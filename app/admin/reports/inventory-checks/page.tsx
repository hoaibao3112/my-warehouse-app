"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
    ClipboardCheck, Eye, Download, Store, Search,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    CalendarIcon, X, FileSpreadsheet, Loader2, FileDown, Layers
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
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
    DialogDescription,
} from "@/components/ui/dialog"

interface InventoryCheck {
    id: string
    number: string
    warehouse: string
    warehouseId?: string
    status: "COMPLETED" | "IN_PROGRESS"
    createdBy: string
    createdAt: string
    completed_at?: string | null
    items?: any[]
}

interface Pagination {
    total: number
    totalPages: number
    page: number
    pageSize: number
}

export default function AllInventoryChecksPage() {
    const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([])
    const [warehouses, setWarehouses] = useState<any[]>([])
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all")
    const [selectedStatus, setSelectedStatus] = useState<string>("all")
    const [searchText, setSearchText] = useState("")
    const [searchDebounced, setSearchDebounced] = useState("")
    const [fromDate, setFromDate] = useState<Date | undefined>(undefined)
    const [toDate, setToDate] = useState<Date | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [exportingSingleId, setExportingSingleId] = useState<string | null>(null)
    const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
    const [selectedCheckData, setSelectedCheckData] = useState<any | null>(null)
    const [pagination, setPagination] = useState<Pagination>({
        total: 0,
        totalPages: 0,
        page: 1,
        pageSize: 20
    })

    // Batch export dialog state
    const [showBatchExport, setShowBatchExport] = useState(false)
    const [batchGroupBy, setBatchGroupBy] = useState<'warehouse' | 'date' | 'none'>('warehouse')
    const [batchOnlyDiscrepancy, setBatchOnlyDiscrepancy] = useState(false)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchDebounced(searchText)
        }, 400)
        return () => clearTimeout(timer)
    }, [searchText])

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

    // Fetch inventory checks
    const fetchChecks = useCallback(async (page: number = 1) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (selectedWarehouseId && selectedWarehouseId !== "all") {
                params.set("warehouseId", selectedWarehouseId)
            }
            if (selectedStatus && selectedStatus !== "all") {
                params.set("status", selectedStatus)
            }
            if (searchDebounced) {
                params.set("search", searchDebounced)
            }
            if (fromDate) {
                params.set("fromDate", fromDate.toISOString().split('T')[0])
            }
            if (toDate) {
                params.set("toDate", toDate.toISOString().split('T')[0])
            }
            params.set("page", page.toString())
            params.set("pageSize", pagination.pageSize.toString())

            const url = `/api/inventory-checks?${params.toString()}`
            const response = await mobileFetch(url)
            const result = await response.json()

            if (result.success) {
                setInventoryChecks(result.data || [])
                if (result.pagination) {
                    setPagination(result.pagination)
                }
            } else {
                toast.error(result.error || "Lỗi tải dữ liệu")
            }
        } catch (error) {
            console.error("Error fetching inventory checks:", error)
            toast.error("Lỗi tải dữ liệu kiểm kê")
        } finally {
            setLoading(false)
        }
    }, [selectedWarehouseId, selectedStatus, searchDebounced, fromDate, toDate, pagination.pageSize])

    // Gọi fetchChecks khi filter thay đổi (reset về page 1)
    useEffect(() => {
        fetchChecks(1)
    }, [fetchChecks])

    // Fetch check details when viewing
    useEffect(() => {
        if (selectedCheckId) {
            const fetchCheckDetails = async () => {
                try {
                    const response = await mobileFetch(`/api/inventory-checks/${selectedCheckId}`)
                    const result = await response.json()
                    if (result.success) {
                        setSelectedCheckData(result.data)
                    }
                } catch (error) {
                    console.error("Error fetching check details:", error)
                }
            }
            fetchCheckDetails()
        }
    }, [selectedCheckId])

    // Format date
    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-"
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

    const formatDateShort = (date: Date | undefined) => {
        if (!date) return ""
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    }

    // Xuất từng phiếu - fetch detail rồi export
    const exportSingleCheck = async (checkId: string, checkNumber: string) => {
        setExportingSingleId(checkId)
        try {
            const response = await mobileFetch(`/api/inventory-checks/${checkId}`)
            const result = await response.json()
            if (!result.success || !result.data) {
                toast.error("Không tải được dữ liệu phiếu")
                return
            }

            const { exportSingleCheckToExcel } = await import('@/lib/inventory-check-excel-export')
            const buffer = await exportSingleCheckToExcel(result.data)
            downloadBuffer(buffer, `kiem-ke-${checkNumber}.xlsx`)
            toast.success("Xuất phiếu thành công")
        } catch (error) {
            console.error("Export single error:", error)
            toast.error("Lỗi xuất file Excel")
        } finally {
            setExportingSingleId(null)
        }
    }

    // Xuất phiếu đang xem trong dialog chi tiết
    const exportCurrentDetail = async () => {
        if (!selectedCheckData) return
        setExporting(true)
        try {
            const { exportSingleCheckToExcel } = await import('@/lib/inventory-check-excel-export')
            const buffer = await exportSingleCheckToExcel(selectedCheckData)
            downloadBuffer(buffer, `kiem-ke-${selectedCheckData.number}.xlsx`)
            toast.success("Xuất phiếu thành công")
        } catch (error) {
            console.error("Export detail error:", error)
            toast.error("Lỗi xuất file Excel")
        } finally {
            setExporting(false)
        }
    }

    // Xuất hàng loạt với options - chỉ phiếu hoàn thành
    const handleBatchExport = async () => {
        const completedChecks = inventoryChecks.filter(c => c.status === 'COMPLETED')
        if (completedChecks.length === 0) {
            toast.error("Không có phiếu hoàn thành để xuất")
            return
        }

        setExporting(true)
        try {
            const { exportBatchToExcel } = await import('@/lib/inventory-check-excel-export')

            const warehouseName = selectedWarehouseId === "all"
                ? "Tất cả kho"
                : warehouses.find(w => w.id === selectedWarehouseId)?.name || ""

            const dateRange = fromDate || toDate
                ? ` (${fromDate ? formatDateShort(fromDate) : '...'} - ${toDate ? formatDateShort(toDate) : '...'})`
                : ''

            const buffer = await exportBatchToExcel(completedChecks, {
                groupBy: batchGroupBy,
                onlyDiscrepancy: batchOnlyDiscrepancy,
                title: `BÁO CÁO KIỂM KÊ - ${warehouseName.toUpperCase()}${dateRange}`
            })

            const groupLabel = batchGroupBy === 'warehouse' ? 'theo-kho' : batchGroupBy === 'date' ? 'theo-ngay' : 'chi-tiet'
            downloadBuffer(buffer, `kiem-ke-${groupLabel}-${new Date().toISOString().split('T')[0]}.xlsx`)
            toast.success("Xuất hàng loạt thành công")
            setShowBatchExport(false)
        } catch (error) {
            console.error("Export batch error:", error)
            toast.error("Lỗi xuất file Excel")
        } finally {
            setExporting(false)
        }
    }

    // Helper download buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadBuffer = (buffer: any, fileName: string) => {
        const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    // Clear all filters
    const clearFilters = () => {
        setSelectedWarehouseId("all")
        setSelectedStatus("all")
        setSearchText("")
        setFromDate(undefined)
        setToDate(undefined)
    }

    const hasActiveFilters = selectedWarehouseId !== "all" ||
        selectedStatus !== "all" ||
        searchText !== "" ||
        fromDate !== undefined ||
        toDate !== undefined

    // Số phiếu hoàn thành (dùng cho điều kiện xuất Excel)
    const completedCount = inventoryChecks.filter(c => c.status === 'COMPLETED').length

    // Pagination handlers
    const goToPage = (page: number) => {
        fetchChecks(page)
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={ClipboardCheck}
                title="Kiểm Kê Tất Cả Kho"
                subtitle="Xem phiếu kiểm kê từ tất cả các kho"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold text-foreground">Kiểm Kê Tất Cả Kho</h1>
                    <p className="text-muted-foreground mt-2">Xem danh sách phiếu kiểm kê từ tất cả các kho</p>
                </div>

                <Card className="p-6">
                    {/* Filters */}
                    <div className="space-y-4 mb-6">
                        <div className="flex flex-wrap gap-3 items-end">
                            {/* Tìm kiếm */}
                            <div className="space-y-1.5 flex-1 min-w-[200px]">
                                <Label className="flex items-center gap-2 text-sm font-medium">
                                    <Search className="w-4 h-4" />
                                    Tìm kiếm
                                </Label>
                                <Input
                                    placeholder="Nhập số phiếu kiểm kê..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    className="h-9"
                                />
                            </div>

                            {/* Lọc theo kho */}
                            <div className="space-y-1.5 min-w-[180px]">
                                <Label className="flex items-center gap-2 text-sm font-medium">
                                    <Store className="w-4 h-4" />
                                    Kho
                                </Label>
                                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                                    <SelectTrigger className="w-full md:w-52 h-9">
                                        <SelectValue placeholder="Chọn kho" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả kho</SelectItem>
                                        {warehouses.map((wh) => (
                                            <SelectItem key={wh.id} value={wh.id}>
                                                {wh.name} ({wh.type === 'MAIN' ? 'Kho Tổng' : 'Kho Con'})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Lọc trạng thái */}
                            <div className="space-y-1.5 min-w-[150px]">
                                <Label className="flex items-center gap-2 text-sm font-medium">
                                    Trạng thái
                                </Label>
                                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                    <SelectTrigger className="w-full md:w-44 h-9">
                                        <SelectValue placeholder="Tất cả" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả</SelectItem>
                                        <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                                        <SelectItem value="IN_PROGRESS">Đang thực hiện</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Từ ngày */}
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-2 text-sm font-medium">
                                    <CalendarIcon className="w-4 h-4" />
                                    Từ ngày
                                </Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="h-9 w-40 justify-start text-left font-normal"
                                        >
                                            {fromDate ? formatDateShort(fromDate) : <span className="text-muted-foreground">Chọn ngày</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={fromDate}
                                            onSelect={setFromDate}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Đến ngày */}
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-2 text-sm font-medium">
                                    Đến ngày
                                </Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="h-9 w-40 justify-start text-left font-normal"
                                        >
                                            {toDate ? formatDateShort(toDate) : <span className="text-muted-foreground">Chọn ngày</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={toDate}
                                            onSelect={setToDate}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {/* Actions row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Xóa bộ lọc
                                    </Button>
                                )}
                                <span className="text-sm text-muted-foreground">
                                    {pagination.total > 0
                                        ? `Tìm thấy ${pagination.total} phiếu kiểm kê`
                                        : loading ? "" : "Không tìm thấy kết quả"}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => setShowBatchExport(true)}
                                    variant="outline"
                                    className="gap-2"
                                    disabled={exporting || completedCount === 0}
                                >
                                    <Layers className="w-4 h-4" />
                                    Xuất hàng loạt
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-muted-foreground">Đang tải dữ liệu...</span>
                            </div>
                        ) : inventoryChecks.length === 0 ? (
                            <p className="text-center py-12 text-muted-foreground">Không có dữ liệu kiểm kê</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">STT</TableHead>
                                        <TableHead>Số Phiếu</TableHead>
                                        <TableHead>Kho</TableHead>
                                        <TableHead>Trạng Thái</TableHead>
                                        <TableHead>Người Tạo</TableHead>
                                        <TableHead>Ngày Tạo</TableHead>
                                        <TableHead>Ngày Hoàn Thành</TableHead>
                                        <TableHead className="text-right">Thao Tác</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {inventoryChecks.map((check, idx) => (
                                        <TableRow key={check.id}>
                                            <TableCell className="text-muted-foreground">
                                                {(pagination.page - 1) * pagination.pageSize + idx + 1}
                                            </TableCell>
                                            <TableCell className="font-medium">{check.number}</TableCell>
                                            <TableCell>{check.warehouse}</TableCell>
                                            <TableCell>
                                                <Badge variant={check.status === "COMPLETED" ? "default" : "secondary"}>
                                                    {check.status === "COMPLETED" ? "Hoàn thành" : "Đang thực hiện"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{check.createdBy}</TableCell>
                                            <TableCell>{formatDate(check.createdAt)}</TableCell>
                                            <TableCell>
                                                {check.completed_at ? formatDate(check.completed_at) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        title="Xem chi tiết"
                                                        onClick={() => setSelectedCheckId(check.id)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={exportingSingleId === check.id || check.status !== 'COMPLETED'}
                                                        title={check.status !== 'COMPLETED' ? 'Chỉ xuất được phiếu hoàn thành' : 'Xuất Excel'}
                                                        onClick={() => exportSingleCheck(check.id, check.number)}
                                                    >
                                                        {exportingSingleId === check.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <FileDown className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t mt-4">
                            <div className="text-sm text-muted-foreground">
                                Trang {pagination.page} / {pagination.totalPages}
                                <span className="ml-2">({pagination.total} phiếu)</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => goToPage(1)}
                                    disabled={pagination.page <= 1}
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => goToPage(pagination.page - 1)}
                                    disabled={pagination.page <= 1}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>

                                {/* Page numbers */}
                                {generatePageNumbers(pagination.page, pagination.totalPages).map((pageNum, i) =>
                                    pageNum === -1 ? (
                                        <span key={`dots-${i}`} className="px-1.5 text-muted-foreground">...</span>
                                    ) : (
                                        <Button
                                            key={pageNum}
                                            variant={pageNum === pagination.page ? "default" : "outline"}
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => goToPage(pageNum)}
                                        >
                                            {pageNum}
                                        </Button>
                                    )
                                )}

                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => goToPage(pagination.page + 1)}
                                    disabled={pagination.page >= pagination.totalPages}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => goToPage(pagination.totalPages)}
                                    disabled={pagination.page >= pagination.totalPages}
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedCheckId} onOpenChange={() => { setSelectedCheckId(null); setSelectedCheckData(null) }}>
                <DialogContent className="max-w-[95vw] md:max-w-7xl max-h-[90vh] flex flex-col">
                    <DialogHeader className="border-b border-border pb-4">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl">Chi tiết báo cáo kiểm kê</DialogTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 mr-8"
                                disabled={exporting || !selectedCheckData || selectedCheckData?.status !== 'COMPLETED'}
                                title={selectedCheckData?.status !== 'COMPLETED' ? 'Chỉ xuất được phiếu hoàn thành' : ''}
                                onClick={exportCurrentDetail}
                            >
                                {exporting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileDown className="w-4 h-4" />
                                )}
                                Xuất Excel
                            </Button>
                        </div>
                        <DialogDescription className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-secondary font-medium">#{selectedCheckData?.number}</Badge>
                            <span className="text-muted-foreground">&bull;</span>
                            <span>{selectedCheckData?.period}</span>
                            <span className="text-muted-foreground">&bull;</span>
                            <span>Người tạo: {selectedCheckData?.createdBy || selectedCheckData?.created_by || 'Hệ thống'}</span>
                        </DialogDescription>
                    </DialogHeader>

                    {selectedCheckData && (
                        <div className="flex-1 overflow-y-auto mt-4 px-1">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="text-left p-2 font-medium">Sản Phẩm</th>
                                        <th className="text-center p-2 font-medium">Tồn Đầu</th>
                                        <th className="text-center p-2 font-medium">Nhập</th>
                                        <th className="text-center p-2 font-medium">Xuất</th>
                                        <th className="text-center p-2 font-medium">Tồn Hệ Thống</th>
                                        <th className="text-center p-2 font-medium">Thực Tế</th>
                                        <th className="text-center p-2 font-medium">Chênh Lệch</th>
                                        <th className="text-center p-2 font-medium">Ghi Chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCheckData.items || []).map((item: any, idx: number) => (
                                        <tr key={idx} className="border-b hover:bg-muted/10">
                                            <td className="p-2">
                                                <p className="font-medium">{item.productName}</p>
                                                <p className="text-xs text-muted-foreground">{item.productCode}</p>
                                            </td>

                                            <td className="p-2 text-center">{item.openingBalance || 0}</td>
                                            <td className="p-2 text-center text-green-600">+{item.imports || 0}</td>
                                            <td className="p-2 text-center text-red-600">-{Math.abs(item.exports || 0)}</td>
                                            <td className="p-2 text-center font-medium bg-muted/20">{item.systemBalance || 0}</td>

                                            <td className="p-2 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-bold text-lg">
                                                        {item.inputValue !== null && item.inputValue !== undefined
                                                            ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(item.inputValue))
                                                            : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(item.actualBalance || 0))
                                                        } {item.inputUnitCode || item.productUnit}
                                                    </span>
                                                    {item.inputUnitId && item.inputUnitId !== item.productUnitId && (
                                                        <span className="text-[10px] text-muted-foreground italic">
                                                            (= {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(item.actualBalance || 0))} {item.productUnit})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className={`p-2 text-center font-medium ${item.difference < 0 ? 'text-red-500' : item.difference > 0 ? 'text-green-500' : ''}`}>
                                                {item.difference > 0 ? '+' : ''}{item.difference || 0}
                                                {item.differencePercentage !== undefined && (
                                                    <span className="text-xs ml-1 opacity-80">
                                                        ({item.differencePercentage > 0 ? "+" : ""}{item.differencePercentage}%)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2 text-center text-xs">
                                                {item.difference > 0 && <div className="text-green-600 text-[10px] font-semibold">NHẬP ĐIỀU CHỈNH</div>}
                                                {item.difference < 0 && <div className="text-red-600 text-[10px] font-semibold">XUẤT ĐIỀU CHỈNH</div>}
                                                {item.note && <div className="text-xs text-muted-foreground mt-1 italic">{item.note}</div>}
                                                {item.difference === 0 && !item.note && <span className="text-muted-foreground">-</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {(selectedCheckData.items || []).length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">Không có dữ liệu sản phẩm</div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Batch Export Dialog */}
            <Dialog open={showBatchExport} onOpenChange={setShowBatchExport}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-lg">Xuất hàng loạt phiếu kiểm kê</DialogTitle>
                        <DialogDescription>
                            Tổng: {pagination.total} phiếu | Trang hiện tại: {inventoryChecks.length} phiếu | Đủ điều kiện xuất (hoàn thành): {completedCount} phiếu
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-4">
                        {/* Nhóm theo */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Nhóm dữ liệu theo</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBatchGroupBy('warehouse')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${batchGroupBy === 'warehouse'
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-border hover:border-muted-foreground/30'
                                        }`}
                                >
                                    <Store className="w-5 h-5" />
                                    <span className="text-xs font-medium">Theo Kho</span>
                                    <span className="text-[10px] text-muted-foreground text-center">Mỗi kho 1 sheet</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBatchGroupBy('date')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${batchGroupBy === 'date'
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-border hover:border-muted-foreground/30'
                                        }`}
                                >
                                    <CalendarIcon className="w-5 h-5" />
                                    <span className="text-xs font-medium">Theo Ngày</span>
                                    <span className="text-[10px] text-muted-foreground text-center">Mỗi ngày 1 sheet</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBatchGroupBy('none')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${batchGroupBy === 'none'
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-border hover:border-muted-foreground/30'
                                        }`}
                                >
                                    <FileSpreadsheet className="w-5 h-5" />
                                    <span className="text-xs font-medium">Từng Phiếu</span>
                                    <span className="text-[10px] text-muted-foreground text-center">Mỗi phiếu 1 sheet</span>
                                </button>
                            </div>
                        </div>

                        {/* Tùy chọn */}
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="onlyDiscrepancy"
                                checked={batchOnlyDiscrepancy}
                                onCheckedChange={(checked) => setBatchOnlyDiscrepancy(checked === true)}
                            />
                            <label
                                htmlFor="onlyDiscrepancy"
                                className="text-sm font-medium cursor-pointer select-none"
                            >
                                Chỉ xuất sản phẩm có chênh lệch
                            </label>
                        </div>

                        {/* Info */}
                        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                            <p>
                                <span className="font-medium text-foreground">Theo Kho:</span> Mỗi kho sẽ có 1 sheet riêng, chứa tất cả phiếu kiểm kê của kho đó.
                            </p>
                            <p>
                                <span className="font-medium text-foreground">Theo Ngày:</span> Mỗi ngày sẽ có 1 sheet riêng, gom tất cả phiếu từ mọi kho trong ngày đó.
                            </p>
                            <p>
                                <span className="font-medium text-foreground">Từng Phiếu:</span> Mỗi phiếu kiểm kê sẽ có 1 sheet chi tiết riêng (tối đa 15 sheet).
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button
                            variant="outline"
                            onClick={() => setShowBatchExport(false)}
                            disabled={exporting}
                        >
                            Hủy
                        </Button>
                        <Button
                            onClick={handleBatchExport}
                            disabled={exporting || completedCount === 0}
                            className="gap-2"
                        >
                            {exporting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileSpreadsheet className="w-4 h-4" />
                            )}
                            Xuất Excel ({completedCount} phiếu)
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

/**
 * Generate page numbers with ellipsis for pagination UI
 * Returns array of page numbers, -1 = ellipsis
 */
function generatePageNumbers(currentPage: number, totalPages: number): number[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages: number[] = [1]

    if (currentPage > 3) {
        pages.push(-1)
    }

    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
        pages.push(i)
    }

    if (currentPage < totalPages - 2) {
        pages.push(-1)
    }

    pages.push(totalPages)

    return pages
}
