"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Plus, Eye, Trash2, Edit, Download, Upload, PackagePlus } from "lucide-react"
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
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

/**
 * Franchise Inventory Intake Page
 * Giống admin inventory-intake nhưng load dữ liệu theo warehouse của user (PARTNER)
 * thay vì MAIN warehouse
 */
export default function FranchiseInventoryIntakePage() {
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
    const [userWarehouse, setUserWarehouse] = useState<any | null>(null)
    const [creatingPO, setCreatingPO] = useState(false)
    const [isEditMode, setIsEditMode] = useState(false)
    const [loading, setLoading] = useState(false)
    const [productQuantities, setProductQuantities] = useState<Map<string, { quantity: string; unitId: string; convertedQuantity?: number; defaultUnitId?: string }>>(new Map())
    const [allUnits, setAllUnits] = useState<any[]>([])
    const [completedInventoryCheck, setCompletedInventoryCheck] = useState<any | null>(null)
    const [productUnitsMap, setProductUnitsMap] = useState<Map<string, any[]>>(new Map())
    const [importData, setImportData] = useState<any[]>([])
    const [importErrors, setImportErrors] = useState<any[]>([])
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [templateGuideOpen, setTemplateGuideOpen] = useState(false)
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
            if (!user?.warehouseId) return

            try {
                // Load intakes for user's warehouse (auto-detected by API)
                const intakeRes = await mobileFetch('/api/inventory-intake')
                const intakeJson = await intakeRes.json()
                setIntakes((intakeJson.data || []).map((r: any) => ({
                    id: r.intakeId,
                    intakeNumber: r.intakeNumber,
                    date: r.createdAt,
                    totalQuantity: r.totalQuantity || 0,
                    items: r.items || [],
                })))

                // Load user's warehouse info (PARTNER warehouse)
                const warehouseRes = await mobileFetch(`/api/warehouses/${user.warehouseId}`)
                const warehouseJson = await warehouseRes.json()
                if (warehouseJson?.success && warehouseJson.data) {
                    setUserWarehouse(warehouseJson.data)

                    // Load purchase orders for user's warehouse
                    const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${user.warehouseId}`)
                    const poJson = await poRes.json()
                    if (poJson?.success) {
                        setPurchaseOrders(poJson.data || [])
                    }

                    // Load latest completed inventory check for user's warehouse
                    const checkRes = await mobileFetch(`/api/inventory-checks?warehouseId=${user.warehouseId}`)
                    const checkJson = await checkRes.json()
                    if (checkJson?.success && checkJson.data) {
                        const completedChecks = checkJson.data.filter((c: any) => c.status === 'COMPLETED')
                        if (completedChecks.length > 0) {
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

                // Load all units from products
                const unitsRes = await mobileFetch('/api/products?pageSize=9999')
                const unitsJson = await unitsRes.json()
                if (unitsJson?.success && unitsJson.data) {
                    const unitsMap = new Map()
                    unitsJson.data.forEach((product: any) => {
                        if (product.unit_id && product.unit_name) {
                            unitsMap.set(product.unit_id, { id: product.unit_id, name: product.unit_name })
                        }
                    })
                    setAllUnits(Array.from(unitsMap.values()))
                }
            } catch (e) {
                console.error("Error loading data:", e)
                setIntakes([])
            }
        }
        load()
    }, [user?.warehouseId])

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

                                        const supplierUnitId = product.unitId || product.unit_id
                                        const foundSupplierUnit = supplierUnitId ? unitsList.find((u: any) => u.id === supplierUnitId) : null

                                        if (foundSupplierUnit) {
                                            unitsMap.set(productId, [foundSupplierUnit])
                                        } else {
                                            const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)
                                            unitsMap.set(productId, convertibleUnits.length > 0 ? convertibleUnits : unitsList)
                                        }

                                        if (defaultUnitId || unitsList.length > 0) {
                                            const preferredUnitId = foundSupplierUnit ? supplierUnitId : (defaultUnitId || unitsList[0]?.id)
                                            setProductQuantities(prev => {
                                                const newMap = new Map(prev)
                                                const existing = newMap.get(productId)
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

    // Helper function to check if an intake is locked
    const isIntakeLocked = (intakeDate: string): boolean => {
        if (!completedInventoryCheck || !completedInventoryCheck.createdAt) return false
        const intakeTime = new Date(intakeDate).getTime()
        const checkTime = new Date(completedInventoryCheck.createdAt).getTime()
        return intakeTime < checkTime
    }

    // Helper function to check if a purchase order is locked
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

    // Submit import
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

        if (!user?.warehouseId) {
            toast.error("Không thể xác định kho của bạn")
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
                    warehouseId: user.warehouseId, // Use user's warehouse instead of MAIN
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

            // Reload purchase orders for user's warehouse
            if (user?.warehouseId) {
                const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${user.warehouseId}`)
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

    if (!user?.warehouseId) {
        return (
            <div className="min-h-screen bg-background">
                <MobilePageHeader
                    icon={PackagePlus}
                    title="Nhập Hàng"
                    subtitle="Quản lý nhập hàng vào kho"
                    gradient="teal"
                />
                <div className="p-4 md:p-8">
                    <Card className="p-6">
                        <div className="text-center text-muted-foreground">
                            <p>Không thể xác định kho của bạn.</p>
                            <p className="text-sm mt-2">Vui lòng liên hệ quản trị viên để được phân công kho.</p>
                        </div>
                    </Card>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={PackagePlus}
                title="Nhập Hàng"
                subtitle={`Quản lý nhập hàng vào kho ${userWarehouse?.name || ''}`}
                gradient="teal"
            />

            <div className="p-4 md:p-8 space-y-6">
                {/* Header */}
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold">Nhập Hàng</h1>
                    <p className="text-muted-foreground mt-1">Quản lý nhập hàng vào kho {userWarehouse?.name || ''}</p>
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
                    <button
                        onClick={() => setActiveTab("purchase-orders")}
                        className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "purchase-orders"
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Nhập Mua<span className="hidden sm:inline"> Hàng</span>
                    </button>
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
                                                <td className="py-3 px-2 md:px-4 text-foreground font-medium">{index + 1}</td>
                                                <td className="py-3 px-2 md:px-4 text-foreground">{formatDbDateTimeToDisplay(intake.date)}</td>
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
                                                <td className="py-3 px-2 md:px-4">
                                                    <div className="flex items-center gap-2">
                                                        {!isIntakeLocked(intake.date) && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                                                                disabled={editingIntakeLoading === intake.id}
                                                                onClick={async () => {
                                                                    setEditingIntakeLoading(intake.id)
                                                                    try {
                                                                        const res = await mobileFetch(`/api/inventory-intake/${intake.id}`)
                                                                        const json = await res.json()
                                                                        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                                                                        const data = json.data
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

                {/* Purchase Orders Tab */}
                {activeTab === "purchase-orders" && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <Button onClick={() => setCreatePOOpen(true)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Tạo Phiếu Nhập Mua
                            </Button>
                        </div>

                        <Card className="p-4 md:p-6">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="text-left py-3 px-4 font-semibold">Mã Phiếu</th>
                                            <th className="text-left py-3 px-4 font-semibold">Nhà Cung Cấp</th>
                                            <th className="text-right py-3 px-4 font-semibold">Tổng Tiền</th>
                                            <th className="text-left py-3 px-4 font-semibold">Ngày Tạo</th>
                                            <th className="text-left py-3 px-4 font-semibold">Hành Động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchaseOrders.map((order) => (
                                            <tr key={order.id} className="border-b border-border hover:bg-muted/50">
                                                <td className="py-3 px-4 font-medium">{order.po_number}</td>
                                                <td className="py-3 px-4">{order.supplier_name || '-'}</td>
                                                <td className="py-3 px-4 text-right">{Number(order.total_amount || 0).toLocaleString("vi-VN")} ₫</td>
                                                <td className="py-3 px-4 text-sm text-muted-foreground">{new Date(order.created_at).toLocaleString("vi-VN")}</td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await mobileFetch(`/api/purchase-orders-detail/${order.id}`)
                                                                    const json = await res.json()
                                                                    if (json?.success) {
                                                                        setSelectedPO(json.data)
                                                                        setViewPOOpen(true)
                                                                    }
                                                                } catch (err) {
                                                                    toast.error("Lỗi tải chi tiết")
                                                                }
                                                            }}
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                        {!isPOLocked(order.created_at) && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="hover:bg-red-50 hover:text-red-600"
                                                                onClick={() => {
                                                                    setConfirmDialog({
                                                                        open: true,
                                                                        title: "Xác nhận xóa phiếu",
                                                                        description: "Bạn có chắc muốn xóa phiếu này? Tồn kho sẽ được hoàn tác lại.",
                                                                        onConfirm: async () => {
                                                                            setConfirmDialog(prev => ({ ...prev, open: false }))
                                                                            try {
                                                                                const res = await mobileFetch(`/api/purchase-orders-detail/${order.id}`, { method: "DELETE" })
                                                                                const json = await res.json()
                                                                                if (!res.ok || !json?.success) {
                                                                                    throw new Error(json?.error || "Lỗi xóa phiếu")
                                                                                }
                                                                                toast.success("Đã xóa phiếu và hoàn tác tồn kho")
                                                                                // Reload
                                                                                if (user?.warehouseId) {
                                                                                    const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${user.warehouseId}`)
                                                                                    const poJson = await poRes.json()
                                                                                    if (poJson?.success) {
                                                                                        setPurchaseOrders(poJson.data || [])
                                                                                    }
                                                                                }
                                                                            } catch (err: any) {
                                                                                toast.error("Lỗi xóa phiếu", { description: err?.message })
                                                                            }
                                                                        }
                                                                    })
                                                                }}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {purchaseOrders.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                                                    Chưa có phiếu nhập mua hàng nào
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            {/* Create PO Dialog */}
            <Dialog open={createPOOpen} onOpenChange={(open) => {
                setCreatePOOpen(open)
                if (!open) {
                    setSelectedSupplier(null)
                    setSelectedProducts(new Set())
                    setProductQuantities(new Map())
                }
            }}>
                <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                        <DialogTitle>Tạo Phiếu Nhập Mua Hàng</DialogTitle>
                        <DialogDescription>Chọn nhà cung cấp và sản phẩm cần nhập</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto">
                        <div className="px-6 py-4 space-y-4">
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
                                    <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
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
                                                        const qty = productQuantities.get(product.product_id) || { quantity: "", unitId: product.unit_id || "" }
                                                        const productUnits = productUnitsMap.get(product.product_id) || []

                                                        return (
                                                            <tr key={product.id} className={`border-b ${isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'}`}>
                                                                <td className="py-3 px-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={(e) => {
                                                                            const newSet = new Set(selectedProducts)
                                                                            if (e.target.checked) {
                                                                                newSet.add(product.product_id)
                                                                            } else {
                                                                                newSet.delete(product.product_id)
                                                                            }
                                                                            setSelectedProducts(newSet)
                                                                        }}
                                                                        className="w-4 h-4"
                                                                    />
                                                                </td>
                                                                <td className="py-3 px-3 text-muted-foreground text-xs">{product.code}</td>
                                                                <td className="py-3 px-3 font-medium">{product.name}</td>
                                                                <td className="py-3 px-3 text-right">{Number(product.unit_price).toLocaleString("vi-VN")} đ</td>
                                                                <td className="py-3 px-3 text-center">
                                                                    {isSelected ? (
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            step="0.0001"
                                                                            placeholder="0"
                                                                            value={qty.quantity}
                                                                            onChange={(e) => {
                                                                                const newQty = new Map(productQuantities)
                                                                                newQty.set(product.product_id, {
                                                                                    quantity: e.target.value,
                                                                                    unitId: qty.unitId,
                                                                                })
                                                                                setProductQuantities(newQty)
                                                                            }}
                                                                            className="text-sm text-center w-20 mx-auto"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-muted-foreground">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="py-3 px-3 text-center">
                                                                    {isSelected && productUnits.length > 0 ? (
                                                                        <Select value={qty.unitId || ""} onValueChange={(value) => {
                                                                            const newQty = new Map(productQuantities)
                                                                            newQty.set(product.product_id, {
                                                                                quantity: qty.quantity,
                                                                                unitId: value,
                                                                            })
                                                                            setProductQuantities(newQty)
                                                                        }}>
                                                                            <SelectTrigger className="w-24 mx-auto text-sm">
                                                                                <SelectValue placeholder="Đơn vị" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {productUnits.map((unit: any) => (
                                                                                    <SelectItem key={unit.id} value={unit.id}>
                                                                                        {unit.code || unit.name}
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
                        </div>
                    </div>

                    <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setCreatePOOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={handleCreatePO} disabled={creatingPO || !selectedSupplier || selectedProducts.size === 0}>
                            {creatingPO ? "Đang tạo..." : "Tạo Phiếu"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View PO Dialog */}
            <Dialog open={viewPOOpen} onOpenChange={setViewPOOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Chi tiết phiếu nhập mua</DialogTitle>
                        <DialogDescription>Mã phiếu: {selectedPO?.po_number}</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto">
                        {selectedPO && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Nhà cung cấp</p>
                                        <p className="font-medium">{selectedPO.supplier_name || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Tổng tiền</p>
                                        <p className="font-medium">{Number(selectedPO.total_amount || 0).toLocaleString("vi-VN")} ₫</p>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-base font-semibold">Danh sách sản phẩm</Label>
                                    <div className="space-y-2 mt-2">
                                        {selectedPO.items?.map((item: any) => (
                                            <div key={item.id} className="p-3 border rounded-lg">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-medium">{item.product_name || item.product_code}</p>
                                                        <p className="text-sm text-muted-foreground">Mã: {item.product_code}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-medium">{item.quantity} {item.unit_name || item.unit_code || ''}</p>
                                                        <p className="text-sm text-muted-foreground">{Number(item.line_total || 0).toLocaleString("vi-VN")} ₫</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
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

            {/* Template Guide Dialog */}
            <Dialog open={templateGuideOpen} onOpenChange={setTemplateGuideOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Hướng Dẫn Sử Dụng Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <p>Template Excel bao gồm các cột:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Mã Sản Phẩm</strong>: Mã sản phẩm trong hệ thống</li>
                            <li><strong>Tên Sản Phẩm</strong>: (Tham khảo, không bắt buộc)</li>
                            <li><strong>Số Lượng</strong>: Số lượng nhập</li>
                            <li><strong>Đơn Vị</strong>: Tên đơn vị (ví dụ: Hộp, Cái, Chai)</li>
                        </ul>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setTemplateGuideOpen(false)}>Đóng</Button>
                        <Button onClick={() => { downloadTemplate(); setTemplateGuideOpen(false) }}>
                            <Download className="w-4 h-4 mr-2" />
                            Tải Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Confirmation Dialog */}
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                        <DialogTitle>Xác Nhận Import Nhập Hàng</DialogTitle>
                        <DialogDescription>Kiểm tra danh sách sản phẩm sẽ được import</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {importErrors.length > 0 && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
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
                                                <th className="text-left py-2 px-3">Mã SP</th>
                                                <th className="text-left py-2 px-3">Tên SP</th>
                                                <th className="text-center py-2 px-3">Số Lượng</th>
                                                <th className="text-center py-2 px-3">Đơn Vị</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importData.map((item, idx) => (
                                                <tr key={idx} className="border-b">
                                                    <td className="py-2 px-3">{item.code}</td>
                                                    <td className="py-2 px-3">{item.productName}</td>
                                                    <td className="py-2 px-3 text-center">{item.quantity}</td>
                                                    <td className="py-2 px-3 text-center">{item.unitName}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>Hủy</Button>
                        <Button onClick={handleSubmitImport} disabled={isImporting || importData.length === 0}>
                            {isImporting ? "Đang xử lý..." : "Xác Nhận Import"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Confirm Dialog */}
            <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmDialog.title}</DialogTitle>
                        <DialogDescription>{confirmDialog.description}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Hủy</Button>
                        <Button variant="destructive" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
