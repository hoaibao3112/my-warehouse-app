"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, Clock, CheckCircle, XCircle, AlertCircle, TruckIcon, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { RequestDetailView } from "@/components/internal-transfer/request-detail-view"
import { ExportForm } from "@/components/internal-transfer/export-form"
import { DiscrepancyConfirmForm } from "@/components/internal-transfer/discrepancy-confirm-form"
import { ManagerApprovalForm } from "@/components/internal-transfer/manager-approval-form"
import { GmApprovalView } from "@/components/internal-transfer/gm-approval-view"
import { mobileFetch } from "@/lib/mobile/api-client"

// Define types based on what we see in the code
interface Request {
    id: string
    request_number: string
    status: string
    from_warehouse_name: string
    to_warehouse_name: string
    created_by_name: string
    created_at: string | Date
    [key: string]: any
}

interface ListViewProps {
    initialRequests: Request[]
    units: any[] // For ExportForm
    currentUserRole?: string
}

const STATUS_CONFIG: Record<string, { label: string; variant: any; icon: any }> = {
    CHO_QUAN_LY_DUYET: {
        label: "Chờ QL duyệt",
        variant: "secondary",
        icon: Clock
    },
    CHO_TONG_QUAN_LY_DUYET: {
        label: "Chờ TQL duyệt",
        variant: "secondary",
        icon: Clock
    },
    CHO_KHO_TONG_XUAT: {
        label: "Chờ xuất kho",
        variant: "default",
        icon: TruckIcon
    },
    DA_XUAT_KHO: {
        label: "Đã xuất - Chờ nhận",
        variant: "default",
        icon: AlertCircle
    },
    CHO_XAC_NHAN_CHENH_LECH: {
        label: "Chờ xác nhận CL",
        variant: "outline",
        icon: AlertCircle
    },
    HOAN_THANH: {
        label: "Hoàn thành",
        variant: "default",
        icon: CheckCircle
    },
    TU_CHOI: {
        label: "Từ chối",
        variant: "destructive",
        icon: XCircle
    },
    HUY_BO: {
        label: "Hủy bỏ",
        variant: "outline",
        icon: XCircle
    }
}

const TABS = [
    { value: "pending", label: "Cần xử lý", statuses: "CHO_KHO_TONG_XUAT,CHO_XAC_NHAN_CHENH_LECH" },
    { value: "processing", label: "Đang xử lý", statuses: "CHO_QUAN_LY_DUYET,CHO_TONG_QUAN_LY_DUYET,DA_XUAT_KHO" },
    { value: "completed", label: "Đã hoàn thành", statuses: "HOAN_THANH,TU_CHOI,HUY_BO" },
    { value: "all", label: "Tất cả", statuses: "" },
]

