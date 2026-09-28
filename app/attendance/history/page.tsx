"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    CheckCircle,
    XCircle,
    AlertCircle,
    ChevronDown,
    History,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AttendanceStatus, getStatusLabel, determineAttendanceStatus, getStatusColor } from "@/lib/shift-status"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function AttendanceHistoryPage() {
    const [history, setHistory] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"))
    const [statusFilter, setStatusFilter] = useState("ALL")
    const [showFilters, setShowFilters] = useState(false)

    useEffect(() => {
        fetchHistory()
    }, [selectedMonth, statusFilter])

    const fetchHistory = async () => {
        try {
            setLoading(true)
            const [year, month] = selectedMonth.split("-")

            const res = await mobileFetch(`/api/shifts/my-schedule?year=${year}&month=${month}`)
            const json = await res.json()

            if (json.success) {
                // Combine assignments and sessions
                const combined = json.data.assignments.map((assignment: any) => {
                    const session = json.data.sessions.find(
                        (s: any) =>
                            format(new Date(s.session_date), "yyyy-MM-dd") ===
                            format(new Date(assignment.assigned_date), "yyyy-MM-dd")
                    )
                    return { assignment, session }
                })

                setHistory(combined)
            }
        } catch (error) {
            console.error("Error fetching history:", error)
            toast.error("Không thể tải lịch sử chấm công")
        } finally {
            setLoading(false)
        }
    }

    const getAttendanceStatus = (assignment: any, session: any) => {
        // Use the proper attendance status determination logic
        const status = determineAttendanceStatus(
            assignment,
            session,
            assignment?.work_shifts
        )
        return status
    }

    const getStatusIcon = (status: AttendanceStatus | string) => {
        switch (status) {
            case AttendanceStatus.COMPLETED_ON_TIME:
            case AttendanceStatus.ON_TIME:
                return <CheckCircle className="h-4 w-4 text-green-600" />
            case AttendanceStatus.LATE_CHECKIN:
            case AttendanceStatus.EARLY_CHECKOUT:
                return <AlertCircle className="h-4 w-4 text-orange-600" />
            case AttendanceStatus.INCOMPLETE:
                return <Clock className="h-4 w-4 text-yellow-600" />
            case AttendanceStatus.ABSENT:
                return <XCircle className="h-4 w-4 text-red-600" />
            case AttendanceStatus.SCHEDULED_PENDING:
            case AttendanceStatus.SCHEDULED_FUTURE:
                return <Calendar className="h-4 w-4 text-gray-600" />
            default:
                return <AlertCircle className="h-4 w-4 text-gray-600" />
        }
    }

    const getStatusBadge = (status: AttendanceStatus | string) => {
        const config: Record<string, { variant: any; label: string; color: string }> = {
            [AttendanceStatus.COMPLETED_ON_TIME]: { variant: "default", label: "Hoàn thành đúng giờ", color: "bg-green-100 text-green-800" },
            [AttendanceStatus.ON_TIME]: { variant: "default", label: "Đúng giờ", color: "bg-green-100 text-green-800" },
            [AttendanceStatus.LATE_CHECKIN]: { variant: "default", label: "Đi muộn", color: "bg-orange-100 text-orange-800" },
            [AttendanceStatus.EARLY_CHECKOUT]: { variant: "default", label: "Về sớm", color: "bg-orange-100 text-orange-800" },
            [AttendanceStatus.INCOMPLETE]: { variant: "default", label: "Chưa chấm công", color: "bg-yellow-100 text-yellow-800" },
            [AttendanceStatus.ABSENT]: { variant: "destructive", label: "Vắng mặt", color: "bg-red-100 text-red-800" },
            [AttendanceStatus.SCHEDULED_PENDING]: { variant: "outline", label: "Chờ chấm công", color: "bg-yellow-100 text-yellow-800" },
            [AttendanceStatus.SCHEDULED_FUTURE]: { variant: "outline", label: "Đã xếp", color: "bg-blue-100 text-blue-800" },
        }
        const info = config[status] || config[AttendanceStatus.SCHEDULED_FUTURE]
        return <Badge className={`${info.color} border-0`}>{info.label}</Badge>
    }

    const filteredHistory = history.filter((item) => {
        if (statusFilter === "ALL") return true
        const status = getAttendanceStatus(item.assignment, item.session)

        // Map old filter strings to new enum values
        const filterMap: Record<string, AttendanceStatus[]> = {
            "COMPLETED": [AttendanceStatus.COMPLETED_ON_TIME, AttendanceStatus.ON_TIME, AttendanceStatus.LATE_CHECKIN, AttendanceStatus.EARLY_CHECKOUT],
            "IN_PROGRESS": [AttendanceStatus.INCOMPLETE],
            "MISSED": [AttendanceStatus.ABSENT],
            "SCHEDULED": [AttendanceStatus.SCHEDULED_FUTURE, AttendanceStatus.SCHEDULED_PENDING],
        }

        const allowedStatuses = filterMap[statusFilter] || []
        return allowedStatuses.includes(status as AttendanceStatus)
    })

    const statistics = {
        total: history.length,
        completed: history.filter((h) => {
            const status = getAttendanceStatus(h.assignment, h.session)
            return status === AttendanceStatus.COMPLETED_ON_TIME || status === AttendanceStatus.ON_TIME || status === AttendanceStatus.LATE_CHECKIN || status === AttendanceStatus.EARLY_CHECKOUT
        }).length,
        missed: history.filter((h) => getAttendanceStatus(h.assignment, h.session) === AttendanceStatus.ABSENT).length,
        inProgress: history.filter((h) => getAttendanceStatus(h.assignment, h.session) === AttendanceStatus.INCOMPLETE).length,
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={History}
                title="Lịch Sử Chấm Công"
                subtitle="Xem chi tiết lịch sử chấm công"
            />

            <div className="p-4 md:p-6 pb-20 space-y-4">
                <div className="max-w-4xl mx-auto space-y-4">
                    {/* Header - Desktop only */}
                    <div className="hidden md:flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">Lịch sử chấm công</h1>
                            <p className="text-sm text-muted-foreground">
                                Xem chi tiết lịch sử chấm công của bạn
                            </p>
                        </div>
                    </div>

                    {/* Statistics Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-blue-600">{statistics.total}</div>
                                <div className="text-xs text-blue-800 mt-1">Tổng ca</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-green-600">{statistics.completed}</div>
                                <div className="text-xs text-green-800 mt-1">Hoàn thành</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-red-50 border-red-200">
                            <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-red-600">{statistics.missed}</div>
                                <div className="text-xs text-red-800 mt-1">Vắng mặt</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-yellow-50 border-yellow-200">
                            <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-yellow-600">{statistics.inProgress}</div>
                                <div className="text-xs text-yellow-800 mt-1">Đang làm</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filters */}
                    <Collapsible open={showFilters} onOpenChange={setShowFilters}>
                        <Card>
                            <CardHeader className="pb-3">
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                                        <div className="flex items-center gap-2">
                                            <Filter className="h-4 w-4" />
                                            <span className="font-semibold">Bộ lọc</span>
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
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Tháng</Label>
                                            <Input
                                                type="month"
                                                value={selectedMonth}
                                                onChange={(e) => setSelectedMonth(e.target.value)}
                                                max={format(new Date(), "yyyy-MM")}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Trạng thái</Label>
                                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ALL">Tất cả</SelectItem>
                                                    <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                                                    <SelectItem value="IN_PROGRESS">Đang làm</SelectItem>
                                                    <SelectItem value="MISSED">Vắng mặt</SelectItem>
                                                    <SelectItem value="SCHEDULED">Đã xếp</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>

                    {/* History List */}
                    <div className="space-y-3">
                        {loading ? (
                            <Card>
                                <CardContent className="p-6 text-center">
                                    <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-muted-foreground">Đang tải...</p>
                                </CardContent>
                            </Card>
                        ) : filteredHistory.length === 0 ? (
                            <Card>
                                <CardContent className="p-6 text-center">
                                    <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                                    <p className="text-muted-foreground">Không có dữ liệu</p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredHistory.map((item) => {
                                const { assignment, session } = item
                                const status = getAttendanceStatus(assignment, session)
                                const shift = assignment.work_shifts

                                return (
                                    <Card key={assignment.id} className="overflow-hidden">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="p-2 bg-blue-50 rounded-lg">
                                                        <Calendar className="h-5 w-5 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">
                                                            {format(new Date(assignment.assigned_date), "EEEE", { locale: vi })}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {format(new Date(assignment.assigned_date), "dd/MM/yyyy")}
                                                        </div>
                                                    </div>
                                                </div>
                                                {getStatusBadge(status)}
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Ca làm việc</span>
                                                    <span className="font-medium">{shift?.shift_name}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Giờ làm việc</span>
                                                    <span className="font-mono font-medium">
                                                        {shift?.start_time?.substring(0, 5)} - {shift?.end_time?.substring(0, 5)}
                                                    </span>
                                                </div>

                                                {session && (
                                                    <>
                                                        <div className="flex items-center justify-between text-sm pt-2 border-t">
                                                            <span className="text-muted-foreground">Check-in</span>
                                                            <span className={cn(
                                                                "font-mono font-medium",
                                                                session.check_in_time ? "text-green-700" : "text-muted-foreground"
                                                            )}>
                                                                {/* CRITICAL: Use formatTimeNoTz for DB time (Vietnam stored as UTC) */}
                                                                {session.check_in_time ? formatTimeNoTz(session.check_in_time) : "—"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-muted-foreground">Check-out</span>
                                                            <span className={cn(
                                                                "font-mono font-medium",
                                                                session.check_out_time ? "text-blue-700" : "text-muted-foreground"
                                                            )}>
                                                                {/* CRITICAL: Use formatTimeNoTz for DB time (Vietnam stored as UTC) */}
                                                                {session.check_out_time ? formatTimeNoTz(session.check_out_time) : "—"}
                                                            </span>
                                                        </div>
                                                        {session.check_in_time && session.check_out_time && (
                                                            <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t">
                                                                <span>Tổng giờ làm</span>
                                                                <span className="text-blue-600">
                                                                    {/* Use actual_duration from server (in minutes) - more accurate */}
                                                                    {session.actual_duration != null && session.actual_duration > 0
                                                                        ? `${Math.floor(session.actual_duration / 60)}h ${session.actual_duration % 60}m`
                                                                        : (() => {
                                                                            const diffMs = new Date(session.check_out_time).getTime() - new Date(session.check_in_time).getTime()
                                                                            const hours = Math.floor(diffMs / (1000 * 60 * 60))
                                                                            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
                                                                            return `${hours}h ${minutes}m`
                                                                        })()
                                                                    }
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
