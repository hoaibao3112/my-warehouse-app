"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, Eye, Wrench } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
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
import { toast } from "sonner"

export default function StoreToolsInventoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [products, setProducts] = useState<any[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [totalInventoryValue, setTotalInventoryValue] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')

  useEffect(() => {
    // Wait for auth to load
    if (authLoading) {
      return
    }

    if (!user?.warehouseId) {
      setError('Bạn chưa được gán kho nào. Vui lòng liên hệ quản trị viên.')
      setProducts([])
      console.error('User does not have warehouseId:', user)
      return
    }

    let mounted = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        // First get all categories to find the tools category
        const categoriesRes = await mobileFetch('/api/categories')
        const categoriesJson = await categoriesRes.json()

        if (!categoriesRes.ok || !categoriesJson?.success) {
          throw new Error('Failed to fetch categories')
        }

        // Find the tools category (Công Cụ Dụng Cụ)
        const toolsCategory = categoriesJson.data?.find((cat: any) =>
          cat.name?.toLowerCase().includes('công cụ') ||
          cat.name?.toLowerCase().includes('dụng cụ')
        )

        if (!toolsCategory) {
          if (mounted) setError('Chưa có danh mục Công Cụ Dụng Cụ. Vui lòng liên hệ quản trị viên.')
          return
        }

        // Fetch tools products with category filter
        const res = await mobileFetch(`/api/products?page=1&pageSize=1000&categoryId=${toolsCategory.id}`)
        const json = await res.json()
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
        let prods = json.data || []

        // Filter out recipe products
        prods = prods.filter((p: any) => !p.code?.startsWith('RECIPE-'))

        if (mounted) setProducts(prods)

        // Fetch stock for user's warehouse only
        try {
          const stockRes = await mobileFetch(`/api/warehouse-stock?page=1&pageSize=1000&warehouseId=${user.warehouseId}`)
          const stockJson = await stockRes.json()
          if (stockRes.ok && stockJson?.success) {
            const stocks: any[] = stockJson.data || []
            const map: Record<string, number> = {}
            for (const s of stocks) {
              const pid = s.productId || s.product_id || s.product || null
              if (!pid) {
                continue
              }
              const qty = Number(s.quantity || 0)
              map[pid] = qty
            }
            if (mounted) {
              setStockMap(map)
            }
          } else {
            console.error('Failed to fetch stock:', stockJson)
            toast.error("Không thể tải dữ liệu tồn công cụ")
          }

          // Fetch total inventory value separately for tools (not limited by pagination)
          try {
            // Calculate total value for tools category only
            let toolsTotalValue = 0
            const stocks: any[] = stockJson.data || []
            for (const s of stocks) {
              const pid = s.productId || s.product_id || s.product || null
              if (!pid) continue

              // Only count if product is in tools category
              const prod = prods.find((p: any) => p.id === pid)
              if (prod && prod.price) {
                const qty = Number(s.quantity || 0)
                toolsTotalValue += qty * Number(prod.price)
              }
            }
            if (mounted) {
              setTotalInventoryValue(toolsTotalValue)
            }
          } catch (err) {
            console.warn('Failed to calculate total inventory value', err)
          }
        } catch (err) {
          console.warn('Failed to fetch warehouse stock', err)
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
  }, [user?.warehouseId, authLoading])

  // Filter products by search term and only show products with stock in this warehouse
  const filteredProducts = products.filter(p => {
    // Only show products that have stock record in this warehouse (including 0 and negative)
    const hasStockRecord = p.id in stockMap
    if (!hasStockRecord) return false

    // Then filter by search term
    if (!searchTerm) return true
    return (
      p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Wrench}
        title="Công Cụ"
        subtitle="Tồn kho công cụ dụng cụ"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        {/* Inventory Value Summary */}
        <Card className="p-4 md:p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-300">Tổng Giá Trị Tồn Kho Công Cụ</p>
              <p className="text-2xl md:text-3xl font-bold text-blue-900 dark:text-blue-50 mt-1 md:mt-2">
                {totalInventoryValue.toLocaleString('vi-VN')} VND
              </p>
            </div>
          </div>
        </Card>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold text-foreground">Công Cụ</h1>
            <p className="text-muted-foreground mt-2">Xem tồn kho công cụ dụng cụ của bạn</p>
          </div>
          <Button className="gap-2 w-full md:w-auto" onClick={() => router.push('/store/tools-transfers')}>
            <Plus className="w-4 h-4" />
            Nhập Công Cụ
          </Button>
        </div>

        <Card className="p-6">
          <div className="mb-6 flex gap-4 items-center">
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

          <div className="overflow-x-auto">
            {authLoading && <p className="p-4 text-sm text-muted-foreground">Đang tải thông tin người dùng...</p>}
            {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải tồn kho công cụ...</p>}
            {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}
            {!authLoading && !loading && !error && filteredProducts.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Không có công cụ tồn kho</p>
            )}
            {filteredProducts.length > 0 && (
              <ResponsiveTable
                data={filteredProducts}
                columns={[
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
                  {
                    key: 'category_name',
                    label: 'Danh Mục',
                    render: (product) => <span>{product.category_name ?? '-'}</span>,
                  },
                  {
                    key: 'unit_name',
                    label: 'Đơn Vị',
                    render: (product) => <span>{product.unit_name ?? '-'}</span>,
                  },
                  {
                    key: 'price',
                    label: 'Giá (VND)',
                    render: (product) => {
                      const price = product.price ? Number(product.price) : 0
                      return <span>{product.price ? price.toLocaleString('vi-VN') : '-'}</span>
                    },
                    align: 'right',
                  },
                  {
                    key: 'stock',
                    label: 'Tồn Kho',
                    render: (product) => {
                      const qty = stockMap[product.id] ?? 0
                      return (
                        <Badge variant={qty < 0 ? 'destructive' : 'secondary'} className={qty < 0 ? 'bg-red-600 text-white font-bold' : ''}>
                          {typeof qty === 'number' ? qty : '-'}
                        </Badge>
                      )
                    },
                    align: 'center',
                    mobilePrimary: true,
                  },
                ]}
                actions={[
                  {
                    label: 'Xem',
                    icon: <Eye className="w-4 h-4" />,
                    onClick: (product) => {
                      setSelectedProduct({ ...product, stock: stockMap[product.id] ?? 0 })
                      setViewOpen(true)
                    },
                    variant: 'ghost',
                  },
                ]}
                keyExtractor={(product) => product.id}
                loading={loading}
                emptyMessage="Không có công cụ tồn kho"
                mobileCardTitle={(product) => product.name}
                mobileCardBadge={(product) => {
                  const qty = stockMap[product.id] ?? 0
                  return (
                    <Badge variant={qty < 0 ? 'destructive' : 'secondary'} className={qty < 0 ? 'bg-red-600 text-white font-bold' : ''}>
                      {typeof qty === 'number' ? qty : '-'}
                    </Badge>
                  )
                }}
                mobileCardMeta={(product) => {
                  const qty = stockMap[product.id] ?? 0
                  const price = product.price ? Number(product.price) : 0
                  return [
                    <>🏷️ {product.code}</>,
                    <>📂 {product.category_name ?? '-'}</>,
                    <>📊 {product.unit_name ?? '-'}</>,
                    <>💰 {product.price ? price.toLocaleString('vi-VN') : '-'} VND</>,
                  ]
                }}
              />
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
                      <p className="text-sm text-muted-foreground mb-1">Tồn Kho</p>
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
      </div>
    </div>
  )
}
