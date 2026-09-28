"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { formatTimeNoTz } from "@/lib/server-time"
import {
    Clock,
    Calendar,
    Filter,
    Search,
    ChevronDown,
    History,
    DollarSign,
    User,
    Store,
    ArrowRight,
    Eye
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useAuth } from "@/hooks/use-auth"
import { formatCurrency } from "@/lib/utils"
import Link from "next/link"

export default function SalesHistoryPage() {
    const { user } = useAuth()
    const [sessions, setSessions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showFilters, setShowFilters] = useState(true)

    // Filters
    const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-01"))
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [selectedWarehouse, setSelectedWarehouse] = useState("ALL")
    const [selectedUser, setSelectedUser] = useState("ALL")
    const [selectedStatus, setSelectedStatus] = useState("ALL")

    // Filter Options
    const [warehouses, setWarehouses] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [selectedSession, setSelectedSession] = useState<any>(null)

    // Pagination
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    useEffect(() => {
        if (user && !loading) {
            fetchOptions()
        }
    }, [user, loading])

    useEffect(() => {
        fetchSessions()
    }, [page, startDate, endDate, selectedWarehouse, selectedUser, selectedStatus])

    const fetchOptions = async () => {
        try {
            // Fetch Warehouses
            const whRes = await mobileFetch("/api/warehouses")
            const whData = await whRes.json()
            if (whData.success) {
                let availableWarehouses = whData.data || []

                // Filter warehouses based on role
                if (user?.role === 'GENERAL_MANAGER') {
                    if (user.warehouseIds && Array.isArray(user.warehouseIds)) {
                        availableWarehouses = availableWarehouses.filter((w: any) => user.warehouseIds?.includes(w.id))
                    }
                } else if (user?.role === 'WAREHOUSE_MANAGER') {
                    if (user.warehouseId) {
                        availableWarehouses = availableWarehouses.filter((w: any) => w.id === user.warehouseId)
                        // Force select their warehouse
                        if (availableWarehouses.length > 0) {
                            setSelectedWarehouse(user.warehouseId)
                        }
                    }
                }

                setWarehouses(availableWarehouses)
            }

            // Fetch Users (If manager, fetch relevant users)
            if (user?.role === 'ADMIN' || user?.role === 'GENERAL_MANAGER' || user?.role === 'WAREHOUSE_MANAGER' || user?.role === 'HR') {
                let userApiUrl = "/api/users?pageSize=1000"

                // Optimization: If Warehouse Manager, only fetch their users
                if (user?.role === 'WAREHOUSE_MANAGER' && user.warehouseId) {
                    userApiUrl += `&warehouseId=${user.warehouseId}`
                }

                const userRes = await mobileFetch(userApiUrl)
                const userData = await userRes.json()
                if (userData.success) {
                    let availableUsers = userData.data || []

                    // 1. Filter by Warehouse Scope (Security)
                    if (user?.role === 'GENERAL_MANAGER') {
                        if (user.warehouseIds && Array.isArray(user.warehouseIds)) {
                            availableUsers = availableUsers.filter((u: any) => user.warehouseIds?.includes(u.warehouseId))
                        }
                    } else if (user?.role === 'WAREHOUSE_MANAGER') {
                        if (user.warehouseId) {
                            availableUsers = availableUsers.filter((u: any) => u.warehouseId === user.warehouseId)
                        }
                    }

                    // 2. Filter by Sales Permission
                    availableUsers = availableUsers.filter((u: any) => {
                        // Managers/Admins implicitly have sales rights or at least manage it
                        if (['ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'AdminKhoTong', 'QuanLyKhoCon'].includes(u.role)) return true

                        // Check specific permissions for staff
                        let perms = u.permissions
                        if (typeof perms === 'string') {
                            try { perms = JSON.parse(perms) } catch { perms = [] }
                        }

                        // Check for 'sales' permission
                        if (Array.isArray(perms) && (perms.includes('sales') || perms.includes('view_sales'))) return true

                        return false
                    })

                    setUsers(availableUsers)
                }
            }
        } catch (error) {
            console.error("Error fetching options:", error)
            toast.error("Không thể tải dữ liệu bộ lọc")
        }
    }

    const fetchSessions = async () => {
        try {
            setLoading(true)

            const params = new URLSearchParams({
                page: page.toString(),
                limit: "20",
                fromDate: startDate,
                toDate: endDate
            })

            if (selectedWarehouse !== "ALL") params.append("warehouseId", selectedWarehouse)
            if (selectedUser !== "ALL") params.append("userId", selectedUser)
            if (selectedStatus !== "ALL") params.append("status", selectedStatus)

            const res = await mobileFetch(`/api/sales-sessions?${params.toString()}`)
            const json = await res.json()

            if (json.success) {
                setSessions(json.data || [])
                if (json.pagination) {
                    setTotalPages(json.pagination.totalPages)
                }
            } else {
                toast.error(json.error || "Không thể tải lịch sử ca bán hàng")
            }
        } catch (error) {
            console.error("Error fetching sessions:", error)
            toast.error("Không thể kết nối đến máy chủ")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background pb-20">
            <MobilePageHeader
                icon={History}
                title="Lịch Sử Ca Bán Hàng"
                subtitle="Quản lý chi tiết ca bán hàng của nhân viên"
            />

            <div className="p-4 md:p-6 space-y-4 w-full mx-auto">

                {/* Statistics or Summary could go here */}

                {/* Filters */}
                <Collapsible open={showFilters} onOpenChange={setShowFilters}>
                    <Card>
                        <CardHeader className="pb-3 py-3">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                                    <div className="flex items-center gap-2">
                                        <Filter className="h-4 w-4" />
                                        <span className="font-semibold">Bộ lọc & Tìm kiếm</span>
                                    </div>
                                    <ChevronDown
                                        className={cn(
                                            "h-4 w-4 transition-transform",
                                            showFilters && "transform rotate-180"
                                        )}
                                    />
                                </Button>
                            </CollapsibleTrigger>
                        </CardHeader>
                        <CollapsibleContent>
                            <CardContent className="space-y-4 pt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                                    {/* Date Range */}
                                    <div className="space-y-2">
                                        <Label>Từ ngày</Label>
                                        <Input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Đến ngày</Label>
                                        <Input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                        />
                                    </div>

                                    {/* Warehouse Filter - Show only if > 1 warehouse or role allows */}
                                    {warehouses.length > 0 && (
                                        <div className="space-y-2">
                                            <Label>Kho hàng</Label>
                                            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Tất cả kho" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {user?.role !== 'WAREHOUSE_MANAGER' && (
                                                        <SelectItem value="ALL">Tất cả kho</SelectItem>
                                                    )}
                                                    {warehouses.map(wh => (
                                                        <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* User Filter */}
                                    <div className="space-y-2">
                                        <Label>Nhân viên</Label>
                                        <Select value={selectedUser} onValueChange={setSelectedUser}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Tất cả nhân viên" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">Tất cả nhân viên</SelectItem>
                                                {users.map(u => (
                                                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Status Filter */}
                                    <div className="space-y-2">
                                        <Label>Trạng thái</Label>
                                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Tất cả" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">Tất cả</SelectItem>
                                                <SelectItem value="IN_PROGRESS">Đang mở (In Progress)</SelectItem>
                                                <SelectItem value="PENDING_APPROVAL">Chờ duyệt (Pending)</SelectItem>
                                                <SelectItem value="COMPLETED">Hoàn thành (Completed)</SelectItem>
                                                <SelectItem value="REJECTED">Từ chối (Rejected)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button variant="outline" onClick={() => {
                                        setStartDate(format(new Date(), "yyyy-MM-01"))
                                        setEndDate(format(new Date(), "yyyy-MM-dd"))
                                        setSelectedWarehouse("ALL")
                                        setSelectedUser("ALL")
                                        setSelectedStatus("ALL")
                                        setPage(1)
                                    }}>Đặt lại bộ lọc</Button>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                {/* List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Clock className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <Card className="p-8 text-center text-muted-foreground">
                            <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p>Không tìm thấy ca bán hàng nào phù hợp</p>
                        </Card>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden md:block rounded-md border bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Ngày / Kho</TableHead>
                                            <TableHead>Nhân viên</TableHead>
                                            <TableHead>Ca làm việc</TableHead>
                                            <TableHead className="text-right">Doanh thu</TableHead>
                                            <TableHead className="text-right">Tiền mặt</TableHead>
                                            <TableHead className="text-right">Chênh lệch</TableHead>
                                            <TableHead className="text-center">Trạng thái</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sessions.map((session) => (
                                            <TableRow key={session.id} className="hover:bg-muted/50">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{format(new Date(session.session_date), "dd/MM/yyyy")}</span>
                                                        <span className="text-xs text-muted-foreground">{session.warehouses?.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium">{session.users_sales_sessions_user_idTousers?.full_name}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col text-sm">
                                                        <span className="text-green-600">In: {session.shift_opened_at ? formatTimeNoTz(session.shift_opened_at) : '--:--'}</span>
                                                        <span className="text-blue-600">Out: {session.shift_closed_at ? formatTimeNoTz(session.shift_closed_at) : '--:--'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold text-green-700">{formatCurrency(session.total_revenue || 0)}</span>
                                                        <span className="text-xs text-muted-foreground">{session.total_orders} đơn</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className="font-medium">{formatCurrency(session.cash_revenue || 0)}</span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={cn(
                                                        "font-medium",
                                                        (session.cash_difference || 0) < 0 ? "text-red-500" : "text-green-500"
                                                    )}>
                                                        {session.cash_difference != null ? formatCurrency(session.cash_difference) : '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={session.status === 'COMPLETED' ? 'default' : (session.status === 'IN_PROGRESS' ? 'outline' : 'secondary')}>
                                                        {session.status === 'IN_PROGRESS' ? 'Đang mở' :
                                                            session.status === 'PENDING_APPROVAL' ? 'Chờ duyệt' :
                                                                session.status === 'COMPLETED' ? 'Hoàn thành' :
                                                                    session.status === 'REJECTED' ? 'Từ chối' : session.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" onClick={() => setSelectedSession(session)}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-4">
                                {sessions.map((session) => (
                                    <Card key={session.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                        <CardHeader className="p-4 bg-muted/40 border-b flex flex-row items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-primary/10 rounded-full">
                                                    <Store className="h-4 w-4 text-primary" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-sm">
                                                        {session.warehouses?.name || 'Unknown Warehouse'}
                                                    </h3>
                                                    <p className="text-xs text-muted-foreground">
                                                        {format(new Date(session.session_date), "dd/MM/yyyy")}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge variant={session.status === 'COMPLETED' ? 'default' : (session.status === 'IN_PROGRESS' ? 'outline' : 'secondary')}>
                                                {session.status === 'IN_PROGRESS' ? 'Đang mở' :
                                                    session.status === 'PENDING_APPROVAL' ? 'Chờ duyệt' :
                                                        session.status === 'COMPLETED' ? 'Hoàn thành' :
                                                            session.status === 'REJECTED' ? 'Từ chối' : session.status}
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="p-4">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-1">Nhân viên</p>
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3 w-3 text-muted-foreground" />
                                                        <span className="text-sm font-medium">{session.users_sales_sessions_user_idTousers?.full_name}</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-1">Giờ làm việc</p>
                                                    <div className="text-sm">
                                                        <span className="text-green-600">{session.shift_opened_at ? formatTimeNoTz(session.shift_opened_at) : '--:--'}</span>
                                                        <span className="mx-1 text-muted-foreground">-</span>
                                                        <span className="text-blue-600">{session.shift_closed_at ? formatTimeNoTz(session.shift_closed_at) : '--:--'}</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-1">Doanh thu</p>
                                                    <div className="flex items-center gap-1">
                                                        <DollarSign className="h-3 w-3 text-green-600" />
                                                        <span className="text-sm font-bold text-green-700">
                                                            {formatCurrency(session.total_revenue || 0)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-1">Chênh lệch</p>
                                                    <div className="text-sm font-medium">
                                                        {session.cash_difference != null ? (
                                                            <span className={session.cash_difference < 0 ? "text-red-500" : "text-green-500"}>
                                                                {formatCurrency(session.cash_difference)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center pt-2 border-t">
                                                <div className="text-xs text-muted-foreground">
                                                    Đơn hàng: <b>{session.total_orders || 0}</b>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1 group"
                                                    onClick={() => setSelectedSession(session)}
                                                >
                                                    Xem chi tiết
                                                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            Trước
                        </Button>
                        <div className="flex items-center px-4">
                            <span className="text-sm">Trang {page} / {totalPages}</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            Sau
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={!!selectedSession} onOpenChange={(open) => !open && setSelectedSession(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Chi tiết ca bán hàng</DialogTitle>
                    </DialogHeader>
                    {selectedSession && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Nhân viên</Label>
                                    <div className="font-medium">{selectedSession.users_sales_sessions_user_idTousers?.full_name}</div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Ngày</Label>
                                    <div className="font-medium">{format(new Date(selectedSession.session_date), "dd/MM/yyyy")}</div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Kho hàng</Label>
                                    <div className="font-medium">{selectedSession.warehouses?.name}</div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Trạng thái</Label>
                                    <Badge variant={selectedSession.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                        {selectedSession.status === 'IN_PROGRESS' ? 'Đang mở' :
                                            selectedSession.status === 'PENDING_APPROVAL' ? 'Chờ duyệt' :
                                                selectedSession.status === 'COMPLETED' ? 'Hoàn thành' : selectedSession.status}
                                    </Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                                <div className="text-center space-y-1">
                                    <div className="text-xs text-muted-foreground">Bắt đầu</div>
                                    <div className="font-mono font-medium text-green-700">
                                        {selectedSession.shift_opened_at ? formatTimeNoTz(selectedSession.shift_opened_at) : '--:--'}
                                    </div>
                                </div>
                                <div className="text-center space-y-1">
                                    <div className="text-xs text-muted-foreground">Kết thúc</div>
                                    <div className="font-mono font-medium text-blue-700">
                                        {selectedSession.shift_closed_at ? formatTimeNoTz(selectedSession.shift_closed_at) : '--:--'}
                                    </div>
                                </div>
                                <div className="text-center space-y-1">
                                    <div className="text-xs text-muted-foreground">Tổng giờ</div>
                                    <div className="font-mono font-medium">
                                        {selectedSession.shift_opened_at && selectedSession.shift_closed_at ? (() => {
                                            const diff = new Date(selectedSession.shift_closed_at).getTime() - new Date(selectedSession.shift_opened_at).getTime()
                                            const hrs = Math.floor(diff / 3600000)
                                            const mins = Math.floor((diff % 3600000) / 60000)
                                            return `${hrs}h ${mins}m`
                                        })() : '--'}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-semibold text-sm border-b pb-2">Thông tin tài chính</h4>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tiền đầu ca</span>
                                        <span className="font-medium">{formatCurrency(selectedSession.opening_cash)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tiền cuối ca (Thực tế)</span>
                                        <span className="font-medium">{selectedSession.closing_cash ? formatCurrency(selectedSession.closing_cash) : '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tổng Doanh Thu</span>
                                        <span className="font-bold text-green-600">{formatCurrency(selectedSession.total_revenue)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Chênh lệch</span>
                                        <span className={cn(
                                            "font-bold",
                                            (selectedSession.cash_difference || 0) < 0 ? "text-red-600" : "text-green-600"
                                        )}>
                                            {formatCurrency(selectedSession.cash_difference || 0)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-semibold text-sm border-b pb-2">Thống kê đơn hàng</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="p-3 bg-blue-50 bg-opacity-50 rounded border border-blue-100 text-center">
                                        <div className="text-xs text-blue-600 mb-1">Tổng đơn</div>
                                        <div className="font-bold text-xl">{selectedSession.total_orders}</div>
                                    </div>
                                    <div className="p-3 bg-green-50 bg-opacity-50 rounded border border-green-100 text-center">
                                        <div className="text-xs text-green-600 mb-1">Tổng tiền mặt</div>
                                        <div className="font-bold text-lg">{formatCurrency(selectedSession.cash_revenue || 0)}</div>
                                    </div>
                                    <div className="p-3 bg-orange-50 bg-opacity-50 rounded border border-orange-100 text-center">
                                        <div className="text-xs text-orange-600 mb-1">Tổng tiền ví</div>
                                        <div className="font-bold text-lg">{formatCurrency(selectedSession.ewallet_revenue || 0)}</div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
