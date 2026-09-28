"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DollarSign, Check, X, Clock, Filter, History, User, Calendar as CalendarIcon, Building2, Eye, FileSpreadsheet, Briefcase } from "lucide-react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { mobileFetch } from "@/lib/mobile/api-client"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useAuthContext } from "@/components/auth-provider"
import { isHR, isAdmin } from "@/lib/auth-helpers"

interface SalaryAdvanceRequest {
    id: string
    reason: string
    desired_date: string
    amount: string
    status: "PENDING" | "HR_APPROVED" | "APPROVED" | "REJECTED" | "CANCELLED"

    // HR Approval
    hr_approved_by: string | null
    hr_approved_at: string | null
    users_hr_approver: {
        id: string
        full_name: string
    } | null

    // Admin Approval
    admin_approved_by: string | null
    admin_approved_at: string | null
    users_admin_approver: {
        id: string
        full_name: string
    } | null

    // Legacy/Rejection
    approved_at: string | null
    rejection_reason: string | null
    created_at: string

    users_requester: {
        id: string
        full_name: string
        email: string | null
        employee_code: string | null
        employment_type: "FULLTIME" | "PARTTIME" | null
    }
    users_approver: {
        id: string
        full_name: string
    } | null
    warehouses: {
        id: string
        name: string
        code: string
    } | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Chờ HR duyệt", color: "bg-yellow-100 text-yellow-800" },
    HR_APPROVED: { label: "Chờ Admin chi", color: "bg-blue-100 text-blue-800" },
    APPROVED: { label: "Đã chi tiền", color: "bg-green-100 text-green-800" },
    REJECTED: { label: "Từ chối", color: "bg-red-100 text-red-800" },
    CANCELLED: { label: "Đã hủy", color: "bg-gray-100 text-gray-800" },
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
    FULLTIME: "Toàn thời gian",
    PARTTIME: "Bán thời gian",
}

