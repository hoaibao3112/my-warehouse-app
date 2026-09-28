"use client"

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Plus, Trash2, Edit, Package, Search, Layers, ArrowUpDown, Eye, X, Ruler } from 'lucide-react'
import { ProductPackagesDialog } from '@/components/product-packages-dialog'
import { toast } from 'sonner'
import { MobilePageHeader } from '@/components/mobile/mobile-page-header'
import { mobileFetch } from "@/lib/mobile/api-client"

interface Unit {
  id: string
  code: string
  name: string
  description?: string
  productCount?: number
  packageCount?: number
  conversionCount?: number
}

interface Product {
  id: string
  code: string
  name: string
  categoryName: string
  unitName: string
  category_id?: string
  unit_id?: string
}

interface Category {
  id: string
  name: string
}

export default function UnitsAdminPage() {
  const [activeTab, setActiveTab] = useState<'units' | 'conversions'>('units')

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => {} })

  // Units tab state
  const [units, setUnits] = useState<Unit[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [unitName, setUnitName] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [unitDescription, setUnitDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingUnit, setDeletingUnit] = useState<string | null>(null)
  const [deletingConversion, setDeletingConversion] = useState<string | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [unitDetailsDialogOpen, setUnitDetailsDialogOpen] = useState(false)
  const [unitConversions, setUnitConversions] = useState<any[]>([])
  const [conversionsLoading, setConversionsLoading] = useState(false)

  // Conversions tab state
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)

  // Filters
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'category'>('name')

  // Load units
  const loadUnits = async () => {
    setUnitsLoading(true)
    setUnitsError(null)
    try {
      const res = await mobileFetch('/api/product-units?enriched=true')
      const j = await res.json()
      if (!res.ok || !j?.success) throw new Error(j?.error || 'Failed to fetch units')
      setUnits(j.data || [])
    } catch (err: any) {
      setUnitsError(err?.message || String(err))
      setUnits([])
      toast.error('Lỗi tải đơn vị: ' + (err?.message || String(err)))
    } finally {
      setUnitsLoading(false)
    }
  }

  // Load categories for filter
  const loadCategories = async () => {
    try {
      const res = await mobileFetch('/api/categories')
      const json = await res.json()
      if (json.success) {
        setCategories(json.data || [])
      }
    } catch (error) {
      console.error('Failed to load categories')
    }
  }

  // Load products with proper mapping
  const loadProducts = async () => {
    try {
      setProductsLoading(true)
      const q = new URLSearchParams()
      q.set('page', String(page))
      q.set('pageSize', String(pageSize))
      if (searchTerm) q.set('search', searchTerm)
      if (selectedCategoryId) q.set('categoryId', selectedCategoryId)

      const res = await mobileFetch(`/api/products?${q.toString()}`)
      const json = await res.json()
      if (json.success) {
        // Map the response to ensure proper field names
        const mappedProducts = (json.data || []).map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          categoryName: p.category_name || 'Không có danh mục',
          unitName: p.unit_name || 'Không có đơn vị',
          category_id: p.category_id,
          unit_id: p.unit_id
        }))
        setProducts(mappedProducts)
        setTotal(json.total || 0)
      } else {
        toast.error('Lỗi tải sản phẩm')
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message)
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'units') {
      loadUnits()
    } else {
      loadCategories()
      loadProducts()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'conversions') {
      loadProducts()
    }
  }, [page, pageSize, selectedCategoryId])

  const handleCreateUnit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setSubmitting(true)
    try {
      const finalCode = unitCode.trim() || unitName.trim().toUpperCase().replace(/\s+/g, '_')
      if (!finalCode || !unitName.trim()) {
        toast.error('Vui lòng nhập tên đơn vị')
        setSubmitting(false)
        return
      }

      const res = await mobileFetch('/api/product-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: finalCode,
          name: unitName.trim(),
          description: unitDescription.trim() || null
        })
      })
      const j = await res.json()
      if (!res.ok || !j?.success) throw new Error(j?.error || 'Tạo đơn vị thất bại')

      setUnitDialogOpen(false)
      resetUnitForm()
      toast.success('Đơn vị đã được tạo thành công')
      await loadUnits()
    } catch (err: any) {
      toast.error(err?.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const resetUnitForm = () => {
    setUnitName('')
    setUnitCode('')
    setUnitDescription('')
    setEditingId(null)
  }

  const handleEditUnit = (unit: Unit) => {
    setEditingId(unit.id)
    setUnitName(unit.name)
    setUnitCode(unit.code)
    setUnitDescription(unit.description || '')
    setUnitDialogOpen(true)
  }

  const handleDeleteUnit = async (unit: Unit) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa đơn vị",
      description: `Bạn có chắc muốn xóa đơn vị "${unit.name}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeletingUnit(unit.id)
        try {
          const res = await mobileFetch(`/api/product-units/${unit.id}`, { method: 'DELETE' })
          const json = await res.json()
          if (!res.ok || !json?.success) throw new Error(json?.error || 'Xóa thất bại')

          toast.success('Đơn vị đã được xóa thành công')
          await loadUnits()
        } catch (err: any) {
          toast.error('Lỗi khi xóa: ' + (err?.message || String(err)))
        } finally {
          setDeletingUnit(null)
        }
      }
    })
  }

  const handleViewUnitDetails = async (unit: Unit) => {
    setSelectedUnit(unit)
    setUnitDetailsDialogOpen(true)
    await loadUnitConversions(unit.id)
  }

  const loadUnitConversions = async (unitId: string) => {
    setConversionsLoading(true)
    try {
      const res = await mobileFetch(`/api/admin/product-packages?packageUnitId=${unitId}&pageSize=1000`)
      const json = await res.json()
      if (json.success) {
        setUnitConversions(json.data || [])
      } else {
        setUnitConversions([])
      }
    } catch (err) {
      console.error('Failed to load unit conversions:', err)
      setUnitConversions([])
    } finally {
      setConversionsLoading(false)
    }
  }

  const handleDeleteConversion = async (conversionId: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa quy đổi",
      description: "Bạn có chắc muốn xóa quy đổi này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeletingConversion(conversionId)
        try {
          const res = await mobileFetch(`/api/admin/product-packages/${conversionId}`, {
            method: 'DELETE'
          })
          const json = await res.json()
          if (json.success) {
            toast.success('Đã xóa quy đổi')
            if (selectedUnit) {
              await loadUnitConversions(selectedUnit.id)
            }
            await loadUnits()
          } else {
            toast.error(json.error || 'Xóa thất bại')
          }
        } catch (err: any) {
          toast.error('Lỗi: ' + err.message)
        } finally {
          setDeletingConversion(null)
        }
      }
    })
  }

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product)
    setConversionDialogOpen(true)
  }

  const handleSearchProducts = () => {
    setPage(1)
    loadProducts()
  }

  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedCategoryId('')
    setPage(1)
    loadProducts()
  }

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'code':
        return a.code.localeCompare(b.code)
      case 'category':
        return a.categoryName.localeCompare(b.categoryName)
      default:
        return 0
    }
  })

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Ruler}
        title="Đơn Vị & Quy Đổi"
        subtitle="Quản lý đơn vị đo"
        gradient="orange"
      />
      
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="hidden md:block">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quản Lý Đơn Vị & Quy Đổi</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Quản lý đơn vị đo và thiết lập quy đổi riêng cho từng sản phẩm
            </p>
          </div>

        {/* Tabs */}
        <div className="flex gap-1 md:gap-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => setActiveTab('units')}
            className={`px-3 md:px-4 py-2 text-sm md:text-base font-medium transition-colors relative whitespace-nowrap ${
              activeTab === 'units'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-1 md:gap-2">
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">Danh Sách </span>Đơn Vị
            </div>
            {activeTab === 'units' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('conversions')}
            className={`px-3 md:px-4 py-2 text-sm md:text-base font-medium transition-colors relative whitespace-nowrap ${
              activeTab === 'conversions'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-1 md:gap-2">
              <Package className="w-4 h-4" />
              Quy Đổi<span className="hidden sm:inline"> Sản Phẩm</span>
            </div>
            {activeTab === 'conversions' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Units Tab */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {units.length} đơn vị đo lường
            </p>
            <Dialog open={unitDialogOpen} onOpenChange={(newOpen) => {
              setUnitDialogOpen(newOpen)
              if (!newOpen) resetUnitForm()
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Thêm Đơn Vị
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? 'Chỉnh Sửa Đơn Vị' : 'Thêm Đơn Vị'}</DialogTitle>
                  <DialogDescription>
                    {editingId ? 'Cập nhật thông tin đơn vị' : 'Thêm một đơn vị đo mới'}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreateUnit} className="grid gap-4 pt-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Tên Đơn Vị <span className="text-red-500">*</span></label>
                    <Input
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      placeholder="VD: Thùng, Chai, ML, KG"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Mã</label>
                    <Input
                      value={unitCode}
                      onChange={(e) => setUnitCode(e.target.value)}
                      placeholder="VD: THUNG (tự động nếu bỏ trống)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Mã sẽ được sinh tự động từ tên nếu không nhập
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Mô Tả</label>
                    <Input
                      value={unitDescription}
                      onChange={(e) => setUnitDescription(e.target.value)}
                      placeholder="VD: Thùng 24 chai"
                    />
                  </div>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="ghost">Hủy</Button>
                    </DialogClose>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Đang lưu...' : editingId ? 'Cập Nhật' : 'Tạo Đơn Vị'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {unitsLoading && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Đang tải đơn vị...</p>
            </Card>
          )}

          {unitsError && (
            <Card className="p-4 bg-destructive/10 border-destructive/30">
              <p className="text-sm text-destructive">Lỗi: {unitsError}</p>
            </Card>
          )}

          {!unitsLoading && units.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground mb-4">Chưa có đơn vị nào</p>
            </Card>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {units.map((unit) => (
                  <Card key={unit.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{unit.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{unit.code}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {unit.productCount || 0} SP
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {unit.packageCount || 0} QĐ
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewUnitDetails(unit)}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUnit(unit)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUnit(unit)}
                          disabled={deletingUnit === unit.id}
                          className="h-8 w-8 p-0 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="border rounded-lg overflow-hidden hidden md:block">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Tên Đơn Vị</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Mã</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold">Số Sản Phẩm</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold">Số Quy Đổi</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {units.map((unit) => (
                      <tr key={unit.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{unit.name}</td>
                        <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{unit.code}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="secondary" className="gap-1 text-xs">
                            {unit.productCount || 0}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className="gap-1 text-xs">
                            {unit.packageCount || 0}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewUnitDetails(unit)}
                              className="h-8 w-8 p-0"
                              title="Chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUnit(unit)}
                              className="h-8 w-8 p-0"
                              title="Sửa"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUnit(unit)}
                              disabled={deletingUnit === unit.id}
                              className="h-8 w-8 p-0 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Conversions Tab */}
      {activeTab === 'conversions' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card className="p-3 md:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 md:gap-4">
              <div className="sm:col-span-2 md:col-span-5 relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm theo tên hoặc mã..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchProducts()
                  }}
                  className="pl-10 text-sm"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={selectedCategoryId}
                  onChange={(e) => {
                    setSelectedCategoryId(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-2 border rounded-md bg-white text-sm h-10"
                >
                  <option value="">Tất cả danh mục</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 sm:col-span-2 md:col-span-4">
                <Button onClick={handleSearchProducts} className="flex-1 md:flex-none" size="sm">
                  <Search className="w-4 h-4 mr-1 md:mr-2" />
                  Tìm
                </Button>
                <Button onClick={handleResetFilters} variant="outline" className="flex-1 md:flex-none" size="sm">
                  Đặt Lại
                </Button>
              </div>
            </div>
          </Card>

          {productsLoading && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Đang tải sản phẩm...</p>
            </Card>
          )}

          {!productsLoading && sortedProducts.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Không tìm thấy sản phẩm nào</p>
            </Card>
          ) : (
            <>
              {/* Table View */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border bg-muted/50">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-sm">
                          <button
                            onClick={() => setSortBy('code')}
                            className="flex items-center gap-1 hover:text-primary"
                          >
                            Mã SP
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-sm">
                          <button
                            onClick={() => setSortBy('name')}
                            className="flex items-center gap-1 hover:text-primary"
                          >
                            Tên Sản Phẩm
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-sm">
                          <button
                            onClick={() => setSortBy('category')}
                            className="flex items-center gap-1 hover:text-primary"
                          >
                            Danh Mục
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-sm">Đơn Vị Gốc</th>
                        <th className="text-right py-3 px-4 font-semibold text-sm">Hành Động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.map((product) => (
                        <tr
                          key={product.id}
                          className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleProductClick(product)}
                        >
                          <td className="py-3 px-4 text-sm font-mono text-muted-foreground">
                            {product.code}
                          </td>
                          <td className="py-3 px-4 font-medium">{product.name}</td>
                          <td className="py-3 px-4 text-sm">
                            <Badge variant="outline">{product.categoryName}</Badge>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <Badge variant="secondary">{product.unitName}</Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleProductClick(product)
                              }}
                              className="gap-2"
                            >
                              <Package className="w-4 h-4" />
                              Quản Lý
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Pagination */}
              {!productsLoading && sortedProducts.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Hiển thị {sortedProducts.length} trên {total} sản phẩm
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Trước
                      </Button>
                      <span className="px-3 py-2 text-sm">
                        Trang {page} / {Math.ceil(total / pageSize)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page * pageSize >= total}
                        onClick={() => setPage(page + 1)}
                      >
                        Tiếp
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Product Packages Dialog */}
      {selectedProduct && (
        <ProductPackagesDialog
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          open={conversionDialogOpen}
          onOpenChange={setConversionDialogOpen}
        />
      )}

      {/* Unit Details Dialog */}
      <Dialog open={unitDetailsDialogOpen} onOpenChange={setUnitDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
            <DialogTitle className="text-xl flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Chi Tiết Đơn Vị: {selectedUnit?.name}
            </DialogTitle>
            <DialogDescription>
              Danh sách quy đổi sử dụng đơn vị "{selectedUnit?.name}" cho các sản phẩm
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4 space-y-4">
            {/* Unit Info Card */}
            <Card className="p-4 bg-muted/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tên Đơn Vị</p>
                  <p className="font-semibold">{selectedUnit?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Mã</p>
                  <p className="font-mono text-sm">{selectedUnit?.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Số Quy Đổi</p>
                  <Badge>{unitConversions.length}</Badge>
                </div>
              </div>
            </Card>

            {/* Conversions Table */}
            {conversionsLoading ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Đang tải...</p>
              </Card>
            ) : unitConversions.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">Chưa có quy đổi nào sử dụng đơn vị này</p>
              </Card>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Sản Phẩm</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Tên Hiển Thị</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold">Quy Đổi</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unitConversions.map((conv: any) => (
                      <tr key={conv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{conv.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              Đơn vị gốc: {conv.baseUnitName || 'N/A'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{conv.packageName}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full">
                            <span className="font-mono font-bold text-primary">1 {selectedUnit?.name}</span>
                            <span className="text-muted-foreground">=</span>
                            <span className="font-mono font-bold text-green-600">
                              {conv.baseQuantity} {conv.baseUnitName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteConversion(conv.id)}
                              disabled={deletingConversion === conv.id}
                              className="h-8 w-8 p-0 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>

          <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex justify-end">
            <Button variant="outline" onClick={() => setUnitDetailsDialogOpen(false)}>
              Đóng
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
