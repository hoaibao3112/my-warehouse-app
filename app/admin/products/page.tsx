"use client"

import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, Trash2, Upload, Copy, Check, Download, FileDown, Package, ChevronDown } from "lucide-react"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { useCurrencyInput } from "@/hooks/use-currency-input"
import { useAuth } from "@/hooks/use-auth"
import * as XLSX from 'xlsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { useRef } from "react"
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog"
import { toast } from "sonner"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { ProductImportDialog } from "@/components/admin/product-import-dialog"

import { useSelectedWarehouse } from "@/components/store/warehouse-selector" // Added
import { Checkbox } from "@/components/ui/checkbox"

export default function ProductsPage() {
  const { user } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse() // Added
  // MANAGER (kho tổng), WAREHOUSE_MANAGER (cửa hàng), WAREHOUSE_STAFF, ADMIN and GENERAL_MANAGER can view stock information
  const canViewStock = user?.role === 'ADMIN' || user?.role === 'GENERAL_MANAGER' || user?.role === 'MANAGER' || user?.role === 'WAREHOUSE_MANAGER' || user?.role === 'WAREHOUSE_STAFF'

  const [products, setProducts] = useState<any[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [totalInventoryValue, setTotalInventoryValue] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [total, setTotal] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]) // New state
  const [categories, setCategories] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [toolsCategoryId, setToolsCategoryId] = useState<string>('')
  const [isToolsView, setIsToolsView] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [importGuideOpen, setImportGuideOpen] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; product: any | null; isBulk?: boolean }>({ open: false, product: null, isBulk: false }) // Updated for bulk
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const codeRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const categoryRef = useRef<HTMLSelectElement | null>(null)
  const unitRef = useRef<HTMLSelectElement | null>(null)
  const priceRef = useRef<HTMLInputElement | null>(null)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateFormData, setDuplicateFormData] = useState<any>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [priceDisplayValue, setPriceDisplayValue] = useState<string>('')
  const [editPriceDisplayValue, setEditPriceDisplayValue] = useState<string>('')
  const { handleInputChange: handlePriceChange, getNumericValue } = useCurrencyInput()
  const [updating, setUpdating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isCreatingTool, setIsCreatingTool] = useState(false)
  const [isEditingTool, setIsEditingTool] = useState(false)
  const [isDuplicatingTool, setIsDuplicatingTool] = useState(false)
  const [isDeletingTool, setIsDeletingTool] = useState(false)
  const [createToolDialogOpen, setCreateToolDialogOpen] = useState(false)
  const [editToolDialogOpen, setEditToolDialogOpen] = useState(false)
  const [duplicateToolDialogOpen, setDuplicateToolDialogOpen] = useState(false)
  const [createToolFormData, setCreateToolFormData] = useState({
    code: '',
    name: '',
    unitId: '',
    price: ''
  })
  const [editToolFormData, setEditToolFormData] = useState({
    code: '',
    name: '',
    unitId: '',
    price: ''
  })
  const [editingToolProduct, setEditingToolProduct] = useState<any | null>(null)
  const [duplicateToolFormData, setDuplicateToolFormData] = useState<any>(null)
  const [productDisplayUnits, setProductDisplayUnits] = useState<Record<string, string>>({}) // productId -> unitId

  // Clear selection when filters change
  useEffect(() => {
    setSelectedProductIds([])
  }, [page, pageSize, searchTerm, selectedCategoryIds, selectedUnitIds, selectedWarehouseId])


  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = products.map(p => p.id)
      // Merge with existing selection to not lose items if we have cross-page selection (though here we only select visible)
      // For simplicity in this version, we only select ALL CURRENT PAGE items.
      const newSelected = [...new Set([...selectedProductIds, ...allIds])]
      setSelectedProductIds(newSelected)
    } else {
      // Unselect all items ON THIS PAGE
      const currentIds = products.map(p => p.id)
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
    // Logic moved to DeleteConfirmationDialog onConfirm
    try {
      setUpdating(true) // Reuse updating loading state or add new one
      await Promise.all(selectedProductIds.map(async (id) => {
        const res = await mobileFetch(`/api/products/${id}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || `Lỗi khi xóa sản phẩm ${id}`)
        }
        return json
      }))
      toast.success(`Đã xóa ${selectedProductIds.length} sản phẩm`)
      setSelectedProductIds([])
      await loadProducts()
    } catch (err: any) {
      toast.error('Lỗi khi xóa hàng loạt', { description: err?.message })
    } finally {
      setUpdating(false)
    }
  }

  const loadProducts = useCallback(async (pageArg: number = page, pageSizeArg: number = pageSize, searchArg: string | null = null, categoryIdsArg: string[] = selectedCategoryIds, unitIdsArg: string[] = selectedUnitIds) => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams()
      q.set('page', String(pageArg))
      q.set('pageSize', String(pageSizeArg))
      if (searchArg) q.set('search', String(searchArg))
      if (categoryIdsArg.length > 0) q.set('categoryId', categoryIdsArg.join(','))
      if (unitIdsArg.length > 0) q.set('unitId', unitIdsArg.join(','))

      // Pass the selected warehouse ID to the API
      if (selectedWarehouseId) {
        q.set('warehouseId', selectedWarehouseId)
      }

      const res = await mobileFetch(`/api/products?${q.toString()}`)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
      const prods = json.data || []
      setProducts(prods)
      setTotal(Number(json.total || 0))
      setTotalPages(Number(json.totalPages || 1))
      setPage(Number(json.page || pageArg))
      setPageSize(Number(json.pageSize || pageSizeArg))

      // fetch MAIN warehouse stock only (Kho Tổng) - only if user has permission
      if (canViewStock) {
        try {
          let targetWhId = selectedWarehouseId || user?.warehouseId || null;

          if (!targetWhId) {
            // Fallback: If no selection AND no user warehouse (e.g. global Admin), try to find MAIN warehouse
            // This maintains legacy behavior for Admin without context
            try {
              const whRes = await mobileFetch(`/api/warehouses?page=1&pageSize=100`)
              const whJson = await whRes.json()
              if (whRes.ok && whJson?.success) {
                const warehouses: any[] = whJson.data || []
                const main = warehouses.find((w: any) => w.type === 'MAIN')
                if (main) targetWhId = main.id
              }
            } catch (err) {
              console.warn("Failed to fetch fallback warehouse", err)
            }
          }

          if (targetWhId) {
            // Fetch stock for target warehouse
            const rs = await mobileFetch(`/api/warehouse-stock?page=1&pageSize=1000&warehouseId=${targetWhId}`)
            const js = await rs.json()
            if (rs.ok && js?.success) {
              const stocks: any[] = js.data || []
              const map: Record<string, number> = {}
              for (const s of stocks) {
                const pid = s.productId || s.product_id || s.product || null
                if (!pid) continue
                const qty = Number(s.quantity || 0)
                map[pid] = qty
              }
              setStockMap(map)

              // Fetch total inventory value separately (not limited by pagination)
              try {
                const totalValueRes = await mobileFetch(`/api/warehouse-stock/total-value?warehouseId=${targetWhId}`)
                const totalValueJson = await totalValueRes.json()
                if (totalValueRes.ok && totalValueJson?.success) {
                  setTotalInventoryValue(totalValueJson.data?.totalValue || 0)
                }
              } catch (err) {
                console.warn('Failed to fetch total inventory value', err)
              }
            }
          }
        } catch (err) {
          // ignore stock fetch errors (non-fatal)
          console.warn('Failed to fetch warehouse stock', err)
        }
      }
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, selectedCategoryIds, selectedUnitIds, canViewStock, selectedWarehouseId]) // Added selectedWarehouseId dependency

  // Helper to get converted quantity and unit name
  const getProductDisplayInfo = useCallback((product: any) => {
    const baseUnitId = product.unit_id
    const selectedUnitId = productDisplayUnits[product.id] || baseUnitId
    const baseQuantity = stockMap[product.id] || 0

    if (selectedUnitId === baseUnitId) {
      return {
        quantity: baseQuantity,
        unitName: product.unit_name || product.unit?.name || '-',
        isBase: true
      }
    }

    const pkg = product.product_package_units?.find((p: any) => p.package_unit_id === selectedUnitId)
    if (pkg) {
      const multiplier = Number(pkg.base_quantity) || 1
      return {
        quantity: baseQuantity / multiplier,
        unitName: pkg.package_name || pkg.product_units?.name || '-',
        isBase: false
      }
    }

    return {
      quantity: baseQuantity,
      unitName: product.unit_name || product.unit?.name || '-',
      isBase: true
    }
  }, [productDisplayUnits, stockMap])

  useEffect(() => {
    loadProducts(page, pageSize, searchTerm || null, selectedCategoryIds, selectedUnitIds)
  }, [loadProducts, page, pageSize, selectedCategoryIds, selectedUnitIds, selectedWarehouseId])

  // Load categories and units on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [catsRes, unitsRes] = await Promise.all([
          mobileFetch('/api/categories'),
          mobileFetch('/api/product-units')
        ])

        if (catsRes.ok) {
          const catsJson = await catsRes.json()
          if (catsJson.success) {
            const cats = catsJson.data || []
            setCategories(cats)

            // Find and set tools category ID
            const toolsCat = cats.find((cat: any) =>
              cat.name?.toLowerCase().includes('công cụ') ||
              cat.name?.toLowerCase().includes('dụng cụ')
            )
            if (toolsCat) {
              setToolsCategoryId(toolsCat.id)
            }
          }
        }

        if (unitsRes.ok) {
          const unitsJson = await unitsRes.json()
          if (unitsJson.success) {
            setUnits(unitsJson.data || [])
          }
        }
      } catch (err) {
        console.warn('Failed to load filter options:', err)
      }
    }

    loadFilters()
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await mobileFetch('/api/products/import', {
        method: 'POST',
        body: formData
      })

      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Import failed')
      }

      setImportResult(json.data)
      setImportOpen(true)

      // Reload products after successful import
      await loadProducts()
    } catch (err: any) {
      toast.error('Import thất bại', {
        description: err?.message || String(err)
      })
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleCreateTool = async () => {
    if (!createToolFormData.code.trim() || !createToolFormData.name.trim() || !createToolFormData.unitId || !createToolFormData.price.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setIsCreatingTool(true)
      const response = await mobileFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: createToolFormData.code.trim(),
          name: createToolFormData.name.trim(),
          categoryId: toolsCategoryId,
          unitId: createToolFormData.unitId,
          price: Number(createToolFormData.price)
        })
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Tạo công cụ thành công')
        setCreateToolDialogOpen(false)
        setCreateToolFormData({ code: '', name: '', unitId: '', price: '' })
        await loadProducts()
      } else {
        toast.error(json?.error || 'Lỗi tạo công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsCreatingTool(false)
    }
  }

  const handleEditTool = async () => {
    if (!editingToolProduct?.id || !editToolFormData.code.trim() || !editToolFormData.name.trim() || !editToolFormData.unitId || !editToolFormData.price.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setIsEditingTool(true)
      const response = await mobileFetch(`/api/products/${editingToolProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editToolFormData.code.trim(),
          name: editToolFormData.name.trim(),
          categoryId: toolsCategoryId,
          unitId: editToolFormData.unitId,
          price: Number(editToolFormData.price)
        })
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Cập nhật công cụ thành công')
        setEditToolDialogOpen(false)
        setEditingToolProduct(null)
        await loadProducts()
      } else {
        toast.error(json?.error || 'Lỗi cập nhật công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsEditingTool(false)
    }
  }

  const handleDuplicateTool = async () => {
    if (!duplicateToolFormData?.code.trim() || !duplicateToolFormData?.name.trim() || !duplicateToolFormData?.unit_id || !duplicateToolFormData?.price) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setIsDuplicatingTool(true)
      const response = await mobileFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: duplicateToolFormData.code.trim(),
          name: duplicateToolFormData.name.trim(),
          categoryId: toolsCategoryId,
          unitId: duplicateToolFormData.unit_id,
          price: Number(duplicateToolFormData.price)
        })
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Nhân bản công cụ thành công')
        setDuplicateToolDialogOpen(false)
        setDuplicateToolFormData(null)
        await loadProducts()
      } else {
        toast.error(json?.error || 'Lỗi nhân bản công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsDuplicatingTool(false)
    }
  }

  const downloadTemplate = async () => {
    // Show guide dialog first
    setImportGuideOpen(true)

    try {
      const { downloadExcelTemplate } = await import("@/lib/excel-utils")

      await downloadExcelTemplate({
        fileName: "products-template.xlsx",
        headers: ["Danh Mục", "Mã Sản Phẩm", "Tên Sản Phẩm", "Đơn Vị", "Giá"],
        sampleData: [
          ["Nguyên Liệu", "NL001", "Mứt Đào", "Hộp", "50000"],
          ["Nguyên Liệu", "NL002", "Mứt Dâu", "Hộp", "45000"],
          ["Nước", "ND001", "Nước Cam", "Chai", "15000"],
          ["Công Cụ", "CT001", "Thìa Inox", "Cái", "5000"],
          ["Công Cụ", "CT002", "Ly Thuỷ Tinh", "Cái", "8000"],
        ],
        columnWidths: [20, 15, 30, 10, 15]
      })

      toast.success("Template Excel đã được tải xuống")
    } catch (err) {
      console.error("Failed to download template", err)
      toast.error("Lỗi khi tải template")
    }
  }

  const exportProductsToExcel = async () => {
    try {
      // Fetch all products without pagination to export all data
      const q = new URLSearchParams()
      q.set('page', '1')
      q.set('pageSize', '10000') // Large number to get all products
      if (searchTerm) q.set('search', searchTerm)
      if (selectedCategoryIds.length > 0) q.set('categoryId', selectedCategoryIds.join(','))
      if (selectedUnitIds.length > 0) q.set('unitId', selectedUnitIds.join(','))

      const res = await mobileFetch(`/api/products?${q.toString()}`)
      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Không thể tải dữ liệu sản phẩm')
      }

      const exportProducts = json.data || []

      // Prepare data for Excel - only include stock info if user has permission
      const excelData = exportProducts.map((product: any) => {
        const baseData: any = {
          'Mã Sản Phẩm': product.code || '',
          'Tên Sản Phẩm': product.name || '',
          'Danh Mục': product.category_name || '',
          'Đơn Vị': product.unit_name || '',
          'Giá (VND)': product.price ? Number(product.price).toLocaleString('vi-VN') : '0',
        }

        // Only add stock columns if user has permission
        if (canViewStock) {
          baseData['Tồn Kho (Kho Tổng)'] = stockMap[product.id] || 0
          baseData['Giá Trị Tồn Kho (VND)'] = product.price ? (stockMap[product.id] || 0) * Number(product.price) : 0
        }

        baseData['Ngày Tạo'] = product.created_at ? formatDbDateToDisplay(product.created_at) : ''
        baseData['Cập Nhật Lần Cuối'] = product.updated_at ? formatDbDateToDisplay(product.updated_at) : ''

        return baseData
      })

      // Create workbook
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(excelData)

      // Set column widths based on whether stock columns are included
      worksheet['!cols'] = canViewStock ? [
        { wch: 15 }, // Mã Sản Phẩm
        { wch: 25 }, // Tên Sản Phẩm
        { wch: 15 }, // Danh Mục
        { wch: 12 }, // Đơn Vị
        { wch: 15 }, // Giá
        { wch: 15 }, // Tồn Kho
        { wch: 20 }, // Giá Trị Tồn Kho
        { wch: 15 }, // Ngày Tạo
        { wch: 15 }, // Cập Nhật
      ] : [
        { wch: 15 }, // Mã Sản Phẩm
        { wch: 25 }, // Tên Sản Phẩm
        { wch: 15 }, // Danh Mục
        { wch: 12 }, // Đơn Vị
        { wch: 15 }, // Giá
        { wch: 15 }, // Ngày Tạo
        { wch: 15 }, // Cập Nhật
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sản Phẩm')

      // Generate filename with timestamp
      const timestamp = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')
      const filename = `san-pham-${timestamp}.xlsx`

      XLSX.writeFile(workbook, filename)
      toast.success(`Đã xuất ${exportProducts.length} sản phẩm`)
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error(error?.message || 'Lỗi xuất file Excel')
    }
  }


  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Package}
        title={isToolsView ? 'Công Cụ' : 'Sản Phẩm'}
        subtitle={isToolsView ? 'Quản lý công cụ dụng cụ' : 'Quản lý danh mục sản phẩm'}
      />

      <div className="p-4 md:p-8 space-y-6">
        {/* Inventory Value Summary - Only visible to ADMIN and GENERAL_MANAGER */}
        {canViewStock && (
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
        )}

        <div className="hidden md:block">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">{isToolsView ? 'Công Cụ' : 'Sản Phẩm'}</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">{isToolsView ? 'Quản lý công cụ dụng cụ và tồn kho' : 'Quản lý danh mục sản phẩm và giá cả'}</p>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2">
          <div className="flex gap-2 flex-wrap">
            {!isToolsView && (
              <>
                <Button variant="outline" size="sm" className="gap-1 md:gap-2 border-green-600 text-green-600 hover:bg-green-50" onClick={downloadTemplate}>
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Tải</span> Template
                </Button>
                <Button variant="outline" size="sm" className="gap-1 md:gap-2" onClick={() => setImportOpen(true)}>
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Import</span><span className="sm:hidden">Import</span>
                </Button>
                <Button variant="outline" size="sm" className="gap-1 md:gap-2 border-blue-600 text-blue-600 hover:bg-blue-50" onClick={exportProductsToExcel}>
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Xuất</span><span className="sm:hidden">Xuất</span>
                </Button>
              </>
            )}
            {/* Bulk Delete Button */}
            {selectedProductIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1 md:gap-2"
                onClick={() => setDeleteDialog({ open: true, product: { name: `${selectedProductIds.length} sản phẩm đã chọn` }, isBulk: true })}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Xóa ({selectedProductIds.length})</span>
                <span className="sm:hidden">({selectedProductIds.length})</span>
              </Button>
            )}
            <Button size="sm" className="gap-1 md:gap-2" onClick={() => {
              if (isToolsView) {
                setCreateToolFormData({ code: '', name: '', unitId: '', price: '' })
                setCreateToolDialogOpen(true)
              } else {
                setAddOpen(true)
              }
            }}>
              <Plus className="w-4 h-4" />
              {isToolsView ? 'Thêm Công Cụ' : 'Thêm Sản Phẩm'}
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
                  onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if ((e as React.KeyboardEvent<HTMLInputElement>).key === 'Enter') {
                      setPage(1)
                      loadProducts(1, pageSize, searchTerm || null, selectedCategoryIds, selectedUnitIds)
                    }
                  }}
                  placeholder="Tìm kiếm sản phẩm..." className="pl-10" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setPage(1); loadProducts(1, pageSize, searchTerm || null, selectedCategoryIds, selectedUnitIds) }}>Tìm</Button>
                <Button size="sm" variant="ghost" onClick={() => { setSearchTerm(''); setSelectedCategoryIds([]); setSelectedUnitIds([]); setPage(1); loadProducts(1, pageSize, null, [], []) }}>Xóa</Button>
              </div>
            </div>

            {/* Filters */}
            {!isToolsView && (
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
                          {selectedCategoryIds.length === 0
                            ? "Tất cả danh mục"
                            : selectedCategoryIds.length === categories.length
                              ? "Tất cả"
                              : `${selectedCategoryIds.length} đã chọn`}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 z-40" align="start" sideOffset={4} side="bottom">
                      <div className="p-2 border-b sticky top-0 bg-background z-10">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              const allIds = categories.map((c: any) => c.id)
                              setSelectedCategoryIds(allIds)
                              setPage(1)
                              loadProducts(1, pageSize, searchTerm, allIds, selectedUnitIds)
                            }}
                          >
                            Chọn tất cả
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              setSelectedCategoryIds([])
                              setPage(1)
                              loadProducts(1, pageSize, searchTerm, [], selectedUnitIds)
                            }}
                          >
                            Bỏ chọn
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2">
                        {categories.map((cat: any) => (
                          <label
                            key={cat.id}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCategoryIds.includes(cat.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked
                                  ? [...selectedCategoryIds, cat.id]
                                  : selectedCategoryIds.filter(id => id !== cat.id)
                                setSelectedCategoryIds(newIds)
                                setPage(1)
                                loadProducts(1, pageSize, searchTerm, newIds, selectedUnitIds)
                              }}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">{cat.name}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Unit Filter */}
                <div>
                  <label className="text-xs md:text-sm font-medium text-muted-foreground mb-1 block">Đơn Vị</label>
                  <Popover modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal text-sm"
                      >
                        <span className="truncate">
                          {selectedUnitIds.length === 0
                            ? "Tất cả đơn vị"
                            : selectedUnitIds.length === units.length
                              ? "Tất cả"
                              : `${selectedUnitIds.length} đã chọn`}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 z-40" align="start" sideOffset={4} side="bottom">
                      <div className="p-2 border-b sticky top-0 bg-background z-10">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              const allIds = units.map((u: any) => u.id)
                              setSelectedUnitIds(allIds)
                              setPage(1)
                              loadProducts(1, pageSize, searchTerm, selectedCategoryIds, allIds)
                            }}
                          >
                            Chọn tất cả
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              setSelectedUnitIds([])
                              setPage(1)
                              loadProducts(1, pageSize, searchTerm, selectedCategoryIds, [])
                            }}
                          >
                            Bỏ chọn
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2">
                        {units.map((unit: any) => (
                          <label
                            key={unit.id}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedUnitIds.includes(unit.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked
                                  ? [...selectedUnitIds, unit.id]
                                  : selectedUnitIds.filter(id => id !== unit.id)
                                setSelectedUnitIds(newIds)
                                setPage(1)
                                loadProducts(1, pageSize, searchTerm, selectedCategoryIds, newIds)
                              }}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">{unit.name}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>

          <ResponsiveTable
            data={products}
            loading={loading}
            columns={[
              {
                key: 'select',
                label: (
                  <Checkbox
                    checked={products.length > 0 && products.every(p => selectedProductIds.includes(p.id))}
                    onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                    aria-label="Select all"
                  />
                ),
                render: (product) => (
                  <Checkbox
                    checked={selectedProductIds.includes(product.id)}
                    onCheckedChange={(checked) => handleSelectOne(checked as boolean, product.id)}
                    aria-label={`Select ${product.name}`}
                  />
                ),
                className: "w-[50px]",
                align: 'center',
              },
              {
                key: 'code',
                label: 'Mã',
                render: (product) => <span className="font-medium">{product.code}</span>,
                mobilePrimary: true,
              },
              {
                key: 'name',
                label: 'Tên',
                render: (product) => <span>{product.name}</span>,
                mobilePrimary: true,
              },
              ...(!isToolsView ? [{
                key: 'category',
                label: 'Danh Mục',
                render: (product: any) => <span>{product.category_name ?? '-'}</span>,
              }] : []),
              {
                key: 'unit',
                label: 'Đơn Vị',
                render: (product) => {
                  const availableUnits = [
                    { id: product.unit_id, name: product.unit_name || product.unit?.name || '-' },
                    ...(product.product_package_units || []).map((pkg: any) => ({
                      id: pkg.package_unit_id,
                      name: pkg.package_name || pkg.product_units?.name || '-'
                    }))
                  ]

                  if (availableUnits.length <= 1) {
                    return <span>{product.unit_name ?? '-'}</span>
                  }

                  const selectedUnitId = productDisplayUnits[product.id] || product.unit_id
                  const selectedUnit = availableUnits.find(u => u.id === selectedUnitId)

                  return (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Popover modal={false}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 font-normal hover:bg-muted text-blue-600 dark:text-blue-400">
                            {selectedUnit?.name}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="start">
                          <div className="space-y-1">
                            {availableUnits.map((u) => (
                              <Button
                                key={u.id}
                                variant={selectedUnitId === u.id ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-start font-normal"
                                onClick={() => setProductDisplayUnits(prev => ({ ...prev, [product.id]: u.id }))}
                              >
                                {u.name}
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )
                },
              },
              {
                key: 'price',
                label: 'Giá (VND)',
                render: (product) => <span className="font-medium">{product.price ? `${Number(product.price).toLocaleString('vi-VN')}` : '-'}</span>,
                align: 'right' as const,
              },
              ...(canViewStock ? [{
                key: 'stock',
                label: 'Tồn Kho',
                render: (product: any) => {
                  const info = getProductDisplayInfo(product)
                  const displayQty = typeof info.quantity === 'number'
                    ? info.quantity.toLocaleString('vi-VN', { maximumFractionDigits: 6 })
                    : '-'
                  return <span className={info.isBase ? "font-medium" : "font-medium text-blue-600 dark:text-blue-400"}>
                    {displayQty}
                  </span>
                },
              }] : []),
            ]}
            actions={[
              {
                label: 'Sửa',
                icon: <Edit className="w-4 h-4" />,
                onClick: (product) => {
                  if (isToolsView) {
                    setEditingToolProduct(product)
                    setEditToolFormData({
                      code: product.code,
                      name: product.name,
                      unitId: product.unit_id,
                      price: product.price ? String(product.price) : ''
                    })
                    setEditToolDialogOpen(true)
                  } else {
                    try {
                      const res = mobileFetch(`/api/products/${product.id}`)
                      res.then(r => r.json()).then(json => {
                        const prod = json?.data || product
                        setSelectedProduct(prod)
                        setEditPriceDisplayValue(prod.price ? prod.price.toLocaleString('vi-VN') : '')
                        setEditOpen(true)
                      })
                    } catch (err) {
                      setSelectedProduct(product)
                      setEditPriceDisplayValue(product.price ? product.price.toLocaleString('vi-VN') : '')
                      setEditOpen(true)
                    }
                  }
                },
                variant: 'ghost' as const,
                className: 'hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400',
              },
              {
                label: 'Nhân bản',
                icon: <Copy className="w-4 h-4" />,
                onClick: (product) => {
                  const formData = {
                    code: '',
                    name: '',
                    category_id: product.category_id,
                    category_name: product.category_name,
                    unit_id: product.unit_id,
                    unit_name: product.unit_name,
                    price: product.price || ''
                  }
                  if (isToolsView) {
                    setDuplicateToolFormData(formData)
                    setDuplicateToolDialogOpen(true)
                  } else {
                    setDuplicateFormData(formData)
                    setDuplicateOpen(true)
                  }
                },
                variant: 'ghost' as const,
                className: 'hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-600 dark:hover:text-green-400',
              },
              {
                label: 'Xóa',
                icon: <Trash2 className="w-4 h-4" />,
                onClick: (product) => setDeleteDialog({ open: true, product }),
                variant: 'ghost' as const,
                className: 'hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400',
              },
            ]}
            keyExtractor={(product) => product.id}
            emptyMessage={error ? `Lỗi: ${error}` : `Chưa có ${isToolsView ? 'công cụ' : 'sản phẩm'} nào`}
            mobileCardTitle={(product) => product.name}
            mobileCardBadge={(product) => (
              <Badge className="bg-blue-100 text-blue-800">
                {product.price ? `${Number(product.price).toLocaleString('vi-VN')} VND` : '-'}
              </Badge>
            )}
            mobileCardMeta={(product) => {
              const info = getProductDisplayInfo(product)
              const displayQty = typeof info.quantity === 'number'
                ? info.quantity.toLocaleString('vi-VN', { maximumFractionDigits: 6 })
                : '-'

              const availableUnits = [
                { id: product.unit_id, name: product.unit_name || product.unit?.name || '-' },
                ...(product.product_package_units || []).map((pkg: any) => ({
                  id: pkg.package_unit_id,
                  name: pkg.package_name || pkg.product_units?.name || '-'
                }))
              ]

              return [
                <span key="code" className="text-xs">Mã: {product.code}</span>,
                ...(!isToolsView ? [<span key="cat" className="text-xs">Danh mục: {product.category_name ?? '-'}</span>] : []),
                <div key="unit-select" onClick={(e) => e.stopPropagation()}>
                  {availableUnits.length > 1 ? (
                    <Popover modal={false}>
                      <PopoverTrigger asChild>
                        <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-0.5 cursor-pointer">
                          ĐV: {info.unitName}
                          <ChevronDown className="w-2.5 h-2.5 opacity-50" />
                        </span>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1" align="start">
                        <div className="space-y-1">
                          {availableUnits.map((u) => (
                            <Button
                              key={u.id}
                              variant={(productDisplayUnits[product.id] || product.unit_id) === u.id ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start font-normal h-8 text-xs"
                              onClick={() => setProductDisplayUnits(prev => ({ ...prev, [product.id]: u.id }))}
                            >
                              {u.name}
                            </Button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span className="text-xs">ĐV: {info.unitName}</span>
                  )}
                </div>,
                <span key="stock" className="text-xs">Tồn kho: <span className={info.isBase ? "" : "text-blue-600 font-medium"}>{displayQty}</span></span>,
              ]
            }}
          />
          {/* Pagination controls */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-muted-foreground">Trang {page}/{totalPages} • {total} {isToolsView ? 'công cụ' : 'sản phẩm'}</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { if (page > 1) setPage(page - 1) }} disabled={page <= 1}>Trước</Button>
              <Button size="sm" variant="outline" onClick={() => { if (page < totalPages) setPage(page + 1) }} disabled={page >= totalPages}>Tiếp</Button>
              <select className="ml-2 p-1.5 text-xs sm:text-sm border rounded" value={pageSize} onChange={(e) => { const ps = Number((e.target as HTMLSelectElement).value); setPageSize(ps); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Edit Product Dialog */}
        <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setEditPriceDisplayValue(''); } setEditOpen(open) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Chỉnh Sửa Sản Phẩm</DialogTitle>
              <DialogDescription>Cập nhật thông tin sản phẩm</DialogDescription>
            </DialogHeader>

            {selectedProduct && (
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Mã Sản Phẩm</Label>
                  <Input value={selectedProduct.code || ''} onChange={(e) => setSelectedProduct({ ...selectedProduct, code: e.target.value })} />
                </div>
                <div>
                  <Label>Tên Sản Phẩm</Label>
                  <Input value={selectedProduct.name || ''} onChange={(e) => setSelectedProduct({ ...selectedProduct, name: e.target.value })} />
                </div>
                <div>
                  <Label>Danh Mục <span className="text-red-500">*</span></Label>
                  <select
                    value={selectedProduct.category_id || ''}
                    onChange={(e) => {
                      const selectedCat = categories.find(c => c.id === e.target.value)
                      setSelectedProduct({
                        ...selectedProduct,
                        category_id: e.target.value,
                        category_name: selectedCat?.name || ''
                      })
                    }}
                    className="mt-1 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                  >
                    <option value="">-- Chọn Danh Mục --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Đơn Vị <span className="text-red-500">*</span></Label>
                  <select
                    value={selectedProduct.unit_id || ''}
                    onChange={(e) => {
                      const selectedUnit = units.find(u => u.id === e.target.value)
                      setSelectedProduct({
                        ...selectedProduct,
                        unit_id: e.target.value,
                        unit_name: selectedUnit?.name || ''
                      })
                    }}
                    className="mt-1 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                  >
                    <option value="">-- Chọn Đơn Vị --</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Giá (VND)</Label>
                  <Input
                    type="text"
                    placeholder="0"
                    value={editPriceDisplayValue}
                    onChange={(e) => {
                      const { display, numeric } = handlePriceChange(e.target.value)
                      setEditPriceDisplayValue(display)
                      setSelectedProduct({ ...selectedProduct, price: numeric || null })
                    }}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild><Button variant="ghost" disabled={updating}>Hủy</Button></DialogClose>
              <Button onClick={async () => {
                if (!selectedProduct) return
                setUpdating(true)
                try {
                  if (!selectedProduct.category_id) {
                    toast.error('Thiếu thông tin', {
                      description: 'Vui lòng chọn Danh Mục'
                    })
                    setUpdating(false)
                    return
                  }

                  if (!selectedProduct.unit_id) {
                    toast.error('Thiếu thông tin', {
                      description: 'Vui lòng chọn Đơn Vị'
                    })
                    setUpdating(false)
                    return
                  }

                  const res = await mobileFetch(`/api/products/${selectedProduct.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      code: selectedProduct.code,
                      name: selectedProduct.name,
                      categoryId: selectedProduct.category_id,
                      unitId: selectedProduct.unit_id,
                      price: selectedProduct.price ? parseFloat(selectedProduct.price) : null
                    })
                  })
                  const json = await res.json()
                  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                  await loadProducts()
                  setEditOpen(false)
                  toast.success('Đã cập nhật sản phẩm')
                } catch (err: any) {
                  toast.error('Lỗi khi cập nhật', {
                    description: err?.message || String(err)
                  })
                } finally {
                  setUpdating(false)
                }
              }} disabled={updating}>{updating ? 'Đang cập nhật...' : 'Lưu'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setPriceDisplayValue(''); setAddOpen(open) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm Sản Phẩm Mới</DialogTitle>
              <DialogDescription>Nhập thông tin sản phẩm</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="code">Mã Sản Phẩm</Label>
                <Input id="code" ref={codeRef} type="text" className="mt-1" placeholder="VD: NL01" />
              </div>
              <div>
                <Label htmlFor="name">Tên Sản Phẩm</Label>
                <Input id="name" ref={nameRef} type="text" className="mt-1" placeholder="VD: Mứt Đào" />
              </div>
              <div>
                <Label htmlFor="category">Danh Mục <span className="text-red-500">*</span></Label>
                <select
                  id="category"
                  ref={categoryRef}
                  className="mt-1 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                >
                  <option value="">-- Chọn Danh Mục --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="unit">Đơn Vị <span className="text-red-500">*</span></Label>
                <select
                  id="unit"
                  ref={unitRef}
                  className="mt-1 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                >
                  <option value="">-- Chọn Đơn Vị --</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="price">Giá (VND)</Label>
                <Input
                  id="price"
                  type="text"
                  placeholder="0"
                  value={priceDisplayValue}
                  onChange={(e) => {
                    const { display, numeric } = handlePriceChange(e.target.value)
                    setPriceDisplayValue(display)
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose className="btn" onClick={() => setAddOpen(false)} disabled={creating}>Hủy</DialogClose>
              <Button onClick={async () => {
                setCreating(true)
                try {
                  const code = codeRef.current?.value
                  const name = nameRef.current?.value
                  const categoryId = categoryRef.current?.value
                  const unitId = unitRef.current?.value
                  const price = getNumericValue(priceDisplayValue)

                  if (!code || !name) {
                    toast.error('Thiếu thông tin', {
                      description: 'Vui lòng nhập mã và tên sản phẩm'
                    })
                    return
                  }

                  if (!categoryId) {
                    toast.error('Thiếu thông tin', {
                      description: 'Vui lòng chọn Danh Mục'
                    })
                    return
                  }

                  if (!unitId) {
                    toast.error('Thiếu thông tin', {
                      description: 'Vui lòng chọn Đơn Vị'
                    })
                    return
                  }

                  const payload = {
                    code,
                    name,
                    categoryId,
                    unitId,
                    price: price || null,
                  }
                  const res = await mobileFetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                  const json = await res.json()
                  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')

                  // Refresh list
                  await loadProducts()
                  setAddOpen(false)
                  toast.success('Đã thêm sản phẩm mới')

                  // Clear inputs
                  if (codeRef.current) codeRef.current.value = ''
                  if (nameRef.current) nameRef.current.value = ''
                  if (categoryRef.current) categoryRef.current.value = ''
                  if (unitRef.current) unitRef.current.value = ''
                  setPriceDisplayValue('')
                } catch (err) {
                  toast.error('Lỗi khi thêm sản phẩm', {
                    description: (err as any)?.message || String(err)
                  })
                } finally {
                  setCreating(false)
                }
              }} disabled={creating}>{creating ? 'Đang thêm...' : 'Lưu'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Duplicate Product Dialog */}
        <Dialog open={duplicateOpen} onOpenChange={(open) => { if (!open) setDuplicateFormData(null); setDuplicateOpen(open) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nhân Bản Sản Phẩm</DialogTitle>
              <DialogDescription>Tạo sản phẩm mới dựa trên sản phẩm hiện tại</DialogDescription>
            </DialogHeader>

            {duplicateFormData && (
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Mã Sản Phẩm Mới <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    placeholder="VD: NL01"
                    value={duplicateFormData.code || ''}
                    onChange={(e) => setDuplicateFormData({ ...duplicateFormData, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tên Sản Phẩm Mới <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    placeholder="VD: Mứt Đào"
                    value={duplicateFormData.name || ''}
                    onChange={(e) => setDuplicateFormData({ ...duplicateFormData, name: e.target.value })}
                  />
                </div>
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Thông tin được sao chép từ sản phẩm gốc:</p>
                  <div className="text-sm space-y-1">
                    <p>Danh Mục: <span className="font-semibold">{duplicateFormData.category_name || '-'}</span></p>
                    <p>Đơn Vị: <span className="font-semibold">{duplicateFormData.unit_name || '-'}</span></p>
                    <p>Giá: <span className="font-semibold">{duplicateFormData.price ? `${Number(duplicateFormData.price).toLocaleString('vi-VN')} VND` : '-'}</span></p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Hủy</Button></DialogClose>
              <Button onClick={async () => {
                if (!duplicateFormData) return
                try {
                  if (!duplicateFormData.code || !duplicateFormData.name) {
                    toast.error('Thiếu thông tin', {
                      description: 'Vui lòng nhập mã và tên sản phẩm mới'
                    })
                    return
                  }

                  const payload = {
                    code: duplicateFormData.code,
                    name: duplicateFormData.name,
                    categoryId: duplicateFormData.category_id,
                    unitId: duplicateFormData.unit_id,
                    price: duplicateFormData.price ? parseFloat(duplicateFormData.price) : null,
                  }
                  const res = await mobileFetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                  const json = await res.json()
                  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')

                  // Refresh list
                  await loadProducts()
                  setDuplicateOpen(false)
                  setDuplicateFormData(null)
                  toast.success('Đã nhân bản sản phẩm')
                } catch (err) {
                  toast.error('Lỗi khi nhân bản sản phẩm', {
                    description: (err as any)?.message || String(err)
                  })
                }
              }}>Tạo Sản Phẩm Mới</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Guide Dialog */}
        <Dialog open={importGuideOpen} onOpenChange={setImportGuideOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Hướng Dẫn Import Sản Phẩm</DialogTitle>
              <DialogDescription>Làm theo các bước sau để import sản phẩm thành công</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
              <div className="space-y-6">
                {/* Step 1 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-3">Bước 1: Chuẩn Bị Dữ Liệu</h3>
                  <div className="space-y-2 text-sm text-blue-800">
                    <p><strong>Các cột bắt buộc:</strong></p>
                    <ul className="list-disc ml-6 space-y-1">
                      <li><strong>Danh Mục:</strong> Tên nhóm hàng (VD: Nguyên Liệu, Nước, Công Cụ)</li>
                      <li><strong>Mã Sản Phẩm:</strong> Mã duy nhất (VD: NL001, ND001)</li>
                      <li><strong>Tên Sản Phẩm:</strong> Tên đầy đủ của sản phẩm</li>
                      <li><strong>Đơn Vị:</strong> Đơn vị tính (VD: Hộp, Chai, Cái, Kg)</li>
                      <li><strong>Giá:</strong> Giá bán (không bắt buộc, có thể để trống)</li>
                    </ul>
                  </div>
                </div>

                {/* Step 2 - Auto Create */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-3">✨ Tính Năng Tự Động</h3>
                  <div className="space-y-2 text-sm text-green-800">
                    <p><strong>Hệ thống sẽ tự động tạo mới nếu chưa tồn tại:</strong></p>
                    <ul className="list-disc ml-6 space-y-1">
                      <li><strong>Danh Mục:</strong> Nếu danh mục chưa có, hệ thống sẽ tự động tạo</li>
                      <li><strong>Đơn Vị:</strong> Nếu đơn vị chưa có, hệ thống sẽ tự động tạo</li>
                    </ul>
                    <p className="mt-2 text-green-700 italic">💡 Bạn không cần phải vào trang Danh Mục hoặc Đơn Vị để tạo trước!</p>
                  </div>
                </div>

                {/* Current Data */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Danh Mục Hiện Có:</h4>
                    <div className="text-sm text-gray-700 max-h-32 overflow-y-auto">
                      {categories.length > 0 ? (
                        <ul className="list-disc ml-4 space-y-1">
                          {categories.map((cat) => (
                            <li key={cat.id}>{cat.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 italic">Chưa có danh mục nào</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Đơn Vị Hiện Có:</h4>
                    <div className="text-sm text-gray-700 max-h-32 overflow-y-auto">
                      {units.length > 0 ? (
                        <ul className="list-disc ml-4 space-y-1">
                          {units.map((unit) => (
                            <li key={unit.id}>{unit.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 italic">Chưa có đơn vị nào</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-900 mb-3">Bước 2: Lưu File</h3>
                  <ul className="list-disc ml-6 space-y-1 text-sm text-amber-800">
                    <li>Định dạng: <strong>.xlsx</strong> hoặc <strong>.xls</strong> hoặc <strong>.csv</strong></li>
                    <li>Không sửa đổi tên các cột header</li>
                    <li>File template đã có sẵn ví dụ để tham khảo</li>
                  </ul>
                </div>

                {/* Step 4 */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-3">Bước 3: Import</h3>
                  <ul className="list-disc ml-6 space-y-1 text-sm text-purple-800">
                    <li>Click nút <strong>"Import Excel"</strong> và chọn file</li>
                    <li>Hệ thống sẽ kiểm tra và xử lý tự động</li>
                    <li>Nếu mã sản phẩm đã tồn tại → Cập nhật thông tin</li>
                    <li>Nếu mã sản phẩm chưa có → Tạo mới sản phẩm</li>
                    <li>Xem kết quả chi tiết sau khi import</li>
                  </ul>
                </div>
              </div></div></div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setImportGuideOpen(false)}>
                Đóng
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Import Result Dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Kết Quả Import</DialogTitle>
              <DialogDescription>Tổng hợp quá trình import từ file Excel</DialogDescription>
            </DialogHeader>

            {importResult && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Tổng số dòng</p>
                    <p className="text-2xl font-bold">{importResult.total}</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Đã thêm</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.created}</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Đã cập nhật</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{importResult.updated || 0}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Bỏ qua</p>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{importResult.skipped}</p>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Lỗi</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.errors?.length || 0}</p>
                  </div>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Chi tiết lỗi:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importResult.errors.map((err: string, idx: number) => (
                        <p key={idx} className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-2 rounded">
                          {err}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setImportOpen(false)}>Đóng</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Tool Dialog */}
        <Dialog open={createToolDialogOpen} onOpenChange={setCreateToolDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Thêm Công Cụ Mới</DialogTitle>
              <DialogDescription>Tạo một công cụ dụng cụ mới trong hệ thống</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="tool-code">Mã Công Cụ</Label>
                <Input
                  id="tool-code"
                  placeholder="Ví dụ: WRENCH-001"
                  value={createToolFormData.code}
                  onChange={(e) => setCreateToolFormData({ ...createToolFormData, code: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="tool-name">Tên Công Cụ</Label>
                <Input
                  id="tool-name"
                  placeholder="Ví dụ: Cờ lê 10mm"
                  value={createToolFormData.name}
                  onChange={(e) => setCreateToolFormData({ ...createToolFormData, name: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="tool-unit">Đơn Vị</Label>
                <select
                  id="tool-unit"
                  value={createToolFormData.unitId}
                  onChange={(e) => setCreateToolFormData({ ...createToolFormData, unitId: e.target.value })}
                  className="mt-2 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                >
                  <option value="">-- Chọn Đơn Vị --</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="tool-price">Giá (VND)</Label>
                <Input
                  id="tool-price"
                  placeholder="Ví dụ: 50.000"
                  value={createToolFormData.price ? Number(createToolFormData.price).toLocaleString('vi-VN') : ''}
                  onChange={(e) => {
                    const numValue = e.target.value.replace(/\D/g, '')
                    setCreateToolFormData({ ...createToolFormData, price: numValue })
                  }}
                  className="mt-2"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateToolDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleCreateTool} disabled={isCreatingTool}>
                {isCreatingTool ? 'Đang tạo...' : 'Tạo Công Cụ'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Tool Dialog */}
        <Dialog open={editToolDialogOpen} onOpenChange={setEditToolDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Chỉnh Sửa Công Cụ</DialogTitle>
              <DialogDescription>Cập nhật thông tin công cụ</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-tool-code">Mã Công Cụ</Label>
                <Input
                  id="edit-tool-code"
                  placeholder="Ví dụ: WRENCH-001"
                  value={editToolFormData.code}
                  onChange={(e) => setEditToolFormData({ ...editToolFormData, code: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="edit-tool-name">Tên Công Cụ</Label>
                <Input
                  id="edit-tool-name"
                  placeholder="Ví dụ: Cờ lê 10mm"
                  value={editToolFormData.name}
                  onChange={(e) => setEditToolFormData({ ...editToolFormData, name: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="edit-tool-unit">Đơn Vị</Label>
                <select
                  id="edit-tool-unit"
                  value={editToolFormData.unitId}
                  onChange={(e) => setEditToolFormData({ ...editToolFormData, unitId: e.target.value })}
                  className="mt-2 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                >
                  <option value="">-- Chọn Đơn Vị --</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="edit-tool-price">Giá (VND)</Label>
                <Input
                  id="edit-tool-price"
                  placeholder="Ví dụ: 50.000"
                  value={editToolFormData.price ? Number(editToolFormData.price).toLocaleString('vi-VN') : ''}
                  onChange={(e) => {
                    const numValue = e.target.value.replace(/\D/g, '')
                    setEditToolFormData({ ...editToolFormData, price: numValue })
                  }}
                  className="mt-2"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditToolDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleEditTool} disabled={isEditingTool}>
                {isEditingTool ? 'Đang cập nhật...' : 'Cập Nhật'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Duplicate Tool Dialog */}
        <Dialog open={duplicateToolDialogOpen} onOpenChange={setDuplicateToolDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nhân Bản Công Cụ</DialogTitle>
              <DialogDescription>Tạo bản sao của công cụ này với thông tin mới</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dup-tool-code">Mã Công Cụ</Label>
                <Input
                  id="dup-tool-code"
                  placeholder="Ví dụ: WRENCH-002"
                  value={duplicateToolFormData?.code || ''}
                  onChange={(e) => setDuplicateToolFormData({ ...duplicateToolFormData, code: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="dup-tool-name">Tên Công Cụ</Label>
                <Input
                  id="dup-tool-name"
                  placeholder="Ví dụ: Cờ lê 10mm (bản sao)"
                  value={duplicateToolFormData?.name || ''}
                  onChange={(e) => setDuplicateToolFormData({ ...duplicateToolFormData, name: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="dup-tool-unit">Đơn Vị</Label>
                <Input
                  id="dup-tool-unit"
                  disabled
                  value={duplicateToolFormData?.unit_name || ''}
                  className="mt-2 bg-muted"
                />
              </div>
              <div>
                <Label htmlFor="dup-tool-price">Giá (VND)</Label>
                <Input
                  id="dup-tool-price"
                  disabled
                  value={duplicateToolFormData?.price ? Number(duplicateToolFormData.price).toLocaleString('vi-VN') : ''}
                  className="mt-2 bg-muted"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDuplicateToolDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleDuplicateTool} disabled={isDuplicatingTool}>
                {isDuplicatingTool ? 'Đang nhân bản...' : 'Nhân Bản'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          open={deleteDialog.open}
          onOpenChange={(open) => !open && setDeleteDialog({ open: false, product: null, isBulk: false })}
          title={deleteDialog.isBulk
            ? "Xác nhận xóa hàng loạt"
            : (isToolsView ? "Xác nhận xóa công cụ" : "Xác nhận xóa sản phẩm")
          }
          description={deleteDialog.isBulk
            ? `Bạn có chắc muốn xóa ${selectedProductIds.length} sản phẩm đã chọn? Hành động này không thể hoàn tác.`
            : (isToolsView ? "Bạn có chắc muốn xóa công cụ này?" : "Bạn có chắc muốn xóa sản phẩm này?")
          }
          itemName={deleteDialog.product?.name}
          onConfirm={async () => {
            if (deleteDialog.isBulk) {
              await handleBulkDelete()
              setDeleteDialog({ open: false, product: null, isBulk: false })
              return
            }

            try {
              const res = await mobileFetch(`/api/products/${deleteDialog.product.id}`, { method: 'DELETE' })
              const json = await res.json()
              if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to delete')
              await loadProducts()
              toast.success(isToolsView ? 'Đã xóa công cụ' : 'Đã xóa sản phẩm')
            } catch (err: any) {
              toast.error('Lỗi khi xóa', {
                description: err?.message || String(err)
              })
              throw err // Re-throw to prevent dialog from closing
            }
          }}
        />

        {/* Product Import Dialog with Preview */}
        <ProductImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onSuccess={() => loadProducts()}
        />
      </div>
    </div>
  )
}
