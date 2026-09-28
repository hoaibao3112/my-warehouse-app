"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, Download, Edit, FileDown, Package, Plus, Search, Trash2, Upload } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { useCurrencyInput } from "@/hooks/use-currency-input"
import * as XLSX from 'xlsx'
import { Checkbox } from "@/components/ui/checkbox"

export default function InventoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse()
  const [products, setProducts] = useState<any[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [totalInventoryValue, setTotalInventoryValue] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialog States
  const [viewOpen, setViewOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)

  // Selection State
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Import States
  const [importFile, setImportFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<any | null>(null)

  // Loading States
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [importing, setImporting] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [categories, setCategories] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [warehouseType, setWarehouseType] = useState<string | null>(null)

  // Forms
  const { formatDisplay, handleInputChange: handlePriceChange, getNumericValue } = useCurrencyInput()
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    categoryId: '',
    unitId: '',
    price: ''
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user?.warehouseId) {
      mobileFetch(`/api/warehouses/${user.warehouseId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setWarehouseType(data.data.type)
          }
        })
        .catch(err => console.error(err))
    }
  }, [user?.warehouseId])

  // Load categories and units on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [catsRes, unitsRes] = await Promise.all([
          mobileFetch('/api/categories'),
          mobileFetch('/api/product-units')
        ])

        const catsJson = await catsRes.json()
        if (catsJson.success) setCategories(catsJson.data || [])

        const unitsJson = await unitsRes.json()
        if (unitsJson.success) setUnits(unitsJson.data || [])

      } catch (err) {
        console.warn('Failed to load filters:', err)
      }
    }

    loadFilters()
  }, [])

  const fetchAllData = async () => {
    // Strict enforcement: Only ADMIN and GENERAL_MANAGER can switch warehouses.
    // Others must use their assigned warehouse.
    let currentWarehouseId = user?.warehouseId

    if (user?.role === 'ADMIN' || user?.role === 'GENERAL_MANAGER') {
      currentWarehouseId = selectedWarehouseId || user?.warehouseId
    }

    if (!currentWarehouseId) return

    setLoading(true)
    setError(null)

    try {
      let categoryParam = ''
      if (selectedCategoryId) {
        categoryParam = `&categoryId=${selectedCategoryId}`
      }

      // 1. Define promises for parallel execution
      const productsPromise = mobileFetch(`/api/products?page=1&pageSize=1000${categoryParam}`)
        .then(async res => {
          const json = await res.json()
          if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch products')
          return json.data || []
        })

      const stockPromise = mobileFetch(`/api/warehouse-stock?page=1&pageSize=1000&warehouseId=${currentWarehouseId}`)
        .then(async res => {
          const json = await res.json()
          return json.success ? (json.data || []) : []
        })
        .catch(() => [])

      const totalValuePromise = mobileFetch(`/api/warehouse-stock/total-value?warehouseId=${currentWarehouseId}`)
        .then(async res => {
          const json = await res.json()
          return json.success ? (json.data?.totalValue || 0) : 0
        })
        .catch(() => 0)

      // 2. Execute in parallel
      const [productsData, stockData, totalValueData] = await Promise.all([
        productsPromise,
        stockPromise,
        totalValuePromise
      ])

      // 3. Process Products
      const filteredProds = productsData.filter((p: any) => !p.code?.startsWith('RECIPE-'))

      // 4. Process Stock
      const newStockMap: Record<string, number> = {}
      for (const s of stockData) {
        const pid = s.productId || s.product_id || s.product || null
        if (!pid) continue
        newStockMap[pid] = Number(s.quantity || 0)
      }

      setProducts(filteredProds)
      setStockMap(newStockMap)
      setTotalInventoryValue(totalValueData)

    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && (selectedWarehouseId || user?.warehouseId)) {
      fetchAllData()
    }
  }, [user?.warehouseId, user?.role, selectedWarehouseId, authLoading, selectedCategoryId])

  // Listen for warehouse changes
  useEffect(() => {
    const handleWarehouseChange = () => fetchAllData()
    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    return () => window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
  }, [])

  // Debounce search
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategoryId])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (!debouncedSearchTerm) return true
      const lowerTerm = debouncedSearchTerm.toLowerCase()
      return (
        p.code?.toLowerCase().includes(lowerTerm) ||
        p.name?.toLowerCase().includes(lowerTerm) ||
        p.category_name?.toLowerCase().includes(lowerTerm)
      )
    })
  }, [products, debouncedSearchTerm])

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredProducts.slice(start, start + itemsPerPage)
  }, [filteredProducts, currentPage])

  // Selection Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all ON CURRENT PAGE
      const currentIds = paginatedProducts.map(p => p.id)
      const newSelected = [...new Set([...selectedProductIds, ...currentIds])]
      setSelectedProductIds(newSelected)
    } else {
      // Unselect all ON CURRENT PAGE
      const currentIds = paginatedProducts.map(p => p.id)
      setSelectedProductIds(selectedProductIds.filter(id => !currentIds.includes(id)))
    }
  }

  const handleSelectOne = (checked: boolean, productId: string) => {
    if (checked) {
      setSelectedProductIds(prev => [...prev, productId])
    } else {
      setSelectedProductIds(prev => prev.filter(id => id !== productId))
    }
  }

  const handleBulkDelete = async () => {
    try {
      setDeleting(true)
      // Execute deletes in parallel
      await Promise.all(selectedProductIds.map(async (id) => {
        const res = await mobileFetch(`/api/products/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          // Log error but continue
          console.error(`Failed to delete product ${id}`)
        }
      }))

      toast.success(`Đã xóa ${selectedProductIds.length} sản phẩm`)
      setSelectedProductIds([])
      setBulkDeleteOpen(false)
      fetchAllData()
    } catch (err: any) {
      toast.error('Lỗi khi xóa hàng loạt')
    } finally {
      setDeleting(false)
    }
  }

  // CRUD Handlers
  const handleAddProduct = async () => {
    if (!formData.code || !formData.name || !formData.unitId || !formData.categoryId || !formData.price) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setCreating(true)
      const res = await mobileFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code.trim(),
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          unitId: formData.unitId,
          price: getNumericValue(formData.price)
        })
      })

      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Thêm sản phẩm thành công')
        setAddOpen(false)
        setFormData({ code: '', name: '', categoryId: '', unitId: '', price: '' })
        fetchAllData()
      } else {
        toast.error(json.error || 'Lỗi thêm sản phẩm')
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kết nối')
    } finally {
      setCreating(false)
    }
  }

  const handleEditProduct = async () => {
    if (!selectedProduct || !formData.code || !formData.name) {
      toast.error('Thiếu thông tin')
      return
    }

    try {
      setUpdating(true)
      const res = await mobileFetch(`/api/products/${selectedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code.trim(),
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          unitId: formData.unitId,
          price: getNumericValue(formData.price)
        })
      })

      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Cập nhật thành công')
        setEditOpen(false)
        setSelectedProduct(null)
        fetchAllData()
      } else {
        toast.error(json.error || 'Lỗi cập nhật')
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kết nối')
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return

    try {
      setDeleting(true)
      const res = await mobileFetch(`/api/products/${selectedProduct.id}`, {
        method: 'DELETE'
      })

      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Xóa thành công')
        setDeleteOpen(false)
        setSelectedProduct(null)
        fetchAllData()
      } else {
        toast.error(json.error || 'Lỗi xóa sản phẩm')
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kết nối')
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = () => {
    const currentWarehouseId = selectedWarehouseId || user?.warehouseId
    if (!currentWarehouseId) {
      toast.error('Không tìm thấy thông tin kho')
      return
    }
    window.open(`/api/products/export?warehouseId=${currentWarehouseId}`, '_blank')
    toast.success("Đang tải báo cáo...")
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0])
      setPreviewData(null)
    }
  }

  const handlePreview = async () => {
    if (!importFile) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('preview', 'true')

      const res = await mobileFetch('/api/products/import', {
        method: 'POST',
        body: formData
      })
      const json = await res.json()

      if (res.ok && json.success) {
        setPreviewData(json.data)
      } else {
        toast.error(json.error || 'Lỗi khi xem trước')
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kết nối')
    } finally {
      setImporting(false)
    }
  }

  const handleProcessImport = async () => {
    if (!importFile) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      // No preview param implies actual import

      const res = await mobileFetch('/api/products/import', {
        method: 'POST',
        body: formData
      })
      const json = await res.json()

      if (res.ok && json.success) {
        toast.success(`Import thành công: ${json.data?.created || 0} mới, ${json.data?.updated || 0} cập nhật`)
        resetImport()
        fetchAllData()
      } else {
        toast.error(json.error || 'Lỗi Import')
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kết nối')
    } finally {
      setImporting(false)
    }
  }

  const resetImport = () => {
    setImportOpen(false)
    setImportFile(null)
    setPreviewData(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadTemplate = async () => {
    try {
      const { downloadExcelTemplate } = await import("@/lib/excel-utils")
      await downloadExcelTemplate({
        fileName: "products-template.xlsx",
        headers: ["Danh Mục", "Mã Sản Phẩm", "Tên Sản Phẩm", "Đơn Vị", "Giá"],
        sampleData: [
          ["Nguyên Liệu", "NL-TEST", "Mứt Đào", "Hộp", "50000"],
        ],
        columnWidths: [20, 15, 30, 10, 15]
      })
      toast.success("Đã tải template")
    } catch (err) {
      toast.error("Lỗi tải template")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Package}
        title="Hàng Tồn Kho"
        subtitle="Quản lý hàng tồn kho"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        {/* Inventory Value - Blue Theme like Admin */}
        <Card className="p-4 md:p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-blue-600 dark:text-blue-300">Tổng Giá Trị Tồn Kho</p>
              <p className="text-xl md:text-3xl font-bold text-blue-900 dark:text-blue-50 mt-1 md:mt-2">
                {totalInventoryValue.toLocaleString('vi-VN')} VND
              </p>
            </div>
          </div>
        </Card>

        {/* Header Section */}
        <div className="hidden md:block">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Sản Phẩm</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">Quản lý danh mục sản phẩm và tồn kho cửa hàng</p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between md:justify-end gap-2">
          <div className="flex gap-2 flex-wrap">
            {/* Template Download */}
            <Button variant="outline" size="sm" className="gap-1 md:gap-2 border-green-600 text-green-600 hover:bg-green-50" onClick={downloadTemplate}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Tải Template</span>
            </Button>

            {/* Bulk Delete Button */}
            {selectedProductIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1 md:gap-2"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Xóa ({selectedProductIds.length})</span>
              </Button>
            )}

            {/* Import Button */}
            <Button variant="outline" size="sm" className="gap-1 md:gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>

            {/* Export Button */}
            <Button variant="outline" size="sm" className="gap-1 md:gap-2 border-blue-600 text-blue-600 hover:bg-blue-50" onClick={handleExport}>
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Xuất Excel</span>
            </Button>

            {/* Internal Transfer (Hidden for Partners) */}
            {warehouseType !== 'PARTNER' && (
              <Button variant="secondary" size="sm" className="gap-1 md:gap-2" onClick={() => router.push('/store/internal-transfers')}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nhập Nội Bộ</span>
              </Button>
            )}

            {/* Add Button */}
            <Button size="sm" className="gap-1 md:gap-2" onClick={() => {
              setFormData({ code: '', name: '', categoryId: '', unitId: '', price: '' })
              setAddOpen(true)
            }}>
              <Plus className="w-4 h-4" />
              Thêm Sản Phẩm
            </Button>
          </div>
        </div>

        <Card className="p-4 md:p-6">
          <div className="mb-4 md:mb-6 space-y-3 md:space-y-4">
            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm sản phẩm..."
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setCurrentPage(1); fetchAllData() }}>Tìm</Button>
                <Button size="sm" variant="ghost" onClick={() => { setSearchTerm(''); setSelectedCategoryId(''); setCurrentPage(1); fetchAllData() }}>Xóa</Button>
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {/* Category Filter */}
              <div>
                <label className="text-xs md:text-sm font-medium text-muted-foreground mb-1 block">Danh Mục</label>
                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal text-sm"
                    >
                      <span className="truncate">
                        {selectedCategoryId
                          ? categories.find(c => c.id === selectedCategoryId)?.name || "Đã chọn"
                          : "Tất cả danh mục"}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 z-40" align="start" sideOffset={4} side="bottom">
                    <div className="max-h-[300px] overflow-y-auto p-1">
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                        onClick={() => setSelectedCategoryId('')}
                      >
                        <span className="text-sm">Tất cả danh mục</span>
                      </div>
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                          onClick={() => setSelectedCategoryId(cat.id)}
                        >
                          {selectedCategoryId === cat.id && <div className="w-1 h-4 bg-primary rounded-full mr-1" />}
                          <span className="text-sm">{cat.name}</span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Unit Filter - Placeholder to match layout or future expansion */}
              <div>
                <label className="text-xs md:text-sm font-medium text-muted-foreground mb-1 block">Đơn Vị</label>
                <Button variant="outline" disabled className="w-full justify-start text-muted-foreground font-normal">
                  Tất cả đơn vị
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading && <p className="p-4 text-center">Đang tải...</p>}
            {!loading && filteredProducts.length === 0 && <p className="p-4 text-center text-muted-foreground">Chưa có sản phẩm nào.</p>}

            {filteredProducts.length > 0 && (
              <>
                <ResponsiveTable
                  data={paginatedProducts}
                  columns={[
                    {
                      key: 'select',
                      label: (
                        <Checkbox
                          checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedProductIds.includes(p.id))}
                          onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                          aria-label="Select all"
                        />
                      ),
                      render: (p) => (
                        <Checkbox
                          checked={selectedProductIds.includes(p.id)}
                          onCheckedChange={(checked) => handleSelectOne(checked as boolean, p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      ),
                      className: "w-[50px] text-center"
                    },
                    { key: 'code', label: 'Mã', mobilePrimary: true, render: (p) => <span className="font-mono font-medium">{p.code}</span> },
                    { key: 'name', label: 'Tên', mobilePrimary: true, render: (p) => <span className="font-medium">{p.name}</span> },
                    { key: 'category', label: 'Danh Mục', render: (p) => <span>{p.category_name}</span> },
                    { key: 'unit', label: 'ĐVT', render: (p) => <span>{p.unit_name}</span> },
                    { key: 'price', label: 'Giá', className: 'text-right', render: (p) => <span>{Number(p.price).toLocaleString('vi-VN')}</span> },
                    {
                      key: 'stock',
                      label: 'Tồn',
                      className: 'text-center',
                      mobilePrimary: true,
                      render: (p) => {
                        const qty = stockMap[p.id] ?? 0
                        return <Badge variant={qty <= 0 ? "destructive" : "secondary"}>{qty}</Badge>
                      }
                    },
                  ]}
                  actions={[
                    {
                      label: 'Sửa',
                      icon: <Edit className="w-4 h-4" />,
                      onClick: (p) => {
                        setSelectedProduct(p)
                        setFormData({
                          code: p.code,
                          name: p.name,
                          categoryId: p.category_id,
                          unitId: p.unit_id,
                          price: p.price ? Number(p.price).toLocaleString('vi-VN') : ''
                        })
                        setEditOpen(true)
                      }
                    },
                    {
                      label: 'Xóa',
                      icon: <Trash2 className="w-4 h-4" />,
                      variant: 'destructive',
                      onClick: (p) => {
                        setSelectedProduct(p)
                        setDeleteOpen(true)
                      }
                    }
                  ]}
                  mobileCardTitle={(p) => p.name}
                  mobileCardMeta={(p) => [
                    <span>{p.code}</span>,
                    <span>Stock: {stockMap[p.id] || 0}</span>
                  ]}
                  keyExtractor={(p) => p.id}
                />

                {/* Pagination Controls */}
                <div className="flex items-center justify-end px-4 py-4 gap-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Trang {currentPage} / {totalPages || 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Trước
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Sau
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm Sản Phẩm Mới</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Mã *</Label>
              <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Tên *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Danh Mục *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                >
                  <option value="">Chọn...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Đơn Vị *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.unitId}
                  onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                >
                  <option value="">Chọn...</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Giá (VND) *</Label>
              <Input
                value={formData.price}
                onChange={(e) => {
                  const { display } = handlePriceChange(e.target.value)
                  setFormData({ ...formData, price: display })
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Hủy</Button>
            <Button onClick={handleAddProduct} disabled={creating}>{creating ? 'Đang tạo...' : 'Lưu'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa Sản Phẩm</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Mã</Label>
              <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Tên</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Danh Mục</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                >
                  <option value="">Chọn...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Đơn Vị</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.unitId}
                  onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                >
                  <option value="">Chọn...</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Giá</Label>
              <Input
                value={formData.price}
                onChange={(e) => {
                  const { display } = handlePriceChange(e.target.value)
                  setFormData({ ...formData, price: display })
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Hủy</Button>
            <Button onClick={handleEditProduct} disabled={updating}>{updating ? 'Đang lưu...' : 'Lưu'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa sản phẩm <strong>{selectedProduct?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleDeleteProduct} disabled={deleting}>
              {deleting ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => {
        if (!open) resetImport()
        else setImportOpen(true)
      }}>
        <DialogContent className="max-w-md md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nhập Sản Phẩm từ Excel</DialogTitle>
            <DialogDescription>
              {previewData ? 'Xác nhận thay đổi trước khi nhập.' : 'Tải lên file Excel để nhập nhanh sản phẩm.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!previewData ? (
              <>
                <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" /> Tải Template Mẫu
                </Button>

                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-slate-50 relative transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Input
                    type="file"
                    accept=".xlsx, .xls"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {importFile ? importFile.name : 'Kéo thả file hoặc click để chọn file'}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-center">
                    <p className="text-xs font-medium uppercase text-blue-500">Sản phẩm mới</p>
                    <p className="text-2xl font-bold">{previewData.newProducts?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-center">
                    <p className="text-xs font-medium uppercase text-amber-500">Cập nhật</p>
                    <p className="text-2xl font-bold">{previewData.updatedProducts?.length || 0}</p>
                  </div>
                </div>

                {(previewData.newCategories?.length > 0 || previewData.newUnits?.length > 0) && (
                  <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 border border-yellow-200">
                    <p className="font-semibold mb-1">Cảnh báo dữ liệu mới:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {previewData.newCategories?.length > 0 && (
                        <li>Sẽ tạo <strong>{previewData.newCategories.length}</strong> danh mục mới: {previewData.newCategories.slice(0, 3).join(', ')}{previewData.newCategories.length > 3 ? '...' : ''}</li>
                      )}
                      {previewData.newUnits?.length > 0 && (
                        <li>Sẽ tạo <strong>{previewData.newUnits.length}</strong> đơn vị mới: {previewData.newUnits.slice(0, 3).join(', ')}{previewData.newUnits.length > 3 ? '...' : ''}</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="text-xs text-muted-foreground text-center">
                  Vui lòng kiểm tra kỹ trước khi xác nhận. Hành động này không thể hoàn tác.
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetImport}>Đóng</Button>
            {!previewData ? (
              <Button onClick={handlePreview} disabled={!importFile || importing}>
                {importing ? 'Đang đọc file...' : 'Xem Trước'}
              </Button>
            ) : (
              <Button onClick={handleProcessImport} disabled={importing}>
                {importing ? 'Đang xử lý...' : 'Xác Nhận Nhập'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa hàng loạt</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa <strong>{selectedProductIds.length}</strong> sản phẩm đã chọn? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? 'Đang xóa...' : 'Xóa Tất Cả'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
