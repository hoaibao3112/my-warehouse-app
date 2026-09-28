"use client"

import { mobileFetch } from "@/lib/mobile/api-client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Eye, Trash2, Download, Printer, Receipt } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { usePrint } from "@/hooks/use-print"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"
import { formatDbDateTimeToDisplay, formatDbDateToDisplay } from "@/lib/server-time"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface InvoiceItem {
  id: string
  quantity: number
  unit_price: number
  line_total: number
  product_recipes?: {
    name: string
  }
}

interface GiftProduct {
  product_name: string
  quantity: number
  item_type: string
}

interface PromotionDetail {
  id: string
  name: string
  promotion_type: string
  discount_type?: string
  discount_value?: number
}

interface VoucherDetail {
  id: string
  code: string
  discount_type: string
  discount_value: number
}

interface Invoice {
  id: string
  invoice_number: string
  total_amount: number
  discount_amount?: number
  promotion_id?: string
  gift_promotion_id?: string
  voucher_id?: string
  notes?: string
  created_at: string
  created_by: string
  items: InvoiceItem[]
  // Detail fields
  promotion?: PromotionDetail | null
  giftPromotion?: PromotionDetail | null
  giftProducts?: GiftProduct[]
  voucher?: VoucherDetail | null
  voucherGiftProducts?: GiftProduct[]
  has_vat?: boolean
  vat_amount?: number
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse()
  const { isPrinting, printInvoice, isMobile } = usePrint()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState("")

  // For GENERAL_MANAGER, use selected warehouse; for others use their assigned warehouse
  const currentWarehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : user?.warehouseId
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [printerWarning, setPrinterWarning] = useState<string | null>(null)
  const [lastInventoryCheckDate, setLastInventoryCheckDate] = useState<Date | null>(null)
  const [inventoryCheckInProgress, setInventoryCheckInProgress] = useState(false)

  useEffect(() => {
    if (currentWarehouseId) {
      fetchInvoices()
      checkPrinterConfig()
      fetchInventoryCheckStatus()
    }

    // Listen for warehouse changes - reload immediately
    const handleWarehouseChange = () => {
      if (currentWarehouseId) {
        fetchInvoices()
        checkPrinterConfig()
        fetchInventoryCheckStatus()
      }
    }
    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [currentWarehouseId])

  // Fetch inventory check status to determine if delete is blocked
  const fetchInventoryCheckStatus = async () => {
    if (!currentWarehouseId) return
    try {
      // Check for in-progress inventory check
      const inProgressRes = await mobileFetch(`/api/inventory-checks?warehouseId=${currentWarehouseId}&status=IN_PROGRESS&pageSize=1`)
      const inProgressData = await inProgressRes.json()
      if (inProgressData.success && inProgressData.data?.length > 0) {
        setInventoryCheckInProgress(true)
      } else {
        setInventoryCheckInProgress(false)
      }

      // Check for last completed inventory check
      const completedRes = await mobileFetch(`/api/inventory-checks?warehouseId=${currentWarehouseId}&status=COMPLETED&pageSize=1`)
      const completedData = await completedRes.json()
      if (completedData.success && completedData.data?.length > 0 && completedData.data[0].completed_at) {
        setLastInventoryCheckDate(new Date(completedData.data[0].completed_at))
      } else {
        setLastInventoryCheckDate(null)
      }
    } catch (error) {
      console.error('Error fetching inventory check status:', error)
    }
  }

  const checkPrinterConfig = async () => {
    if (!currentWarehouseId) return

    // Only check on mobile (client-side only to avoid hydration issues)
    if (typeof window !== 'undefined' && !isMobile) return

    try {
      const response = await mobileFetch(`/api/warehouses/${currentWarehouseId}/printer`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          const { require_printer, default_printer_id } = result.data
          if (require_printer && !default_printer_id) {
            setPrinterWarning('Kho này yêu cầu bắt buộc sử dụng máy in nhưng chưa cấu hình. Vui lòng liên hệ quản lý để thiết lập.')
          }
        }
      }
    } catch (error) {
      console.error('Error checking printer config:', error)
    }
  }

