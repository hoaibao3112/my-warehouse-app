"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Plus, Edit, Trash2, Eye, Check, X, Download, Upload, Truck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrencyInput } from "@/hooks/use-currency-input"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function SuppliersPage() {
  const [activeTab, setActiveTab] = useState<"suppliers" | "products">("suppliers")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false)
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importGuideOpen, setImportGuideOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [supplierProducts, setSupplierProducts] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({ name: "", contact_person: "", email: "", phone: "", address: "" })
  const [creating, setCreating] = useState(false)
  const [receiving, setReceiving] = useState(false)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })
  const [menuTypes, setMenuTypes] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [selectedProductsForAdd, setSelectedProductsForAdd] = useState<Map<string, string>>(new Map()) // productId -> unitPrice
  const [addingProduct, setAddingProduct] = useState(false)
  const [searchProductQuery, setSearchProductQuery] = useState("")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [productPriceDisplayMap, setProductPriceDisplayMap] = useState<Map<string, string>>(new Map())
  const [selectedProductUnits, setSelectedProductUnits] = useState<Map<string, any[]>>(new Map())
  const [selectedProductUnitMap, setSelectedProductUnitMap] = useState<Map<string, string>>(new Map())
  const { handleInputChange: handlePriceChange, getNumericValue } = useCurrencyInput()

  // Load suppliers
  useEffect(() => {
    loadSuppliers()
    loadMenuTypes()
    loadCategories()
    loadAllProducts()
  }, [])

  // Load supplier products when supplier changes
  useEffect(() => {
    if (!selectedSupplier) {
      setSupplierProducts([])
      setSelectedProducts(new Set())
      return
    }

    const loadSupplierProducts = async () => {
      try {
        const res = await mobileFetch(`/api/suppliers/${selectedSupplier}`)
        const json = await res.json()
        if (json?.success) {
          setSupplierProducts(json.data?.products || [])
          setSelectedProducts(new Set(json.data?.products?.map((p: any) => p.product_id) || []))
        }
      } catch (err: any) {
        toast.error("Lỗi tải sản phẩm", { description: err?.message })
      }
    }

    loadSupplierProducts()
  }, [selectedSupplier])

  const loadSuppliers = async () => {
    try {
      const res = await mobileFetch(`/api/suppliers`)
      const json = await res.json()
      if (json?.success) {
        setSuppliers(json.data || [])
      }
    } catch (err: any) {
      toast.error("Lỗi tải dữ liệu", { description: err?.message })
    }
  }


  const loadMenuTypes = async () => {
    try {
      const res = await mobileFetch(`/api/menu-types`)
      const json = await res.json()
      if (json?.success) {
        setMenuTypes(json.data || [])
      }
    } catch (err: any) {
      console.error("Failed to load menu types:", err)
      toast.error("Không thể tải loại menu")
    }
  }

  const loadCategories = async () => {
    try {
      const res = await mobileFetch(`/api/categories`)
      const json = await res.json()
      if (json?.success) {
        setCategories(json.data || [])
      }
    } catch (err: any) {
      console.error("Failed to load categories:", err)
      toast.error("Không thể tải danh mục")
    }
  }

  const loadAllProducts = async () => {
    try {
      const res = await mobileFetch(`/api/products?pageSize=9999`)
      const json = await res.json()
      if (json?.success) {
        setAllProducts(json.data || [])
      }
    } catch (err: any) {
      console.error("Failed to load products:", err)
      toast.error("Không thể tải sản phẩm")
    }
  }

  // Supplier handlers
  const handleCreateSupplier = async () => {
    if (!formData.name.trim()) {
      toast.error("Vui lòng nhập tên nhà cung cấp")
      return
    }

    setCreating(true)
    try {
      const url = editingId ? `/api/suppliers/${editingId}` : `/api/suppliers`
      const method = editingId ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Lỗi")
      }

      toast.success(editingId ? "Cập nhật thành công" : "Tạo thành công")
      setCreateSupplierOpen(false)
      setEditingId(null)
      setFormData({ name: "", contact_person: "", email: "", phone: "", address: "" })
      loadSuppliers()
    } catch (err: any) {
      toast.error("Lỗi", { description: err?.message })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteSupplier = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa nhà cung cấp",
      description: "Bạn có chắc muốn xóa nhà cung cấp này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await mobileFetch(`/api/suppliers/${id}`, { method: "DELETE" })
          const json = await res.json()
          if (!res.ok || !json?.success) {
            throw new Error(json?.error || "Lỗi xóa")
          }

          toast.success("Đã xóa nhà cung cấp")
          loadSuppliers()
        } catch (err: any) {
          toast.error("Lỗi", { description: err?.message })
        }
      }
    })
  }

  const openEditSupplier = (supplier: any) => {
    setEditingId(supplier.id)
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
    })
    setCreateSupplierOpen(true)
  }

  const openCreateSupplier = () => {
    setEditingId(null)
    setFormData({ name: "", contact_person: "", email: "", phone: "", address: "" })
    setCreateSupplierOpen(true)
  }


  const handleAddProduct = async () => {
    if (!selectedSupplier || selectedProductsForAdd.size === 0) {
      toast.error("Vui lòng chọn ít nhất một sản phẩm")
      return
    }

    // Check all products have prices
    for (const [, price] of selectedProductsForAdd) {
      if (!price || Number(price) < 0) {
        toast.error("Vui lòng nhập giá hợp lệ cho tất cả sản phẩm")
        return
      }
    }

    setAddingProduct(true)
    try {
      // Add each product
      for (const [productId, unitPrice] of selectedProductsForAdd) {
        const res = await mobileFetch(`/api/suppliers/${selectedSupplier}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            unitPrice: Number(unitPrice),
            unitId: selectedProductUnitMap.get(productId) || null,
          }),
        })

        const json = await res.json()
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Lỗi thêm sản phẩm")
        }
      }

      toast.success(`Đã thêm ${selectedProductsForAdd.size} sản phẩm`)
      setAddProductOpen(false)
      setSelectedProductsForAdd(new Map())
      // Reload supplier products
      const supplierRes = await mobileFetch(`/api/suppliers/${selectedSupplier}`)
      const supplierJson = await supplierRes.json()
      if (supplierJson?.success) {
        setSupplierProducts(supplierJson.data?.products || [])
      }
    } catch (err: any) {
      toast.error("Lỗi", { description: err?.message })
    } finally {
      setAddingProduct(false)
    }
  }

  const handleRemoveProduct = async (productId: string) => {
    if (!selectedSupplier) return
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa sản phẩm",
      description: "Bạn có chắc muốn xóa sản phẩm này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await mobileFetch(`/api/suppliers/${selectedSupplier}/products`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId }),
          })

          const json = await res.json()
          if (!res.ok || !json?.success) {
            throw new Error(json?.error || "Lỗi xóa sản phẩm")
          }

          toast.success("Sản phẩm đã được xóa")
          // Reload supplier products
          const supplierRes = await mobileFetch(`/api/suppliers/${selectedSupplier}`)
          const supplierJson = await supplierRes.json()
          if (supplierJson?.success) {
            setSupplierProducts(supplierJson.data?.products || [])
          }
        } catch (err: any) {
          toast.error("Lỗi", { description: err?.message })
        }
      }
    })
  }

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    PENDING_RECEIPT: "bg-yellow-100 text-yellow-800",
    RECEIVED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  }

  const downloadTemplate = async () => {
    try {
      const { downloadExcelTemplate } = await import("@/lib/excel-utils")

      await downloadExcelTemplate({
        fileName: "suppliers-template.xlsx",
        headers: ["Tên Nhà Cung Cấp", "Người Liên Hệ", "Email", "Điện Thoại", "Địa Chỉ", "Mã Sản Phẩm & Giá"],
        sampleData: [
          ["Công Ty ABC", "Nguyễn Văn A", "abc@company.vn", "0901234567", "123 Đường Lê Lợi - Hà Nội", "P001:25000;P002:35000"],
          ["Nhà Cung Cấp XYZ", "Trần Thị B", "xyz@supplier.vn", "0987654321", "456 Nguyễn Huệ - TP. Hồ Chí Minh", "P003:15000;P004:45000"],
          ["Nhà cung cấp Z", "", "", "0909000111", "100 Trần Hưng Đạo - Đà Nẵng", "P001:24000"]
        ],
        columnWidths: [30, 20, 25, 15, 35, 40]
      })

      toast.success("Template Excel đã được tải xuống")
    } catch (err) {
      console.error("Failed to download template", err)
      toast.error("Lỗi khi tải template")
    }
  }

  const fetchProductUnits = async (productId: string) => {
    if (selectedProductUnits.has(productId)) return

    try {
      const res = await mobileFetch(`/api/products/${productId}/units`)
      const json = await res.json()
      if (json?.success) {
        const units = json.data?.units || []
        const defaultUnitId = json.data?.defaultUnitId

        setSelectedProductUnits(prev => new Map(prev).set(productId, units))

        // Auto select default unit if not selected
        if (!selectedProductUnitMap.has(productId) && defaultUnitId) {
          setSelectedProductUnitMap(prev => new Map(prev).set(productId, defaultUnitId))
        } else if (!selectedProductUnitMap.has(productId) && units.length > 0) {
          setSelectedProductUnitMap(prev => new Map(prev).set(productId, units[0].id))
        }
      }
    } catch (err) {
      console.error("Failed to load units for product", productId, err)
    }
  }

  // Batch fetch units for all products to avoid N+1
  const fetchAllUnitsForDialog = async (products: any[]) => {
    if (!products.length) return

    // Filter out products that already have units loaded
    const missingIds = products.filter(p => !selectedProductUnits.has(p.id)).map(p => p.id)
    if (missingIds.length === 0) return

    // Chunk into batches of 100 to avoid payload limits
    const BATCH_SIZE = 100
    const chunks = []
    for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
      chunks.push(missingIds.slice(i, i + BATCH_SIZE))
    }

    setAddingProduct(true)

    try {
      // Process all chunks and collect ALL data first
      const allUnitsData: Record<string, any> = {}

      await Promise.all(chunks.map(async (chunkIds) => {
        try {
          const res = await mobileFetch('/api/products/batch-units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds: chunkIds })
          })
          const json = await res.json()

          if (json?.success && json.data) {
            // Collect data, don't setState yet
            Object.assign(allUnitsData, json.data)
          }
        } catch (e) {
          console.error("Error fetching batch units", e)
        }
      }))

      // Now update state ONCE with all collected data
      if (Object.keys(allUnitsData).length > 0) {
        setSelectedProductUnits(prev => {
          const next = new Map(prev)
          Object.entries(allUnitsData).forEach(([pid, data]: [string, any]) => {
            next.set(pid, data.units || [])
          })
          return next
        })

        setSelectedProductUnitMap(prev => {
          const next = new Map(prev)
          Object.entries(allUnitsData).forEach(([pid, data]: [string, any]) => {
            const units = data.units || []
            const defaultId = data.defaultUnitId

            // Only set if not already set
            if (!next.has(pid)) {
              if (defaultId) next.set(pid, defaultId)
              else if (units.length > 0) next.set(pid, units[0].id)
            }
          })
          return next
        })
      }
    } finally {
      setAddingProduct(false)
    }
  }

  // Import state
  const [importData, setImportData] = useState<any[]>([])
  const [importErrors, setImportErrors] = useState<any[]>([])
  const [importPreviewOpen, setImportPreviewOpen] = useState(false)

  // Handle file selection and parse
  const handleImportFile = async () => {
    if (!importFile) {
      toast.error("Vui lòng chọn file")
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append("file", importFile)

      const res = await mobileFetch("/api/admin/suppliers/parse-import", {
        method: "POST",
        body: formData,
      })

      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Lỗi đọc file")
      }

      setImportData(json.data?.items || [])
      setImportErrors(json.data?.errors || [])
      setImportPreviewOpen(true)
      setImportOpen(false) // Close file selection dialog
    } catch (err: any) {
      toast.error("Lỗi đọc file", { description: err?.message })
    } finally {
      setImporting(false)
      setImportFile(null)
    }
  }

  // Handle confirm import
  const handleConfirmImport = async () => {
    if (importData.length === 0) {
      toast.error("Không có dữ liệu hợp lệ để import")
      return
    }

    setImporting(true)
    try {
      const res = await mobileFetch("/api/admin/suppliers/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: importData }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Lỗi import")
      }

      const { created, updated, errors } = json.data
      toast.success(`Đã import thành công: ${created} tạo mới, ${updated} cập nhật`)

      if (errors && errors.length > 0) {
        toast.warning(`${errors.length} lỗi xảy ra trong quá trình lưu`)
        console.warn("Import errors:", errors)
      }

      setImportPreviewOpen(false)
      setImportData([])
      setImportErrors([])
      loadSuppliers()
    } catch (err: any) {
      toast.error("Lỗi import", { description: err?.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Truck}
        title="Nhà Cung Cấp"
        subtitle="Quản lý nhà cung cấp"
        gradient="teal"
      />

      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold">Quản Lý Nhà Cung Cấp</h1>
          <p className="text-muted-foreground mt-1">Quản lý nhà cung cấp và các phiếu nhập hàng từ nhà cung cấp</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 md:gap-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => setActiveTab("suppliers")}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "suppliers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <span className="hidden sm:inline">Danh Sách </span>Nhà Cung Cấp
          </button>
          <button
            onClick={() => setActiveTab("products")}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "products"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            Sản Phẩm <span className="hidden sm:inline">Nhà Cung Cấp</span>
          </button>
        </div>

        {/* Suppliers Tab */}
        {activeTab === "suppliers" && (
          <div className="space-y-4">
            <div className="flex gap-2 justify-end flex-wrap">
              <Button onClick={() => setImportGuideOpen(true)} variant="outline" size="sm" className="gap-1 md:gap-2">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Xem </span>Hướng Dẫn
              </Button>
              <Button onClick={downloadTemplate} variant="outline" size="sm" className="gap-1 md:gap-2 border-green-600 text-green-600 hover:bg-green-50">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Tải </span>Template
              </Button>
              <Button onClick={() => setImportOpen(true)} variant="outline" size="sm" className="gap-1 md:gap-2 border-orange-600 text-orange-600 hover:bg-orange-50">
                <Upload className="w-4 h-4" />
                Import<span className="hidden sm:inline"> Excel</span>
              </Button>
              <Button onClick={openCreateSupplier} size="sm" className="gap-1 md:gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Thêm Nhà Cung Cấp</span>
                <span className="sm:hidden">Thêm</span>
              </Button>
            </div>

            <Card className="p-6">
              <ResponsiveTable
                data={suppliers}
                columns={[
                  {
                    key: 'name',
                    label: 'Tên Nhà Cung Cấp',
                    render: (supplier) => <span className="font-medium">{supplier.name}</span>,
                    mobilePrimary: true,
                  },
                  {
                    key: 'contact_person',
                    label: 'Người Liên Hệ',
                    render: (supplier) => <span>{supplier.contact_person || "-"}</span>,
                  },
                  {
                    key: 'email',
                    label: 'Email',
                    render: (supplier) => <span className="text-sm">{supplier.email || "-"}</span>,
                  },
                  {
                    key: 'phone',
                    label: 'Điện Thoại',
                    render: (supplier) => <span>{supplier.phone || "-"}</span>,
                    mobilePrimary: true,
                  },
                ]}
                actions={[
                  {
                    label: 'Sửa',
                    icon: <Edit className="w-4 h-4" />,
                    onClick: (supplier) => openEditSupplier(supplier),
                    variant: 'ghost',
                  },
                  {
                    label: 'Xóa',
                    icon: <Trash2 className="w-4 h-4" />,
                    onClick: (supplier) => handleDeleteSupplier(supplier.id),
                    variant: 'ghost',
                    className: 'hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400'
                  },
                ]}
                keyExtractor={(supplier) => supplier.id}
                loading={loading}
                emptyMessage="Chưa có nhà cung cấp nào"
                mobileCardTitle={(supplier) => supplier.name}
                mobileCardMeta={(supplier) => [
                  <span className="text-xs">Liên hệ: {supplier.contactPerson || '-'}</span>,
                  <span className="text-xs">Email: {supplier.email || '-'}</span>,
                  <span className="text-xs">SĐT: {supplier.phone || '-'}</span>,
                ]}
              />
            </Card>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === "products" && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label className="text-sm font-medium">Chọn Nhà Cung Cấp</Label>
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
              <div className="flex items-end">
                <Button onClick={() => {
                  setAddProductOpen(true)
                  fetchAllUnitsForDialog(allProducts)
                }} className="gap-2" disabled={!selectedSupplier}>
                  <Plus className="w-4 h-4" />
                  Thêm Sản Phẩm
                </Button>
              </div>
            </div>

            {selectedSupplier && (
              <Card className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Mã Sản Phẩm</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Tên Sản Phẩm</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Đơn Vị</th>
                        <th className="text-right py-3 px-4 font-semibold text-foreground">Giá Nhà Cung Cấp</th>
                        <th className="text-center py-3 px-4 font-semibold text-foreground">Hành Động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierProducts.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-muted-foreground">
                            Chưa có sản phẩm
                          </td>
                        </tr>
                      ) : (
                        supplierProducts.map((product) => (
                          <tr key={product.id} className="border-b border-border hover:bg-muted/50">
                            <td className="py-3 px-4 font-mono text-sm">{product.code || "-"}</td>
                            <td className="py-3 px-4 font-medium">{product.name}</td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">{product.unit_name || "-"}</td>
                            <td className="py-3 px-4 text-right font-semibold">{Number(product.unit_price).toLocaleString("vi-VN")} đ</td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                                onClick={() => handleRemoveProduct(product.product_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}


        {/* Create Supplier Dialog */}
        <Dialog open={createSupplierOpen} onOpenChange={setCreateSupplierOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Chỉnh Sửa Nhà Cung Cấp" : "Thêm Nhà Cung Cấp"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name" className="text-sm font-medium">
                  Tên Nhà Cung Cấp *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nhập tên nhà cung cấp"
                  disabled={creating}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="contact_person" className="text-sm font-medium">
                  Người Liên Hệ
                </Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  placeholder="Tên người liên hệ"
                  disabled={creating}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  disabled={creating}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="phone" className="text-sm font-medium">
                  Điện Thoại
                </Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Số điện thoại"
                  disabled={creating}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="address" className="text-sm font-medium">
                  Địa Chỉ
                </Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Địa chỉ nhà cung cấp"
                  disabled={creating}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateSupplierOpen(false)} disabled={creating}>
                Hủy
              </Button>
              <Button onClick={handleCreateSupplier} disabled={creating} className="bg-blue-600 hover:bg-blue-700">
                {creating ? "Đang lưu..." : editingId ? "Cập Nhật" : "Tạo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Import Suppliers Dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Nhà Cung Cấp từ Excel</DialogTitle>
              <DialogDescription>
                Chọn file Excel chứa danh sách nhà cung cấp để import vào hệ thống
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Quick Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Lưu ý:</strong> Tải template, điền thông tin nhà cung cấp, sau đó chọn file để import.
                  <button
                    onClick={() => { setImportOpen(false); setImportGuideOpen(true); }}
                    className="text-blue-600 hover:text-blue-700 underline ml-1"
                  >
                    Xem hướng dẫn chi tiết
                  </button>
                </p>
              </div>

              {/* File Input */}
              <div>
                <Label htmlFor="import-file" className="text-sm font-medium">
                  Chọn File
                </Label>
                <div className="mt-2">
                  <input
                    id="import-file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    disabled={importing}
                    className="block w-full text-sm text-slate-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-violet-50 file:text-violet-700
                      hover:file:bg-violet-100"
                  />
                </div>
                {importFile && (
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Đã chọn: {importFile.name}
                  </p>
                )}
              </div>

              {/* Download Template Button */}
              <div>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  className="w-full border-green-600 text-green-600 hover:bg-green-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Tải Template
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                Hủy
              </Button>
              <Button
                onClick={handleImportFile}
                disabled={!importFile || importing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {importing ? "Đang đọc file..." : "Tiếp Tục"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Preview Dialog */}
        <Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Xác Nhận Import Nhà Cung Cấp</DialogTitle>
              <DialogDescription>Kiểm tra dữ liệu trước khi lưu vào hệ thống</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* Errors Section */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-800 mb-2">Phát hiện {importErrors.length} lỗi:</h4>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {importErrors.map((err, idx) => (
                      <li key={idx}>
                        Dòng {err.row}: <strong>{err.name}</strong> - {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Valid Items Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold">Danh sách hợp lệ ({importData.length})</h4>
                </div>

                {importData.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b">
                          <tr>
                            <th className="py-2 px-3 text-left">Trạng Thái</th>
                            <th className="py-2 px-3 text-left">Tên NCC</th>
                            <th className="py-2 px-3 text-left">Liên Hệ</th>
                            <th className="py-2 px-3 text-left">SĐT</th>
                            <th className="py-2 px-3 text-center">SP</th>
                          </tr>
                        </thead>
                        <tbody className="max-h-60 overflow-y-auto">
                          {importData.slice(0, 100).map((item, idx) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="py-2 px-3">
                                {item.status === 'UPDATE' ? (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                    Cập nhật
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    Mới
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium">{item.name}</td>
                              <td className="py-2 px-3 text-muted-foreground">{item.contact_person || '-'}</td>
                              <td className="py-2 px-3 text-muted-foreground">{item.phone || '-'}</td>
                              <td className="py-2 px-3 text-center">
                                {item.products && item.products.length > 0 ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    {item.products.length} SP
                                  </Badge>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {importData.length > 100 && (
                            <tr>
                              <td colSpan={5} className="py-2 text-center text-muted-foreground italic">
                                ... và {importData.length - 100} dòng khác
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8 border rounded-lg border-dashed">
                    Không có dữ liệu hợp lệ để import
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 flex-shrink-0 bg-background">
              <Button variant="outline" onClick={() => setImportPreviewOpen(false)} disabled={importing}>Hủy</Button>
              <Button onClick={handleConfirmImport} disabled={importing || importData.length === 0} className="bg-green-600 hover:bg-green-700">
                {importing ? "Đang xử lý..." : `Xác Nhận Import (${importData.length})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Add Product Dialog */}
        <Dialog open={addProductOpen} onOpenChange={(open) => {
          setAddProductOpen(open)
          if (open) {
            // Fetch units for ALL products when opening dialog
            fetchAllUnitsForDialog(allProducts)
          } else {
            setSelectedProductsForAdd(new Map())
            setProductPriceDisplayMap(new Map())
            setSelectedProductUnits(new Map())
            setSelectedProductUnitMap(new Map())
            setSearchProductQuery("")
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Thêm Sản Phẩm Vào Nhà Cung Cấp</DialogTitle>
              <DialogDescription>Chọn sản phẩm và nhập giá cho từng sản phẩm</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
              <div>
                <Input
                  placeholder="Tìm kiếm theo mã hoặc tên sản phẩm..."
                  value={searchProductQuery}
                  onChange={(e) => setSearchProductQuery(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b">
                    <tr>
                      <th className="text-left py-2 px-3 w-10">✓</th>
                      <th className="text-left py-2 px-3">Mã Sản Phẩm</th>
                      <th className="text-left py-2 px-3">Tên Sản Phẩm</th>
                      <th className="text-left py-2 px-3 w-40">Đơn Vị</th>
                      <th className="text-right py-2 px-3 w-40">Giá NCC (VND)</th>
                    </tr>
                  </thead>
                  <tbody className="max-h-96 overflow-y-auto">
                    {allProducts
                      .filter((product) => {
                        const query = searchProductQuery.toLowerCase()
                        return (
                          product.code?.toLowerCase().includes(query) ||
                          product.name?.toLowerCase().includes(query)
                        )
                      })
                      .map((product) => {
                        const isSelected = selectedProductsForAdd.has(product.id)
                        const price = selectedProductsForAdd.get(product.id) || ""
                        return (
                          <tr key={product.id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newMap = new Map(selectedProductsForAdd)
                                  if (e.target.checked) {
                                    newMap.set(product.id, "")
                                  } else {
                                    newMap.delete(product.id)
                                  }
                                  setSelectedProductsForAdd(newMap)
                                }}
                                className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono text-xs">{product.code}</td>
                            <td className="py-2 px-3">{product.name}</td>
                            <td className="py-2 px-3">
                              {isSelected ? (
                                selectedProductUnits.get(product.id) ? (
                                  <Select
                                    value={selectedProductUnitMap.get(product.id) || ""}
                                    onValueChange={(val) => setSelectedProductUnitMap(prev => new Map(prev).set(product.id, val))}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Chọn..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {selectedProductUnits.get(product.id)?.map((u: any) => (
                                        <SelectItem key={u.id} value={u.id}>
                                          {u.code} {u.isDefault ? '(Chuẩn)' : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground animate-pulse">Đang tải...</span>
                                )
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {isSelected ? (
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={productPriceDisplayMap.get(product.id) || ''}
                                  onChange={(e) => {
                                    const { display, numeric } = handlePriceChange(e.target.value)
                                    const newDisplayMap = new Map(productPriceDisplayMap)
                                    newDisplayMap.set(product.id, display)
                                    setProductPriceDisplayMap(newDisplayMap)
                                    const newMap = new Map(selectedProductsForAdd)
                                    newMap.set(product.id, String(numeric))
                                    setSelectedProductsForAdd(newMap)
                                  }}
                                  className="w-full text-right"
                                />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>

              {selectedProductsForAdd.size > 0 && (
                <div className="text-sm text-muted-foreground">
                  Đã chọn {selectedProductsForAdd.size} sản phẩm
                </div>
              )}
            </div></div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddProductOpen(false)} disabled={addingProduct}>
                Hủy
              </Button>
              <Button onClick={handleAddProduct} disabled={addingProduct || selectedProductsForAdd.size === 0} className="bg-blue-600 hover:bg-blue-700">
                {addingProduct ? "Đang thêm..." : "Thêm Sản Phẩm"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Import Suppliers Dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Nhà Cung Cấp từ Excel</DialogTitle>
              <DialogDescription>
                Chọn file Excel chứa danh sách nhà cung cấp để import vào hệ thống
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Quick Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Lưu ý:</strong> Tải template, điền thông tin nhà cung cấp, sau đó chọn file để import.
                  <button
                    onClick={() => { setImportOpen(false); setImportGuideOpen(true); }}
                    className="text-blue-600 hover:text-blue-700 underline ml-1"
                  >
                    Xem hướng dẫn chi tiết
                  </button>
                </p>
              </div>

              {/* File Input */}
              <div>
                <Label htmlFor="import-file" className="text-sm font-medium">
                  Chọn File
                </Label>
                <div className="mt-2">
                  <input
                    id="import-file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    disabled={importing}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm cursor-pointer hover:border-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                </div>
                {importFile && (
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Đã chọn: {importFile.name}
                  </p>
                )}
              </div>

              {/* Download Template Button */}
              <div>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  className="w-full border-green-600 text-green-600 hover:bg-green-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Tải Template
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                Hủy
              </Button>
              <Button
                onClick={handleImportFile}
                disabled={!importFile || importing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {importing ? "Đang import..." : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Guide Dialog */}
        <Dialog open={importGuideOpen} onOpenChange={setImportGuideOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Hướng Dẫn Import Nhà Cung Cấp</DialogTitle>
              <DialogDescription>
                Hướng dẫn chi tiết cách import nhà cung cấp từ file Excel/CSV
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
              {/* Step 1 */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">Bước 1: Tải Template</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Click nút "Tải Template" để tải file mẫu với các cột dữ liệu và ví dụ.
                </p>
              </div>

              {/* Step 2 */}
              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">Bước 2: Cấu Trúc File</h3>
                <div className="space-y-3">
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">Các cột trong file template:</p>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li><strong className="text-foreground">Tên Nhà Cung Cấp:</strong> <span className="text-red-600">[BẮT BUỘC]</span> Tên của nhà cung cấp</li>
                      <li><strong className="text-foreground">Người Liên Hệ:</strong> Tên người liên hệ (không bắt buộc)</li>
                      <li><strong className="text-foreground">Email:</strong> Email liên hệ định dạng example@domain.com (không bắt buộc)</li>
                      <li><strong className="text-foreground">Điện Thoại:</strong> Số điện thoại, tối thiểu 10 chữ số (không bắt buộc)</li>
                      <li><strong className="text-foreground">Địa Chỉ:</strong> Địa chỉ nhà cung cấp (không bắt buộc)</li>
                      <li><strong className="text-foreground">Mã Sản Phẩm & Giá:</strong> Danh sách sản phẩm và giá (không bắt buộc)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="border-l-4 border-purple-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">Bước 3: Thêm Sản Phẩm (Tùy Chọn)</h3>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Bạn có thể thêm sản phẩm cho nhà cung cấp ngay trong file import:
                  </p>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">Cú pháp:</p>
                    <code className="text-xs bg-background px-2 py-1 rounded block mb-2">
                      MÃ_SẢN_PHẨM:GIÁ;MÃ_SẢN_PHẨM_2:GIÁ_2
                    </code>
                    <p className="text-sm font-medium mb-2">Ví dụ:</p>
                    <code className="text-xs bg-background px-2 py-1 rounded block">
                      P001:25000;P002:35000;P003:15000
                    </code>
                    <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                      <li>• Mã sản phẩm và giá phân cách bằng dấu hai chấm (:)</li>
                      <li>• Các sản phẩm phân cách bằng dấu chấm phẩy (;)</li>
                      <li>• Giá là số nguyên, không có dấu phẩy hay ký tự đặc biệt</li>
                    </ul>
                  </div>
                  {allProducts.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm font-medium mb-2">Danh sách một số mã sản phẩm khả dụng:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {allProducts.slice(0, 10).map(p => (
                          <div key={p.id} className="flex justify-between bg-background px-2 py-1 rounded">
                            <span className="font-mono font-semibold">{p.code}</span>
                            <span className="text-muted-foreground truncate ml-2">{p.name}</span>
                          </div>
                        ))}
                      </div>
                      {allProducts.length > 10 && (
                        <p className="text-xs text-muted-foreground mt-2">Và {allProducts.length - 10} sản phẩm khác...</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 4 */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">Bước 4: Điền Dữ Liệu</h3>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Điền thông tin nhà cung cấp vào các dòng, mỗi dòng là một nhà cung cấp.
                  </p>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-medium mb-2">Ví dụ dữ liệu:</p>
                    <div className="text-xs font-mono bg-background p-2 rounded overflow-x-auto">
                      <div>Công Ty ABC,Nguyễn Văn A,abc@company.vn,0901234567,123 Đường Lê Lợi - Hà Nội,P001:25000;P002:35000</div>
                      <div className="mt-1">Nhà Cung Cấp XYZ,Trần Thị B,xyz@supplier.vn,0987654321,456 Nguyễn Huệ - TP. HCM,P003:15000</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="border-l-4 border-red-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">Bước 5: Lưu & Import</h3>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Lưu file với định dạng <strong className="text-foreground">.xlsx</strong> hoặc <strong className="text-foreground">.csv</strong></li>
                  <li>• Click nút "Import Excel" và chọn file đã lưu</li>
                  <li>• Hệ thống sẽ kiểm tra và import dữ liệu</li>
                  <li>• Kết quả import sẽ hiển thị ở thông báo</li>
                </ul>
              </div>

              {/* Notes */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-900 text-sm mb-2">⚠️ Lưu Ý Quan Trọng:</h4>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• Không xóa hoặc thay đổi tên các cột trong file template</li>
                  <li>• Tên nhà cung cấp là trường bắt buộc, không được để trống</li>
                  <li>• Email phải đúng định dạng (nếu có)</li>
                  <li>• Số điện thoại chỉ chứa chữ số (nếu có)</li>
                  <li>• Mã sản phẩm phải tồn tại trong hệ thống</li>
                </ul>
              </div>
            </div></div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setImportGuideOpen(false)}>
                Đóng
              </Button>
              <Button onClick={() => { setImportGuideOpen(false); downloadTemplate(); }}>
                Tải Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-[340px] rounded-lg">
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
              <DialogDescription>{confirmDialog.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
                Hủy
              </Button>
              <Button variant="destructive" onClick={confirmDialog.onConfirm}>
                Xác nhận
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
