"use client"

import { useEffect, useState, useCallback } from "react"
import { StaffMonthlyCalendar } from "@/components/shifts/staff-monthly-calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useAuth } from "@/hooks/use-auth"
import {
    Calendar,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    Loader2,
    Info,
    CheckCircle2,
    AlertTriangle,
    Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay } from "date-fns"
import { vi } from "date-fns/locale"
import { mobileFetch } from "@/lib/mobile/api-client"
import { StaffShiftRegistrationDialog } from "@/components/shifts/staff-shift-registration-dialog"
import { ManagePendingRegistrationDialog } from "@/components/shifts/manage-pending-registration-dialog"
import { formatTimeNoTz } from "@/lib/server-time"

// ===== VIETNAM TIMEZONE DETECTION =====
const serverTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

function getVietnamDateStr(fromTime: Date): string {
    if (isVietnamTz) {
        const year = fromTime.getFullYear()
        const month = String(fromTime.getMonth() + 1).padStart(2, '0')
        const day = String(fromTime.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    } else {
        const vnTime = new Date(fromTime.getTime() + VIETNAM_OFFSET_MS)
        return vnTime.toISOString().split('T')[0]
    }
}

function formatToVietnamDateStr(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toISOString().split('T')[0]
}

// Registration period helpers
function isRegistrationPeriodOpen(serverTime: Date): boolean {
    const day = serverTime.getDate()
    return day >= 20 && day <= 28
}

function getTargetRegistrationMonth(serverTime: Date): Date {
    return addMonths(serverTime, 1)
}

function getRegistrationDaysRemaining(serverTime: Date): number {
    const day = serverTime.getDate()
    if (day < 20) return -1
    if (day > 28) return 0
    return 28 - day
}

type AttendanceStatus = "ontime" | "late" | "early_leave" | "absent" | "leave" | "scheduled" | "pending" | "rejected" | "incomplete" | "none"

interface DayData {
    date: Date
    status: AttendanceStatus
    shiftName?: string
    checkIn?: string
    checkOut?: string
    isPending?: boolean
    incompleteType?: "no-checkin" | "no-checkout"
    modifiedBy?: string
}

export default function AttendanceCalendarPage() {
    const { user } = useAuth()
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [loading, setLoading] = useState(true)

    // Staff calendar state
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [assignments, setAssignments] = useState<any[]>([])
    const [sessions, setSessions] = useState<any[]>([])
    const [shifts, setShifts] = useState<any[]>([])
    const [pendingRequests, setPendingRequests] = useState<any[]>([])
    const [statistics, setStatistics] = useState<any>(null)
    const [employmentType, setEmploymentType] = useState<"FULLTIME" | "PARTTIME">("FULLTIME")

    // Registration dialog state
    const [dialogOpen, setDialogOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)

    // Manage pending registration dialog state
    const [manageDialogOpen, setManageDialogOpen] = useState(false)
    const [selectedPendingDate, setSelectedPendingDate] = useState<Date | null>(null)
    const [selectedPendingShift, setSelectedPendingShift] = useState<any>(null)

    // CRITICAL: Fetch server time to prevent device time manipulation
    const [currentTime, setCurrentTime] = useState(new Date())

    // Registration period info
    const isRegPeriodOpen = isRegistrationPeriodOpen(currentTime)
    const targetMonth = getTargetRegistrationMonth(currentTime)
    const daysRemaining = getRegistrationDaysRemaining(currentTime)

    // Calendar calculations
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const startDay = getDay(monthStart) // 0 = Sunday

    useEffect(() => {
        const fetchUserInfo = async () => {
            try {
                const res = await mobileFetch("/api/auth/me")
                const json = await res.json()

                if (json.success && json.data) {
                    setEmploymentType(json.data.employmentType?.type || "FULLTIME")
                }
            } catch (error) {
                console.error("Error fetching user info:", error)
                toast.error("Không thể tải thông tin người dùng")
            } finally {
                setLoading(false)
            }
        }

        fetchUserInfo()
    }, [])

    // CRITICAL SECURITY: Fetch server time
    useEffect(() => {
        let serverTimeOffset = 0

        const fetchTime = async () => {
            try {
                const res = await mobileFetch('/api/server-time')
                const json = await res.json()
                if (json.success && json.data?.currentTime) {
                    const serverTime = new Date(json.data.currentTime)
                    const clientTime = new Date()
                    serverTimeOffset = serverTime.getTime() - clientTime.getTime()
                    setCurrentTime(serverTime)
                }
            } catch (error) {
                console.error('Failed to fetch server time:', error)
            }
        }

        fetchTime()

        const timer = setInterval(() => {
            if (serverTimeOffset !== 0) {
                setCurrentTime(new Date(Date.now() + serverTimeOffset))
            } else {
                setCurrentTime(new Date())
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [])

    // Fetch staff calendar data
    const fetchStaffCalendarData = useCallback(async () => {
        setLoading(true)
        try {
            const year = currentMonth.getFullYear()
            const month = currentMonth.getMonth() + 1
            const res = await mobileFetch(`/api/shifts/my-schedule?year=${year}&month=${month}`)
            const json = await res.json()

            if (json.success) {
                setAssignments(json.data.assignments || [])
                setSessions(json.data.sessions || [])
                setShifts(json.data.shifts || [])
                setPendingRequests(json.data.pendingRequests || [])
                setStatistics(json.data.statistics)
            } else {
                console.error("Error fetching staff schedule:", json.error)
                toast.error(json.error || "Không thể tải dữ liệu lịch làm việc")
            }
        } catch (error) {
            console.error("Error fetching staff schedule:", error)
            toast.error("Không thể tải dữ liệu lịch làm việc")
        } finally {
            setLoading(false)
        }
    }, [currentMonth, toast])

    useEffect(() => {
        fetchStaffCalendarData()
    }, [fetchStaffCalendarData])

    // Fetch available shifts for registration
    const fetchAvailableShifts = useCallback(async () => {
        try {
            const res = await mobileFetch("/api/shifts/available")
            const json = await res.json()
            if (json.success) {
                setShifts(json.data)
            }
        } catch (error) {
            console.error("Error fetching available shifts:", error)
            toast.error("Không thể tải danh sách ca làm trống")
        }
    }, [])

    useEffect(() => {
        fetchAvailableShifts()
    }, [fetchAvailableShifts])

    // Helper: Get day status data
    const getDayData = (date: Date): DayData => {
        const dateStr = format(date, "yyyy-MM-dd")

        // Find assignment
        const assignment = assignments.find(a => formatToVietnamDateStr(a.assigned_date) === dateStr)
        const shiftName = assignment?.work_shifts?.shift_name

        // Check for pending request
        const pendingRequest = pendingRequests.find(r => formatToVietnamDateStr(r.requested_date) === dateStr)
        if (pendingRequest) {
            if (pendingRequest.status === "PENDING") {
                return { date, status: "pending", shiftName: pendingRequest.work_shifts?.shift_name, isPending: true }
            }
            if (pendingRequest.status === "REJECTED") {
                return { date, status: "rejected", shiftName: pendingRequest.work_shifts?.shift_name }
            }
        }

        // Find session
        const session = sessions.find(s => formatToVietnamDateStr(s.session_date) === dateStr)

        if (!assignment) {
            return { date, status: "none" }
        }

        // Determine status
        const checkIn = session?.check_in_time ? formatTimeNoTz(session.check_in_time) : undefined
        const checkOut = session?.check_out_time ? formatTimeNoTz(session.check_out_time) : undefined
        const modifiedBy = session?.modified_by_user?.full_name

        // Has both check_in and check_out
        if (session?.check_in_time && session?.check_out_time) {
            const isLate = session.is_late_checkin
            const isEarly = session.is_early_checkout
            if (isLate) return { date, status: "late", shiftName, checkIn, checkOut, modifiedBy }
            if (isEarly) return { date, status: "early_leave", shiftName, checkIn, checkOut, modifiedBy }
            return { date, status: "ontime", shiftName, checkIn, checkOut, modifiedBy }
        }

        // Only check_in
        if (session?.check_in_time && !session?.check_out_time) {
            return { date, status: "incomplete", shiftName, checkIn, checkOut, incompleteType: "no-checkout", modifiedBy }
        }

        // Only check_out (forgot check-in)
        if (!session?.check_in_time && session?.check_out_time) {
            return { date, status: "incomplete", shiftName, checkIn, checkOut, incompleteType: "no-checkin", modifiedBy }
        }

        // Past date without session = absent
        const serverTodayStr = getVietnamDateStr(currentTime)
        if (dateStr < serverTodayStr) {
            return { date, status: "absent", shiftName }
        }

        // Future or today with assignment = scheduled
        return { date, status: "scheduled", shiftName }
    }

    const getStatusColor = (status: AttendanceStatus) => {
        switch (status) {
            case "ontime": return "bg-green-500"
            case "late": return "bg-orange-500"
            case "early_leave": return "bg-orange-500"
            case "absent": return "bg-red-500"
            case "leave": return "bg-blue-500"
            case "scheduled": return "bg-blue-500"
            case "pending": return "bg-purple-500"
            case "rejected": return "bg-red-600"
            case "incomplete": return "bg-amber-500"
            default: return "bg-muted"
        }
    }

    const getStatusBadge = (status: AttendanceStatus, incompleteType?: "no-checkin" | "no-checkout") => {
        switch (status) {
            case "ontime": return <Badge className="bg-green-500 hover:bg-green-600">Đúng giờ</Badge>
            case "late": return <Badge className="bg-orange-500 hover:bg-orange-600">Đi muộn</Badge>
            case "early_leave": return <Badge className="bg-orange-500 hover:bg-orange-600">Về sớm</Badge>
            case "absent": return <Badge variant="destructive">Vắng mặt</Badge>
            case "leave": return <Badge className="bg-blue-500 hover:bg-blue-600">Nghỉ phép</Badge>
            case "scheduled": return <Badge className="bg-blue-500 hover:bg-blue-600">Đã xếp ca</Badge>
            case "pending": return <Badge className="bg-purple-500 hover:bg-purple-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Chờ duyệt</Badge>
            case "rejected": return <Badge variant="destructive">Bị từ chối</Badge>
            case "incomplete": return <Badge className="bg-amber-500 hover:bg-amber-600">{incompleteType === "no-checkout" ? "Chưa ra ca" : "Chưa vào ca"}</Badge>
            default: return null
        }
    }

    // Registration handlers
    const handleRegister = (date: Date) => {
        if (!isRegPeriodOpen) {
            toast.error("Thời gian đăng ký là từ ngày 20-28 hàng tháng")
            return
        }
        setSelectedDate(date)
        setDialogOpen(true)
    }

    const handleRegisterSubmit = async (shiftId: string, notes: string) => {
        if (!selectedDate) return

        try {
            const res = await mobileFetch("/api/shifts/self-register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    work_shift_id: shiftId,
                    assigned_date: format(selectedDate, "yyyy-MM-dd"),
                    notes,
                }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success(json.message || "Yêu cầu đăng ký ca đang chờ quản lý phê duyệt")
                fetchStaffCalendarData()
            } else {
                throw new Error(json.error)
            }
        } catch (error: any) {
            throw error
        }
    }

    const handleCancel = async (date: Date) => {
        try {
            const dateStr = format(date, "yyyy-MM-dd")
            const res = await mobileFetch(`/api/shifts/self-register?date=${dateStr}`, { method: "DELETE" })
            const json = await res.json()

            if (json.success) {
                toast.success("Đã hủy đăng ký ca" )
                fetchStaffCalendarData()
            } else {
                toast.error(json.error || "Không thể hủy đăng ký")
            }
        } catch (error) {
            toast.error("Không thể hủy đăng ký")
        }
    }

    // Open manage pending dialog
    const handleOpenManageDialog = (date: Date, pendingRequest: any) => {
        setSelectedPendingDate(date)
        setSelectedPendingShift(pendingRequest?.work_shifts || null)
        setManageDialogOpen(true)
    }

    // Edit registration - delete and re-register with new shift
    const handleEditRegistration = async (shiftId: string, notes: string) => {
        if (!selectedPendingDate) return

        try {
            // First delete the current registration
            const dateStr = format(selectedPendingDate, "yyyy-MM-dd")
            const deleteRes = await mobileFetch(`/api/shifts/self-register?date=${dateStr}`, { method: "DELETE" })
            const deleteJson = await deleteRes.json()

            if (!deleteJson.success) {
                toast.error(deleteJson.error || "Không thể thay đổi ca")
                return
            }

            // Then create new registration
            const createRes = await mobileFetch("/api/shifts/self-register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    work_shift_id: shiftId,
                    assigned_date: dateStr,
                    notes,
                }),
            })
            const createJson = await createRes.json()

            if (createJson.success) {
                toast.success("Đã đổi ca đăng ký" )
                fetchStaffCalendarData()
            } else {
                toast.error(createJson.error || "Không thể đổi ca")
            }
        } catch (error) {
            toast.error("Không thể đổi ca")
        }
    }

    // Delete registration
    const handleDeleteRegistration = async () => {
        if (!selectedPendingDate) return
        await handleCancel(selectedPendingDate)
    }

    // Statistics - Calculate from sessions data with shift duration cap
    const MAX_REASONABLE_DURATION_MINUTES = 60 * 16 // 16 hours max

    // Helper to get shift duration for a session (returns hours, or null if no shift)
    const getShiftDurationHours = (session: any): number | null => {
        const sessionDate = session.session_date ? new Date(session.session_date).toISOString().split('T')[0] : null
        if (!sessionDate) return null

        const assignment = assignments.find((a: any) => {
            const assignDate = a.assigned_date ? new Date(a.assigned_date).toISOString().split('T')[0] : null
            return assignDate === sessionDate
        })

        if (!assignment?.work_shifts?.start_time || !assignment?.work_shifts?.end_time) return null

        const parseTime = (t: string) => {
            const parts = t.split(':')
            return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0')
        }

        let startMins = parseTime(assignment.work_shifts.start_time)
        let endMins = parseTime(assignment.work_shifts.end_time)
        if (endMins <= startMins) endMins += 24 * 60 // Overnight

        return (endMins - startMins) / 60
    }

    const totalWorkedHours = sessions.reduce((acc: number, s: any) => {
        let hours = 0

        if (s.actual_duration != null && s.actual_duration > 0 && s.actual_duration <= MAX_REASONABLE_DURATION_MINUTES) {
            hours = s.actual_duration / 60
        } else if (s.check_in_time && s.check_out_time) {
            const diff = new Date(s.check_out_time).getTime() - new Date(s.check_in_time).getTime()
            hours = diff / (1000 * 60 * 60)
            if (hours <= 0 || hours > 16) hours = 0
        }

        // Cap at shift duration
        const shiftDuration = getShiftDurationHours(s)
        if (shiftDuration && hours > shiftDuration) {
            hours = shiftDuration
        }

        return acc + hours
    }, 0)

    // Count late sessions from notes or status
    const lateCount = sessions.filter((s: any) =>
        s.notes?.includes("Đi muộn") || s.status === "LATE"
    ).length

    const statsData = {
        completed: statistics?.completedSessions || 0,
        late: lateCount,
        leaveRemaining: 2, // Default max for fulltime (TODO: fetch from leave API if needed)
        totalHours: Math.round(totalWorkedHours * 10) / 10,
    }

    if (loading && !statistics) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center space-y-4">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-muted-foreground">Đang tải...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <div className={cn("p-4 space-y-4", !isMobile && "max-w-7xl mx-auto p-6")}>
                {/* Desktop Header */}
                {!isMobile && (
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                                <Calendar className="w-8 h-8 text-primary" />
                                Lịch làm việc
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                Xem lịch làm việc và trạng thái đăng ký ca của bạn
                            </p>
                        </div>
                    </div>
                )}

                {/* Statistics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                        <CardContent className="p-4 text-center">
                            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-600" />
                            <p className="text-2xl font-bold text-green-600">{statsData.completed}</p>
                            <p className="text-xs text-green-600/80">Công chuẩn</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                        <CardContent className="p-4 text-center">
                            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                            <p className="text-2xl font-bold text-orange-600">{statsData.late}</p>
                            <p className="text-xs text-orange-600/80">Đi muộn</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                        <CardContent className="p-4 text-center">
                            <CalendarDays className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                            <p className="text-2xl font-bold text-blue-600">{statsData.leaveRemaining}</p>
                            <p className="text-xs text-blue-600/80">Phép còn</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                        <CardContent className="p-4 text-center">
                            <Clock className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                            <p className="text-2xl font-bold text-purple-600">{statsData.totalHours}h</p>
                            <p className="text-xs text-purple-600/80">Tổng giờ</p>
                        </CardContent>
                    </Card>
                </div>

                {/* DESKTOP: Use StaffMonthlyCalendar */}
                {!isMobile && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Calendar className="w-5 h-5" />
                                    Lịch làm việc
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="font-medium min-w-[140px] text-center">
                                        {format(currentMonth, "MMMM yyyy", { locale: vi })}
                                    </span>
                                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <StaffMonthlyCalendar
                                assignments={assignments}
                                sessions={sessions}
                                shifts={shifts}
                                pendingRequests={pendingRequests}
                                onRegister={isRegPeriodOpen ? handleRegister : () => { }}
                                onCancel={isRegPeriodOpen ? handleCancel : () => { }}
                                onManage={isRegPeriodOpen ? handleOpenManageDialog : undefined}
                                currentMonth={currentMonth}
                                onMonthChange={setCurrentMonth}
                                employmentType={employmentType}
                                readonly={!isRegPeriodOpen}
                                currentTime={currentTime}
                                loading={loading}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* MOBILE: Custom layout with Lịch tháng and Lịch sử chấm công */}
                {isMobile && (
                    <>
                        {/* Lịch tháng - Mobile Calendar with CN, T2-T7 headers */}
                        <Card className={cn(loading && "opacity-60")}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Calendar className="w-5 h-5" />
                                        Lịch tháng
                                        {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                                    </CardTitle>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} disabled={loading}>
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        <span className="text-sm font-medium min-w-[100px] text-center">
                                            {format(currentMonth, "MM/yyyy")}
                                        </span>
                                        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} disabled={loading}>
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0 relative">
                                {/* Loading Overlay */}
                                {loading && (
                                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                                        <div className="flex items-center gap-2 bg-background/90 px-3 py-1.5 rounded-lg shadow text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                            <span>Đang tải...</span>
                                        </div>
                                    </div>
                                )}

                                {/* Mini Calendar Grid - CN, T2-T7 headers */}
                                <div className="grid grid-cols-7 gap-1 mb-4">
                                    {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day) => (
                                        <div key={day} className="text-center text-xs text-muted-foreground py-1">
                                            {day}
                                        </div>
                                    ))}
                                    {/* Empty cells for days before month starts */}
                                    {Array.from({ length: startDay }).map((_, i) => (
                                        <div key={`empty-${i}`} className="h-8" />
                                    ))}
                                    {/* Calendar days */}
                                    {daysInMonth.map((day) => {
                                        const dayData = getDayData(day)
                                        const isCurrentDay = format(day, "yyyy-MM-dd") === getVietnamDateStr(currentTime)
                                        const isTargetMonth = isSameMonth(day, targetMonth)
                                        const canRegister = isTargetMonth && dayData.status === "none" && isRegPeriodOpen
                                        // Allow managing pending registrations
                                        const canManage = dayData.status === "pending" && isRegPeriodOpen
                                        // Get pending request info for this day
                                        const dateStr = format(day, "yyyy-MM-dd")
                                        const pendingRequest = pendingRequests.find(r =>
                                            formatToVietnamDateStr(r.requested_date) === dateStr && r.status === "PENDING"
                                        )

                                        return (
                                            <div
                                                key={day.toISOString()}
                                                onClick={() => {
                                                    if (canRegister) {
                                                        handleRegister(day)
                                                    } else if (canManage && pendingRequest) {
                                                        handleOpenManageDialog(day, pendingRequest)
                                                    }
                                                }}
                                                className={cn(
                                                    "h-8 flex items-center justify-center text-sm rounded-full relative",
                                                    isCurrentDay && "ring-2 ring-primary",
                                                    dayData.status !== "none" && getStatusColor(dayData.status),
                                                    dayData.status !== "none" && "text-white",
                                                    canRegister && "cursor-pointer hover:bg-primary/20 border border-dashed border-primary",
                                                    canManage && "cursor-pointer hover:opacity-70",
                                                    dayData.status === "pending" && "animate-pulse",
                                                )}
                                            >
                                                {format(day, "d")}
                                                {canRegister && (
                                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                                                )}
                                                {canManage && (
                                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-300 rounded-full" />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Registration Hint */}
                                {isRegPeriodOpen && (
                                    <div className="mb-3 p-2 bg-primary/10 rounded-lg text-xs text-center">
                                        <Info className="w-3 h-3 inline mr-1" />
                                        Chạm vào ngày có dấu chấm để đăng ký ca tháng {format(targetMonth, "MM/yyyy")}
                                    </div>
                                )}

                                {/* Status Legend */}
                                <div className="flex flex-wrap gap-3 text-xs border-t pt-3">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                        <span>Đúng giờ</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                                        <span>Đi muộn</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                        <span>Vắng</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                                        <span>Chưa chấm công</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                        <span>Nghỉ phép</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                        <span>Đã xếp ca</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                        <span>Chờ duyệt</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Lịch sử chấm công - Attendance History List */}
                        <Card className={cn(loading && "opacity-60")}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5" />
                                    Lịch sử chấm công
                                    {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 relative">
                                {/* Loading Overlay */}
                                {loading && (
                                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                                        <div className="flex items-center gap-2 bg-background/90 px-3 py-1.5 rounded-lg shadow text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                            <span>Đang tải...</span>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {daysInMonth
                                        .filter((day) => {
                                            const dayData = getDayData(day)
                                            return dayData.status !== "none" && dayData.status !== "scheduled"
                                        })
                                        .reverse()
                                        .slice(0, 10)
                                        .map((day) => {
                                            const dayData = getDayData(day)
                                            const isCurrentDay = format(day, "yyyy-MM-dd") === getVietnamDateStr(currentTime)
                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    className={cn(
                                                        "flex items-center justify-between p-3 rounded-lg border",
                                                        isCurrentDay && "border-primary bg-primary/5"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs",
                                                            dayData.status !== "none" ? getStatusColor(dayData.status) + " text-white" : "bg-muted"
                                                        )}>
                                                            <span className="font-bold">{format(day, "dd")}</span>
                                                            <span className="text-[10px] opacity-80">{format(day, "EEE", { locale: vi })}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm">{dayData.shiftName || "Không có ca"}</p>
                                                            {(dayData.checkIn || dayData.checkOut) && (
                                                                <div className={cn(
                                                                    "text-xs",
                                                                    (dayData.checkIn && dayData.checkOut) ? "text-muted-foreground" : "text-amber-600"
                                                                )}>
                                                                    <p>{dayData.checkIn || "—"} - {dayData.checkOut || "—"}</p>
                                                                    {dayData.modifiedBy && (
                                                                        <p className="text-orange-500 italic mt-0.5">
                                                                            (QL: {dayData.modifiedBy})
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {getStatusBadge(dayData.status, dayData.incompleteType)}
                                                </div>
                                            )
                                        })}

                                    {daysInMonth.filter(day => {
                                        const dayData = getDayData(day)
                                        return dayData.status !== "none" && dayData.status !== "scheduled"
                                    }).length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                <p>Chưa có dữ liệu chấm công</p>
                                            </div>
                                        )}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Registration Dialog */}
            <StaffShiftRegistrationDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                date={selectedDate}
                shifts={shifts}
                onRegister={handleRegisterSubmit}
            />

            {/* Manage Pending Registration Dialog */}
            <ManagePendingRegistrationDialog
                open={manageDialogOpen}
                onOpenChange={setManageDialogOpen}
                date={selectedPendingDate}
                currentShift={selectedPendingShift}
                shifts={shifts}
                onEdit={handleEditRegistration}
                onDelete={handleDeleteRegistration}
            />
        </div>
    )
}
