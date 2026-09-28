"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, Eye, Edit, Trash2, Copy, Wrench } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

interface Unit {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
}

interface Warehouse {
  id: string
  name: string
  code: string
}

export default function ToolsInventoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("")
  const [products, setProducts] = useState<any[]>([])
  const [stockMap, setStockMap] = useState<Record<string, Record<string, number>>>({})
  const [totalInventoryValue, setTotalInventoryValue] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Create tool form state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [toolsCategory, setToolsCategory] = useState<any | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    categoryId: '',
    unitId: '',
    price: ''
  })

  // Edit tool state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const [editFormData, setEditFormData] = useState({
    code: '',
    name: '',
    categoryId: '',
    unitId: '',
    price: ''
  })
  const [isEditing, setIsEditing] = useState(false)

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; product: any | null }>({ open: false, product: null })
  const [isDeleting, setIsDeleting] = useState(false)

  // Duplicate/Copy state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [duplicateFormData, setDuplicateFormData] = useState<any>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Fetch units and categories on mount
  useEffect(() => {
    if (authLoading) return

    let mounted = true
    const fetchInitialData = async () => {
      try {
        // Fetch units for create form
        const unitsRes = await mobileFetch('/api/product-units')
        const unitsJson = await unitsRes.json()
        if (unitsRes.ok && unitsJson?.success && mounted) {
          setUnits(unitsJson.data || [])
        }

        // Fetch all categories for the form dropdown
        const categoriesRes = await mobileFetch('/api/categories')
        const categoriesJson = await categoriesRes.json()
        if (categoriesRes.ok && categoriesJson?.success && mounted) {
          const allCats = categoriesJson.data || []
          setCategories(allCats)

          // Find and set tools category for filtering products
          const toolsCat = allCats.find((cat: any) =>
            cat.name?.toLowerCase().includes('công cụ') ||
            cat.name?.toLowerCase().includes('dụng cụ')
          )
          if (toolsCat) {
            setToolsCategory(toolsCat)
            setSelectedWarehouse('main') // Set a dummy value to trigger data load
          }
        }
      } catch (err) {
        console.error('Failed to fetch initial data:', err)
      }
    }

    fetchInitialData()
    return () => {
      mounted = false
    }
  }, [authLoading])

  // Fetch tools and stock from all warehouses when tools category loads
  useEffect(() => {
    if (!toolsCategory?.id) return

    let mounted = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        // First, fetch MAIN warehouse ID
        let mainWarehouseId = null
        try {
          const whRes = await mobileFetch('/api/warehouses?type=MAIN&page=1&pageSize=10')
          const whJson = await whRes.json()
          if (whJson?.success && whJson?.data && whJson.data.length > 0) {
            mainWarehouseId = whJson.data[0].id
          }
        } catch (err) {
          console.warn('Failed to fetch main warehouse', err)
        }

        // Fetch products with tools category filter
        const productsRes = await mobileFetch(`/api/products?page=1&pageSize=1000&categoryId=${toolsCategory.id}`)
        const productsJson = await productsRes.json()

        if (!productsRes.ok || !productsJson?.success) {
          throw new Error(productsJson?.error || 'Failed to fetch products')
        }

        let prods = productsJson.data || []
        prods = prods.filter((p: any) => !p.code?.startsWith('RECIPE-'))

        if (mounted) setProducts(prods)

        // Fetch stock from MAIN warehouse if we found it
        if (mainWarehouseId) {
          try {
            const stockRes = await mobileFetch(`/api/warehouse-stock?page=1&pageSize=1000&warehouseId=${mainWarehouseId}`)
            const stockJson = await stockRes.json()

            if (stockRes.ok && stockJson?.success) {
              const stocks: any[] = stockJson.data || []
              const map: Record<string, Record<string, number>> = {}
              let totalValue = 0

              for (const s of stocks) {
                const pid = s.productId || s.product_id || s.product || null
                if (!pid) continue

                const qty = Number(s.quantity || 0)

                if (!map[pid]) map[pid] = {}
                map[pid]['main'] = qty

                // Calculate inventory value
                const prod = prods.find((p: any) => p.id === pid)
                if (prod && prod.price) {
                  totalValue += qty * Number(prod.price)
                }
              }

              if (mounted) {
                setStockMap(map)
                setTotalInventoryValue(totalValue)
              }
            }
          } catch (err) {
            console.warn('Failed to fetch warehouse stock', err)
          }
        }
      } catch (err: any) {
        if (mounted) setError(err?.message || String(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchData()
    return () => {
      mounted = false
    }
  }, [toolsCategory?.id])

  // Filter products by search term
  const filteredProducts = products.filter(p => {
    if (!searchTerm) return true
    return (
      p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const selectedWarehouseData = warehouses.find(w => w.id === selectedWarehouse)

  const handleCreateTool = async () => {
    if (!formData.code.trim() || !formData.name.trim() || !formData.categoryId || !formData.unitId || !formData.price.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setIsCreating(true)
      const response = await mobileFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code.trim(),
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          unitId: formData.unitId,
          price: Number(formData.price)
        })
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Tạo công cụ thành công')
        setCreateDialogOpen(false)
        setFormData({ code: '', name: '', categoryId: '', unitId: '', price: '' })
        // Refresh products list
        window.location.reload()
      } else {
        toast.error(json?.error || 'Lỗi tạo công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsCreating(false)
    }
  }

  const handleEditTool = async () => {
    if (!editingProduct?.id || !editFormData.code.trim() || !editFormData.name.trim() || !editFormData.categoryId || !editFormData.unitId || !editFormData.price.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setIsEditing(true)
      const response = await mobileFetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editFormData.code.trim(),
          name: editFormData.name.trim(),
          categoryId: editFormData.categoryId,
          unitId: editFormData.unitId,
          price: Number(editFormData.price)
        })
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Cập nhật công cụ thành công')
        setEditDialogOpen(false)
        setEditingProduct(null)
        window.location.reload()
      } else {
        toast.error(json?.error || 'Lỗi cập nhật công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsEditing(false)
    }
  }

  const handleDeleteTool = async () => {
    if (!deleteDialog.product?.id) return

    try {
      setIsDeleting(true)
      const response = await mobileFetch(`/api/products/${deleteDialog.product.id}`, {
        method: 'DELETE'
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Xóa công cụ thành công')
        setDeleteDialog({ open: false, product: null })
        window.location.reload()
      } else {
        toast.error(json?.error || 'Lỗi xóa công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDuplicateTool = async () => {
    if (!duplicateFormData?.code.trim() || !duplicateFormData?.name.trim() || !duplicateFormData?.category_id || !duplicateFormData?.unit_id || !duplicateFormData?.price) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    try {
      setIsDuplicating(true)
      const response = await mobileFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: duplicateFormData.code.trim(),
          name: duplicateFormData.name.trim(),
          categoryId: duplicateFormData.category_id,
          unitId: duplicateFormData.unit_id,
          price: Number(duplicateFormData.price)
        })
      })

      const json = await response.json()

      if (response.ok && json?.success) {
        toast.success('Nhân bản công cụ thành công')
        setDuplicateDialogOpen(false)
        setDuplicateFormData(null)
        window.location.reload()
      } else {
        toast.error(json?.error || 'Lỗi nhân bản công cụ')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsDuplicating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Wrench}
        title="Công Cụ"
        subtitle="Quản lý công cụ dụng cụ"
        gradient="blue"
      />
      
      <div className="p-4 md:p-8 space-y-6">
        {/* Inventory Value Summary */}
        <Card className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-300">Tổng Giá Trị Tồn Kho Công Cụ</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-50 mt-2">
                {totalInventoryValue.toLocaleString('vi-VN')} VND
              </p>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold text-foreground">Công Cụ</h1>
            <p className="text-muted-foreground mt-2">Quản lý công cụ dụng cụ và tồn kho</p>
          </div>
          <div className="flex gap-2">
            <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Thêm Công Cụ</span>
              <span className="md:hidden">Thêm</span>
            </Button>
          </div>
        </div>

      <Card className="p-6">
        <div className="mb-6 space-y-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm công cụ..."
                className="pl-10"
              />
            </div>
            <Button variant="ghost" onClick={() => setSearchTerm('')}>Xóa</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {authLoading && <p className="p-4 text-sm text-muted-foreground">Đang tải thông tin người dùng...</p>}
          {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải tồn kho công cụ...</p>}
          {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}
          {!authLoading && !loading && !error && filteredProducts.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Không có công cụ tồn kho</p>
          )}
          {filteredProducts.length > 0 && (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {filteredProducts.map((product) => {
                  const qty = stockMap[product.id]?.['main'] ?? 0
                  const price = product.price ? Number(product.price) : 0
                  return (
                    <Card key={product.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{product.name}</p>
                          <p className="text-xs font-mono text-muted-foreground">{product.code}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">{product.category_name ?? '-'}</Badge>
                            <Badge variant="secondary" className="text-xs">{product.unit_name ?? '-'}</Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-lg ${qty < 0 ? 'text-red-600' : 'text-green-600'}`}>{qty}</p>
                          <p className="text-xs text-muted-foreground">{price.toLocaleString('vi-VN')}đ</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setEditingProduct(product)
                            setEditFormData({
                              code: product.code,
                              name: product.name,
                              categoryId: product.category_id,
                              unitId: product.unit_id,
                              price: product.price ? String(product.price) : ''
                            })
                            setEditDialogOpen(true)
                          }}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDuplicateFormData({
                              code: '',
                              name: '',
                              category_id: product.category_id,
                              category_name: product.category_name,
                              unit_id: product.unit_id,
                              unit_name: product.unit_name,
                              price: product.price || ''
                            })
                            setDuplicateDialogOpen(true)
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => setDeleteDialog({ open: true, product })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Mã</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Tên</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Danh Mục</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Đơn Vị</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Giá (VND)</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Kho</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const qty = stockMap[product.id]?.['main'] ?? 0
                    const price = product.price ? Number(product.price) : 0
                    const totalValue = qty * price
                    return (
                    <tr key={product.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium text-foreground">{product.code}</td>
                      <td className="py-3 px-4 text-foreground">{product.name}</td>
                      <td className="py-3 px-4 text-foreground">{product.category_name ?? '-'}</td>
                      <td className="py-3 px-4 text-foreground">{product.unit_name ?? '-'}</td>
                      <td className="py-3 px-4 text-right font-medium text-foreground">
                        {product.price ? price.toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className={`py-3 px-4 text-center font-medium ${qty < 0 ? 'text-red-600 font-bold' : 'text-foreground'}`}>
                        {typeof qty === 'number' ? qty : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-orange-50 dark:hover:bg-orange-950 hover:text-orange-600 dark:hover:text-orange-400"
                            onClick={() => {
                              setEditingProduct(product)
                              setEditFormData({
                                code: product.code,
                                name: product.name,
                                categoryId: product.category_id,
                                unitId: product.unit_id,
                                price: product.price ? String(product.price) : ''
                              })
                              setEditDialogOpen(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-600 dark:hover:text-green-400"
                            onClick={() => {
                              setDuplicateFormData({
                                code: '',
                                name: '',
                                category_id: product.category_id,
                                category_name: product.category_name,
                                unit_id: product.unit_id,
                                unit_name: product.unit_name,
                                price: product.price || ''
                              })
                              setDuplicateDialogOpen(true)
                            }}
                            title="Nhân bản công cụ"
                          >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                          onClick={() => setDeleteDialog({ open: true, product })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            </>
          )}
        </div>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={viewOpen} onOpenChange={(open) => { if (!open) setSelectedProduct(null); setViewOpen(open) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết công cụ</DialogTitle>
            <DialogDescription>Thông tin chi tiết công cụ và tồn kho</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {selectedProduct ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 border-b pb-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Mã</p>
                    <p className="font-semibold">{selectedProduct.code}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tên</p>
                    <p className="font-semibold">{selectedProduct.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Danh Mục</p>
                    <p className="font-semibold">{selectedProduct.category_name ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Đơn Vị</p>
                    <p className="font-semibold">{selectedProduct.unit_name ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Giá (VND)</p>
                    <p className="font-semibold">{selectedProduct.price ? Number(selectedProduct.price).toLocaleString('vi-VN') : '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Tồn Kho (Kho Tổng)</p>
                    <p className="text-3xl font-bold text-blue-900">
                      {typeof selectedProduct.stock === 'number' ? selectedProduct.stock : '-'}
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Tổng Giá Trị</p>
                    <p className="text-3xl font-bold text-green-900">
                      {selectedProduct.price && typeof selectedProduct.stock === 'number'
                        ? (selectedProduct.stock * Number(selectedProduct.price)).toLocaleString('vi-VN')
                        : '-'}
                    </p>
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

      {/* Create Tool Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm Công Cụ Mới</DialogTitle>
            <DialogDescription>Tạo một công cụ dụng cụ mới trong hệ thống</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Mã Công Cụ</label>
              <Input
                placeholder="Ví dụ: WRENCH-001"
                value={formData.code}
                onChange={(e) => setFormData({...formData, code: e.target.value})}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tên Công Cụ</label>
              <Input
                placeholder="Ví dụ: Cờ lê 10mm"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Nhóm Hàng</label>
              <Select value={formData.categoryId} onValueChange={(val) => setFormData({...formData, categoryId: val})}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Chọn nhóm hàng..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Đơn Vị</label>
              <Select value={formData.unitId} onValueChange={(val) => setFormData({...formData, unitId: val})}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Chọn đơn vị..." />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Giá (VND)</label>
              <Input
                placeholder="Ví dụ: 50.000"
                value={formData.price ? Number(formData.price).toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const numValue = e.target.value.replace(/\D/g, '')
                  setFormData({...formData, price: numValue})
                }}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleCreateTool} disabled={isCreating}>
              {isCreating ? 'Đang tạo...' : 'Tạo Công Cụ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tool Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh Sửa Công Cụ</DialogTitle>
            <DialogDescription>Cập nhật thông tin công cụ</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Mã Công Cụ</label>
              <Input
                placeholder="Ví dụ: WRENCH-001"
                value={editFormData.code}
                onChange={(e) => setEditFormData({...editFormData, code: e.target.value})}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tên Công Cụ</label>
              <Input
                placeholder="Ví dụ: Cờ lê 10mm"
                value={editFormData.name}
                onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Nhóm Hàng</label>
              <Select value={editFormData.categoryId} onValueChange={(val) => setEditFormData({...editFormData, categoryId: val})}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Chọn nhóm hàng..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Đơn Vị</label>
              <Select value={editFormData.unitId} onValueChange={(val) => setEditFormData({...editFormData, unitId: val})}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Chọn đơn vị..." />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Giá (VND)</label>
              <Input
                placeholder="Ví dụ: 50.000"
                value={editFormData.price ? Number(editFormData.price).toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const numValue = e.target.value.replace(/\D/g, '')
                  setEditFormData({...editFormData, price: numValue})
                }}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleEditTool} disabled={isEditing}>
              {isEditing ? 'Đang cập nhật...' : 'Cập Nhật'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Tool Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nhân Bản Công Cụ</DialogTitle>
            <DialogDescription>Tạo bản sao của công cụ này với thông tin mới</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Mã Công Cụ</label>
              <Input
                placeholder="Ví dụ: WRENCH-002"
                value={duplicateFormData?.code || ''}
                onChange={(e) => setDuplicateFormData({...duplicateFormData, code: e.target.value})}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tên Công Cụ</label>
              <Input
                placeholder="Ví dụ: Cờ lê 10mm (bản sao)"
                value={duplicateFormData?.name || ''}
                onChange={(e) => setDuplicateFormData({...duplicateFormData, name: e.target.value})}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Nhóm Hàng</label>
              <Input
                disabled
                value={duplicateFormData?.category_name || ''}
                className="mt-2 bg-muted"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Đơn Vị</label>
              <Input
                disabled
                value={duplicateFormData?.unit_name || ''}
                className="mt-2 bg-muted"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Giá (VND)</label>
              <Input
                disabled
                value={duplicateFormData?.price ? Number(duplicateFormData.price).toLocaleString('vi-VN') : ''}
                className="mt-2 bg-muted"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleDuplicateTool} disabled={isDuplicating}>
              {isDuplicating ? 'Đang nhân bản...' : 'Nhân Bản'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialog.open}
        title="Xác nhận xóa"
        description={`Bạn có chắc muốn xóa công cụ "${deleteDialog.product?.name}" không?`}
        onConfirm={handleDeleteTool}
        onCancel={() => setDeleteDialog({ open: false, product: null })}
        isLoading={isDeleting}
        confirmText="Xóa"
        cancelText="Hủy"
      />
    </div>
    </div>
  )
}
