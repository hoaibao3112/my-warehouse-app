"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"
import { PromotionReport, VoucherReport } from "@/types/report-types"
import { toast } from "sonner"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from "recharts"
import { Download, Sparkles, TrendingUp, Gift } from "lucide-react"
import * as XLSX from "xlsx"
import { createStyledSheetFromJSON } from "@/lib/xlsx-utils"

interface MarketingReportProps {
    startDate: string
    endDate: string
    warehouseId?: string
}

const COLORS = ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#eab308', '#ef4444'];
const FORMATTER = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function MarketingReport({ startDate, endDate, warehouseId }: MarketingReportProps) {
    const [promotions, setPromotions] = useState<PromotionReport[]>([])
    const [vouchers, setVouchers] = useState<VoucherReport[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedProgram, setSelectedProgram] = useState<string>("all")
    const [subTab, setSubTab] = useState<"overview" | "analysis">("overview")

    const fetchData = async () => {
        if (!startDate || !endDate) return
        setLoading(true)
        try {
            const warehouseQuery = warehouseId && warehouseId !== 'all' ? `&warehouseId=${warehouseId}` : ''
            const [promoRes, voucherRes] = await Promise.all([
                mobileFetch(`/api/reports/promotions?startDate=${startDate}&endDate=${endDate}${warehouseQuery}`),
                mobileFetch(`/api/reports/vouchers?startDate=${startDate}&endDate=${endDate}${warehouseQuery}`)
            ])

            const promoData = await promoRes.json()
            const voucherData = await voucherRes.json()

            if (promoData.success) setPromotions(promoData.data || [])
            if (voucherData.success) setVouchers(voucherData.data || [])

        } catch (error) {
            console.error("Error fetching marketing data:", error)
            toast.error("Không thể tải dữ liệu báo cáo marketing")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [startDate, endDate, warehouseId])

    // Aggregate Data
    const summary = useMemo(() => {
        const totalPromoUsage = promotions.reduce((acc, p) => acc + (p.promotion.invoiceCount || 0), 0)
        const totalVoucherUsage = vouchers.reduce((acc, v) => acc + (v.program.invoiceCount || 0), 0) // or usedCodes

        const totalPrograms = promotions.length + vouchers.length

        const promoRevenueNet = promotions.reduce((acc, p) => acc + (p.promotion.netRevenue || 0), 0)
        const voucherRevenueNet = vouchers.reduce((acc, v) => acc + (v.program.netRevenue || 0), 0)

        // Gross Value = (Total Discount + Total Gift Value)
        const promoValue = promotions.reduce((acc, p) => acc + (p.promotion.totalDiscount || 0) + (p.promotion.totalGiftValue || 0), 0)
        const voucherValue = vouchers.reduce((acc, v) => acc + (v.program.totalValue || 0) + (v.program.totalGiftValue || 0), 0)

        return {
            usageCount: totalPromoUsage + totalVoucherUsage,
            programCount: totalPrograms,
            revenueNet: promoRevenueNet + voucherRevenueNet,
            promoValueGross: promoValue + voucherValue
        }
    }, [promotions, vouchers])

    // Data for Donut Chart (Program Distribution by Value)
    const programDistributionData = useMemo(() => {
        const data: any[] = []

        promotions.forEach(p => {
            const value = (p.promotion.totalDiscount || 0) + (p.promotion.totalGiftValue || 0)
            if (value > 0) {
                data.push({
                    name: p.promotion.name,
                    value: value,
                    type: 'promotion'
                })
            }
        })

        vouchers.forEach(v => {
            const value = (v.program.totalValue || 0) + (v.program.totalGiftValue || 0)
            if (value > 0) {
                data.push({
                    name: v.program.programName,
                    value: value,
                    type: 'voucher'
                })
            }
        })

        return data.sort((a, b) => b.value - a.value).slice(0, 8) // Top original 8
    }, [promotions, vouchers])

    // Data for Bar Chart (Product Quantity in Program)
    // This requires parsing invoice items - which we might not have fully detailed in the summary API unless we fetch details or the API returns it.
    // Assuming 'affectedProducts' count or similar is what is requested? 
    // Screenshot shows specific products "Cơm Trứng...", "Cơm Đậu Hũ..."
    // Currently the API returns `PromotionReport` with `invoices`. Invoices have `items`.
    // We can aggregate product quantities from `invoices`.

    const productAnalysisData = useMemo(() => {
        if (selectedProgram === 'all') return []

        // Find selected program (promo or voucher)
        let selectedItems: any[] = []

        const promo = promotions.find(p => p.promotion.id === selectedProgram)
        if (promo) {
            promo.invoices.forEach(inv => {
                if (inv.items) selectedItems.push(...inv.items)
                if (inv.giftItems) selectedItems.push(...inv.giftItems)
            })
        } else {
            const voucher = vouchers.find(v => v.program.id === selectedProgram)
            if (voucher) {
                voucher.invoices.forEach(inv => {
                    if (inv.items) selectedItems.push(...inv.items)
                    if (inv.giftItems) selectedItems.push(...inv.giftItems)
                })
            }
        }

        // Aggregate by product name
        const agg: Record<string, number> = {}
        selectedItems.forEach(item => {
            const name = item.recipe_name || item.name || 'Unknown'
            agg[name] = (agg[name] || 0) + (item.quantity || 0)
        })

        return Object.keys(agg).map(key => ({
            name: key,
            quantity: agg[key]
        })).sort((a, b) => b.quantity - a.quantity).slice(0, 10)

    }, [selectedProgram, promotions, vouchers])

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Marketing & Khuyến Mãi
                    </h2>
                    <p className="text-sm text-muted-foreground">Báo cáo hiệu quả các chương trình khuyến mãi và voucher</p>
                </div>
                <div className="flex items-center gap-2">
                    {loading && <div className="text-sm text-muted-foreground animate-pulse mr-2">Đang cập nhật...</div>}
                    <Button variant="outline" className="gap-2 bg-white/50 backdrop-blur-sm border-purple-200 hover:bg-purple-50 text-purple-700">
                        <Sparkles className="w-4 h-4" />
                        AI Phân Tích
                    </Button>
                </div>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "LƯỢT SỬ DỤNG KM", value: summary.usageCount, icon: TrendingUp, color: "text-blue-600" },
                    { label: "CHƯƠNG TRÌNH KM", value: summary.programCount, icon: Sparkles, color: "text-purple-600" },
                    { label: "DOANH THU KHUYẾN MÃI (NET)", value: FORMATTER.format(summary.revenueNet), icon: null, color: "text-green-600", isCurrency: true },
                    { label: "GIÁ TRỊ KHUYẾN MÃI (GROSS)", value: FORMATTER.format(summary.promoValueGross), icon: null, color: "text-pink-600", isCurrency: true },
                ].map((item, index) => (
                    <Card key={index} className="shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                            <span className={`text-2xl font-bold ${item.color}`}>{item.value}</span>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts Section 1: Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Chart */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-medium">Tỷ Lệ Giá Trị Khuyến Mãi</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={programDistributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {programDistributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(value: number) => FORMATTER.format(value)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Program List / Details */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-medium">Chi tiết chương trình KM</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                            {programDistributionData.map((item, index) => (
                                <div key={index} className="flex items-center justify-between text-sm group hover:bg-muted/50 p-2 rounded-lg transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                        <span className="font-medium text-foreground">{item.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold">{FORMATTER.format(item.value)}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {summary.promoValueGross > 0 ? ((item.value / summary.promoValueGross) * 100).toFixed(1) : 0}%
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {programDistributionData.length === 0 && (
                                <div className="text-center text-muted-foreground py-8">Chưa có dữ liệu</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section 2: Detailed Analysis */}
            <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-yellow-500" />
                        PHÂN TÍCH CHI TIẾT CHƯƠNG TRÌNH KM
                    </CardTitle>
                    <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                        <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder="Chọn chương trình" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">-- Chọn chương trình --</SelectItem>
                            {promotions.map(p => (
                                <SelectItem key={p.promotion.id} value={p.promotion.id}>[KM] {p.promotion.name}</SelectItem>
                            ))}
                            {vouchers.map(v => (
                                <SelectItem key={v.program.id} value={v.program.id}>[VC] {v.program.programName}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    {selectedProgram !== 'all' ? (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground">Số lượng sản phẩm trong chương trình</h3>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={productAnalysisData} layout="vertical" margin={{ left: 50 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                                        <RechartsTooltip cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="quantity" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20}>
                                            {
                                                productAnalysisData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill="#ec4899" />
                                                ))
                                            }
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : (
                        <div className="h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                            Vui lòng chọn một chương trình để xem phân tích chi tiết
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Gift Analysis Section (Mock-up based on screenshot 3 if valid data exists) */}
            {/* Since we don't have explicit 'Game' data separately, we will treat Voucher/Gifts as this section or skip if not relevant. 
          The user screenshot has 'PHÂN TÍCH QUÀ TẶNG GAME'. I will assume this is for Gift-type promotions/vouchers.
      */}
            <Card className="shadow-sm border-t-4 border-t-yellow-400">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Gift className="w-5 h-5 text-yellow-500" />
                        PHÂN TÍCH QUÀ TẶNG / VOUCHER
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => {
                        try {
                            const notebook = XLSX.utils.book_new()

                            // Promotions Sheet
                            const promoData = promotions.map(p => ({
                                "Tên Chương Trình": p.promotion.name,
                                "Loại": p.promotion.promotionType,
                                "Doanh Thu Net": p.promotion.netRevenue,
                                "Số HĐ": p.promotion.invoiceCount,
                                "Trạng Thái": p.promotion.status ? "Hoạt động" : "Kết thúc"
                            }))
                            const promoSheet = XLSX.utils.json_to_sheet(promoData)
                            XLSX.utils.book_append_sheet(notebook, promoSheet, "Khuyến Mãi")

                            // Vouchers Sheet
                            const voucherData = vouchers.map(v => ({
                                "Tên Chương Trình": v.program.programName,
                                "Tổng Mã": v.program.totalCodes,
                                "Đã Dùng": v.program.usedCodes,
                                "Còn Lại": (v.program.totalCodes || 0) - (v.program.usedCodes || 0),
                                "Doanh Thu Net": v.program.netRevenue,
                                "Trạng Thái": v.program.status ? "Hoạt động" : "Kết thúc"
                            }))
                            const voucherSheet = XLSX.utils.json_to_sheet(voucherData)
                            XLSX.utils.book_append_sheet(notebook, voucherSheet, "Voucher")

                            XLSX.writeFile(notebook, `marketing-report-${startDate}-${endDate}.xlsx`)
                            toast.success("Xuất báo cáo thành công")
                        } catch (e) {
                            console.error(e)
                            toast.error("Lỗi xuất báo cáo")
                        }
                    }}>
                        <Download className="w-4 h-4 mr-2" />
                        Xuất Excel
                    </Button>
                </CardHeader>
                <CardContent>
                    {/* If we have vouchers or gift promos */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-purple-50 p-4 rounded-xl">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><Gift className="w-4 h-4" /></div>
                                <span className="font-bold text-lg">{summary.programCount}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Tổng chương trình quà tặng</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-green-100 rounded-lg text-green-600"><TrendingUp className="w-4 h-4" /></div>
                                <span className="font-bold text-lg">{summary.usageCount}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Đã sử dụng</div>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-xl">
                            <div className="flex items-center gap-3 mb-2">
                                {/* Mock data for "not used" - assuming totalCodes - usedCodes for vouchers */}
                                <span className="font-bold text-lg text-orange-600">
                                    {vouchers.reduce((acc, v) => acc + ((v.program.totalCodes || 0) - (v.program.usedCodes || 0)), 0)}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">Chưa sử dụng (Voucher)</div>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl">
                            <div className="flex items-center gap-3 mb-2">
                                {/* Calculate rate */}
                                <span className="font-bold text-lg text-blue-600">
                                    {vouchers.length > 0 ?
                                        ((vouchers.reduce((acc, v) => acc + (v.program.usageRate || 0), 0) / vouchers.length) * 100).toFixed(1)
                                        : 0
                                    }%
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">Tỷ lệ sử dụng trung bình</div>
                        </div>
                    </div>

                    {/* List of Vouchers/Gifts */}
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-3 text-left">Tên chương trình</th>
                                    <th className="p-3 text-center">Trạng thái</th>
                                    <th className="p-3 text-center">Đã phát</th>
                                    <th className="p-3 text-center">Đã dùng</th>
                                    <th className="p-3 text-center">Còn lại</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {vouchers.map((v, i) => (
                                    <tr key={i} className="hover:bg-muted/30">
                                        <td className="p-3 font-medium">
                                            {v.program.programName}
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(v.program.startDate).toLocaleDateString()} - {new Date(v.program.endDate).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            {v.program.status ? <Badge variant="default" className="bg-green-500">Còn hạn</Badge> : <Badge variant="secondary">Hết hạn</Badge>}
                                        </td>
                                        <td className="p-3 text-center">{v.program.totalCodes}</td>
                                        <td className="p-3 text-center text-blue-600 font-bold">{v.program.usedCodes}</td>
                                        <td className="p-3 text-center text-orange-600 font-bold">{(v.program.totalCodes || 0) - (v.program.usedCodes || 0)}</td>
                                    </tr>
                                ))}
                                {promotions.filter(p => p.promotion.promotionType === 'GIFT').map((p, i) => (
                                    <tr key={`p-${i}`} className="hover:bg-muted/30">
                                        <td className="p-3 font-medium">
                                            [KM] {p.promotion.name}
                                        </td>
                                        <td className="p-3 text-center">
                                            {p.promotion.status ? <Badge variant="default" className="bg-green-500">Còn hạn</Badge> : <Badge variant="secondary">Hết hạn</Badge>}
                                        </td>
                                        <td className="p-3 text-center">-</td>
                                        <td className="p-3 text-center text-blue-600 font-bold">{p.promotion.invoiceCount}</td>
                                        <td className="p-3 text-center">-</td>
                                    </tr>
                                ))}
                                {vouchers.length === 0 && promotions.filter(p => p.promotion.promotionType === 'GIFT').length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted-foreground">Chưa có dữ liệu quà tặng</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

        </div>
    )
}
