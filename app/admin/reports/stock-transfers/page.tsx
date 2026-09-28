"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { TrendingUp, Eye, Download, Calendar, Store, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

interface StockTransfer {
    id: string
    transfer_number: string
    from_warehouse_id: string
    to_warehouse_id: string
    from_warehouse_name?: string
    to_warehouse_name?: string
    status: string
    requested_by: string
    created_at: string
    items?: any[]
}

export default function StockTransfersReportPage() {
    const [transfers, setTransfers] = useState<StockTransfer[]>([])
    const [warehouses, setWarehouses] = useState<any[]>([])
    const [selectedFromWarehouseId, setSelectedFromWarehouseId] = useState<string>("all")
    const [selectedToWarehouseId, setSelectedToWarehouseId] = useState<string>("all")
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")
    const [loading, setLoading] = useState(false)
    const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null)
    const [selectedTransferData, setSelectedTransferData] = useState<any | null>(null)

    // Initialize dates to current month
    useEffect(() => {
        const now = new Date()
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        setStartDate(firstDay.toISOString().split('T')[0])
        setEndDate(lastDay.toISOString().split('T')[0])
    }, [])

    // Fetch all warehouses
    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const res = await mobileFetch('/api/warehouses?pageSize=100')
                const json = await res.json()
                if (json.success) {
                    setWarehouses(json.data || [])
                }
            } catch (err) {
                console.error("Failed to fetch warehouses:", err)
            }
        }
        fetchWarehouses()
    }, [])

    // Fetch transfers
    const fetchTransfers = async () => {
        setLoading(true)
        try {
            let url = '/api/stock-transfer-requests?pageSize=100'

            if (selectedFromWarehouseId && selectedFromWarehouseId !== "all") {
                url += `&fromWarehouseId=${selectedFromWarehouseId}`
            }

            if (selectedToWarehouseId && selectedToWarehouseId !== "all") {
                url += `&toWarehouseId=${selectedToWarehouseId}`
            }

            if (startDate) {
                url += `&startDate=${startDate}`
            }

            if (endDate) {
                url += `&endDate=${endDate}`
            }

            const response = await mobileFetch(url)
            const result = await response.json()

            if (result.success) {
                setTransfers(result.data || [])
            } else {
                toast.error(result.error || "Lỗi tải dữ liệu")
            }
        } catch (error) {
            console.error("Error fetching transfers:", error)
            toast.error("Lỗi tải dữ liệu vận chuyển")
        } finally {
            setLoading(false)
        }
    }

    // Auto fetch when filters change
    useEffect(() => {
        if (startDate && endDate) {
            fetchTransfers()
        }
    }, [selectedFromWarehouseId, selectedToWarehouseId, startDate, endDate])

    // Fetch detail
    useEffect(() => {
        if (selectedTransferId) {
            // Find directly from list if available, or fetch
            const transfer = transfers.find(t => t.id === selectedTransferId)
            if (transfer) {
                setSelectedTransferData(transfer)
            }
        }
    }, [selectedTransferId, transfers])

    // Format date
    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'HOAN_THANH': return <Badge className="bg-green-500">Hoàn thành</Badge>
            case 'DA_XUAT_KHO': return <Badge className="bg-blue-500">Đã xuất kho</Badge>
            case 'DA_DUYET': return <Badge className="bg-indigo-500">Đã duyệt</Badge>
            case 'CHO_DUYET': return <Badge variant="secondary">Chờ duyệt</Badge>
            case 'HUY_BO': return <Badge variant="destructive">Hủy bỏ</Badge>
            case 'TU_CHOI': return <Badge variant="destructive">Từ chối</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    // Export to Excel
    const exportToExcel = () => {
        if (transfers.length === 0) {
            toast.error("Không có dữ liệu để xuất")
            return
        }

        try {
            const workbook = XLSX.utils.book_new()

            const data = transfers.map((t, idx) => ({
                "STT": idx + 1,
                "Mã Phiếu": t.transfer_number,
                "Từ Kho": t.from_warehouse_name,
                "Đến Kho": t.to_warehouse_name,
                "Trạng Thái": t.status,
                "Người Yêu Cầu": t.requested_by,
                "Ngày Tạo": formatDate(t.created_at),
            }))

            const sheet = XLSX.utils.json_to_sheet(data)
            XLSX.utils.book_append_sheet(workbook, sheet, "Danh Sách Phiếu Nhập")

            // Details Sheet
            const detailsData: any[] = []
            transfers.forEach(t => {
                if (t.items && t.items.length > 0) {
                    t.items.forEach((item: any) => {
                        detailsData.push({
                            "Mã Phiếu": t.transfer_number,
                            "Mã SP": item.product_code,
                            "Tên Sản Phẩm": item.product_name,
                            "ĐVT": item.unit_name,
                            "SL Yêu Cầu": item.requested_quantity || item.quantity,
                            "SL Thực Nhận": item.actual_received_quantity || 0,
                        })
                    })
                }
            })

            if (detailsData.length > 0) {
                const detailsSheet = XLSX.utils.json_to_sheet(detailsData)
                XLSX.utils.book_append_sheet(workbook, detailsSheet, "Chi Tiết Sản Phẩm")
            }

            XLSX.writeFile(workbook, `bao-cao-nhap-hang-${startDate}-${endDate}.xlsx`)
            toast.success("Xuất Excel thành công")
        } catch (error) {
            console.error("Export error:", error)
            toast.error("Lỗi xuất file Excel")
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={TrendingUp}
                title="Phiếu Nhập Hàng Nội Bộ"
                subtitle="Quản lý nhập hàng từ kho đến kho"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold text-foreground">Phiếu Nhập Hàng Nội Bộ</h1>
                    <p className="text-muted-foreground mt-2">Báo cáo nhập xuất hàng giữa các kho</p>
                </div>

                <Card className="p-6">
                    {/* Filters */}
                    <div className="space-y-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Date Filter */}
                            <div className="space-y-2">
                                <Label>Thời Gian</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full"
                                    />
                                    <span className="flex items-center text-muted-foreground">-</span>
                                    <Input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            {/* Warehouse Filters */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-2">
                                    <Label>Từ Kho (Xuất)</Label>
                                    <Select value={selectedFromWarehouseId} onValueChange={setSelectedFromWarehouseId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn kho xuất" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tất cả</SelectItem>
                                            {warehouses.map((wh) => (
                                                <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Đến Kho (Nhập)</Label>
                                    <Select value={selectedToWarehouseId} onValueChange={setSelectedToWarehouseId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn kho nhập" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tất cả</SelectItem>
                                            {warehouses.map((wh) => (
                                                <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button onClick={fetchTransfers} disabled={loading}>
                                {loading ? "Đang tải..." : "Xem Báo Cáo"}
                            </Button>
                            <Button onClick={exportToExcel} variant="outline" className="gap-2">
                                <Download className="w-4 h-4" />
                                Xuất Excel
                            </Button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        {transfers.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">Không có dữ liệu</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Mã Phiếu</TableHead>
                                        <TableHead>Từ Kho <ArrowRight className="inline w-3 h-3 mx-1" /> Đến Kho</TableHead>
                                        <TableHead>Trạng Thái</TableHead>
                                        <TableHead>Ngày Tạo</TableHead>
                                        <TableHead className="text-right">Thao Tác</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transfers.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="font-medium">{t.transfer_number}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground">{t.from_warehouse_name}</span>
                                                    <ArrowRight className="w-4 h-4 text-primary" />
                                                    <span className="font-medium">{t.to_warehouse_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(t.status)}</TableCell>
                                            <TableCell>{formatDate(t.created_at)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setSelectedTransferId(t.id)}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Card>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedTransferId} onOpenChange={() => { setSelectedTransferId(null); setSelectedTransferData(null) }}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Chi tiết phiếu: {selectedTransferData?.transfer_number}</DialogTitle>
                    </DialogHeader>

                    {selectedTransferData && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                                <div>
                                    <p className="text-muted-foreground">Từ Kho</p>
                                    <p className="font-medium">{selectedTransferData.from_warehouse_name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Đến Kho</p>
                                    <p className="font-medium">{selectedTransferData.to_warehouse_name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Trạng thái</p>
                                    <div className="mt-1">{getStatusBadge(selectedTransferData.status)}</div>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Ngày tạo</p>
                                    <p className="font-medium">{formatDate(selectedTransferData.created_at)}</p>
                                </div>
                            </div>

                            {/* Items table */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3">Danh sách sản phẩm</h3>
                                <Table className="border rounded-md">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Mã SP</TableHead>
                                            <TableHead>Tên Sản Phẩm</TableHead>
                                            <TableHead>ĐVT</TableHead>
                                            <TableHead className="text-right">SL Yêu Cầu</TableHead>
                                            <TableHead className="text-right">SL Thực Nhận</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(selectedTransferData.items || []).map((item: any, idx: number) => (
                                            <TableRow key={idx}>
                                                <TableCell className="font-mono text-sm">{item.product_code}</TableCell>
                                                <TableCell>{item.product_name}</TableCell>
                                                <TableCell>{item.unit_name}</TableCell>
                                                <TableCell className="text-right font-medium">{item.requested_quantity || item.quantity}</TableCell>
                                                <TableCell className="text-right font-bold text-green-600">{item.actual_received_quantity ?? "-"}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
