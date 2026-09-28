"use client"

// Re-export the existing shifts register page for attendance users
// This ensures code reuse and consistent functionality

import { mobileFetch } from "@/lib/mobile/api-client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { StaffMonthlyCalendar } from "@/components/shifts/staff-monthly-calendar"
import { StaffShiftRegistrationDialog } from "@/components/shifts/staff-shift-registration-dialog"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isSameDay, addMonths, subMonths, getDate, differenceInDays } from "date-fns"
import { formatTimeNoTz } from "@/lib/server-time"
import { vi } from "date-fns/locale"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Calendar, Clock, MapPin, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, MinusCircle, CalendarDays, TrendingUp, AlertTriangle, ArrowRightLeft, FileCheck, Info, Loader2, Banknote, Circle, Navigation, CalendarOff, CalendarIcon, Fingerprint, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { formatTime, determineAttendanceStatus, AttendanceStatus as SharedAttendanceStatus } from "@/lib/shift-status"
import { checkGeoFence, formatDistance } from "@/lib/mobile/geolocation"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface LeaveStats {
    approved: number
    pending: number
    remaining: number
    maxPerMonth: number
    month?: number
    year?: number
}

// Simplified attendance page for ATTENDANCE_STAFF
// Shows only check-in/check-out and calendar view

