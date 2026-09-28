"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Plus, Search, Eye, Trash2, Edit, Download, Upload, PackagePlus } from "lucide-react"
import * as XLSX from 'xlsx'
import { useRef } from "react"
import { InventoryIntakeForm } from "@/components/admin/inventory-intake-form"
import { formatDbDateTimeToDisplay } from "@/lib/server-time"
import { formatVietnamDate } from "@/lib/timezone"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function InventoryIntakePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<"intake" | "purchase-orders">("intake")
  const [showForm, setShowForm] = useState(false)
  const [editingIntakeId, setEditingIntakeId] = useState<string | null>(null)
  const [editingInitialItems, setEditingInitialItems] = useState<any[] | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [intakes, setIntakes] = useState<any[]>([])
  const [viewIntake, setViewIntake] = useState<any | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierProducts, setSupplierProducts] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [createPOOpen, setCreatePOOpen] = useState(false)
  const [editPOOpen, setEditPOOpen] = useState(false)
  const [viewPOOpen, setViewPOOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState<any | null>(null)
  const [editingPO, setEditingPO] = useState<any | null>(null)
  const [mainWarehouse, setMainWarehouse] = useState<any | null>(null)
  const [creatingPO, setCreatingPO] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [productQuantities, setProductQuantities] = useState<Map<string, { quantity: string; unitId: string; convertedQuantity?: number; defaultUnitId?: string }>>(new Map())
  const [allUnits, setAllUnits] = useState<any[]>([])
  const [completedInventoryCheck, setCompletedInventoryCheck] = useState<any | null>(null)
  const [productUnitsMap, setProductUnitsMap] = useState<Map<string, any[]>>(new Map()) // Map of productId -> units array
  const [importData, setImportData] = useState<any[]>([]) // Parsed import data
  const [importErrors, setImportErrors] = useState<any[]>([]) // Import errors
  const [importDialogOpen, setImportDialogOpen] = useState(false) // Import confirmation dialog
  const [isImporting, setIsImporting] = useState(false) // Loading state for import
  const [templateGuideOpen, setTemplateGuideOpen] = useState(false) // Template guide dialog
  const [deletingIntakeId, setDeletingIntakeId] = useState<string | null>(null)
  const [viewingIntakeId, setViewingIntakeId] = useState<string | null>(null)
  const [editingIntakeLoading, setEditingIntakeLoading] = useState<string | null>(null)
  const [viewingPOId, setViewingPOId] = useState<string | null>(null)
  const [editingPOLoading, setEditingPOLoading] = useState<string | null>(null)
  const [deletingPOId, setDeletingPOId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        // Load intakes
        const intakeRes = await mobileFetch('/api/inventory-intake')
        const intakeJson = await intakeRes.json()
        setIntakes((intakeJson.data || []).map((r: any) => ({
          id: r.intakeId,
          intakeNumber: r.intakeNumber,
          date: r.createdAt,
          totalQuantity: r.totalQuantity || 0,
          items: r.items || [],
        })))

        // Load main warehouse
        const warehouseRes = await mobileFetch('/api/warehouses?type=MAIN')
        const warehouseJson = await warehouseRes.json()
        if (warehouseJson?.success && warehouseJson.data?.length > 0) {
          setMainWarehouse(warehouseJson.data[0])

          // Load purchase orders for main warehouse only
          const mainWarehouseId = warehouseJson.data[0].id
          const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${mainWarehouseId}`)
          const poJson = await poRes.json()
          if (poJson?.success) {
            setPurchaseOrders(poJson.data || [])
          }

          // Load latest completed inventory check for main warehouse
          const checkRes = await mobileFetch(`/api/inventory-checks?warehouseId=${mainWarehouseId}`)
          const checkJson = await checkRes.json()
          if (checkJson?.success && checkJson.data) {
            // Find the latest COMPLETED check
            const completedChecks = checkJson.data.filter((c: any) => c.status === 'COMPLETED')
            if (completedChecks.length > 0) {
              // Sort by created_at descending and take the first one
              completedChecks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              setCompletedInventoryCheck(completedChecks[0])
            }
          }
        }

        // Load suppliers
        const supplierRes = await mobileFetch('/api/suppliers')
        const supplierJson = await supplierRes.json()
        if (supplierJson?.success) {
          setSuppliers(supplierJson.data || [])
        }

        // Load all units
        const unitsRes = await mobileFetch('/api/products?pageSize=9999')
        const unitsJson = await unitsRes.json()
        if (unitsJson?.success && unitsJson.data) {
          // Extract unique units from products
          const unitsMap = new Map()
          unitsJson.data.forEach((product: any) => {
            if (product.unit_id && product.unit_name) {
              unitsMap.set(product.unit_id, { id: product.unit_id, name: product.unit_name })
            }
          })
          setAllUnits(Array.from(unitsMap.values()))
        }
      } catch (e) {
        setIntakes([])
      }
    }
    load()
  }, [])

  // Load supplier products when supplier changes
  useEffect(() => {
    if (!selectedSupplier) {
      setSupplierProducts([])
      if (!isEditMode) {
        setSelectedProducts(new Set())
      }
      setProductUnitsMap(new Map())
      return
    }

    const loadSupplierProducts = async () => {
      try {
        const res = await mobileFetch(`/api/suppliers/${selectedSupplier}`)
        const json = await res.json()
        if (json?.success) {
          const products = json.data?.products || []
          setSupplierProducts(products)
          // Only auto-select all products in CREATE mode, not in EDIT mode
          if (!isEditMode) {
            setSelectedProducts(new Set(products.map((p: any) => p.product_id) || []))
          }

          // Fetch units for ALL products in ONE batch request
          const unitsMap = new Map()
          const productIds = products.map((p: any) => p.product_id)

          if (productIds.length > 0) {
            try {
              const batchRes = await mobileFetch('/api/products/batch-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ productIds })
              })
              const batchJson = await batchRes.json()

              if (batchRes.ok && batchJson?.success) {
                const batchData = batchJson.data || {}

                for (const product of products) {
                  const productId = product.product_id
                  const productUnitsData = batchData[productId]

                  if (productUnitsData) {
                    const { units: unitsList, defaultUnitId } = productUnitsData

                    // Priority: 1. Supplier's configured unit, 2. Product's default unit, 3. First available unit
                    const supplierUnitId = product.unitId || product.unit_id // From supplier_products join
                    const foundSupplierUnit = supplierUnitId ? unitsList.find((u: any) => u.id === supplierUnitId) : null

                    // If supplier has a specific unit configured, RESTRICT the list to ONLY that unit
                    if (foundSupplierUnit) {
                      unitsMap.set(productId, [foundSupplierUnit])
                    } else {
                      // Otherwise allow all convertible units
                      const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)
                      unitsMap.set(productId, convertibleUnits.length > 0 ? convertibleUnits : unitsList)
                    }

                    // Set default unit for this product (only if not already set in edit mode)
                    if (defaultUnitId || unitsList.length > 0) {
                      // Priority: 1. Supplier's configured unit, 2. Product's default unit, 3. First available unit


                      const preferredUnitId = foundSupplierUnit ? supplierUnitId : (defaultUnitId || unitsList[0]?.id)
                      setProductQuantities(prev => {
                        const newMap = new Map(prev)
                        const existing = newMap.get(productId)
                        // In edit mode, preserve existing unitId if it exists
                        // In create mode, use the preferred/default unit
                        const finalUnitId = (isEditMode && existing?.unitId) ? existing.unitId : preferredUnitId
                        newMap.set(productId, {
                          quantity: existing?.quantity || "",
                          unitId: finalUnitId,
                          defaultUnitId: preferredUnitId,
                        })
                        return newMap
                      })
                    }
                  }
                }
              }
            } catch (err) {
              console.error('Failed to fetch batch units:', err)
              // Silently fail - units will be empty for products
            }
          }
          setProductUnitsMap(unitsMap)
        }
      } catch (err: any) {
        toast.error("Lỗi tải sản phẩm", { description: err?.message })
      }
    }

    loadSupplierProducts()
  }, [selectedSupplier, isEditMode])

  // Helper function to check if an intake is locked (created before completed inventory check)
  const isIntakeLocked = (intakeDate: string): boolean => {
    if (!completedInventoryCheck || !completedInventoryCheck.createdAt) return false
    const intakeTime = new Date(intakeDate).getTime()
    const checkTime = new Date(completedInventoryCheck.createdAt).getTime()
    return intakeTime < checkTime
  }

  // Helper function to check if a purchase order is locked (created before completed inventory check)
  const isPOLocked = (poDate: string): boolean => {
    if (!completedInventoryCheck || !completedInventoryCheck.updatedAt) return false
    const poTime = new Date(poDate).getTime()
    const checkTime = new Date(completedInventoryCheck.updatedAt).getTime()
    return poTime < checkTime
  }

  // Download import template
  const downloadTemplate = async () => {
    try {
      const { downloadExcelTemplate } = await import("@/lib/excel-utils")

      await downloadExcelTemplate({
        fileName: "inventory-intake-template.xlsx",
        headers: ["Mã Sản Phẩm", "Tên Sản Phẩm", "Số Lượng", "Đơn Vị"],
        sampleData: [
          ["NL001", "Mứt Đào", "100", "Hộp"],
          ["NL002", "Mứt Dâu", "50", "Hộp"],
          ["ND001", "Nước Cam", "250", "Chai"],
          ["CT001", "Thìa Inox", "500", "Cái"],
          ["CT002", "Ly Thuỷ Tinh", "300", "Cái"],
        ],
        columnWidths: [15, 30, 15, 10]
      })

      toast.success("Template Excel đã được tải xuống")
    } catch (err) {
      console.error("Failed to download template", err)
      toast.error("Lỗi khi tải template")
    }
  }

  // Handle file import
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await mobileFetch('/api/inventory-intake/parse-import', {
        method: 'POST',
        body: formData
      })

      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Parse import failed')
      }

      setImportData(json.data?.items || [])
      setImportErrors(json.data?.errors || [])
      setImportDialogOpen(true)
    } catch (err: any) {
      toast.error('Lỗi import', { description: err?.message || String(err) })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Submit import - create intake with parsed items
  const handleSubmitImport = async () => {
    if (importData.length === 0) {
      toast.error('Không có sản phẩm để import')
      return
    }

    try {
      setIsImporting(true)
      const items = importData.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitId: item.unitId
      }))

      const res = await mobileFetch('/api/inventory-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      })

      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Create intake failed')
      }

      toast.success('Nhập hàng từ file thành công')
      setImportDialogOpen(false)
      setImportData([])
      setImportErrors([])

      // Reload intakes
      try {
        const intakeRes = await mobileFetch('/api/inventory-intake')
        const intakeJson = await intakeRes.json()
        setIntakes((intakeJson.data || []).map((r: any) => ({
          id: r.intakeId,
          intakeNumber: r.intakeNumber,
          date: r.createdAt,
          totalQuantity: r.totalQuantity || 0,
          items: r.items || [],
        })))
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      toast.error('Lỗi tạo phiếu', { description: err?.message })
    } finally {
      setIsImporting(false)
    }
  }

  // Purchase order handlers
  const handleCreatePO = async () => {
    if (!selectedSupplier || selectedProducts.size === 0) {
      toast.error("Vui lòng chọn nhà cung cấp và sản phẩm")
      return
    }

    if (!mainWarehouse) {
      toast.error("Không thể tải kho Tổng")
      return
    }

    // Validate all products have quantities
    for (const productId of selectedProducts) {
      const qty = productQuantities.get(productId)
      if (!qty || !qty.quantity || Number(qty.quantity) <= 0) {
        toast.error("Vui lòng nhập số lượng hợp lệ cho tất cả sản phẩm")
        return
      }
    }

    setCreatingPO(true)
    try {
      const items = supplierProducts
        .filter((p: any) => selectedProducts.has(p.product_id))
        .map((p: any) => {
          const qty = productQuantities.get(p.product_id)
          return {
            productId: p.product_id,
            quantity: Number(qty?.quantity || 1),
            unitId: qty?.unitId,
            convertedQuantity: qty?.convertedQuantity,
          }
        })

      const res = await mobileFetch(`/api/purchase-orders-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplier,
          warehouseId: mainWarehouse.id,
          items,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Lỗi tạo phiếu")
      }
      toast.success("Phiếu nhập hàng đã được tạo và cộng vào tồn kho")
      setCreatePOOpen(false)
      setSelectedSupplier(null)
      setSelectedProducts(new Set())
      setProductQuantities(new Map())

      // Reload purchase orders for main warehouse only
      if (mainWarehouse) {
        const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${mainWarehouse.id}`)
        const poJson = await poRes.json()
        if (poJson?.success) {
          setPurchaseOrders(poJson.data || [])
        }
      }
    } catch (err: any) {
      toast.error("Lỗi tạo phiếu", { description: err?.message })
    } finally {
      setCreatingPO(false)
    }
  }

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    PENDING_RECEIPT: "bg-yellow-100 text-yellow-800",
    RECEIVED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={PackagePlus}
        title="Nhập Hàng"
        subtitle="Quản lý nhập hàng vào kho"
        gradient="teal"
      />

      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold">Nhập Hàng</h1>
          <p className="text-muted-foreground mt-1">Quản lý nhập hàng vào kho</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 md:gap-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => setActiveTab("intake")}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "intake"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            Nhập Hàng
          </button>
          {/* Hide "Nhập Mua Hàng" tab for WAREHOUSE_STAFF */}
          {user?.role !== "WAREHOUSE_STAFF" && (
            <button
              onClick={() => setActiveTab("purchase-orders")}
              className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "purchase-orders"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              Nhập Mua<span className="hidden sm:inline"> Hàng</span>
            </button>
          )}
        </div>

        {/* Intake Tab */}
        {activeTab === "intake" && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1 md:gap-2 border-green-600 text-green-600 hover:bg-green-50" onClick={() => setTemplateGuideOpen(true)}>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Tải </span>Template
              </Button>
              <Button variant="outline" size="sm" className="gap-1 md:gap-2" disabled={isImporting} onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4" />
                {isImporting ? 'Đang...' : <><span className="hidden sm:inline">Import </span>Excel</>}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileImport}
                className="hidden"
              />
              <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setEditingIntakeId(null); setEditingInitialItems(null) }; setShowForm(o) }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1 md:gap-2" onClick={() => { setFormKey(k => k + 1); setEditingIntakeId(null); setEditingInitialItems(null) }}>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Nhập Hàng Mới</span>
                    <span className="sm:hidden">Thêm</span>
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg">{editingIntakeId ? 'Chỉnh Sửa Nhập Hàng' : 'Nhập Hàng Mới'}</DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">Thêm nhiều sản phẩm vào một phiếu nhập.</DialogDescription>
                  </DialogHeader>
                  <InventoryIntakeForm
                    key={formKey}
                    intakeId={editingIntakeId}
                    initialItems={editingInitialItems || undefined}
                    initialWarehouse={undefined}
                    onClose={() => { setShowForm(false); setEditingIntakeId(null); setEditingInitialItems(null) }}
                    onSaved={async () => {
                      // reload intakes after save
                      try {
                        const res = await mobileFetch('/api/inventory-intake')
                        const json = await res.json()
                        setIntakes((json.data || []).map((r: any) => ({
                          id: r.intakeId,
                          intakeNumber: r.intakeNumber,
                          date: r.createdAt,
                          totalQuantity: r.totalQuantity || 0,
                          items: r.items || [],
                        })))
                        toast.success('Nhập hàng thành công')
                      } catch (e) {
                        // ignore
                      }
                    }} />
                </DialogContent>
              </Dialog>
            </div>

            {/* Detail Dialog */}
            <Dialog open={viewOpen} onOpenChange={(o) => { if (!o) setViewIntake(null); setViewOpen(o) }}>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Chi tiết phiếu nhập</DialogTitle>
                  <DialogDescription>Thông tin chi tiết sản phẩm và tồn kho</DialogDescription>
                </DialogHeader>
                <div className="mt-4 overflow-y-auto flex-1">
                  {viewIntake ? (
                    <div className="space-y-4">
                      {/* Header Info */}
                      <div className="flex justify-between items-center border-b pb-3">
                        <div>
                          <p className="text-sm text-muted-foreground">ID Phiếu</p>
                          <p className="font-semibold font-mono text-sm">{viewIntake?.intakeId?.substring(0, 8) || viewIntake?.id?.substring(0, 8) || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Ngày tạo</p>
                          <p className="font-medium">{formatVietnamDate(viewIntake?.createdAt)}</p>
                        </div>
                      </div>

                      {/* Products List */}
                      <div>
                        <Label className="text-base font-semibold mb-3">Danh sách sản phẩm</Label>
                        <div className="space-y-3 mt-3 max-h-[50vh] overflow-y-auto pr-2">
                          {viewIntake.items.map((item: any) => (
                            <div
                              key={item.id}
                              className="p-4 border border-border rounded-lg bg-muted/30"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-foreground">
                                    {item.productName || item.productId}
                                  </p>
                                  {item.productCode && (
                                    <p className="text-sm text-muted-foreground">
                                      Mã: {item.productCode}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Số lượng:</span>
                                    <Badge variant="outline" className="font-semibold">
                                      {item.quantity} {item.unitName || ''}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Tồn kho mới:</span>
                                    <Badge className="bg-green-100 text-green-800 font-semibold">
                                      {item.currentStock}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-muted-foreground">Đang tải...</p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Đóng</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="p-4 md:p-6">
              <div className="mb-6 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Tìm kiếm nhập hàng..." className="pl-10" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 md:px-4 font-semibold text-foreground">STT</th>
                      <th className="text-left py-3 px-2 md:px-4 font-semibold text-foreground">Ngày Tạo</th>
                      <th className="text-left py-3 px-2 md:px-4 font-semibold text-foreground">Chi Tiết</th>
                      <th className="text-left py-3 px-2 md:px-4 font-semibold text-foreground">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intakes.map((intake, index) => (
                      <tr key={intake.id} className="border-b border-border hover:bg-muted/50">
                        {/* STT */}
                        <td className="py-3 px-2 md:px-4 text-foreground font-medium">{index + 1}</td>

                        {/* Ngày Tạo */}
                        <td className="py-3 px-2 md:px-4 text-foreground">{formatDbDateTimeToDisplay(intake.date)}</td>

                        {/* Chi Tiết Button */}
                        <td className="py-3 px-2 md:px-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            disabled={viewingIntakeId === intake.id}
                            onClick={async () => {
                              setViewingIntakeId(intake.id)
                              try {
                                const res = await mobileFetch(`/api/inventory-intake/${intake.id}`)
                                const json = await res.json()
                                if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                                setViewIntake(json.data)
                                setViewOpen(true)
                              } catch (err) {
                                toast.error('Không thể tải chi tiết phiếu', {
                                  description: (err as any)?.message || String(err)
                                })
                              } finally {
                                setViewingIntakeId(null)
                              }
                            }}
                          >
                            <Eye className="w-4 h-4" />
                            {viewingIntakeId === intake.id ? 'Đang tải...' : 'Xem Chi Tiết'}
                          </Button>
                        </td>

                        {/* Hành Động */}
                        <td className="py-3 px-2 md:px-4">
                          <div className="flex items-center gap-2">
                            {!isIntakeLocked(intake.date) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                                disabled={editingIntakeLoading === intake.id}
                                onClick={async () => {
                                  // Adjust / Edit intake
                                  setEditingIntakeLoading(intake.id)
                                  try {
                                    const res = await mobileFetch(`/api/inventory-intake/${intake.id}`)
                                    const json = await res.json()
                                    if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                                    const data = json.data
                                    // map items to form shape - ensure we have the unitId
                                    const mapped = (data.items || []).map((it: any, idx: number) => ({
                                      id: String(idx + 1),
                                      product: it.productName || it.productId,
                                      productId: it.productId,
                                      quantity: String(it.quantity),
                                      unitId: it.unitId || it.unit_id
                                    }))
                                    setEditingIntakeId(data.intakeId)
                                    setEditingInitialItems(mapped)
                                    setShowForm(true)
                                  } catch (err) {
                                    toast.error('Không thể tải phiếu để chỉnh sửa', { description: (err as any)?.message || String(err) })
                                  } finally {
                                    setEditingIntakeLoading(null)
                                  }
                                }}>
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {isIntakeLocked(intake.date) && (
                              <div className="text-xs text-muted-foreground italic px-2 py-1">
                                Đã khóa (kiểm kê)
                              </div>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              className="hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                              disabled={isIntakeLocked(intake.date) || deletingIntakeId === intake.id}
                              onClick={() => {
                                // Delete intake
                                setConfirmDialog({
                                  open: true,
                                  title: "Xác nhận xóa",
                                  description: "Bạn có chắc muốn xóa phiếu nhập này?",
                                  onConfirm: async () => {
                                    setConfirmDialog(prev => ({ ...prev, open: false }))
                                    setDeletingIntakeId(intake.id)
                                    try {
                                      const res = await mobileFetch(`/api/inventory-intake/${intake.id}`, { method: 'DELETE' })
                                      const json = await res.json()
                                      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                                      setIntakes((prev) => prev.filter((p) => p.id !== intake.id))
                                      toast.success('Đã xóa phiếu nhập')
                                    } catch (err) {
                                      toast.error('Không thể xóa phiếu', { description: (err as any)?.message || String(err) })
                                    } finally {
                                      setDeletingIntakeId(null)
                                    }
                                  }
                                })
                              }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Import Confirmation Dialog */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Xác Nhận Import Nhập Hàng</DialogTitle>
              <DialogDescription>Kiểm tra danh sách sản phẩm sẽ được import</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="mt-4 space-y-4 px-6 py-4">
                {importErrors.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-900 mb-2">Lỗi ({importErrors.length}):</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {importErrors.map((err, idx) => (
                        <div key={idx} className="text-xs text-red-700">
                          • {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3">Danh sách sản phẩm sẽ import ({importData.length}):</p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold">Mã Sản Phẩm</th>
                            <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                            <th className="text-left py-2 px-3 font-semibold">Danh Mục</th>
                            <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                            <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                            <th className="text-center py-2 px-3 font-semibold">Quy Đổi</th>
                          </tr>
                        </thead>
                        <tbody className="max-h-64 overflow-y-auto">
                          {importData.map((item, idx) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="py-2 px-3 font-medium text-xs">{item.productCode}</td>
                              <td className="py-2 px-3">{item.productName}</td>
                              <td className="py-2 px-3 text-muted-foreground">{item.categoryName || '-'}</td>
                              <td className="py-2 px-3 text-center font-semibold">{item.quantity}</td>
                              <td className="py-2 px-3 text-center">{item.unitName}</td>
                              <td className="py-2 px-3 text-center">
                                {item.conversionInfo ? (
                                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                    {item.conversionInfo}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importData.length === 0 && importErrors.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Không có dữ liệu để import
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>
                Hủy
              </Button>
              <Button
                onClick={handleSubmitImport}
                disabled={isImporting || importData.length === 0}
              >
                {isImporting ? 'Đang xử lý...' : `Xác Nhận Import (${importData.length} sản phẩm)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Purchase Orders Tab */}
        {activeTab === "purchase-orders" && (
          <div className="space-y-4">
            {/* Inventory Check Notice */}
            {completedInventoryCheck && (
              <Card className="p-4 bg-amber-50 border-amber-200">
                <div className="flex items-start gap-3">
                  <div className="text-amber-600 mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-amber-900">Kiểm kê đã hoàn thành</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Phiếu nhập tạo trước ngày {formatVietnamDate(completedInventoryCheck.updatedAt)} sẽ bị khóa và không thể chỉnh sửa hoặc xóa.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setCreatePOOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Tạo Phiếu Nhập
              </Button>
            </div>

            <Card className="p-6">
              <ResponsiveTable
                data={purchaseOrders}
                columns={[
                  {
                    key: 'po_number',
                    label: 'Mã Phiếu',
                    render: (order) => <span className="font-medium">{order.po_number}</span>,
                    mobilePrimary: true,
                  },
                  {
                    key: 'supplier_name',
                    label: 'Nhà Cung Cấp',
                    render: (order) => <span>{order.supplier_name || "-"}</span>,
                  },
                  {
                    key: 'warehouse_name',
                    label: 'Kho',
                    render: (order) => <span>{order.warehouse_name || "-"}</span>,
                  },
                  {
                    key: 'total_amount',
                    label: 'Tổng Tiền',
                    render: (order) => <span>{Number(order.total_amount || 0).toLocaleString("vi-VN")} ₫</span>,
                    align: 'right',
                    mobilePrimary: true,
                  },
                  {
                    key: 'created_at',
                    label: 'Ngày Tạo',
                    render: (order) => <span className="text-sm text-muted-foreground">{formatVietnamDate(order.created_at)}</span>,
                    align: 'center',
                  },
                ]}
                actions={[
                  {
                    label: 'Xem',
                    icon: <Eye className="w-4 h-4" />,
                    onClick: async (order) => {
                      setViewingPOId(order.id)
                      try {
                        const res = await mobileFetch(`/api/purchase-orders-detail/${order.id}`)
                        const json = await res.json()
                        if (json?.success) {
                          setSelectedPO(json.data)
                          setViewPOOpen(true)
                        }
                      } catch (err) {
                        toast.error("Lỗi tải chi tiết")
                      } finally {
                        setViewingPOId(null)
                      }
                    },
                    disabled: (order) => viewingPOId === order.id,
                    variant: 'ghost',
                  },
                  {
                    label: 'Sửa',
                    icon: <Edit className="w-4 h-4" />,
                    onClick: async (order) => {
                      setEditingPOLoading(order.id)
                      try {
                        const res = await mobileFetch(`/api/purchase-orders-detail/${order.id}`)
                        const json = await res.json()
                        if (json?.success) {
                          setIsEditMode(true)
                          setEditingPO(json.data)
                          // Pre-populate selected products and quantities FIRST
                          const productIds = new Set<string>()
                          const quantities = new Map()
                          json.data.items?.forEach((item: any) => {
                            productIds.add(item.product_id)
                            quantities.set(item.product_id, {
                              quantity: String(item.quantity || 0),
                              unitId: item.unit_id || "",
                            })
                          })
                          setSelectedProducts(productIds)
                          setProductQuantities(quantities)
                          // Then set supplier (this will trigger useEffect to load products)
                          setSelectedSupplier(json.data.supplier_id)
                          setEditPOOpen(true)
                        }
                      } catch (err) {
                        toast.error("Lỗi tải phiếu để chỉnh sửa")
                      } finally {
                        setEditingPOLoading(null)
                      }
                    },
                    disabled: (order) => editingPOLoading === order.id || isPOLocked(order.created_at),
                    show: (order) => !isPOLocked(order.created_at),
                    variant: 'ghost',
                  },
                  {
                    label: 'Xóa',
                    icon: <Trash2 className="w-4 h-4" />,
                    onClick: (order) => {
                      setConfirmDialog({
                        open: true,
                        title: "Xác nhận xóa",
                        description: "Bạn có chắc muốn xóa phiếu này?",
                        onConfirm: async () => {
                          setConfirmDialog(prev => ({ ...prev, open: false }))
                          setDeletingPOId(order.id)
                          try {
                            const res = await mobileFetch(`/api/purchase-orders-detail/${order.id}`, {
                              method: "DELETE",
                            })
                            const json = await res.json()
                            if (!res.ok || !json?.success) {
                              throw new Error(json?.error || "Lỗi xóa phiếu")
                            }
                            toast.success("Đã xóa phiếu")
                            // Reload purchase orders for main warehouse only
                            if (mainWarehouse) {
                              const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${mainWarehouse.id}`)
                              const poJson = await poRes.json()
                              if (poJson?.success) {
                                setPurchaseOrders(poJson.data || [])
                              }
                            }
                          } catch (err: any) {
                            toast.error("Lỗi xóa phiếu", { description: err?.message })
                          } finally {
                            setDeletingPOId(null)
                          }
                        }
                      })
                    },
                    disabled: (order) => deletingPOId === order.id || isPOLocked(order.created_at),
                    show: (order) => !isPOLocked(order.created_at),
                    variant: 'ghost',
                    className: 'hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400'
                  },
                ]}
                keyExtractor={(order) => order.id}
                loading={loading}
                emptyMessage="Không có phiếu nào"
                mobileCardTitle={(order) => order.po_number}
                mobileCardBadge={(order) => isPOLocked(order.created_at) ? (
                  <Badge variant="secondary" className="text-xs text-amber-600 bg-amber-50">
                    Đã khóa
                  </Badge>
                ) : null}
                mobileCardMeta={(order) => [
                  <>🏪 {order.supplier_name || "-"}</>,
                  <>📦 {order.warehouse_name || "-"}</>,
                  <>💰 {Number(order.total_amount || 0).toLocaleString("vi-VN")} ₫</>,
                  <>📅 {formatVietnamDate(order.created_at)}</>,
                ]}
              />
            </Card>
          </div>
        )}

        {/* Create Purchase Order Dialog */}
        <Dialog open={createPOOpen} onOpenChange={(open) => {
          setCreatePOOpen(open)
          if (!open) {
            setSelectedSupplier(null)
            setSelectedProducts(new Set())
            setProductQuantities(new Map())
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tạo Phiếu Nhập Mua Hàng</DialogTitle>
              <DialogDescription>Chọn nhà cung cấp và sản phẩm cần nhập</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-sm font-medium">Chọn Nhà Cung Cấp *</Label>
                <Select value={selectedSupplier || ""} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhà cung cấp..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSupplier && (
                <div>
                  <Label className="text-sm font-medium">Chọn Sản Phẩm *</Label>
                  <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                    {supplierProducts.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Nhà cung cấp này chưa có sản phẩm</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold">Chọn</th>
                            <th className="text-left py-2 px-3 font-semibold">Mã</th>
                            <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                            <th className="text-right py-2 px-3 font-semibold">Giá</th>
                            <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                            <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierProducts.map((product) => {
                            const isSelected = selectedProducts.has(product.product_id)
                            const qty = productQuantities.get(product.product_id) || { quantity: "", unitId: product.unit_id || "", defaultUnitId: product.unit_id || "", convertedQuantity: undefined }
                            const productUnits = productUnitsMap.get(product.product_id) || []
                            const defaultUnit = productUnits.find((u: any) => u.id === qty.defaultUnitId)
                            const selectedUnit = productUnits.find((u: any) => u.id === qty.unitId)
                            const hasConversion = qty.convertedQuantity !== undefined && qty.convertedQuantity !== null

                            return (
                              <tr key={product.id} className={`border-b ${isSelected ? 'bg-blue-50' : 'hover:bg-muted/50'}`}>
                                <td className="py-3 px-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedProducts)
                                      if (e.target.checked) {
                                        newSet.add(product.product_id)
                                        if (!productQuantities.has(product.product_id)) {
                                          const newQty = new Map(productQuantities)
                                          const defaultUnitId = productUnits[0]?.id || product.unit_id || ""
                                          newQty.set(product.product_id, {
                                            quantity: "",
                                            unitId: defaultUnitId,
                                            defaultUnitId: defaultUnitId
                                          })
                                          setProductQuantities(newQty)
                                        }
                                      } else {
                                        newSet.delete(product.product_id)
                                      }
                                      setSelectedProducts(newSet)
                                    }}
                                    className="w-4 h-4"
                                  />
                                </td>
                                <td className="py-3 px-3 text-muted-foreground text-xs font-medium">{product.code}</td>
                                <td className="py-3 px-3 font-medium">{product.name}</td>
                                <td className="py-3 px-3 text-right">{Number(product.unit_price).toLocaleString("vi-VN")} đ</td>
                                <td className="py-3 px-3 text-center">
                                  {isSelected ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        placeholder="0"
                                        value={qty.quantity}
                                        onChange={(e) => {
                                          const newValue = String(e.target.value).replace(/^0+(?=\d)/, '') || e.target.value
                                          const newQty = new Map(productQuantities)

                                          // Calculate conversion if unit differs from default
                                          let convertedQty: number | undefined = undefined
                                          if (newValue && qty.unitId && qty.defaultUnitId && qty.unitId !== qty.defaultUnitId) {
                                            const unitsList = productUnits
                                            const defaultU = unitsList.find((u: any) => u.id === qty.defaultUnitId)
                                            const selectedU = unitsList.find((u: any) => u.id === qty.unitId)

                                            if (defaultU && selectedU && defaultU.multiplier !== null && selectedU.multiplier !== null) {
                                              convertedQty = Number(newValue) * (selectedU.multiplier / defaultU.multiplier)
                                              convertedQty = Math.round(convertedQty * 100) / 100
                                            }
                                          }

                                          newQty.set(product.product_id, {
                                            quantity: newValue,
                                            unitId: qty.unitId,
                                            defaultUnitId: qty.defaultUnitId,
                                            convertedQuantity: convertedQty
                                          })
                                          setProductQuantities(newQty)
                                        }}
                                        className="text-sm text-center w-20 mx-auto"
                                      />
                                      {hasConversion && (
                                        <span className="text-xs text-muted-foreground">
                                          ≈ {qty.convertedQuantity} {defaultUnit?.code || defaultUnit?.name || ''}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {isSelected ? (
                                    <Select value={qty.unitId || ""} onValueChange={(value) => {
                                      const newQty = new Map(productQuantities)

                                      // Recalculate conversion for new unit
                                      let convertedQty: number | undefined = undefined
                                      if (qty.quantity && value && qty.defaultUnitId && value !== qty.defaultUnitId) {
                                        const unitsList = productUnits
                                        const defaultU = unitsList.find((u: any) => u.id === qty.defaultUnitId)
                                        const selectedU = unitsList.find((u: any) => u.id === value)

                                        if (defaultU && selectedU && defaultU.multiplier !== null && selectedU.multiplier !== null) {
                                          convertedQty = Number(qty.quantity) * (selectedU.multiplier / defaultU.multiplier)
                                          convertedQty = Math.round(convertedQty * 100) / 100
                                        }
                                      }

                                      newQty.set(product.product_id, {
                                        quantity: qty.quantity,
                                        unitId: value,
                                        defaultUnitId: qty.defaultUnitId,
                                        convertedQuantity: convertedQty
                                      })
                                      setProductQuantities(newQty)
                                    }}>
                                      <SelectTrigger className="w-32 mx-auto text-sm">
                                        <SelectValue placeholder="Chọn đơn vị" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {productUnits.map((unit: any) => (
                                          <SelectItem key={unit.id} value={unit.id}>
                                            {unit.code || unit.name} {unit.id === qty.defaultUnitId ? '(mặc định)' : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Total Amount Section */}
              {selectedSupplier && selectedProducts.size > 0 && Array.from(selectedProducts).some(prodId => {
                const qty = productQuantities.get(prodId)
                return qty && qty.quantity && Number(qty.quantity) > 0
              }) && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-end items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                        <div className="text-2xl font-bold text-primary">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                            Array.from(selectedProducts).reduce((sum, productId) => {
                              const qty = productQuantities.get(productId)
                              const product = supplierProducts.find((p: any) => p.product_id === productId)

                              if (qty && qty.quantity && product && product.unit_price) {
                                // Use convertedQuantity if available (when unit differs from default)
                                // Otherwise use the original quantity
                                const effectiveQty = qty.convertedQuantity !== undefined && qty.convertedQuantity !== null
                                  ? qty.convertedQuantity
                                  : Number(qty.quantity)
                                return sum + (effectiveQty * Number(product.unit_price))
                              }
                              return sum
                            }, 0)
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreatePOOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleCreatePO} disabled={creatingPO || !selectedSupplier || selectedProducts.size === 0}>
                {creatingPO ? "Đang tạo..." : "Tạo Phiếu"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Purchase Order Dialog */}
        <Dialog open={viewPOOpen} onOpenChange={setViewPOOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chi tiết Phiếu Nhập Mua Hàng</DialogTitle>
            </DialogHeader>

            {selectedPO ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                  <div>
                    <p className="text-sm text-muted-foreground">Mã Phiếu</p>
                    <p className="font-semibold">{selectedPO.po_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ngày Tạo</p>
                    <p className="font-semibold">{formatVietnamDate(selectedPO.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nhà Cung Cấp</p>
                    <p className="font-semibold">{selectedPO.supplier_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kho</p>
                    <p className="font-semibold">{selectedPO.warehouse_name}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3">Danh sách sản phẩm</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted border-b">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold">Mã SP</th>
                          <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                          <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                          <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                          <th className="text-right py-2 px-3 font-semibold">Đơn Giá</th>
                          <th className="text-right py-2 px-3 font-semibold">Thành Tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPO.items?.map((item: any) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="py-2 px-3 text-muted-foreground text-xs font-medium">{item.product_code || "-"}</td>
                            <td className="py-2 px-3 font-medium">{item.product_name || item.productId}</td>
                            <td className="py-2 px-3 text-center">{item.quantity}</td>
                            <td className="py-2 px-3 text-center">{item.unit_code || item.unit_name || "-"}</td>
                            <td className="py-2 px-3 text-right">{Number(item.unit_price || 0).toLocaleString("vi-VN")} ₫</td>
                            <td className="py-2 px-3 text-right font-semibold">{Number(item.line_total || 0).toLocaleString("vi-VN")} ₫</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 border-t-2">
                        <tr>
                          <td colSpan={5} className="py-2 px-3 text-right font-semibold">Tổng Cộng:</td>
                          <td className="py-2 px-3 text-right font-bold text-primary">
                            {Number(selectedPO.total_amount || 0).toLocaleString("vi-VN")} ₫
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Đang tải...</p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setViewPOOpen(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Purchase Order Dialog */}
        <Dialog open={editPOOpen} onOpenChange={(open) => {
          setEditPOOpen(open)
          if (!open) {
            setIsEditMode(false)
            setEditingPO(null)
            setSelectedSupplier(null)
            setSelectedProducts(new Set())
            setProductQuantities(new Map())
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] sm:max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Chỉnh Sửa Phiếu Nhập Mua Hàng</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">Cập nhật thông tin phiếu nhập (Mã: {editingPO?.po_number})</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4 -mx-6 px-6 sm:mx-0 sm:px-0">
              <div>
                <Label className="text-sm font-medium">Chọn Nhà Cung Cấp *</Label>
                <Select value={selectedSupplier || ""} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhà cung cấp..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSupplier && isEditMode && editingPO?.items && (
                <div className="relative">
                  <Label className="text-sm font-medium">Sản Phẩm Đã Chọn *</Label>
                  <div className="border rounded-lg overflow-hidden -mx-6 sm:mx-0">
                    <div className="overflow-x-auto max-h-96 overflow-y-auto px-6 sm:px-0">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-muted border-b sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold hidden sm:table-cell">Mã</th>
                            <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                            <th className="text-right py-2 px-3 font-semibold hidden md:table-cell">Giá</th>
                            <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                            <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                            <th className="text-center py-2 px-3 font-semibold">Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editingPO.items
                            .filter((item: any) => selectedProducts.has(item.product_id))
                            .map((item: any) => {
                              const qty = productQuantities.get(item.product_id)
                              const productUnits = productUnitsMap.get(item.product_id) || []
                              return (
                                <tr key={item.product_id} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="py-2 px-3 text-muted-foreground text-xs font-medium hidden sm:table-cell">{item.product_code || "-"}</td>
                                  <td className="py-2 px-3 font-medium">
                                    <div className="flex flex-col">
                                      <span>{item.product_name}</span>
                                      <span className="text-xs text-muted-foreground sm:hidden">{item.product_code}</span>
                                      <span className="text-xs text-muted-foreground md:hidden">{Number(item.unit_price || 0).toLocaleString("vi-VN")} ₫</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-right hidden md:table-cell">{Number(item.unit_price || 0).toLocaleString("vi-VN")} ₫</td>
                                  <td className="py-2 px-3 text-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="w-20 sm:w-24 h-8 mx-auto text-sm text-center"
                                      placeholder="0"
                                      value={qty?.quantity || ""}
                                      onChange={(e) => {
                                        const cleanValue = String(e.target.value).replace(/^0+(?=\d)/, '') || e.target.value
                                        const newMap = new Map(productQuantities)
                                        const currentData = newMap.get(item.product_id) || { quantity: "", unitId: "", defaultUnitId: item.unit_id }
                                        newMap.set(item.product_id, { ...currentData, quantity: cleanValue })
                                        setProductQuantities(newMap)
                                      }}
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {productUnits.length > 0 ? (
                                      <Select
                                        value={qty?.unitId || ""}
                                        onValueChange={(unitId) => {
                                          const newMap = new Map(productQuantities)
                                          const currentData = newMap.get(item.product_id) || { quantity: "", unitId: "", defaultUnitId: item.unit_id }
                                          newMap.set(item.product_id, { ...currentData, unitId })
                                          setProductQuantities(newMap)
                                        }}
                                      >
                                        <SelectTrigger className="w-24 sm:w-32 mx-auto text-sm">
                                          <SelectValue placeholder="Chọn đơn vị" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {productUnits.map((unit: any) => (
                                            <SelectItem key={unit.id} value={unit.id}>
                                              {unit.code || unit.name} {unit.id === qty?.defaultUnitId ? '(mặc định)' : ''}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => {
                                        const newSet = new Set(selectedProducts)
                                        newSet.delete(item.product_id)
                                        setSelectedProducts(newSet)
                                        const newMap = new Map(productQuantities)
                                        newMap.delete(item.product_id)
                                        setProductQuantities(newMap)
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-600" />
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Tổng tiền cho Edit Mode */}
                  <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <span className="text-sm font-semibold">Tổng Tiền:</span>
                    <span className="text-lg font-bold text-primary">
                      {(() => {
                        let total = 0
                        editingPO.items
                          .filter((item: any) => selectedProducts.has(item.product_id))
                          .forEach((item: any) => {
                            const qty = productQuantities.get(item.product_id)
                            const quantity = Number(qty?.quantity || 0)
                            const unitPrice = Number(item.unit_price || 0)
                            total += quantity * unitPrice
                          })
                        return total.toLocaleString("vi-VN") + " ₫"
                      })()}
                    </span>
                  </div>
                </div>
              )}
              {selectedSupplier && !isEditMode && (
                <div>
                  <Label className="text-sm font-medium">Sản Phẩm Đã Chọn *</Label>
                  <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                    {supplierProducts.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Đang tải sản phẩm...</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold">Mã</th>
                            <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                            <th className="text-right py-2 px-3 font-semibold">Giá</th>
                            <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                            <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                            <th className="text-center py-2 px-3 font-semibold">Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierProducts.filter((sp: any) => selectedProducts.has(sp.product_id)).map((sp: any) => {
                            const qty = productQuantities.get(sp.product_id)
                            const productUnits = productUnitsMap.get(sp.product_id) || []
                            return (
                              <tr key={sp.product_id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2 px-3 text-muted-foreground text-xs font-medium">{sp.product_code || "-"}</td>
                                <td className="py-2 px-3 font-medium">{sp.product_name}</td>
                                <td className="py-2 px-3 text-right">{Number(sp.unit_price || 0).toLocaleString("vi-VN")} ₫</td>
                                <td className="py-2 px-3">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-24 h-8 mx-auto text-sm text-center"
                                    placeholder="0"
                                    value={qty?.quantity || ""}
                                    onChange={(e) => {
                                      const cleanValue = String(e.target.value).replace(/^0+(?=\d)/, '') || e.target.value
                                      const newMap = new Map(productQuantities)
                                      const currentData = newMap.get(sp.product_id) || { quantity: "", unitId: "", defaultUnitId: sp.unit_id }
                                      newMap.set(sp.product_id, { ...currentData, quantity: cleanValue })
                                      setProductQuantities(newMap)
                                    }}
                                  />
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {productUnits.length > 0 ? (
                                    <Select
                                      value={qty?.unitId || ""}
                                      onValueChange={(unitId) => {
                                        const newMap = new Map(productQuantities)
                                        const currentData = newMap.get(sp.product_id) || { quantity: "", unitId: "", defaultUnitId: sp.unit_id }
                                        newMap.set(sp.product_id, { ...currentData, unitId })
                                        setProductQuantities(newMap)
                                      }}
                                    >
                                      <SelectTrigger className="w-32 mx-auto text-sm">
                                        <SelectValue placeholder="Chọn đơn vị" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {productUnits.map((unit: any) => (
                                          <SelectItem key={unit.id} value={unit.id}>
                                            {unit.code || unit.name} {unit.id === qty?.defaultUnitId ? '(mặc định)' : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      const newSet = new Set(selectedProducts)
                                      newSet.delete(sp.product_id)
                                      setSelectedProducts(newSet)
                                      const newMap = new Map(productQuantities)
                                      newMap.delete(sp.product_id)
                                      setProductQuantities(newMap)
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => setEditPOOpen(false)} className="w-full sm:w-auto">
                Hủy
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={async () => {
                  if (!selectedSupplier || selectedProducts.size === 0 || !editingPO) return

                  const items = Array.from(selectedProducts).map((productId) => {
                    const qty = productQuantities.get(productId)
                    return {
                      productId,
                      quantity: Number(qty?.quantity || 0),
                      unitId: qty?.unitId || null,
                    }
                  }).filter(item => item.quantity > 0)

                  if (items.length === 0) {
                    toast.error("Vui lòng nhập số lượng cho ít nhất một sản phẩm")
                    return
                  }

                  setCreatingPO(true)
                  try {
                    const res = await mobileFetch(`/api/purchase-orders-detail/${editingPO.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        supplierId: selectedSupplier,
                        warehouseId: mainWarehouse?.id,
                        items,
                      }),
                    })

                    const json = await res.json()
                    if (!res.ok || !json?.success) {
                      throw new Error(json?.error || "Lỗi cập nhật phiếu")
                    }

                    toast.success("Đã cập nhật phiếu nhập")
                    setEditPOOpen(false)
                    setIsEditMode(false)
                    setEditingPO(null)
                    setSelectedSupplier(null)
                    setSelectedProducts(new Set())
                    setProductQuantities(new Map())

                    // Reload purchase orders for main warehouse only
                    if (mainWarehouse) {
                      const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${mainWarehouse.id}`)
                      const poJson = await poRes.json()
                      if (poJson?.success) {
                        setPurchaseOrders(poJson.data || [])
                      }
                    }
                  } catch (err: any) {
                    toast.error("Lỗi cập nhật phiếu", { description: err?.message })
                  } finally {
                    setCreatingPO(false)
                  }
                }}
                disabled={creatingPO || !selectedSupplier || selectedProducts.size === 0}
              >
                {creatingPO ? "Đang cập nhật..." : "Cập Nhật"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Guide Dialog */}
        <Dialog open={templateGuideOpen} onOpenChange={setTemplateGuideOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Hướng Dẫn Sử Dụng Template Import</DialogTitle>
              <DialogDescription>
                Làm theo các bước dưới đây để import dữ liệu nhập hàng
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold">1</div>
                  <h3 className="text-lg font-semibold">Tải Template</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-10">
                  Bấm nút bên dưới để tải file template mẫu (định dạng CSV).
                </p>
                <div className="ml-10">
                  <Button
                    variant="outline"
                    className="gap-2 border-green-600 text-green-600 hover:bg-green-50"
                    onClick={() => {
                      downloadTemplate()
                      // Don't close dialog, let user continue reading
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Tải Template Ngay
                  </Button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold">2</div>
                  <h3 className="text-lg font-semibold">Mở File và Điền Dữ Liệu</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-10">
                  Mở file CSV bằng Excel hoặc Google Sheets. File có 4 cột:
                </p>
                <div className="ml-10 bg-gray-50 p-4 rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-semibold">Cột</th>
                        <th className="text-left py-2 px-3 font-semibold">Mô Tả</th>
                        <th className="text-left py-2 px-3 font-semibold">Ví Dụ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 px-3 font-mono bg-blue-50">Mã Sản Phẩm</td>
                        <td className="py-2 px-3">Mã sản phẩm trong hệ thống</td>
                        <td className="py-2 px-3 font-mono">NL001</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3 font-mono bg-blue-50">Tên Sản Phẩm</td>
                        <td className="py-2 px-3">Tên sản phẩm (tham khảo)</td>
                        <td className="py-2 px-3">Mứt Đào</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3 font-mono bg-blue-50">Số Lượng</td>
                        <td className="py-2 px-3">Số lượng nhập (chỉ số, không có dấu phẩy)</td>
                        <td className="py-2 px-3 font-mono">100</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono bg-blue-50">Đơn Vị</td>
                        <td className="py-2 px-3">Mã đơn vị (ML, Hộp, Chai, Cái...)</td>
                        <td className="py-2 px-3 font-mono">Hộp</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold">3</div>
                  <h3 className="text-lg font-semibold">Lưu Ý Quan Trọng</h3>
                </div>
                <div className="ml-10 space-y-2">
                  <div className="flex gap-2 text-sm">
                    <span className="text-red-600">⚠️</span>
                    <span><strong>Mã Sản Phẩm</strong> phải khớp chính xác với mã trong hệ thống</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-red-600">⚠️</span>
                    <span><strong>Đơn Vị</strong> phải là mã đơn vị hợp lệ (kiểm tra tại "Quản Lý Đơn Vị")</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-red-600">⚠️</span>
                    <span><strong>Số Lượng</strong> chỉ được nhập số (không dấu phẩy, không ký tự đặc biệt)</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-blue-600">💡</span>
                    <span>Không được xóa hàng tiêu đề (dòng đầu tiên)</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-blue-600">💡</span>
                    <span>Xóa tất cả các dòng ví dụ trước khi nhập dữ liệu thật</span>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold">4</div>
                  <h3 className="text-lg font-semibold">Lưu File và Import</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-10">
                  Sau khi điền xong dữ liệu:
                </p>
                <div className="ml-10 space-y-2">
                  <div className="flex gap-2 text-sm">
                    <span>1.</span>
                    <span>Lưu file với định dạng <strong>CSV (UTF-8)</strong> hoặc <strong>Excel (.xlsx)</strong></span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span>2.</span>
                    <span>Bấm nút <strong>"Import Excel"</strong> ở trang chính</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span>3.</span>
                    <span>Chọn file vừa lưu</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span>4.</span>
                    <span>Hệ thống sẽ kiểm tra và hiển thị kết quả trước khi xác nhận</span>
                  </div>
                </div>
              </div>

              {/* Example */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-lg font-semibold">Ví Dụ Dữ Liệu Hợp Lệ</h3>
                <div className="bg-gray-50 p-4 rounded-lg border font-mono text-xs overflow-x-auto">
                  <pre>
                    Mã Sản Phẩm,Tên Sản Phẩm,Số Lượng,Đơn Vị
                    NL001,Mứt Đào,100,Hộp
                    NL002,Mứt Dâu,50,Hộp
                    ND001,Nước Cam,250,Chai
                    CT001,Thìa Inox,500,Cái
                    CT002,Ly Thuỷ Tinh,300,Cái
                  </pre>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTemplateGuideOpen(false)}>
                Đóng
              </Button>
              <Button
                onClick={() => {
                  downloadTemplate()
                  toast.success("Template đã tải xuống! Hãy làm theo hướng dẫn ở trên.")
                  setTemplateGuideOpen(false)
                }}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                Tải Template và Đóng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">{confirmDialog.description}</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Hủy</Button>
              <Button variant="destructive" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
