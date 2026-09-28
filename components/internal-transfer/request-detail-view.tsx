"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    CheckCircle2,
    Clock,
    User,
    Calendar,
    Package,
    AlertCircle,
    XCircle,
    TruckIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

interface RequestDetailViewProps {
    request: any
    items: any[]
    userRole: string
}

const STEPS = [
    { id: 1, label: "Tạo Phiếu", key: "created_at" },
    { id: 2, label: "Quản Lý", key: "manager_approved_at" },
    { id: 3, label: "Tổng QL", key: "gm_approved_at" },
    { id: 4, label: "Xuất Kho", key: "exported_at" },
    { id: 5, label: "Nhận Hàng", key: "received_at" },
]

export function RequestDetailView({ request, items, userRole }: RequestDetailViewProps) {
    // Add null safety check for items
    const safeItems = items || []

    const getCurrentStepIndex = () => {
        if (request.status === "HOAN_THANH") return 5
        if (request.status === "CHO_XAC_NHAN_CHENH_LECH") return 5
        if (request.status === "DA_XUAT_KHO") return 4
        if (request.status === "CHO_KHO_TONG_XUAT") return 3
        if (request.status === "CHO_TONG_QUAN_LY_DUYET") return 2
        if (request.status === "CHO_QUAN_LY_DUYET") return 1
        if (request.status === "TU_CHOI" || request.status === "HUY_BO") return -1
        return 1
    }

    const currentStep = getCurrentStepIndex()
    const isRejected = request.status === "TU_CHOI" || request.status === "HUY_BO"

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "HOAN_THANH":
                return <Badge variant="default" className="bg-green-600 hover:bg-green-700 whitespace-nowrap"><CheckCircle2 className="w-3 h-3 mr-1" /> Hoàn thành</Badge>
            case "CHO_QUAN_LY_DUYET":
            case "CHO_TONG_QUAN_LY_DUYET":
                return <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200 whitespace-nowrap"><Clock className="w-3 h-3 mr-1" /> Đang duyệt</Badge>
            case "CHO_KHO_TONG_XUAT":
                return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200 whitespace-nowrap"><Package className="w-3 h-3 mr-1" /> Chờ xuất</Badge>
            case "DA_XUAT_KHO":
                return <Badge variant="secondary" className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200 whitespace-nowrap"><TruckIcon className="w-3 h-3 mr-1" /> Đang vận chuyển</Badge>
            case "CHO_XAC_NHAN_CHENH_LECH":
                return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800 whitespace-nowrap"><AlertCircle className="w-3 h-3 mr-1" /> Chênh lệch</Badge>
            case "TU_CHOI":
                return <Badge variant="destructive" className="whitespace-nowrap"><XCircle className="w-3 h-3 mr-1" /> Từ chối</Badge>
            case "HUY_BO":
                return <Badge variant="outline" className="whitespace-nowrap"><XCircle className="w-3 h-3 mr-1" /> Hủy bỏ</Badge>
            default:
                return <Badge variant="outline" className="whitespace-nowrap">{status}</Badge>
        }
    }

    return (
        <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto pb-10">
            {/* 1. Header & Info Card */}
            <Card className="border-border/60 shadow-sm overflow-hidden rounded-xl">
                <div className="bg-muted/30 p-4 md:p-6 border-b border-border/50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground leading-tight">
                                {request.request_number || "ITR-####"}
                            </h2>
                            <div className="flex items-center text-xs md:text-sm text-muted-foreground bg-background/50 px-2 py-1 rounded-md w-fit">
                                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                {request.created_at ? format(new Date(request.created_at), "dd/MM/yyyy HH:mm") : "N/A"}
                            </div>
                        </div>
                        <div className="shrink-0 scale-100 md:scale-110 origin-left md:origin-right">
                            {getStatusBadge(request.status)}
                        </div>
                    </div>
                </div>

                <CardContent className="p-4 md:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                        {/* Warehouse Route */}
                        <div className="flex gap-4 items-start">
                            {/* Visual Timeline Column */}
                            <div className="flex flex-col items-center pt-2 h-full min-h-[5rem]">
                                <div className="w-4 h-4 rounded-full border-[3px] border-primary bg-background shadow-sm z-10" />
                                <div className="w-[2px] flex-1 bg-gradient-to-b from-primary/50 to-muted my-1.5" />
                                <div className="w-4 h-4 rounded-full border-[3px] border-orange-500 bg-background shadow-sm z-10" />
                            </div>

                            {/* Text Content Column */}
                            <div className="flex flex-col gap-6 flex-1 py-0.5">
                                <div>
                                    <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Kho Xuất (Từ)</p>
                                    <p className="font-semibold text-foreground text-base md:text-lg leading-tight">{request.from_warehouse_name}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Kho Nhập (Đến)</p>
                                    <p className="font-semibold text-foreground text-base md:text-lg leading-tight">{request.to_warehouse_name}</p>
                                </div>
                            </div>
                        </div>

                        {/* People Involvement - Grid on Desktop */}
                        <div className="bg-muted/10 rounded-lg p-0 md:p-4 border-0 md:border md:border-border/40">
                            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-1 md:gap-4 h-full">
                                <div className="flex flex-row items-center justify-between md:border-b md:border-border/40 md:pb-3 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <User className="w-4 h-4" />
                                        <span className="text-sm md:text-base">Người tạo</span>
                                    </div>
                                    <span className="font-medium text-sm md:text-base text-right">{request.created_by_name || "—"}</span>
                                </div>

                                <div className="flex flex-row items-center justify-between md:border-b md:border-border/40 md:pb-3 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-sm md:text-base">Quản lý duyệt</span>
                                    </div>
                                    <span className="font-medium text-sm md:text-base text-right">{request.manager_approved_by_name || "—"}</span>
                                </div>

                                {request.exported_by_name && (
                                    <div className="flex flex-row items-center justify-between">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <TruckIcon className="w-4 h-4" />
                                            <span className="text-sm md:text-base">Người xuất</span>
                                        </div>
                                        <span className="font-medium text-sm md:text-base text-right">{request.exported_by_name}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 2. Process Timeline - Adaptive Layout */}
            <Card className="border-border/60 shadow-sm rounded-xl">
                <div className="p-3 md:p-4 border-b border-border/50 bg-muted/10">
                    <h3 className="font-semibold text-sm md:text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" /> Tiến độ xử lý
                    </h3>
                </div>
                <CardContent className="p-4 md:p-6">
                    {/* Mobile: Vertical Timeline */}
                    <div className="block md:hidden relative pl-4 space-y-6">
                        <div className="absolute left-[22px] top-3 bottom-5 w-[2px] bg-muted -z-10" />
                        {STEPS.map((step, index) => {
                            const isCompleted = currentStep > index
                            const isCurrent = currentStep === index + 1
                            const stepDate = request[step.key]
                            return (
                                <div key={step.id} className="relative flex items-start gap-3">
                                    <div className={cn(
                                        "w-5 h-5 rounded-full flex items-center justify-center border-2 border-background z-10 shrink-0 mt-0.5",
                                        isCompleted ? "bg-primary border-primary text-primary-foreground" :
                                            isCurrent ? "bg-background border-primary border-4 w-5 h-5" : "bg-muted border-muted"
                                    )}>
                                        {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                                    </div>
                                    <div className="flex-1 -mt-0.5">
                                        <p className={cn("text-sm font-medium", isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{stepDate ? format(new Date(stepDate), "dd/MM HH:mm") : isCurrent ? "Đang xử lý..." : ""}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Desktop: Horizontal Timeline */}
                    <div className="hidden md:flex items-center justify-between relative px-4">
                        <div className="absolute left-4 right-4 top-[1.125rem] h-0.5 bg-muted -z-10" />
                        {STEPS.map((step, index) => {
                            const isCompleted = currentStep > index
                            const isCurrent = currentStep === index + 1
                            const stepDate = request[step.key]
                            return (
                                <div key={step.id} className="flex flex-col items-center gap-3 text-center min-w-[5rem]">
                                    <div className={cn(
                                        "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-200 bg-background",
                                        isCompleted ? "bg-primary border-primary text-primary-foreground" :
                                            isCurrent ? "border-primary text-primary ring-4 ring-primary/10" : "border-muted text-muted-foreground"
                                    )}>
                                        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> :
                                            isCurrent ? <div className="w-3 h-3 bg-primary rounded-full animate-pulse" /> :
                                                <span className="text-sm font-medium">{step.id}</span>
                                        }
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <div className={cn("text-sm font-bold whitespace-nowrap", isCurrent ? "text-primary" : "text-foreground")}>{step.label}</div>
                                        {stepDate && <div className="text-xs text-muted-foreground mt-0.5 font-medium">{format(new Date(stepDate), "dd/MM HH:mm")}</div>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* 3. Product List */}
            <Card className="border-border/60 shadow-sm rounded-xl">
                <div className="p-3 md:p-4 border-b border-border/50 bg-muted/10 flex items-center justify-between">
                    <h3 className="font-semibold text-sm md:text-base flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" /> Chi Tiết Sản Phẩm
                    </h3>
                    <Badge variant="secondary" className="font-normal">{safeItems.length} mặt hàng</Badge>
                </div>

                {/* Desktop Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-border/50 bg-muted/5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-4">Sản phẩm</div>
                    <div className="col-span-2 text-right">Yêu cầu</div>
                    <div className="col-span-2 text-right">Đã duyệt</div>
                    <div className="col-span-2 text-right">Thực xuất</div>
                    <div className="col-span-2 text-right">Thực nhận</div>
                </div>

                <div className="divide-y divide-border/50">
                    {safeItems.map((item, idx) => (
                        <div key={idx} className="p-4 hover:bg-muted/10 transition-colors">
                            {/* Mobile View */}
                            <div className="md:hidden flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm text-primary">{item.product_name}</span>
                                    {item.product_code && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">{item.product_code}</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs bg-muted/30 p-3 rounded-md">
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-[10px] uppercase">Yêu cầu</span>
                                        <span className="font-medium mt-0.5">{item.requested_quantity} {item.requested_unit_name}</span>
                                    </div>
                                    <div className="flex flex-col border-l border-border/50 pl-3">
                                        <span className="text-muted-foreground text-[10px] uppercase">Duyệt</span>
                                        <span className={cn("font-medium mt-0.5", item.manager_quantity > 0 && item.manager_quantity !== item.requested_quantity ? "text-amber-600" : "")}>
                                            {item.manager_quantity > 0 ? item.manager_quantity : "—"} {item.manager_quantity > 0 && <span className="text-[10px] text-muted-foreground">{item.manager_unit_name}</span>}
                                        </span>
                                    </div>
                                    <div className="flex flex-col border-t border-border/50 pt-2 mt-1">
                                        <span className="text-muted-foreground text-[10px] uppercase">Thực xuất</span>
                                        <span className={cn("font-medium mt-0.5", item.exported_quantity > 0 ? "text-blue-600" : "")}>
                                            {item.exported_quantity > 0 ? item.exported_quantity : "—"} {item.exported_quantity > 0 && <span className="text-[10px] text-muted-foreground">{item.exported_unit_name}</span>}
                                        </span>
                                    </div>
                                    <div className="flex flex-col border-t border-l border-border/50 pt-2 pl-3 mt-1">
                                        <span className="text-muted-foreground text-[10px] uppercase">Thực nhận</span>
                                        <span className={cn("font-medium mt-0.5", item.received_quantity > 0 ? "text-green-600" : "")}>
                                            {item.received_quantity > 0 ? item.received_quantity : "—"} {item.received_quantity > 0 && <span className="text-[10px] text-muted-foreground">{item.received_unit_name}</span>}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Desktop View - Grid Aligned with Header */}
                            <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                                <div className="col-span-4 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center text-muted-foreground">
                                        <Package className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-foreground">{item.product_name}</p>
                                        {item.product_code && <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.product_code}</p>}
                                    </div>
                                </div>

                                <div className="col-span-2 text-right">
                                    <span className="font-semibold text-sm">{item.requested_quantity}</span>
                                    <span className="text-xs text-muted-foreground ml-1">{item.requested_unit_name}</span>
                                </div>

                                <div className="col-span-2 text-right">
                                    {item.manager_quantity > 0 ? (
                                        <>
                                            <span className={cn("font-semibold text-sm", item.manager_quantity !== item.requested_quantity ? "text-amber-600" : "")}>
                                                {item.manager_quantity}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-1">{item.manager_unit_name}</span>
                                            {item.manager_quantity !== item.requested_quantity && (
                                                <div className="text-[10px] text-amber-600 font-medium">Điều chỉnh</div>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">—</span>
                                    )}
                                </div>

                                <div className="col-span-2 text-right">
                                    {item.exported_quantity > 0 ? (
                                        <>
                                            <span className="font-semibold text-sm text-blue-600">
                                                {item.exported_quantity}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-1">{item.exported_unit_name}</span>
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">—</span>
                                    )}
                                </div>

                                <div className="col-span-2 text-right">
                                    {item.received_quantity > 0 ? (
                                        <>
                                            <span className="font-semibold text-sm text-green-600">
                                                {item.received_quantity}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-1">{item.received_unit_name}</span>
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">—</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {request.rejection_reason && (
                <Card className="border-red-200 bg-red-50/50 rounded-xl">
                    <CardContent className="p-4 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-red-900 text-sm md:text-base">Lý do từ chối/hủy</p>
                            <p className="text-red-800 text-sm md:text-base mt-1">{request.rejection_reason}</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
