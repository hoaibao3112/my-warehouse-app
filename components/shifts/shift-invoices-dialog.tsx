"use client"

import { useEffect, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"
import { Loader2, Receipt, Eye, ChevronLeft, Gift } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import { formatDbDateTimeToDisplay, formatDbDateToDisplay } from "@/lib/server-time"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"

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
    has_vat?: boolean
    vat_amount?: number
    notes?: string
    created_at: string
    created_by?: string
    items: InvoiceItem[]
    promotion?: PromotionDetail | null
    giftPromotion?: PromotionDetail | null
    giftProducts?: GiftProduct[]
    voucher?: VoucherDetail | null
    voucherGiftProducts?: GiftProduct[]
}

interface ShiftInvoicesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sessionId: string | null
    sessionDate?: string
}

export function ShiftInvoicesDialog({
    open,
    onOpenChange,
    sessionId,
    sessionDate,
}: ShiftInvoicesDialogProps) {
    const [loading, setLoading] = useState(false)
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [showDetail, setShowDetail] = useState(false)

    useEffect(() => {
        if (open && sessionId) {
            loadInvoices()
        }
    }, [open, sessionId])

    const loadInvoices = async () => {
        if (!sessionId) return

        try {
            setLoading(true)
            const res = await mobileFetch(`/api/shifts/${sessionId}`)
            const json = await res.json()

            if (json.success && json.data) {
                // Check if it's a sales session with invoices
                const invoiceData = json.data.invoices || json.data.sales_invoices_new || []
                setInvoices(invoiceData)
            } else {
                console.error("Failed to load invoices:", json.error)
                toast.error("Không thể tải danh sách hóa đơn")
            }
        } catch (error) {
            console.error("Error loading invoices:", error)
            toast.error("Lỗi khi tải danh sách hóa đơn")
        } finally {
            setLoading(false)
        }
    }

    const handleViewDetails = async (invoice: Invoice) => {
        try {
            setLoadingDetail(true)
            setShowDetail(true)

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

    const handleBackToList = () => {
        setShowDetail(false)
        setSelectedInvoice(null)
    }

    // Calculate stats
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    const totalDiscount = invoices.reduce((sum, inv) => sum + Number(inv.discount_amount || 0), 0)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
                    <DialogTitle className="text-lg sm:text-2xl flex items-center gap-2">
                        {showDetail ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBackToList}
                                    className="mr-2 p-1 h-8 w-8"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </Button>
                                <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
                                Chi tiết: {selectedInvoice?.invoice_number}
                            </>
                        ) : (
                            <>
                                <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
                                Danh Sách Hóa Đơn
                            </>
                        )}
                    </DialogTitle>
                    {sessionDate && !showDetail && (
                        <DialogDescription className="text-xs sm:text-base pt-1 sm:pt-2">
                            Ca làm việc ngày {sessionDate}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4">
                    {showDetail ? (
                        // Invoice Detail View
                        loadingDetail ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-muted-foreground text-sm">Đang tải chi tiết...</span>
                            </div>
                        ) : selectedInvoice && (
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
                                        <p className="font-semibold">{selectedInvoice.created_by || "N/A"}</p>
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
                                                {(() => {
                                                    // Warehouse invoices store items in notes JSON
                                                    let itemsToShow = selectedInvoice.items || []

                                                    // Try parse from notes if items empty
                                                    if (itemsToShow.length === 0 && selectedInvoice.notes) {
                                                        try {
                                                            // Check if notes starts with { (JSON)
                                                            if (selectedInvoice.notes.trim().startsWith('{')) {
                                                                const notesData = JSON.parse(selectedInvoice.notes)
                                                                if (notesData.items && Array.isArray(notesData.items)) {
                                                                    itemsToShow = notesData.items.map((item: any) => ({
                                                                        id: item.product_id,
                                                                        quantity: item.quantity,
                                                                        unit_price: item.unit_price,
                                                                        line_total: item.quantity * item.unit_price,
                                                                        product_recipes: { name: item.product_name }
                                                                    }))
                                                                }
                                                            }
                                                        } catch (e) {
                                                            // Old invoices have plain text notes, ignore
                                                        }
                                                    }

                                                    return itemsToShow.map((item, idx) => (
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
                                                    ))
                                                })()}
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
                                                    <Gift className="h-4 w-4" />
                                                    {selectedInvoice.giftPromotion.name}
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
                                                            <Gift className="h-4 w-4" />
                                                            Sản phẩm tặng kèm
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

                                {selectedInvoice.vat_amount && selectedInvoice.vat_amount > 0 && (
                                    <div className="bg-rose-50 p-4 rounded-lg border border-rose-200 mb-3">
                                        <div className="flex justify-between items-center text-rose-800">
                                            <span className="font-semibold">VAT (8%):</span>
                                            <span className="text-xl font-bold">
                                                {Number(selectedInvoice.vat_amount).toLocaleString("vi-VN")}đ
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
                    ) : (
                        // Invoice List View
                        loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-muted-foreground text-sm">Đang tải...</span>
                            </div>
                        ) : invoices.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p className="text-sm">Chưa có hóa đơn nào trong ca này</p>
                            </div>
                        ) : (
                            <div className="space-y-4 sm:space-y-6">
                                {/* Summary Cards */}
                                <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-4">
                                    <div className="grid grid-cols-2 gap-2 sm:contents">
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                                            <p className="text-[10px] sm:text-xs text-blue-700 font-semibold uppercase">Số Hóa Đơn</p>
                                            <p className="text-xl sm:text-2xl font-bold text-blue-900 mt-1">{invoices.length}</p>
                                        </div>
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
                                            <p className="text-[10px] sm:text-xs text-green-700 font-semibold uppercase">Tổng Doanh Thu</p>
                                            <p className="text-lg sm:text-2xl font-bold text-green-900 mt-1">
                                                {formatCurrency(totalRevenue)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
                                        <p className="text-[10px] sm:text-xs text-orange-700 font-semibold uppercase">Tổng Giảm Giá</p>
                                        <p className="text-lg sm:text-2xl font-bold text-orange-900 mt-1">
                                            {formatCurrency(totalDiscount)}
                                        </p>
                                    </div>
                                </div>

                                {/* Invoice List - Mobile Card View */}
                                <div className="sm:hidden space-y-3">
                                    {invoices.map((invoice) => (
                                        <Card key={invoice.id} className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold truncate">{invoice.invoice_number}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {formatDbDateTimeToDisplay(invoice.created_at)}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-green-600">
                                                        {Number(invoice.total_amount).toLocaleString("vi-VN")}đ
                                                    </p>
                                                    {invoice.vat_amount && invoice.vat_amount > 0 && (
                                                        <p className="text-xs text-rose-600 font-medium">
                                                            VAT: {Number(invoice.vat_amount).toLocaleString("vi-VN")}đ
                                                        </p>
                                                    )}
                                                    <Badge variant="secondary" className="text-xs mt-1">
                                                        {invoice.items?.length || 0} mục
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleViewDetails(invoice)}
                                                    disabled={loadingDetail}
                                                    className="flex-1 text-blue-600"
                                                >
                                                    <Eye className="w-4 h-4 mr-1" />
                                                    Chi tiết
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                {/* Invoice List - Desktop Table View */}
                                <div className="hidden sm:block border rounded-lg overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="w-12 font-semibold text-slate-600">STT</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Số Hóa Đơn</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Thời Gian</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-center">Số Mục</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-right">VAT</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-right">Tổng Tiền</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-center">Thao Tác</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {invoices.map((invoice, index) => (
                                                <TableRow key={invoice.id} className={index % 2 === 0 ? "bg-slate-50/50" : ""}>
                                                    <TableCell className="font-medium">{index + 1}</TableCell>
                                                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {formatDbDateTimeToDisplay(invoice.created_at)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary">{invoice.items?.length || 0}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-rose-600 font-medium">
                                                        {invoice.vat_amount && invoice.vat_amount > 0 ? `${Number(invoice.vat_amount).toLocaleString("vi-VN")}đ` : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-green-700">
                                                        {Number(invoice.total_amount).toLocaleString("vi-VN")}đ
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleViewDetails(invoice)}
                                                            disabled={loadingDetail}
                                                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
