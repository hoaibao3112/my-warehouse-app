"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Loader2, Package, Gift } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"

interface ProductData {
  product_id: string
  product_name: string
  product_code: string | null
  unit: string | null
  quantity: number
  revenue: number
  order_count: number
}

interface GiftProductData {
  product_name: string
  promotion_name: string
  quantity: number
  invoice_count: number
}

interface ShiftProductsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string | null
  sessionDate?: string
}

export function ShiftProductsDialog({
  open,
  onOpenChange,
  sessionId,
  sessionDate,
}: ShiftProductsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<ProductData[]>([])
  const [giftProducts, setGiftProducts] = useState<GiftProductData[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalQuantity, setTotalQuantity] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)

  useEffect(() => {
    if (open && sessionId) {
      loadProducts()
    }
  }, [open, sessionId])

  const loadProducts = async () => {
    if (!sessionId) return

    try {
      setLoading(true)
      const res = await mobileFetch(`/api/shifts/${sessionId}/products`)
      const json = await res.json()

      if (json.success) {
        setProducts(json.data.products || [])
        setGiftProducts(json.data.giftProducts || [])
        setTotalProducts(json.data.totalProducts || 0)
        setTotalQuantity(json.data.totalQuantity || 0)
        setTotalRevenue(json.data.totalRevenue || 0)
      } else {
        console.error("Failed to load products:", json.error)
        toast.error("Không thể tải danh sách sản phẩm")
      }
    } catch (error) {
      console.error("Error loading products:", error)
      toast.error("Lỗi khi tải danh sách sản phẩm")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
          <DialogTitle className="text-lg sm:text-2xl flex items-center gap-2">
            <Package className="h-5 w-5 sm:h-6 sm:w-6" />
            Chi Tiết Sản Phẩm
          </DialogTitle>
          {sessionDate && (
            <DialogDescription className="text-xs sm:text-base pt-1 sm:pt-2">
              Ca làm việc ngày {sessionDate}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground text-sm">Đang tải...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Không có sản phẩm nào được bán trong ca này</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary Cards - Mobile: 2 cols top, 1 col bottom */}
              <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-4">
                {/* Row 1: Tổng SP + Tổng SL (2 cols on mobile) */}
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                    <p className="text-[10px] sm:text-xs text-blue-700 font-semibold uppercase">Tổng SP</p>
                    <p className="text-xl sm:text-2xl font-bold text-blue-900 mt-1">{totalProducts}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
                    <p className="text-[10px] sm:text-xs text-green-700 font-semibold uppercase">Tổng SL</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-900 mt-1">{totalQuantity}</p>
                  </div>
                </div>
                {/* Row 2: Doanh Thu (full width on mobile) */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-purple-700 font-semibold uppercase">Tổng Doanh Thu</p>
                  <p className="text-lg sm:text-2xl font-bold text-purple-900 mt-1">
                    {formatCurrency(totalRevenue)}
                  </p>
                </div>
              </div>

              {/* Products Table - responsive with horizontal scroll on mobile */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-10 sm:w-12 font-semibold text-slate-600 text-xs sm:text-sm">STT</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-xs sm:text-sm">Mã SP</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-xs sm:text-sm min-w-[150px] sm:min-w-[200px]">Tên Sản Phẩm</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-center text-xs sm:text-sm">ĐVT</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right text-xs sm:text-sm">SL</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right text-xs sm:text-sm">Đơn</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right text-xs sm:text-sm min-w-[90px] sm:min-w-[100px]">Doanh Thu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product, index) => (
                      <TableRow key={product.product_id} className={index % 2 === 0 ? "bg-slate-50/50" : ""}>
                        <TableCell className="font-medium text-xs sm:text-sm">{index + 1}</TableCell>
                        <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                          {product.product_code ? (
                            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
                              {product.product_code}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm font-medium">
                          {product.product_name}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-center whitespace-nowrap">
                          {product.unit || "—"}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-right font-bold text-green-700 whitespace-nowrap">
                          {product.quantity}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-right text-muted-foreground whitespace-nowrap">
                          {product.order_count}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-right font-semibold text-blue-700 whitespace-nowrap">
                          {formatCurrency(product.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Gift Products Table */}
              {giftProducts.length > 0 && (
                <div className="mt-6 sm:mt-8">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
                    <Gift className="h-5 w-5 text-pink-600" />
                    Sản Phẩm Tặng
                  </h3>
                  <div className="border rounded-lg overflow-x-auto bg-gradient-to-r from-pink-50 to-rose-50">
                    <Table>
                      <TableHeader className="bg-pink-100/50">
                        <TableRow>
                          <TableHead className="w-10 sm:w-12 font-semibold text-pink-700 text-xs sm:text-sm">STT</TableHead>
                          <TableHead className="font-semibold text-pink-700 text-xs sm:text-sm min-w-[150px] sm:min-w-[200px]">Sản Phẩm</TableHead>
                          <TableHead className="font-semibold text-pink-700 text-xs sm:text-sm min-w-[120px]">Khuyến Mãi</TableHead>
                          <TableHead className="font-semibold text-pink-700 text-right text-xs sm:text-sm">SL</TableHead>
                          <TableHead className="font-semibold text-pink-700 text-right text-xs sm:text-sm">Số Đơn</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {giftProducts.map((gift, index) => (
                          <TableRow key={index} className={index % 2 === 0 ? "bg-pink-50/50" : "bg-white/50"}>
                            <TableCell className="font-medium text-xs sm:text-sm">{index + 1}</TableCell>
                            <TableCell className="text-xs sm:text-sm font-medium text-pink-900">
                              {gift.product_name}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm text-pink-700">
                              {gift.promotion_name}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm text-right font-bold text-pink-700 whitespace-nowrap">
                              {gift.quantity}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm text-right text-muted-foreground whitespace-nowrap">
                              {gift.invoice_count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