  const fetchInvoices = async () => {
    if (!currentWarehouseId) {
      console.log("Waiting for user data...")
      return
    }

    try {
      setLoading(true)
      const response = await mobileFetch(`/api/sales/invoices?warehouseId=${currentWarehouseId}`)
      const result = await response.json()
      if (result.success) {
        setInvoices(result.data || [])
      }
    } catch (error) {
      console.error("Error:", error)
      toast.error("Lỗi tải hóa đơn")
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = async (invoice: Invoice) => {
    try {
      setLoadingDetail(true)
      setShowDetailDialog(true)

      // Fetch full details with rate limiting
      const response = await fetchWithRateLimit(`/api/sales/invoices/${invoice.id}`)
      const result = await response.json()

      if (result.success) {
        setSelectedInvoice(result.data)
      } else {
        toast.error("Lỗi tải chi tiết hóa đơn")
        setSelectedInvoice(invoice) // Fallback to basic info
      }
    } catch (error: any) {
      console.error("Error:", error)
      toast.error(error.message || "Lỗi tải chi tiết hóa đơn")
      setSelectedInvoice(invoice) // Fallback to basic info
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleCloseDetail = () => {
    setShowDetailDialog(false)
    setSelectedInvoice(null)
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return

    try {
      setDeleting(true)
      const response = await fetchWithRateLimit(
        `/api/sales/invoices/${deleteConfirmId}`,
        { method: "DELETE" }
      )

      const result = await response.json()

      if (result.success) {
        toast.success("Xóa hóa đơn thành công")
        await fetchInvoices()
        setShowDeleteDialog(false)
        setDeleteConfirmId(null)
      } else {
        toast.error(result.error || "Lỗi xóa hóa đơn")
      }
    } catch (error: any) {
      console.error("Error:", error)
      toast.error(error.message || "Lỗi xóa hóa đơn")
    } finally {
      setDeleting(false)
    }
  }

  const handlePrint = async (invoice: Invoice) => {
    await printInvoice(invoice, currentWarehouseId || undefined)
  }

  const filteredInvoices = invoices.filter((inv) => {
    // Text search filter
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(searchFilter.toLowerCase()) ||
      inv.created_by.toLowerCase().includes(searchFilter.toLowerCase())

    // Date range filter
    if (fromDate || toDate) {
      const invoiceDate = new Date(inv.created_at)
      const fromDateTime = fromDate ? new Date(fromDate) : null
      const toDateTime = toDate ? new Date(toDate) : null

      // Set time to end of day for toDate comparison
      if (toDateTime) {
        toDateTime.setHours(23, 59, 59, 999)
      }

      if (fromDateTime && invoiceDate < fromDateTime) return false
      if (toDateTime && invoiceDate > toDateTime) return false
    }

    return matchesSearch
  })

  // Check if invoice can be deleted (created after last inventory check)
  const canDeleteInvoice = (invoice: Invoice) => {
    // If inventory check is in progress, block all deletions
    if (inventoryCheckInProgress) return false

    // If there's a completed inventory check, only allow deleting invoices created after it
    if (lastInventoryCheckDate && invoice.created_at) {
      return new Date(invoice.created_at) > lastInventoryCheckDate
    }

    // No inventory check, allow deletion
    return true
  }

  // Calculate revenue statistics
  const revenueStats = {
    totalRevenue: filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
    invoiceCount: filteredInvoices.length,
    averageRevenue: filteredInvoices.length > 0
      ? filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0) / filteredInvoices.length
      : 0,
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Receipt}
        title="Quản Lý Hóa Đơn"
        subtitle="Xem và quản lý hóa đơn"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Quản Lý Hóa Đơn</h1>
          <p className="text-muted-foreground mt-2">Xem, in, và quản lý hóa đơn bán hàng</p>
        </div>

        {/* Printer Warning Alert */}
        {printerWarning && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg p-4 flex items-start gap-3">
            <Receipt className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">
                Cảnh báo cấu hình máy in
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {printerWarning}
              </p>
            </div>
          </div>
        )}

        <Card className="p-4 md:p-6">
          <div className="space-y-4">
            {/* Search and Date Filters */}
            <div className="space-y-3 md:space-y-0">
              {/* Search Bar */}
              <div className="relative md:mb-4">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm hóa đơn..."
                  className="pl-10"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>

              {/* Date Range and Button Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-foreground mb-1">Từ ngày</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-9 md:h-10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-medium text-foreground mb-1">Đến ngày</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-9 md:h-10 text-sm"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                  <label className="block text-xs md:text-sm font-medium text-foreground mb-1">.</label>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFromDate("")
                      setToDate("")
                    }}
                    className="w-full h-9 md:h-10 text-sm"
                  >
                    Xóa bộ lọc
                  </Button>
                </div>
              </div>
            </div>

            {/* Revenue Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 pt-2 md:pt-4 border-t border-border">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 md:p-4">
                <div className="text-xs md:text-sm text-muted-foreground font-medium">Tổng Doanh Thu</div>
                <div className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 break-words">
                  {Number(revenueStats.totalRevenue).toLocaleString("vi-VN")}đ
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 md:p-4">
                <div className="text-xs md:text-sm text-muted-foreground font-medium">Số Hóa Đơn</div>
                <div className="text-lg md:text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {revenueStats.invoiceCount}
                </div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3 md:p-4">
                <div className="text-xs md:text-sm text-muted-foreground font-medium">Doanh Thu TB</div>
                <div className="text-lg md:text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1 break-words">
                  {Number(revenueStats.averageRevenue).toLocaleString("vi-VN")}đ
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Đang tải...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {invoices.length === 0 ? "Chưa có hóa đơn nào" : "Không tìm thấy hóa đơn"}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {filteredInvoices.map((invoice) => (
                  <Card key={invoice.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{invoice.invoice_number}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDbDateTimeToDisplay(invoice.created_at)}</p>
                        <p className="text-xs text-muted-foreground">NV: {invoice.created_by}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">
                          {Number(invoice.total_amount).toLocaleString("vi-VN")}đ
                        </p>
                        <div className="flex gap-1 justify-end mt-1">
                          {invoice.has_vat && <Badge variant="outline" className="text-[10px] text-green-600 border-green-600 px-1 py-0">VAT</Badge>}
                          <Badge variant="secondary" className="text-xs">
                            {invoice.items.length} mục
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(invoice)}
                        disabled={loadingDetail || deleting}
                        className="flex-1 text-blue-600"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Chi tiết
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrint(invoice)}
                        disabled={isPrinting || loadingDetail || deleting}
                        className="text-green-600"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      {canDeleteInvoice(invoice) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeleteConfirmId(invoice.id)
                            setShowDeleteDialog(true)
                          }}
                          disabled={deleting || loadingDetail}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Số Hóa Đơn
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Ngày
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Nhân Viên
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">
                        Tổng Tiền
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        VAT
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        Số Mục
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        Hành Động
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium text-foreground">
                          {invoice.invoice_number}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {formatDbDateTimeToDisplay(invoice.created_at)}
                        </td>
                        <td className="py-3 px-4 text-sm text-foreground">
                          {invoice.created_by}
                        </td>
                        <td className="py-3 px-4 font-semibold text-right">
                          {Number(invoice.total_amount).toLocaleString("vi-VN")}đ
                        </td>
                        <td className="py-3 px-4 text-center">
                          {invoice.has_vat && <Badge variant="outline" className="text-green-600 border-green-600 px-2 py-0">Có</Badge>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="secondary">{invoice.items.length}</Badge>
                        </td>
                        <td className="py-3 px-4 flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(invoice)}
                            disabled={loadingDetail || deleting}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePrint(invoice)}
                            disabled={isPrinting || loadingDetail || deleting}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          {canDeleteInvoice(invoice) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDeleteConfirmId(invoice.id)
                                setShowDeleteDialog(true)
                              }}
                              disabled={deleting || loadingDetail}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle className="text-xl">Chi Tiết Hóa Đơn: {selectedInvoice?.invoice_number}</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4">
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Đang tải chi tiết...</p>
                    </div>
                  </div>
                ) : (
                  selectedInvoice && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Ngày tạo</p>
                          <p className="font-semibold">
                            {formatDbDateToDisplay(selectedInvoice.created_at)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Nhân viên</p>
                          <p className="font-semibold">{selectedInvoice.created_by}</p>
                        </div>
                      </div>

                      <div>
                        <p className="font-semibold mb-2">Chi tiết mặt hàng:</p>
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted border-b border-border">
                              <tr>
                                <th className="text-left p-2">Sản phẩm</th>
                                <th className="text-center p-2">SL</th>
                                <th className="text-right p-2">Giá</th>
                                <th className="text-right p-2">T.tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedInvoice.items.map((item, idx) => (
                                <tr key={idx} className="border-b border-border hover:bg-muted/50">
                                  <td className="p-2">
                                    {item.product_recipes?.name || "N/A"}
                                  </td>
                                  <td className="text-center p-2">{item.quantity}</td>
                                  <td className="text-right p-2">
                                    {Number(item.unit_price).toLocaleString("vi-VN")}đ
                                  </td>
                                  <td className="text-right p-2 font-semibold">
                                    {Number(item.line_total).toLocaleString("vi-VN")}đ
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Promotion/Voucher Info */}
                      {(selectedInvoice.promotion_id || selectedInvoice.gift_promotion_id || selectedInvoice.voucher_id) && (
                        <div className="space-y-3">
                          <p className="font-semibold text-base flex items-center gap-2">
                            <span className="text-xl">🎁</span>
                            Thông tin khuyến mãi
                          </p>

                          {/* Discount Promotion */}
                          {selectedInvoice.promotion && (
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-300 shadow-sm">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-semibold text-green-900 mb-1">
                                    💰 {selectedInvoice.promotion.name}
                                  </p>
                                  <p className="text-xs text-green-700">
                                    {selectedInvoice.promotion.promotion_type === 'DISCOUNT' ? 'Giảm giá' :
                                      selectedInvoice.promotion.promotion_type === 'COMBO' ? 'Combo' :
                                        selectedInvoice.promotion.promotion_type}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-green-700">Giảm giá</p>
                                  <p className="text-xl font-bold text-green-600">
                                    {Number(selectedInvoice.discount_amount || 0).toLocaleString('vi-VN')}đ
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Gift Promotion with Products Table */}
                          {selectedInvoice.giftPromotion && selectedInvoice.giftProducts && selectedInvoice.giftProducts.length > 0 && (
                            <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-lg border-2 border-pink-300 shadow-sm">
                              <p className="font-semibold text-pink-900 mb-3 flex items-center gap-2">
                                🎁 {selectedInvoice.giftPromotion.name}
                              </p>

                              <div className="bg-white/80 rounded-lg border border-pink-200 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-pink-100/50">
                                    <tr>
                                      <th className="text-center p-2 text-pink-900">Quà tặng</th>
                                      <th className="text-center p-2 text-pink-900">Số lượng</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedInvoice.giftProducts.map((gift, idx) => (
                                      <tr key={idx} className="border-t border-pink-100">
                                        <td className="p-2 text-pink-900 font-medium text-center">{gift.product_name}</td>
                                        <td className="text-center p-2 font-semibold text-pink-900">
                                          {gift.quantity}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Voucher */}
                          {selectedInvoice.voucher && (
                            <div className="space-y-3">
                              <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 rounded-lg border-2 border-purple-300 shadow-sm">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-semibold text-purple-900 mb-1">
                                      🎟️ Mã: {selectedInvoice.voucher.code}
                                    </p>
                                    <p className="text-xs text-purple-700">
                                      {selectedInvoice.voucher.discount_type === 'GIFT' ? 'Voucher quà tặng' :
                                        selectedInvoice.voucher.discount_type === 'PRODUCT_DISCOUNT' ? 'Voucher giảm sản phẩm cụ thể' :
                                          selectedInvoice.voucher.discount_type === 'PERCENTAGE' ? 'Voucher giảm %' :
                                            'Voucher giảm cố định'}
                                    </p>
                                  </div>
                                  {selectedInvoice.voucher.discount_type !== 'GIFT' && (
                                    <div className="text-right">
                                      <p className="text-sm text-purple-700">Giảm giá</p>
                                      <p className="text-xl font-bold text-purple-600">
                                        {Number(selectedInvoice.discount_amount || 0).toLocaleString('vi-VN')}đ
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Voucher Gift Products Table */}
                              {selectedInvoice.voucher.discount_type === 'GIFT' && selectedInvoice.voucherGiftProducts && selectedInvoice.voucherGiftProducts.length > 0 && (
                                <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-lg border-2 border-pink-300 shadow-sm">
                                  <p className="font-semibold text-pink-900 mb-3 flex items-center gap-2">
                                    🎁 Sản phẩm tặng kèm
                                  </p>

                                  <div className="bg-white/80 rounded-lg border border-pink-200 overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-pink-100/50">
                                        <tr>
                                          <th className="text-center p-2 text-pink-900">Quà tặng</th>
                                          <th className="text-center p-2 text-pink-900">Số lượng</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {selectedInvoice.voucherGiftProducts.map((gift, idx) => (
                                          <tr key={idx} className="border-t border-pink-100">
                                            <td className="p-2 text-pink-900 font-medium text-center">{gift.product_name}</td>
                                            <td className="text-center p-2 font-semibold text-pink-900">
                                              {gift.quantity}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* VAT Info */}
                      {(selectedInvoice.has_vat || (selectedInvoice.vat_amount && selectedInvoice.vat_amount > 0)) && (
                        <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                          <div className="flex justify-between items-center text-pink-900">
                            <span className="font-semibold">VAT (8%):</span>
                            <span className="text-xl font-bold">
                              {Number(selectedInvoice.vat_amount || 0).toLocaleString("vi-VN")}đ
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Tổng tiền:</span>
                          <span className="text-2xl font-bold text-blue-600">
                            {Number(selectedInvoice.total_amount).toLocaleString("vi-VN")}đ
                          </span>
                        </div>
                      </div>

                    </div>
                  )
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleCloseDetail}
                disabled={loadingDetail || isPrinting}
              >
                Đóng
              </Button>
              <Button
                onClick={() => selectedInvoice && handlePrint(selectedInvoice)}
                disabled={isPrinting || loadingDetail}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4 mr-2" />
                {isPrinting ? "Đang in..." : "In"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa Hóa Đơn</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa hóa đơn này? Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Đang xóa..." : "Xóa"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