export function InternalTransferListView({ initialRequests, units, currentUserRole }: ListViewProps) {
    const [requests, setRequests] = useState<Request[]>(initialRequests)
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState("pending")
    const [page, setPage] = useState(1)
    const [pagination, setPagination] = useState({ totalPages: 1, totalRecords: 0 })

    const [selectedRequest, setSelectedRequest] = useState<Request | null>(null)
    const [detailData, setDetailData] = useState<any>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const fetchRequests = useCallback(async (tabValue: string, pageNum: number) => {
        setLoading(true)
        try {
            const tab = TABS.find(t => t.value === tabValue)
            const statusParam = tab?.statuses ? `&status=${tab.statuses}` : ""

            const res = await mobileFetch(`/api/internal-transfer-requests?page=${pageNum}&limit=10${statusParam}`, {
                cache: "no-store"
            })

            if (res.ok) {
                const json = await res.json()
                if (json.success) {
                    setRequests(json.data)
                    if (json.pagination) {
                        setPagination({
                            totalPages: json.pagination.totalPages,
                            totalRecords: json.pagination.totalRecords
                        })
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching requests:", error)
        } finally {
            setLoading(false)
        }
    }, [])

    // Initial fetch for the default tab
    useEffect(() => {
        fetchRequests(activeTab, page)
    }, [activeTab, page, fetchRequests])

    const handleTabChange = (value: string) => {
        setActiveTab(value)
        setPage(1) // Reset to page 1 on tab change
    }

    const handleViewDetail = async (request: Request) => {
        setSelectedRequest(request)
        setIsDialogOpen(true)
        setLoadingDetail(true)
        setDetailData(null)

        try {
            const res = await mobileFetch(`/api/internal-transfer-requests/${request.id}`)
            if (!res.ok) throw new Error("Failed to fetch details")
            const json = await res.json()
            if (json.success) {
                setDetailData(json.data)
            }
        } catch (error) {
            console.error("Error fetching details:", error)
        } finally {
            setLoadingDetail(false)
        }
    }

    const refreshList = () => {
        fetchRequests(activeTab, page)
    }

    const renderRequestCard = (request: Request) => {
        const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.CHO_QUAN_LY_DUYET
        const StatusIcon = statusConfig.icon

        return (
            <Card key={request.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                        <div className="space-y-2 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-lg">{request.request_number}</span>
                                <Badge variant={statusConfig.variant} className="h-6">
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    {statusConfig.label}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground">Từ:</span> {request.from_warehouse_name}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground">Đến:</span> {request.to_warehouse_name}
                                </div>
                                <div className="flex items-center gap-2 sm:col-span-2">
                                    <span className="font-medium text-foreground">Tạo bởi:</span> {request.created_by_name}
                                    <span className="mx-1">•</span>
                                    {new Date(request.created_at).toLocaleString("vi-VN")}
                                </div>
                            </div>
                        </div>

                        <div className="flex sm:flex-col gap-2 shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full gap-2"
                                onClick={() => handleViewDetail(request)}
                            >
                                <Eye className="h-4 w-4" />
                                Chi tiết
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const renderDetailContent = () => {
        if (loadingDetail) {
            return (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )
        }

        if (!detailData) {
            return (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Không tìm thấy thông tin chi tiết</p>
                </div>
            )
        }

        const { items, ...requestInfo } = detailData

        let ActionComponent = null

        // Admin có thể duyệt ở mọi trạng thái
        if (requestInfo.status === "CHO_QUAN_LY_DUYET") {
            // Duyệt như Manager
            ActionComponent = (
                <ManagerApprovalForm
                    requestId={requestInfo.id}
                    items={items}
                    productUnitsMap={requestInfo.productUnitsMap}
                    onSuccess={() => {
                        setIsDialogOpen(false)
                        refreshList()
                    }}
                />
            )
        } else if (requestInfo.status === "CHO_TONG_QUAN_LY_DUYET") {
            // Duyệt như GM
            ActionComponent = (
                <GmApprovalView
                    requestId={requestInfo.id}
                    items={items}
                    productUnitsMap={requestInfo.productUnitsMap}
                    warehouseName={requestInfo.to_warehouse_name || ""}
                    onSuccess={() => {
                        setIsDialogOpen(false)
                        refreshList()
                    }}
                />
            )
        } else if (requestInfo.status === "CHO_KHO_TONG_XUAT") {
            ActionComponent = (
                <ExportForm
                    requestId={requestInfo.id}
                    items={items}
                    units={units}
                    productUnitsMap={requestInfo.productUnitsMap}
                    toWarehouseName={requestInfo.to_warehouse_name}
                    onSuccess={() => {
                        setIsDialogOpen(false)
                        refreshList()
                    }}
                />
            )
        } else if (requestInfo.status === "CHO_XAC_NHAN_CHENH_LECH") {
            ActionComponent = (
                <DiscrepancyConfirmForm
                    requestId={requestInfo.id}
                    items={items}
                    onSuccess={() => {
                        setIsDialogOpen(false)
                        refreshList()
                    }}
                />
            )
        }

        return (
            <div className="space-y-6 max-h-[80vh] overflow-y-auto px-1">
                {ActionComponent}

                <RequestDetailView
                    request={requestInfo}
                    items={items}
                    userRole={currentUserRole || ""}
                />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background pb-8">
            <MobilePageHeader
                title="Quản Lý Nhập Hàng Nội Bộ"
                subtitle="Xử lý xuất hàng cho các kho con"
                headerIcon={<TruckIcon className="w-5 h-5" />}
            />

            <div className="container mx-auto max-w-5xl p-4 md:p-8 space-y-6">

                {/* Helper Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Chi tiết phiếu yêu cầu</DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 overflow-hidden">
                            {renderDetailContent()}
                        </div>
                    </DialogContent>
                </Dialog>

                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-[600px]">
                        {TABS.map(tab => (
                            <TabsTrigger key={tab.value} value={tab.value}>
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <div className="mt-6 min-h-[400px]">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-muted-foreground">Đang tải dữ liệu...</p>
                            </div>
                        ) : requests.length === 0 ? (
                            <Card className="bg-muted/30 border-dashed">
                                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <p>Không có dữ liệu cho mục này.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-4">
                                    {requests.map(renderRequestCard)}
                                </div>

                                {/* Pagination */}
                                {pagination.totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 py-4">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page <= 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium">
                                            Trang {page} / {pagination.totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                            disabled={page >= pagination.totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Tabs>
            </div>
        </div>
    )
}
