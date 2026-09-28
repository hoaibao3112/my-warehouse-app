"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, ArrowDownToLine, ArrowRight, User, Clock, Search } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RequestDetailView } from "@/components/internal-transfer/request-detail-view"
import { ExportForm } from "@/components/internal-transfer/export-form"
import { DiscrepancyConfirmForm } from "@/components/internal-transfer/discrepancy-confirm-form"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: any }> = {
    CHO_KHO_TONG_XUAT: { label: "Chờ Xuất", variant: "default", icon: ArrowDownToLine },
    DA_XUAT_KHO: { label: "Đã Xuất", variant: "secondary", icon: Eye },
    CHO_XAC_NHAN_CHENH_LECH: { label: "Chờ XN Chênh Lệch", variant: "warning", icon: Eye },
    HOAN_THANH: { label: "Hoàn Thành", variant: "success", icon: Eye },
}

export default function WarehouseInternalTransfersPage() {
    const [requests, setRequests] = useState<any[]>([])
    const [filteredRequests, setFilteredRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedRequest, setSelectedRequest] = useState<{ request: any, items: any[] } | null>(null)
    const [viewDetailOpen, setViewDetailOpen] = useState(false)
    const [detailLoading, setDetailLoading] = useState(false)
    const [productUnitsMap, setProductUnitsMap] = useState<Record<string, any[]>>({})
    const [searchTerm, setSearchTerm] = useState("")

    // Filter states
    const [fromDate, setFromDate] = useState("")
    const [toDate, setToDate] = useState("")
    const [filterWarehouse, setFilterWarehouse] = useState("")
    const [warehouses, setWarehouses] = useState<any[]>([])

    const { user, loading: authLoading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/login")
                return
            }
            // Only MANAGER (main warehouse manager), ADMIN, or WAREHOUSE_STAFF can access
            if (user.role !== "MANAGER" && user.role !== "ADMIN" && user.role !== "WAREHOUSE_STAFF") {
                router.push("/")
                return
            }
            fetchRequests()
            fetchWarehouses()
        }
    }, [user, authLoading, router])

    // Re-fetch when filters change
    useEffect(() => {
        if (user) {
            fetchRequests()
        }
    }, [fromDate, toDate, filterWarehouse])

    useEffect(() => {
        const lower = searchTerm.toLowerCase()
        const filtered = requests.filter(r =>
            r.request_number?.toLowerCase().includes(lower) ||
            r.to_warehouse_name?.toLowerCase().includes(lower) ||
            r.created_by_name?.toLowerCase().includes(lower)
        )
        setFilteredRequests(filtered)
    }, [searchTerm, requests])

    const fetchRequests = async () => {
        try {
            // Build query params
            const params = new URLSearchParams()
            if (fromDate) params.append('fromDate', fromDate)
            if (toDate) params.append('toDate', toDate)
            if (filterWarehouse) params.append('warehouseId', filterWarehouse)

            const url = `/api/internal-transfer-requests${params.toString() ? '?' + params.toString() : ''}`
            const response = await mobileFetch(url)
            const json = await response.json()

            if (json.success) {
                // Filter to show only requests that main warehouse needs to handle
                const filtered = json.data.filter((req: any) =>
                    ["CHO_KHO_TONG_XUAT", "DA_XUAT_KHO", "CHO_XAC_NHAN_CHENH_LECH", "HOAN_THANH"].includes(req.status)
                )
                setRequests(filtered)
                setFilteredRequests(filtered)
            }
        } catch (error) {
            console.error("Failed to fetch requests:", error)
            toast({ variant: "destructive", title: "Lỗi", description: "Không thể tải danh sách phiếu" })
        } finally {
            setLoading(false)
        }
    }

    const fetchWarehouses = async () => {
        try {
            const res = await mobileFetch('/api/warehouses?page=1&pageSize=100')
            const json = await res.json()
            if (json.success) {
                setWarehouses(json.data || [])
            }
        } catch (err) {
            console.error('Failed to load warehouses:', err)
        }
    }

    const handleViewDetail = async (requestId: string) => {
        setDetailLoading(true)
        setViewDetailOpen(true)
        try {
            const res = await mobileFetch(`/api/internal-transfer-requests/${requestId}`)
            const json = await res.json()
            if (json.success) {
                setSelectedRequest({ request: json.data, items: json.data.items || [] })

                // Use productUnitsMap from API response directly
                // The API already provides correct conversion data with base_quantity
                if (json.data.productUnitsMap) {
                    console.log('[PAGE] Using productUnitsMap from API:', json.data.productUnitsMap)
                    setProductUnitsMap(json.data.productUnitsMap)
                } else {
                    console.warn('[PAGE] No productUnitsMap in API response')
                    setProductUnitsMap({})
                }
            }
        } catch (err) {
            toast({ variant: "destructive", title: "Lỗi", description: "Không thể tải chi tiết" })
            setViewDetailOpen(false)
        } finally {
            setDetailLoading(false)
        }
    }

    const handleActionSuccess = () => {
        setViewDetailOpen(false)
        fetchRequests()
        toast({ description: "Đã cập nhật phiếu yêu cầu" })
    }

    if (authLoading || loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Xuất Hàng Nội Bộ</h1>
                    <p className="text-muted-foreground">Quản lý và xử lý các yêu cầu xuất hàng cho kho con</p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Tìm theo mã, kho, người tạo..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Date Range and Warehouse Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Từ ngày</label>
                            <Input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="h-10"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Đến ngày</label>
                            <Input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="h-10"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Kho</label>
                            <select
                                value={filterWarehouse}
                                onChange={(e) => setFilterWarehouse(e.target.value)}
                                className="w-full h-10 px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="">Tất cả kho</option>
                                {warehouses.map((wh) => (
                                    <option key={wh.id} value={wh.id}>
                                        {wh.name} ({wh.code})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setFromDate("")
                                    setToDate("")
                                    setFilterWarehouse("")
                                }}
                                className="w-full h-10"
                            >
                                Xóa bộ lọc
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {filteredRequests.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <ArrowDownToLine className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground font-medium">Không có phiếu nào cần xử lý</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Desktop View: Table */}
                    <div className="hidden md:block border rounded-lg overflow-hidden shadow-sm bg-white">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Mã Phiếu</TableHead>
                                    <TableHead>Từ Kho</TableHead>
                                    <TableHead>Đến Kho</TableHead>
                                    <TableHead>Người Tạo</TableHead>
                                    <TableHead>Ngày Tạo</TableHead>
                                    <TableHead>Trạng Thái</TableHead>
                                    <TableHead className="text-right">Hành Động</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRequests.map((request) => {
                                    const config = STATUS_CONFIG[request.status]
                                    return (
                                        <TableRow key={request.id} className="hover:bg-muted/5">
                                            <TableCell className="font-semibold">{request.request_number}</TableCell>
                                            <TableCell>{request.from_warehouse_name}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                                    {request.to_warehouse_name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <User className="w-3 h-3 text-muted-foreground" />
                                                    {request.created_by_name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {format(new Date(request.created_at), "dd/MM/yyyy HH:mm")}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={config?.variant as any || "outline"}>
                                                    {config?.label || request.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="outline" onClick={() => handleViewDetail(request.id)}>
                                                    <Eye className="w-3 h-3 mr-1" /> Chi tiết
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile View: Cards */}
                    <div className="md:hidden space-y-4">
                        {filteredRequests.map((request) => {
                            const config = STATUS_CONFIG[request.status]
                            const StatusIcon = config?.icon || Eye

                            return (
                                <Card key={request.id} className="overflow-hidden shadow-sm border-border/60 active:scale-[0.99] transition-transform">
                                    <div
                                        className="p-0 cursor-pointer group"
                                        onClick={() => handleViewDetail(request.id)}
                                    >
                                        {/* Header */}
                                        <div className="flex items-center justify-between p-3 pb-2 bg-muted/10 border-b border-border/40">
                                            <span className="font-bold text-sm text-foreground">{request.request_number}</span>
                                            <Badge variant={config?.variant as any} className="text-[10px] px-2 py-0.5 h-auto">
                                                {config?.label}
                                            </Badge>
                                        </div>

                                        {/* Content */}
                                        <div className="p-3 bg-card space-y-3">
                                            <div className="flex items-center gap-2 text-sm">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5">Từ</p>
                                                    <p className="font-medium truncate" title={request.from_warehouse_name}>{request.from_warehouse_name}</p>
                                                </div>
                                                <div className="shrink-0 text-muted-foreground/40 px-1">
                                                    <ArrowRight className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0 text-right">
                                                    <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5">Đến</p>
                                                    <p className="font-medium truncate" title={request.to_warehouse_name}>{request.to_warehouse_name}</p>
                                                </div>
                                            </div>

                                            <div className="h-px bg-border/40 w-full" />

                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <User className="w-3 h-3" />
                                                    <span className="truncate max-w-[100px]">{request.created_by_name}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{format(new Date(request.created_at), "dd/MM HH:mm")}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <div className="bg-muted/5 p-3 border-t border-border/40">
                                            <Button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleViewDetail(request.id)
                                                }}
                                                size="sm"
                                                className="w-full gap-2"
                                                variant="default"
                                            >
                                                <Eye className="w-4 h-4" />
                                                Chi tiết
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                </>
            )}

            {/* Detail Dialog */}
            <Dialog open={viewDetailOpen} onOpenChange={setViewDetailOpen}>
                <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto bg-background p-0">
                    <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle>Chi Tiết Phiếu Xuất Hàng</DialogTitle>
                    </DialogHeader>

                    <div className="p-4 md:p-6">
                        {detailLoading ? (
                            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                        ) : selectedRequest ? (
                            <div className="space-y-6">
                                {/* Export Form for CHO_KHO_TONG_XUAT status */}
                                {selectedRequest.request.status === "CHO_KHO_TONG_XUAT" && (
                                    <ExportForm
                                        requestId={selectedRequest.request.id}
                                        items={selectedRequest.items}
                                        productUnitsMap={productUnitsMap}
                                        onSuccess={handleActionSuccess}
                                    />
                                )}

                                {/* Discrepancy Confirm Form for CHO_XAC_NHAN_CHENH_LECH status */}
                                {selectedRequest.request.status === "CHO_XAC_NHAN_CHENH_LECH" && (
                                    <DiscrepancyConfirmForm
                                        requestId={selectedRequest.request.id}
                                        items={selectedRequest.items}
                                        onSuccess={handleActionSuccess}
                                    />
                                )}

                                {/* Detail View - Only show when NOT in export mode */}
                                {selectedRequest.request.status !== "CHO_KHO_TONG_XUAT" && selectedRequest.request.status !== "CHO_XAC_NHAN_CHENH_LECH" && (
                                    <RequestDetailView
                                        request={selectedRequest.request}
                                        items={selectedRequest.items}
                                        userRole={user?.role || "STAFF"}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="text-center p-8 text-muted-foreground">Không có dữ liệu</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