export default function SalaryAdvancePage() {
    const { user } = useAuthContext()
    const [loading, setLoading] = useState(true)
    const [requests, setRequests] = useState<SalaryAdvanceRequest[]>([])
    const [selectedStatus, setSelectedStatus] = useState<string>("all")
    const [startDate, setStartDate] = useState<Date | undefined>(undefined)
    const [endDate, setEndDate] = useState<Date | undefined>(undefined)
    const [exporting, setExporting] = useState(false)

    // Detail dialog state
    const [detailDialogOpen, setDetailDialogOpen] = useState(false)
    const [viewingRequest, setViewingRequest] = useState<SalaryAdvanceRequest | null>(null)

    // Action dialog state
    const [actionDialogOpen, setActionDialogOpen] = useState(false)
    const [selectedRequest, setSelectedRequest] = useState<SalaryAdvanceRequest | null>(null)
    const [actionType, setActionType] = useState<"approve" | "reject">("approve")
    const [rejectionReason, setRejectionReason] = useState("")
    const [processing, setProcessing] = useState(false)

    useEffect(() => {
        loadRequests()
    }, [startDate, endDate, selectedStatus])

    const loadRequests = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (startDate) params.append("startDate", startDate.toISOString())
            if (endDate) params.append("endDate", endDate.toISOString())
            if (selectedStatus && selectedStatus !== "all") {
                params.append("status", selectedStatus)
            }

            const response = await mobileFetch(`/api/salary-advance?${params.toString()}`)
            const data = await response.json()

            if (data.success) {
                setRequests(data.data || [])
            } else {
                toast.error(data.error || "Không thể tải danh sách yêu cầu")
            }
        } catch (error) {
            toast.error("Không thể kết nối đến server")
        } finally {
            setLoading(false)
        }
    }

    const openDetailDialog = (request: SalaryAdvanceRequest) => {
        setViewingRequest(request)
        setDetailDialogOpen(true)
    }

    const openActionDialog = (request: SalaryAdvanceRequest, type: "approve" | "reject") => {
        setSelectedRequest(request)
        setActionType(type)
        setRejectionReason("")
        setDetailDialogOpen(false)
        setActionDialogOpen(true)
    }

    const handleAction = async () => {
        if (!selectedRequest) return

        setProcessing(true)
        try {
            const response = await mobileFetch(`/api/salary-advance/${selectedRequest.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: actionType,
                    rejection_reason: actionType === "reject" ? rejectionReason : undefined,
                }),
            })

            const data = await response.json()

            if (data.success) {
                toast.success(data.message)
                setActionDialogOpen(false)
                loadRequests()
            } else {
                toast.error(data.error || "Không thể xử lý yêu cầu")
            }
        } catch (error) {
            toast.error("Không thể kết nối đến server")
        } finally {
            setProcessing(false)
        }
    }

    const handleExportToExcel = async () => {
        if (requests.length === 0) {
            toast.error("Không có dữ liệu để xuất")
            return
        }

        setExporting(true)
        try {
            // Dynamic import ExcelJS
            const ExcelJS = await import('exceljs')
            const workbook = new ExcelJS.default.Workbook()
            const worksheet = workbook.addWorksheet('Phiếu Ứng Lương')

            // Define styles
            const borderStyle = {
                top: { style: 'thin' as const },
                left: { style: 'thin' as const },
                bottom: { style: 'thin' as const },
                right: { style: 'thin' as const }
            }
            const headerFont = { bold: true, name: 'Times New Roman', size: 11 }
            const normalFont = { name: 'Times New Roman', size: 10 }
            const titleFont = { bold: true, name: 'Times New Roman', size: 14 }

            // Title
            const titleRow = worksheet.addRow(['BÁO CÁO PHIẾU ỨNG LƯƠNG'])
            titleRow.font = titleFont
            titleRow.height = 25
            worksheet.mergeCells(1, 1, 1, 12)
            titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

            // Date range
            let dateRangeStr = 'Tất cả thời gian'
            if (startDate && endDate) {
                dateRangeStr = `Từ ${format(startDate, 'dd/MM/yyyy')} đến ${format(endDate, 'dd/MM/yyyy')}`
            } else if (startDate) {
                dateRangeStr = `Từ ${format(startDate, 'dd/MM/yyyy')}`
            } else if (endDate) {
                dateRangeStr = `Đến ${format(endDate, 'dd/MM/yyyy')}`
            }
            const dateRow = worksheet.addRow([`Khoảng thời gian: ${dateRangeStr}`])
            dateRow.font = normalFont
            worksheet.mergeCells(2, 1, 2, 12)

            // Empty row
            worksheet.addRow([])

            // Headers
            const headers = ['STT', 'Họ tên', 'Mã NV', 'Loại NV', 'Cửa hàng', 'Số tiền', 'Ngày muốn nhận', 'Ngày tạo', 'Trạng thái', 'Người Duyệt', 'Người Duyệt Chi', 'Lý do', 'Lý do từ chối']
            const headerRow = worksheet.addRow(headers)
            headerRow.font = headerFont
            headerRow.height = 25
            headerRow.eachCell((cell) => {
                cell.border = borderStyle
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
            })

            // Data rows
            requests.forEach((r, idx) => {
                const row = worksheet.addRow([
                    idx + 1,
                    r.users_requester.full_name,
                    r.users_requester.employee_code || '',
                    r.users_requester.employment_type ? EMPLOYMENT_TYPE_MAP[r.users_requester.employment_type] : '',
                    r.warehouses?.name || '',
                    new Intl.NumberFormat('vi-VN').format(parseFloat(r.amount)),
                    format(new Date(r.desired_date), 'dd/MM/yyyy'),
                    format(new Date(r.created_at), 'HH:mm dd/MM/yyyy'),
                    STATUS_MAP[r.status]?.label || r.status,
                    r.users_hr_approver?.full_name || '',
                    r.users_admin_approver?.full_name || '',
                    r.reason,
                    r.rejection_reason || ''
                ])

                row.font = normalFont
                row.eachCell((cell, colNumber) => {
                    cell.border = borderStyle
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

                    // Status color
                    if (colNumber === 9) {
                        if (r.status === 'APPROVED') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } }
                        } else if (r.status === 'REJECTED') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCB' } }
                        } else if (r.status === 'PENDING') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
                        }
                    }
                })
                // Left align text columns
                row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                row.getCell(12).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                row.getCell(13).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
            })

            // Column widths
            worksheet.getColumn(1).width = 5    // STT
            worksheet.getColumn(2).width = 22   // Họ tên
            worksheet.getColumn(3).width = 12   // Mã NV
            worksheet.getColumn(4).width = 15   // Loại NV
            worksheet.getColumn(5).width = 18   // Cửa hàng
            worksheet.getColumn(6).width = 15   // Số tiền
            worksheet.getColumn(7).width = 15   // Ngày muốn nhận
            worksheet.getColumn(8).width = 18   // Ngày tạo
            worksheet.getColumn(9).width = 15   // Trạng thái
            worksheet.getColumn(10).width = 18  // HR Duyệt
            worksheet.getColumn(11).width = 18  // Admin Duyệt Chi
            worksheet.getColumn(12).width = 30  // Lý do
            worksheet.getColumn(13).width = 30  // Lý do từ chối

            // Generate and download
            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `phieu-ung-luong-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
            link.click()
            window.URL.revokeObjectURL(url)

            toast.success("Đã xuất báo cáo Excel")
        } catch (error) {
            console.error("Export error:", error)
            toast.error("Không thể xuất báo cáo")
        } finally {
            setExporting(false)
        }
    }

    const pendingRequests = requests.filter((r) => r.status === "PENDING" || r.status === "HR_APPROVED")
    const historyRequests = requests.filter((r) => r.status !== "PENDING" && r.status !== "HR_APPROVED")

    // Render a card for the list (hiding amount)
    const renderRequestCard = (request: SalaryAdvanceRequest) => (
        <Card
            key={request.id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => openDetailDialog(request)}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{request.users_requester.full_name}</span>
                            {request.users_requester.employee_code && (
                                <Badge variant="outline">{request.users_requester.employee_code}</Badge>
                            )}
                            <Badge className={STATUS_MAP[request.status].color}>
                                {STATUS_MAP[request.status].label}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            {request.users_requester.employment_type && (
                                <div className="flex items-center gap-1">
                                    <Briefcase className="w-4 h-4" />
                                    <span>{EMPLOYMENT_TYPE_MAP[request.users_requester.employment_type]}</span>
                                </div>
                            )}
                            {request.warehouses && (
                                <div className="flex items-center gap-1">
                                    <Building2 className="w-4 h-4" />
                                    <span>{request.warehouses.name}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="w-4 h-4" />
                                {format(new Date(request.created_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                            </div>
                        </div>
                        {request.users_approver && request.approved_at && (
                            <div className="text-sm text-muted-foreground">
                                <span className="font-medium">
                                    {request.status === "APPROVED" ? "Duyệt bởi" : "Xử lý bởi"}:
                                </span>{" "}
                                {request.users_approver.full_name}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetailDialog(request) }}>
                            <Eye className="w-4 h-4 mr-1" />
                            Chi tiết
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <DollarSign className="w-6 h-6" />
                        Duyệt Ứng Lương
                    </h1>
                    <p className="text-muted-foreground">Quản lý yêu cầu ứng lương của nhân viên</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={handleExportToExcel}
                        disabled={exporting || requests.length === 0}
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        {exporting ? "Đang xuất..." : "Xuất Excel"}
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-[140px] justify-start text-left font-normal",
                                    !startDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {startDate ? format(startDate, "dd/MM/yyyy") : "Từ ngày"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={startDate}
                                onSelect={setStartDate}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-[140px] justify-start text-left font-normal",
                                    !endDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {endDate ? format(endDate, "dd/MM/yyyy") : "Đến ngày"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={endDate}
                                onSelect={setEndDate}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    {(startDate || endDate) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                setStartDate(undefined)
                                setEndDate(undefined)
                            }}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="pending" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="pending" className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Chờ Duyệt
                        {pendingRequests.length > 0 && (
                            <Badge variant="destructive" className="ml-1">
                                {pendingRequests.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Lịch Sử
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
                    ) : pendingRequests.length === 0 ? (
                        <Card>
                            <CardContent className="py-8 text-center text-muted-foreground">
                                Không có yêu cầu nào đang chờ duyệt
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            {pendingRequests.map((request) => renderRequestCard(request))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history">
                    <div className="flex gap-2 mb-4">
                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                            <SelectTrigger className="w-40">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Tất cả" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                <SelectItem value="HR_APPROVED">Chờ Admin chi</SelectItem>
                                <SelectItem value="APPROVED">Đã chi tiền</SelectItem>
                                <SelectItem value="REJECTED">Từ chối</SelectItem>
                                <SelectItem value="CANCELLED">Đã hủy</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
                    ) : historyRequests.length === 0 ? (
                        <Card>
                            <CardContent className="py-8 text-center text-muted-foreground">
                                Không có lịch sử ứng lương
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            {historyRequests.map((request) => renderRequestCard(request))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Detail Dialog */}
            <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Chi Tiết Yêu Cầu Ứng Lương</DialogTitle>
                    </DialogHeader>

                    {viewingRequest && (
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Người yêu cầu:</span>
                                    <span className="font-medium">{viewingRequest.users_requester.full_name}</span>
                                </div>
                                {viewingRequest.users_requester.employee_code && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Mã nhân viên:</span>
                                        <span>{viewingRequest.users_requester.employee_code}</span>
                                    </div>
                                )}
                                {viewingRequest.users_requester.employment_type && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Loại nhân viên:</span>
                                        <Badge variant="outline">
                                            {EMPLOYMENT_TYPE_MAP[viewingRequest.users_requester.employment_type]}
                                        </Badge>
                                    </div>
                                )}
                                {viewingRequest.warehouses && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Cửa hàng:</span>
                                        <span>{viewingRequest.warehouses.name}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Ngày tạo:</span>
                                    <span>{format(new Date(viewingRequest.created_at), "HH:mm dd/MM/yyyy", { locale: vi })}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Trạng thái:</span>
                                    <Badge className={STATUS_MAP[viewingRequest.status].color}>
                                        {STATUS_MAP[viewingRequest.status].label}
                                    </Badge>
                                </div>

                                <div className="border-t pt-3 mt-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Số tiền ứng:</span>
                                        <span className="font-bold text-lg text-orange-600">
                                            {new Intl.NumberFormat('vi-VN').format(parseFloat(viewingRequest.amount))}đ
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <span className="text-muted-foreground">Muốn nhận ngày:</span>
                                        <span>{format(new Date(viewingRequest.desired_date), "dd/MM/yyyy", { locale: vi })}</span>
                                    </div>
                                </div>

                                <div className="border-t pt-3 mt-3">
                                    <div className="text-muted-foreground mb-1">Lý do:</div>
                                    <div className="text-sm bg-muted p-2 rounded">{viewingRequest.reason}</div>
                                </div>

                                {/* HR Approval Info */}
                                {viewingRequest.users_hr_approver && viewingRequest.hr_approved_at && (
                                    <div className="border-t pt-3 mt-3 bg-blue-50 p-3 rounded">
                                        <div className="font-medium mb-2 text-blue-900">Bước 1: HR Duyệt</div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Duyệt bởi:</span>
                                            <span>{viewingRequest.users_hr_approver.full_name}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-muted-foreground">Thời gian:</span>
                                            <span>{format(new Date(viewingRequest.hr_approved_at), "HH:mm dd/MM/yyyy", { locale: vi })}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Admin Approval Info */}
                                {viewingRequest.users_admin_approver && viewingRequest.admin_approved_at && (
                                    <div className="border-t pt-3 mt-3 bg-green-50 p-3 rounded">
                                        <div className="font-medium mb-2 text-green-900">Bước 2: Admin Chi Tiền</div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Chi bởi:</span>
                                            <span>{viewingRequest.users_admin_approver.full_name}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-muted-foreground">Thời gian:</span>
                                            <span>{format(new Date(viewingRequest.admin_approved_at), "HH:mm dd/MM/yyyy", { locale: vi })}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Legacy approval info (for rejection) */}
                                {viewingRequest.users_approver && viewingRequest.approved_at && viewingRequest.status === "REJECTED" && (
                                    <div className="border-t pt-3 mt-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Từ chối bởi:</span>
                                            <span>{viewingRequest.users_approver.full_name}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-muted-foreground">Thời gian:</span>
                                            <span>{format(new Date(viewingRequest.approved_at), "HH:mm dd/MM/yyyy", { locale: vi })}</span>
                                        </div>
                                    </div>
                                )}

                                {viewingRequest.rejection_reason && (
                                    <div className="border-t pt-3 mt-3">
                                        <div className="text-muted-foreground mb-1">Lý do từ chối:</div>
                                        <div className="text-sm bg-red-50 text-red-600 p-2 rounded">{viewingRequest.rejection_reason}</div>
                                    </div>
                                )}
                            </div>

                            {/* Action buttons based on status */}
                            {/* Action buttons based on status and role */}
                            {user && (
                                <>
                                    {/* Handle PENDING requests: HR or Admin can approve */}
                                    {viewingRequest.status === "PENDING" && (isHR(user) || isAdmin(user)) && (
                                        <DialogFooter className="gap-2">
                                            <Button
                                                variant="outline"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => openActionDialog(viewingRequest, "reject")}
                                            >
                                                <X className="w-4 h-4 mr-1" />
                                                Từ Chối
                                            </Button>
                                            <Button
                                                className="bg-green-600 hover:bg-green-700"
                                                onClick={() => openActionDialog(viewingRequest, "approve")}
                                            >
                                                <Check className="w-4 h-4 mr-1" />
                                                Duyệt (HR)
                                            </Button>
                                        </DialogFooter>
                                    )}

                                    {/* Handle HR_APPROVED requests: Only Admin can approve payment */}
                                    {viewingRequest.status === "HR_APPROVED" && isAdmin(user) && (
                                        <DialogFooter className="gap-2">
                                            <Button
                                                variant="outline"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => openActionDialog(viewingRequest, "reject")}
                                            >
                                                <X className="w-4 h-4 mr-1" />
                                                Từ Chối
                                            </Button>
                                            <Button
                                                className="bg-green-600 hover:bg-green-700"
                                                onClick={() => openActionDialog(viewingRequest, "approve")}
                                            >
                                                <Check className="w-4 h-4 mr-1" />
                                                Duyệt Chi (Admin)
                                            </Button>
                                        </DialogFooter>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Action Dialog */}
            <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {actionType === "approve" ? "Duyệt Ứng Lương" : "Từ Chối Ứng Lương"}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedRequest && (
                                <>
                                    <strong>{selectedRequest.users_requester.full_name}</strong> xin ứng{" "}
                                    <strong className="text-orange-600">
                                        {new Intl.NumberFormat('vi-VN').format(parseFloat(selectedRequest.amount))}đ
                                    </strong>
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {actionType === "reject" && (
                        <div className="space-y-2">
                            <Label htmlFor="rejection-reason">Lý do từ chối</Label>
                            <Textarea
                                id="rejection-reason"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Nhập lý do từ chối (tùy chọn)"
                            />
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
                            Hủy
                        </Button>
                        <Button
                            onClick={handleAction}
                            disabled={processing}
                            className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                        >
                            {processing
                                ? "Đang xử lý..."
                                : actionType === "approve"
                                    ? "Xác nhận duyệt"
                                    : "Xác nhận từ chối"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