export default function AttendancePage() {
    const { user, loading } = useAuth()
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [currentTime, setCurrentTime] = useState(new Date())
    const [warehouseName, setWarehouseName] = useState<string>("")
    const [todayStatus, setTodayStatus] = useState<"not_checked_in" | "checked_in" | "checked_out">("not_checked_in")
    const [todaySession, setTodaySession] = useState<any>(null)
    const [todayAssignment, setTodayAssignment] = useState<any>(null)
    const [submitting, setSubmitting] = useState(false)
    const [geoChecking, setGeoChecking] = useState(false)
    const [geoError, setGeoError] = useState<string | null>(null)
    const [warehouseGps, setWarehouseGps] = useState<{
        warehouses?: Array<{ id: string; name: string; latitude: number; longitude: number; radius: number }>;
        latitude: number | null;
        longitude: number | null;
        radius: number
    }>({ latitude: null, longitude: null, radius: 3000, warehouses: [] })
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null)
    const [currentMonth, setCurrentMonth] = useState(new Date())

    // Leave request states
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
    const [leaveDate, setLeaveDate] = useState<Date | null>(null)
    const [leaveReason, setLeaveReason] = useState("")
    const [leaveStats, setLeaveStats] = useState<LeaveStats>({
        approved: 0,
        pending: 0,
        remaining: 2,
        maxPerMonth: 2,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    })
    const [leaveRequests, setLeaveRequests] = useState<any[]>([])
    const [sessions, setSessions] = useState<any[]>([])
    const [shifts, setShifts] = useState<any[]>([])
    const [assignments, setAssignments] = useState<any[]>([])

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean
        title: string
        description: string
        onConfirm: () => void
    }>({ open: false, title: '', description: '', onConfirm: () => { } })

    // Fetch server time
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


    // Fetch ALL warehouse GPS coordinates (allow check-in at any warehouse location)
    useEffect(() => {
        const fetchGPSCheckpoints = async () => {
            try {
                // Sử dụng API riêng để lấy TẤT CẢ điểm chấm công, không bị filter theo role
                const res = await mobileFetch(`/api/attendance/gps-checkpoints`)
                const json = await res.json()
                if (json.success && json.data) {
                    const warehousesWithGPS = json.data.map((w: any) => ({
                        id: w.id,
                        name: w.name,
                        latitude: w.latitude,
                        longitude: w.longitude,
                        radius: w.radius || 3000
                    }))

                    console.log('[Attendance] Loaded GPS checkpoints:', warehousesWithGPS.length)
                    warehousesWithGPS.forEach((w: any) => {
                        console.log(`  - ${w.name}: lat=${w.latitude}, lng=${w.longitude}, radius=${w.radius}m`)
                    })

                    // Set all warehouses for GPS check
                    if (warehousesWithGPS.length > 0) {
                        setWarehouseGps({
                            warehouses: warehousesWithGPS,
                            latitude: warehousesWithGPS[0].latitude,
                            longitude: warehousesWithGPS[0].longitude,
                            radius: warehousesWithGPS[0].radius
                        })
                    }
                } else {
                    console.warn('[Attendance] No GPS checkpoints available:', json.error)
                }

                // Fetch user's warehouse name separately
                if (user?.warehouseId) {
                    try {
                        const warehouseRes = await mobileFetch(`/api/warehouses`)
                        const warehouseJson = await warehouseRes.json()
                        if (warehouseJson.success && warehouseJson.data) {
                            const userWarehouse = warehouseJson.data.find((w: any) => w.id === user.warehouseId)
                            if (userWarehouse) {
                                setWarehouseName(userWarehouse.name || "")
                            }
                        }
                    } catch {
                        // Ignore error for warehouse name fetch
                    }
                }
            } catch (error) {
                console.error("Error fetching GPS checkpoints:", error)
                toast.error("Không thể tải thông tin điểm chấm công")
            }
        }
        fetchGPSCheckpoints()
    }, [user?.warehouseId])

    // Load available shifts and schedule
    const fetchSchedule = useCallback(async () => {
        try {
            const year = currentMonth.getFullYear()
            const month = currentMonth.getMonth() + 1

            const res = await mobileFetch(`/api/shifts/my-schedule?year=${year}&month=${month}`)
            const json = await res.json()

            if (json.success) {
                const now = new Date() // Use current time for filtering, avoiding dependency loop
                setTodayAssignment(json.data.assignments.find((a: any) => isSameDay(new Date(a.assigned_date), now)))
                setSessions(json.data.sessions)
                setAssignments(json.data.assignments)
                setShifts(json.data.shifts || [])

                // Set today status
                const todayStr = format(now, "yyyy-MM-dd")
                const todaySession = json.data.sessions.find((s: any) =>
                    s.session_date && s.session_date.startsWith(todayStr)
                )

                if (todaySession) {
                    setTodaySession(todaySession)
                    if (todaySession.check_out_time) {
                        setTodayStatus("checked_out")
                    } else if (todaySession.check_in_time) {
                        setTodayStatus("checked_in")
                    } else {
                        // Special case: Session exists but check_in_time is null (forgot check-in)
                        // Treat as 'checked_in' so user can check out
                        setTodayStatus("checked_in")
                    }
                } else {
                    setTodaySession(null)
                    setTodayStatus("not_checked_in")
                }

            }
        } catch (error) {
            console.error("Error fetching schedule", error)
            toast.error("Không thể tải lịch làm việc")
        }
    }, [currentMonth])

    // --- LOGIC FROM STORE: DETERMINE FORGOT CHECK_IN ---
    const { isShiftEnded, isCheckInGracePeriodExpired, isCheckOutGracePeriodExpired, shiftStartTime, shiftEndTime } = (() => {
        const shiftData = todayAssignment?.work_shifts || (todayAssignment as any)?.shift
        if (!shiftData?.end_time || !shiftData?.start_time) {
            return {
                isShiftEnded: false,
                isCheckInGracePeriodExpired: false,
                isCheckOutGracePeriodExpired: false,
                shiftStartTime: null,
                shiftEndTime: null
            }
        }

        const now = currentTime

        const startTimeStr = shiftData.start_time.toString()
        const endTimeStr = shiftData.end_time.toString()

        const parseTime = (timeStr: string): [number, number] => {
            if (timeStr.includes('T')) {
                const timePart = timeStr.split('T')[1]
                const [h, m] = timePart.split(':').map(Number)
                return [h, m]
            }
            const [h, m] = timeStr.split(':').map(Number)
            return [h, m]
        }

        const [startHour, startMin] = parseTime(startTimeStr)
        const [endHour, endMin] = parseTime(endTimeStr)

        const shiftStartDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0)
        let shiftEndDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0)

        if (endHour < startHour || (endHour === startHour && endMin < startMin)) {
            shiftEndDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, endHour, endMin, 0)
        }

        // 60 minutes grace period
        const LATE_CHECKIN_GRACE_PERIOD = 60
        const LATE_CHECKOUT_GRACE_PERIOD = 30

        const checkInDeadline = new Date(shiftStartDateTime.getTime() + LATE_CHECKIN_GRACE_PERIOD * 60 * 1000)
        const checkOutDeadline = new Date(shiftEndDateTime.getTime() + LATE_CHECKOUT_GRACE_PERIOD * 60 * 1000)

        const ended = now > shiftEndDateTime
        const checkInGraceExpired = now > checkInDeadline
        const checkOutGraceExpired = now > checkOutDeadline

        return {
            isShiftEnded: ended,
            isCheckInGracePeriodExpired: checkInGraceExpired,
            isCheckOutGracePeriodExpired: checkOutGraceExpired,
            shiftStartTime: shiftStartDateTime,
            shiftEndTime: shiftEndDateTime
        }
    })()

    // Check if within allowed check-in window (1 hour BEFORE shift start)
    const EARLY_CHECKIN_LIMIT_MINUTES = 60 // Can check in 60 minutes before shift
    const isWithinAllowedCheckInWindow = (() => {
        if (!shiftStartTime) return false
        const earliestCheckIn = new Date(shiftStartTime.getTime() - EARLY_CHECKIN_LIMIT_MINUTES * 60 * 1000)
        return currentTime >= earliestCheckIn
    })()

    // Calculate earliest check-in time for message display
    const earliestCheckInTime = shiftStartTime
        ? new Date(shiftStartTime.getTime() - EARLY_CHECKIN_LIMIT_MINUTES * 60 * 1000)
        : null

    const hasCheckedIn = !!todaySession?.check_in_time
    const hasCheckedOut = !!todaySession?.check_out_time

    // Logic for button state - ADDED: isWithinAllowedCheckInWindow
    const canCheckIn = todayAssignment && !hasCheckedIn && !todaySession && !isShiftEnded && !isCheckInGracePeriodExpired && isWithinAllowedCheckInWindow

    // Check if too early to check in
    const isTooEarlyToCheckIn = todayAssignment && !hasCheckedIn && !todaySession && !isWithinAllowedCheckInWindow && !isShiftEnded

    // User forgot to check-in (grace period expired, but shift valid)
    const forgotCheckIn = todayAssignment && !hasCheckedIn && !todaySession && isCheckInGracePeriodExpired && !isCheckOutGracePeriodExpired

    // Fetch leave requests for current month
    const fetchLeaveRequests = useCallback(async () => {
        try {
            const year = currentMonth.getFullYear()
            const month = currentMonth.getMonth() + 1
            const res = await mobileFetch(`/api/shifts/leave?year=${year}&month=${month}`)
            const json = await res.json()
            if (json.success) {
                setLeaveRequests(json.data.requests || [])
                setLeaveStats({
                    ...(json.data.stats || { approved: 0, pending: 0, remaining: 2, maxPerMonth: 2 }),
                    month,
                    year,
                })
            }
        } catch (error) {
            console.error("Error fetching leave requests:", error)
            toast.error("Không thể tải danh sách nghỉ phép")
        }
    }, [currentMonth])

    useEffect(() => {
        fetchSchedule()
        fetchLeaveRequests()
    }, [fetchSchedule, fetchLeaveRequests])

    // Leave request handlers
    const handleLeaveRequest = async () => {
        if (!leaveDate) {
            toast.error("Vui lòng chọn ngày nghỉ phép")
            return
        }

        setSubmitting(true)
        try {
            const res = await mobileFetch("/api/shifts/leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    leave_date: format(leaveDate, "yyyy-MM-dd"),
                    reason: leaveReason || undefined,
                }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success(json.message || "Đã gửi yêu cầu nghỉ phép")
                setLeaveDialogOpen(false)
                setLeaveDate(null)
                setLeaveReason("")
                fetchLeaveRequests()
                fetchSchedule()
            } else {
                toast.error(json.error || "Không thể gửi yêu cầu")
            }
        } catch (error) {
            toast.error("Không thể gửi yêu cầu")
        } finally {
            setSubmitting(false)
        }
    }

    const handleCancelLeave = async (leaveId: string) => {
        setConfirmDialog({
            open: true,
            title: "Xác nhận hủy nghỉ phép",
            description: "Bạn có chắc muốn hủy yêu cầu nghỉ phép này?",
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                try {
                    const res = await mobileFetch(`/api/shifts/leave/${leaveId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "cancel" }),
                    })

                    const json = await res.json()

                    if (json.success) {
                        toast.success("Đã hủy yêu cầu nghỉ phép")
                        fetchLeaveRequests()
                    } else {
                        toast.error(json.error || "Không thể hủy")
                    }
                } catch (error) {
                    toast.error("Không thể hủy")
                }
            }
        })
    }


    // Fetch today's schedule


    // Unified Check-in/Check-out Wrapper
    const handleCheckInClick = () => {
        if (forgotCheckIn) {
            // If forgot check-in, map to Check-in API but with forgot_checkin=true
            handleCheckIn(true)
        } else {
            handleCheckIn(false)
        }
    }

    const handleCheckOutClick = () => {
        if (forgotCheckIn) {
            // If forgot check-in mode, it actually calls CHECK-IN API with forgot_checkin=true
            // This creates the session with null check-in time
            handleCheckIn(true)
        } else {
            handleCheckOut()
        }
    }

    // Check-in handler
    const handleCheckIn = async (isForgotCheckIn = false) => {
        if (!todayAssignment) {
            toast.error("Bạn chưa được xếp ca hôm nay")
            return
        }

        setGeoChecking(true)
        setGeoError(null)

        try {
            // Get current position first
            const { getCurrentPosition, calculateDistance } = await import('@/lib/mobile/geolocation')
            const position = await getCurrentPosition()

            // Verify position is valid
            if (!position) {
                toast.error("Không thể xác định vị trí. Vui lòng kiểm tra GPS.")
                return
            }

            console.log("[Attendance] Location found:", position)
            setUserLocation(position)

            // Check if within radius of ANY warehouse (cross-warehouse check-in allowed)
            const warehouses = warehouseGps.warehouses || []
            let nearestWarehouse: any = null
            let minDistance = Infinity
            let isWithinAnyWarehouse = false

            if (warehouses.length === 0) {
                // No warehouses configured - allow check-in (backward compatibility)
                console.log('[Attendance] No warehouses configured - allowing check-in for backward compatibility')
                isWithinAnyWarehouse = true
            } else {
                for (const wh of warehouses) {
                    const distance = calculateDistance(
                        position.latitude,
                        position.longitude,
                        wh.latitude,
                        wh.longitude
                    )

                    if (distance < minDistance) {
                        minDistance = distance
                        nearestWarehouse = { ...wh, distance: Math.round(distance) }
                    }

                    if (distance <= wh.radius) {
                        isWithinAnyWarehouse = true
                        console.log(`[Attendance] Within range of warehouse: ${wh.name} (${Math.round(distance)}m)`)
                        break
                    }
                }
            }

            if (!isWithinAnyWarehouse) {
                const msg = nearestWarehouse
                    ? `Bạn đang ở ngoài phạm vi chấm công. Kho gần nhất: ${nearestWarehouse.name} (cách ${nearestWarehouse.distance}m, vượt quá ${nearestWarehouse.distance - nearestWarehouse.radius}m).`
                    : `Bạn đang ở ngoài phạm vi chấm công.`
                setGeoError(msg)
                toast.error(msg)
                setGeoChecking(false)
                return
            }

            setSubmitting(true)
            setGeoChecking(false)

            // Safe extraction of coordinates
            const lat = position.latitude
            const lon = position.longitude
            const acc = position.accuracy

            // Call check-in API
            const res = await mobileFetch("/api/attendance/check-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shift_assignment_id: todayAssignment.id,
                    latitude: lat,
                    longitude: lon,
                    accuracy: acc,
                    forgot_checkin: isForgotCheckIn ? true : undefined
                }),
            })

            const json = await res.json()

            if (json.success) {
                const createdSession = json.data

                // If forgot check-in, immediately proceed to check-out
                if (isForgotCheckIn && createdSession?.id) {
                    // Chain to check-out API
                    const checkOutRes = await mobileFetch("/api/attendance/check-out", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            session_id: createdSession.id,
                            latitude: position.latitude,
                            longitude: position.longitude,
                            accuracy: position.accuracy,
                        }),
                    })

                    const checkOutJson = await checkOutRes.json()

                    if (checkOutJson.success) {
                        toast.success("Đã chấm công ra ca (Quên chấm công vào)")
                        // Refresh schedule to get updated session from server
                        await fetchSchedule()
                    } else {
                        toast.error(checkOutJson.error || "Không thể chấm công ra")
                        // Still refresh to show check-in status
                        await fetchSchedule()
                    }
                } else {
                    toast.success(json.message || "Đã chấm công vào ca")
                    // CRITICAL FIX: Refresh schedule data from server to update UI state
                    // This ensures todaySession is updated and button shows "RA CA" instead of "VÀO CA"
                    await fetchSchedule()
                }
            } else {
                toast.error(json.error || "Không thể chấm công")
            }
        } catch (error) {
            console.error('[Attendance] Check-in error:', error)
            const errMsg = error instanceof Error ? error.message : "Không thể chấm công"
            toast.error(errMsg)
        } finally {
            setGeoChecking(false)
            setSubmitting(false)
        }
    }

    // Check-out handler
    const handleCheckOut = async () => {
        if (!todaySession) {
            toast.error("Chưa có phiên làm việc")
            return
        }

        setGeoChecking(true)
        setGeoError(null)

        try {
            // Get current position first
            const { getCurrentPosition, calculateDistance } = await import('@/lib/mobile/geolocation')
            const position = await getCurrentPosition()

            // Verify position
            if (!position) {
                toast.error("Không thể xác định vị trí. Vui lòng kiểm tra GPS.")
                return
            }

            setUserLocation(position)

            // Check if within radius of ANY warehouse (cross-warehouse check-out allowed)
            const warehouses = warehouseGps.warehouses || []
            let nearestWarehouse: any = null
            let minDistance = Infinity
            let isWithinAnyWarehouse = false

            if (warehouses.length === 0) {
                // No warehouses configured - allow check-out (backward compatibility)
                console.log('[Attendance] No warehouses configured - allowing check-out')
                isWithinAnyWarehouse = true
            } else {
                for (const wh of warehouses) {
                    const distance = calculateDistance(
                        position.latitude,
                        position.longitude,
                        wh.latitude,
                        wh.longitude
                    )

                    if (distance < minDistance) {
                        minDistance = distance
                        nearestWarehouse = { ...wh, distance: Math.round(distance) }
                    }

                    if (distance <= wh.radius) {
                        isWithinAnyWarehouse = true
                        console.log(`[Attendance] Within range of warehouse: ${wh.name} (${Math.round(distance)}m)`)
                        break
                    }
                }
            }

            if (!isWithinAnyWarehouse) {
                const msg = nearestWarehouse
                    ? `Bạn đang ở ngoài phạm vi chấm công. Kho gần nhất: ${nearestWarehouse.name} (cách ${nearestWarehouse.distance}m, vượt quá ${nearestWarehouse.distance - nearestWarehouse.radius}m).`
                    : `Bạn đang ở ngoài phạm vi chấm công.`
                setGeoError(msg)
                toast.error(msg)
                setGeoChecking(false)
                return
            }

            setSubmitting(true)
            setGeoChecking(false)

            // Safe extraction
            const lat = position.latitude
            const lon = position.longitude
            const acc = position.accuracy

            // Call check-out API
            const res = await mobileFetch("/api/attendance/check-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: todaySession.id,
                    latitude: lat,
                    longitude: lon,
                    accuracy: acc,
                }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success("Đã chấm công ra ca")
                // Refresh schedule to get updated session from server
                await fetchSchedule()
            } else {
                toast.error(json.error || "Không thể chấm công")
            }
        } catch (error) {
            console.error('[Attendance] Check-out error:', error)
            const errMsg = error instanceof Error ? error.message : "Không thể chấm công"
            toast.error(errMsg)
        } finally {
            setGeoChecking(false)
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Đang tải...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Clock}
                title="Chấm Công"
                subtitle={`Xin chào, ${user?.fullName || "Nhân viên"}`}
            />

            <div className={cn("p-4 space-y-6", !isMobile && "max-w-7xl mx-auto p-6")}>
                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3">
                    <Link href="/attendance/shift-swaps">
                        <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <ArrowRightLeft className="w-6 h-6 mb-2 text-primary" />
                                <span className="text-sm font-medium">Đổi ca</span>
                            </CardContent>
                        </Card>
                    </Link>
                    {/* Leave Request */}
                    <Card
                        className="hover:border-primary transition-colors cursor-pointer h-full"
                        onClick={() => setLeaveDialogOpen(true)}
                    >
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                            <div className="relative">
                                <CalendarOff className="w-6 h-6 mb-2 text-orange-500" />
                                {leaveStats && leaveStats.remaining > 0 && (
                                    <Badge className="absolute -top-1 -right-3 text-xs px-1 py-0">
                                        {leaveStats.remaining}
                                    </Badge>
                                )}
                            </div>
                            <span className="text-sm font-medium">Nghỉ phép</span>
                            {leaveStats && (
                                <span className="text-xs text-muted-foreground">
                                    Còn {leaveStats.remaining}/{leaveStats.maxPerMonth} ngày
                                </span>
                            )}
                        </CardContent>
                    </Card>
                </div>
                {/* Current Time Card */}
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900">
                    <CardContent className="py-8">
                        <div className="text-center space-y-2">
                            <p className="text-sm text-muted-foreground uppercase tracking-wide">Thời gian hiện tại</p>
                            <p className="text-5xl font-bold text-primary tabular-nums">
                                {format(currentTime, "HH:mm:ss")}
                            </p>
                            <p className="text-lg text-muted-foreground">
                                {format(currentTime, "EEEE, dd/MM/yyyy", { locale: vi })}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Today's Status */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            Trạng Thái Hôm Nay
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!todayAssignment ? (
                            <div className="text-center py-6">
                                <CalendarOff className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                                <p className="text-muted-foreground">Bạn không có ca làm việc hôm nay</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                    <div>
                                        <p className="font-medium">{todayAssignment.work_shifts?.shift_name || "Ca làm việc"}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {todayAssignment.work_shifts?.start_time && todayAssignment.work_shifts?.end_time
                                                ? `${todayAssignment.work_shifts.start_time.toString().substring(0, 5)} - ${todayAssignment.work_shifts.end_time.toString().substring(0, 5)}`
                                                : "Chưa rõ giờ"
                                            }
                                        </p>
                                    </div>
                                    <Badge variant={
                                        forgotCheckIn
                                            ? "destructive"
                                            : todayStatus === "checked_out"
                                                ? "default"
                                                : todayStatus === "checked_in"
                                                    ? (todaySession?.status === "LATE" ? "destructive" : "secondary")
                                                    : "outline"
                                    }>
                                        {forgotCheckIn
                                            ? "Quên chấm công"
                                            : todayStatus === "checked_out"
                                                ? "Đã kết thúc"
                                                : todayStatus === "checked_in"
                                                    ? (todaySession?.status === "LATE" ? "Đi muộn" : "Đang làm việc")
                                                    : "Chưa vào ca"}
                                    </Badge>
                                </div>

                                {/* Check-in/Check-out info */}
                                {todaySession && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                                            <p className="text-xs text-muted-foreground">Giờ vào</p>
                                            <p className="font-semibold text-green-600">
                                                {todaySession.check_in_time
                                                    ? `${new Date(todaySession.check_in_time).getUTCHours().toString().padStart(2, '0')}:${new Date(todaySession.check_in_time).getUTCMinutes().toString().padStart(2, '0')}`
                                                    : "--:--"}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                                            <p className="text-xs text-muted-foreground">Giờ ra</p>
                                            <p className="font-semibold text-red-600">
                                                {todaySession.check_out_time
                                                    ? `${new Date(todaySession.check_out_time).getUTCHours().toString().padStart(2, '0')}:${new Date(todaySession.check_out_time).getUTCMinutes().toString().padStart(2, '0')}`
                                                    : "--:--"}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* GPS Error */}
                                {geoError && (
                                    <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-red-600">Lỗi vị trí</p>
                                                <p className="text-sm text-red-500">{geoError}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}


                                {/* Action Buttons */}
                                <div className="flex flex-col items-center gap-6 mt-4">
                                    {/* Status 0: Too early to check in - Premium SaaS Style */}
                                    {isTooEarlyToCheckIn && earliestCheckInTime && shiftStartTime && (
                                        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
                                            {/* Main countdown circle with gradient */}
                                            <div className="relative">
                                                {/* Outer glow ring */}
                                                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/20 to-purple-500/20 blur-xl scale-110" />

                                                {/* Main circle */}
                                                <div className="relative h-36 w-36 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex flex-col items-center justify-center shadow-2xl border border-slate-200 dark:border-slate-700">
                                                    {/* Decorative ring */}
                                                    <div className="absolute inset-2 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-700 animate-spin" style={{ animationDuration: '20s' }} />

                                                    {/* Time display */}
                                                    <div className="text-center z-10">
                                                        <div className="flex items-center justify-center gap-1 text-3xl font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                                            <Clock className="w-6 h-6 text-blue-500" />
                                                            <span>{format(earliestCheckInTime, "HH:mm")}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium uppercase tracking-wide">
                                                            Check-in mở
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Info card with glassmorphism */}
                                            <div className="w-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-lg">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                                                        <Calendar className="w-5 h-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-800 dark:text-slate-100">Ca làm chưa bắt đầu</p>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400">Vui lòng quay lại sau</p>
                                                    </div>
                                                </div>

                                                {/* Timeline */}
                                                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                                                    <div className="flex flex-col items-center">
                                                        <div className="h-3 w-3 rounded-full bg-blue-500 ring-4 ring-blue-500/20" />
                                                        <div className="w-0.5 h-6 bg-gradient-to-b from-blue-500 to-green-500" />
                                                        <div className="h-3 w-3 rounded-full bg-green-500 ring-4 ring-green-500/20" />
                                                    </div>
                                                    <div className="flex-1 space-y-4">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Có thể check-in</span>
                                                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">{format(earliestCheckInTime, "HH:mm")}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Ca bắt đầu</span>
                                                            <span className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">{format(shiftStartTime, "HH:mm")}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Status 1: Not checked in yet, within grace period */}
                                    {canCheckIn && (
                                        <div
                                            onClick={submitting || geoChecking ? undefined : handleCheckInClick}
                                            className={cn(
                                                "h-32 w-32 rounded-full bg-primary flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95 flex-col ring-4 ring-primary/20",
                                                (submitting || geoChecking) ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/90"
                                            )}
                                        >
                                            {geoChecking || submitting ? (
                                                <Loader2 className="w-10 h-10 animate-spin text-white mb-1" />
                                            ) : (
                                                <Fingerprint className="w-12 h-12 text-white mb-1" />
                                            )}
                                            <span className="text-xs text-white font-bold tracking-wider">
                                                {geoChecking ? "ĐỊNH VỊ..." : submitting ? "ĐANG XỬ LÝ..." : "VÀO CA"}
                                            </span>
                                        </div>
                                    )}

                                    {/* Status 2: Checked in, waiting to check out */}
                                    {todayStatus === "checked_in" && !todaySession?.check_out_time && (
                                        <div
                                            onClick={submitting || geoChecking ? undefined : handleCheckOutClick}
                                            className={cn(
                                                "h-32 w-32 rounded-full bg-orange-500 flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95 flex-col ring-4 ring-orange-500/20",
                                                (submitting || geoChecking) ? "opacity-50 cursor-not-allowed" : "hover:bg-orange-600"
                                            )}
                                        >
                                            {geoChecking || submitting ? (
                                                <Loader2 className="w-10 h-10 animate-spin text-white mb-1" />
                                            ) : (
                                                <Fingerprint className="w-12 h-12 text-white mb-1" />
                                            )}
                                            <span className="text-xs text-white font-bold tracking-wider">
                                                {geoChecking ? "ĐỊNH VỊ..." : submitting ? "ĐANG XỬ LÝ..." : "RA CA"}
                                            </span>
                                        </div>
                                    )}

                                    {/* Status 3: Forgot check in (late > 1h), allow late check out */}
                                    {forgotCheckIn && !hasCheckedOut && (
                                        <div
                                            onClick={submitting || geoChecking ? undefined : handleCheckOutClick}
                                            className={cn(
                                                "h-32 w-32 rounded-full bg-destructive flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95 flex-col ring-4 ring-destructive/20",
                                                (submitting || geoChecking) ? "opacity-50 cursor-not-allowed" : "hover:bg-destructive/90"
                                            )}
                                        >
                                            {geoChecking || submitting ? (
                                                <Loader2 className="w-10 h-10 animate-spin text-white mb-1" />
                                            ) : (
                                                <Fingerprint className="w-12 h-12 text-white mb-1" />
                                            )}
                                            <span className="text-xs text-white font-bold tracking-wider">
                                                {geoChecking ? "ĐỊNH VỊ..." : submitting ? "ĐANG XỬ LÝ..." : "RA CA"}
                                            </span>
                                        </div>
                                    )}

                                    {forgotCheckIn && !hasCheckedOut && (
                                        <div className="flex items-center gap-2 mt-2 text-destructive">
                                            <AlertCircle className="w-4 h-4" />
                                            <p className="text-sm font-medium text-center">
                                                Quên chấm công
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {todayStatus === "checked_out" && (
                                    <div className="flex-1 h-14 flex items-center justify-center bg-green-100 dark:bg-green-950/30 text-green-600 rounded-lg mt-4">
                                        <CheckCircle2 className="mr-2 h-5 w-5" />
                                        <span className="font-medium">Đã hoàn thành ca làm việc</span>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
            {/* Leave Request Dialog */}
            <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarOff className="w-5 h-5 text-orange-500" />
                            Xin nghỉ phép
                        </DialogTitle>
                        <DialogDescription>
                            {leaveStats
                                ? `Bạn còn ${leaveStats.remaining} ngày nghỉ phép trong tháng này`
                                : "Đang tải thông tin nghỉ phép..."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Leave Stats */}
                        {leaveStats && (
                            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <div className="text-sm">
                                    <p className="font-medium">Tháng {leaveStats.month}/{leaveStats.year}</p>
                                    <p className="text-muted-foreground">
                                        Đã dùng: {leaveStats.approved}/{leaveStats.maxPerMonth}
                                        {leaveStats.pending > 0 && ` | Đang chờ: ${leaveStats.pending}`}
                                    </p>
                                </div>
                                <Badge variant={leaveStats.remaining > 0 ? "default" : "destructive"}>
                                    Còn {leaveStats.remaining} ngày
                                </Badge>
                            </div>
                        )}

                        {/* Date Picker */}
                        <div className="space-y-2">
                            <Label>Chọn ngày nghỉ</Label>
                            <Popover modal={true}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !leaveDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {leaveDate ? format(leaveDate, "dd/MM/yyyy (EEEE)", { locale: vi }) : "Chọn ngày"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[100]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <CalendarPicker
                                        mode="single"
                                        selected={leaveDate || undefined}
                                        onSelect={(date) => setLeaveDate(date || null)}
                                        disabled={(date) => {
                                            const today = new Date()
                                            today.setHours(0, 0, 0, 0)
                                            // Disable past dates
                                            if (date < today) return true

                                            // Only allow dates where user has a shift assignment
                                            const dateStr = format(date, "yyyy-MM-dd")
                                            const hasAssignment = assignments.some(a =>
                                                format(new Date(a.assigned_date), "yyyy-MM-dd") === dateStr
                                            )
                                            return !hasAssignment
                                        }}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Reason */}
                        <div className="space-y-2">
                            <Label htmlFor="leave-reason">Lý do nghỉ (không bắt buộc)</Label>
                            <Textarea
                                id="leave-reason"
                                placeholder="Nhập lý do xin nghỉ..."
                                value={leaveReason}
                                onChange={(e) => setLeaveReason(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* Pending Leave Requests */}
                        {leaveRequests.filter(r => r.status === "PENDING").length > 0 && (
                            <div className="space-y-2">
                                <Label>Đơn nghỉ đang chờ duyệt</Label>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {leaveRequests
                                        .filter(r => r.status === "PENDING")
                                        .map(request => (
                                            <div key={request.id} className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded border">
                                                <div className="text-sm">
                                                    <p className="font-medium">
                                                        {format(new Date(request.leave_date), "dd/MM/yyyy (EEEE)", { locale: vi })}
                                                    </p>
                                                    {request.reason && (
                                                        <p className="text-muted-foreground text-xs">{request.reason}</p>
                                                    )}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-red-500 hover:text-red-700"
                                                    onClick={() => handleCancelLeave(request.id)}
                                                >
                                                    Hủy
                                                </Button>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
                            Đóng
                        </Button>
                        <Button
                            onClick={handleLeaveRequest}
                            disabled={submitting || !leaveDate || (leaveStats?.remaining === 0)}
                        >
                            {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirm Dialog */}
            <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDialog.onConfirm}>Xác nhận</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    )
}
