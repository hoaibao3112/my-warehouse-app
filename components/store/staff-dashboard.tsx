"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, isToday, addMonths, getDate, isSameMonth } from "date-fns"
import { vi } from "date-fns/locale"
import Link from "next/link"
import { mobileFetch } from "@/lib/mobile/api-client"
import {
  LayoutDashboard,
  Clock,
  Calendar,
  ArrowRightLeft,
  Bell,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Target,
  Award,
  Zap,
  Users,
  CalendarDays,
  FileCheck,
  History,
  ChevronRight,
  Star,
  Fingerprint,
} from "lucide-react"

// Check if registration period is open (20-28)
function isRegistrationPeriodOpen(): boolean {
  const day = getDate(new Date())
  return day >= 20 && day <= 28
}

function getTargetRegistrationMonth(): Date {
  return addMonths(new Date(), 1)
}

function getDaysUntilRegistration(): number {
  const day = getDate(new Date())
  if (day >= 20) return 0
  return 20 - day
}

function getRegistrationDaysRemaining(): number {
  const day = getDate(new Date())
  if (day < 20) return -1
  if (day > 28) return 0
  return 28 - day
}

interface ShiftSwapRequest {
  id: string
  requester_name: string
  requester_shift: string
  target_shift: string
  request_date: string
  status: string
}

interface PerformanceStats {
  totalShifts: number
  completedShifts: number
  lateCount: number
  onTimeRate: number
  totalHours: number
  averageHoursPerDay: number
}

export function StaffDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [todayAssignment, setTodayAssignment] = useState<any>(null)
  const [todaySession, setTodaySession] = useState<any>(null)
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([])
  const [pendingSwapsCount, setPendingSwapsCount] = useState(0)
  const [performance, setPerformance] = useState<PerformanceStats>({
    totalShifts: 0,
    completedShifts: 0,
    lateCount: 0,
    onTimeRate: 0,
    totalHours: 0,
    averageHoursPerDay: 0,
  })
  const [registeredNextMonth, setRegisteredNextMonth] = useState(0)
  const [employmentType, setEmploymentType] = useState<"FULLTIME" | "PARTTIME">("FULLTIME")

  // Mark as mounted and start clock on client only
  useEffect(() => {
    setMounted(true)
    setCurrentTime(new Date())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // CRITICAL: Fetch server time first to avoid device time manipulation
      let serverTime = new Date()
      try {
        const timeRes = await mobileFetch('/api/server-time')
        const timeJson = await timeRes.json()
        if (timeJson.success && timeJson.data?.currentTime) {
          serverTime = new Date(timeJson.data.currentTime)
        }
      } catch (e) {
        console.warn('Failed to fetch server time, using device time')
      }
      
      const year = serverTime.getFullYear()
      const month = serverTime.getMonth() + 1

      // Fetch schedule
      const scheduleRes = await mobileFetch(`/api/shifts/my-schedule?year=${year}&month=${month}`)
      const scheduleJson = await scheduleRes.json()

      if (scheduleJson.success) {
        // Use server time for today string
        const todayStr = format(serverTime, "yyyy-MM-dd")
        const assignment = scheduleJson.data.assignments.find(
          (a: any) => format(new Date(a.assigned_date), "yyyy-MM-dd") === todayStr
        )

        // Find session - try by session_date first, then by check_in_time or check_out_time (Vietnam time)
        let session = scheduleJson.data.sessions.find(
          (s: any) => format(new Date(s.session_date), "yyyy-MM-dd") === todayStr
        )
        if (!session) {
          // Try finding by check_in_time
          session = scheduleJson.data.sessions.find((s: any) => {
            if (!s.check_in_time) return false
            // CRITICAL: DB stores Vietnam time as UTC, so use UTC components directly
            const checkInDate = new Date(s.check_in_time)
            const year = checkInDate.getUTCFullYear()
            const month = String(checkInDate.getUTCMonth() + 1).padStart(2, '0')
            const day = String(checkInDate.getUTCDate()).padStart(2, '0')
            return `${year}-${month}-${day}` === todayStr
          })
        }
        if (!session) {
          // Try finding by check_out_time (case: forgot check-in but already checked out)
          session = scheduleJson.data.sessions.find((s: any) => {
            if (!s.check_out_time) return false
            const checkOutDate = new Date(s.check_out_time)
            const year = checkOutDate.getUTCFullYear()
            const month = String(checkOutDate.getUTCMonth() + 1).padStart(2, '0')
            const day = String(checkOutDate.getUTCDate()).padStart(2, '0')
            return `${year}-${month}-${day}` === todayStr
          })
        }

        setTodayAssignment(assignment)
        setTodaySession(session)

        // Calculate performance - check for late in notes
        const sessions = scheduleJson.data.sessions || []
        const completedSessions = sessions.filter((s: any) => s.check_out_time)
        const lateSessions = sessions.filter((s: any) =>
          s.notes?.includes("Đi muộn") || s.status === "LATE" || s.late_minutes > 0
        )
        // Use actual_duration from server (in minutes) - more accurate with proper timezone handling
        // VALIDATION: If actual_duration > 16 hours (960 min), data is likely corrupted - skip it
        const MAX_REASONABLE_DURATION_MINUTES = 960 // 16 hours max per shift
        const totalHours = sessions.reduce((acc: number, s: any) => {
          // Prefer actual_duration from server (stored in minutes) if reasonable
          if (s.actual_duration != null && s.actual_duration > 0 && s.actual_duration <= MAX_REASONABLE_DURATION_MINUTES) {
            return acc + s.actual_duration / 60
          }
          // Fallback: calculate from timestamps if actual_duration is not available or unreasonable
          if (s.check_in_time && s.check_out_time) {
            const diff = new Date(s.check_out_time).getTime() - new Date(s.check_in_time).getTime()
            const hours = diff / (1000 * 60 * 60)
            // Only count if reasonable (less than 16 hours)
            if (hours > 0 && hours <= 16) {
              return acc + hours
            }
          }
          return acc
        }, 0)

        setPerformance({
          totalShifts: scheduleJson.data.assignments?.length || 0,
          completedShifts: completedSessions.length,
          lateCount: lateSessions.length,
          onTimeRate: completedSessions.length > 0
            ? Math.round(((completedSessions.length - lateSessions.length) / completedSessions.length) * 100)
            : 100,
          totalHours: Math.round(totalHours * 10) / 10,
          averageHoursPerDay: completedSessions.length > 0
            ? Math.round((totalHours / completedSessions.length) * 10) / 10
            : 0,
        })

        // Count next month registrations
        const targetMonth = getTargetRegistrationMonth()
        const nextMonthAssignments = scheduleJson.data.assignments.filter((a: any) =>
          isSameMonth(new Date(a.assigned_date), targetMonth)
        )
        setRegisteredNextMonth(nextMonthAssignments.length)

        // Get employment type
        if (scheduleJson.data.statistics?.employmentType?.type) {
          setEmploymentType(scheduleJson.data.statistics.employmentType.type)
        }
      }

      // Fetch swap requests - use correct endpoint with type=available to get pending requests in my warehouse
      try {
        const swapRes = await mobileFetch("/api/shifts/swap?type=available")
        const swapJson = await swapRes.json()
        if (swapJson.success) {
          setSwapRequests(swapJson.data?.slice(0, 5) || [])
          setPendingSwapsCount(swapJson.data?.length || 0)
        }
      } catch (e) {
        console.error("Error fetching swap requests:", e)
      }

    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const isRegPeriodOpen = isRegistrationPeriodOpen()
  const targetMonth = getTargetRegistrationMonth()
  const daysRemaining = getRegistrationDaysRemaining()
  const daysUntilOpen = getDaysUntilRegistration()

  // Skill ratings (mock data - can be replaced with real API)
  const skills = [
    { name: "Đúng giờ", value: performance.onTimeRate, icon: Clock },
    { name: "Hoàn thành ca", value: performance.totalShifts > 0 ? Math.round((performance.completedShifts / performance.totalShifts) * 100) : 100, icon: CheckCircle2 },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={LayoutDashboard}
        title="Trang Chủ"
        subtitle={`Xin chào, ${user?.fullName || "Nhân viên"}`}
      />

      <div className="p-4 md:p-8 space-y-6">
        {/* Desktop Header */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Xin chào, {user?.fullName || "Nhân viên"}!</h1>
          <p className="text-muted-foreground mt-2">Chào mừng bạn quay trở lại</p>
        </div>

        {/* Today's Shift Card */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {currentTime ? format(currentTime, "EEEE, dd/MM/yyyy", { locale: vi }) : "—"}
                  </span>
                </div>
                <p className="text-3xl md:text-4xl font-bold tabular-nums">
                  {currentTime ? format(currentTime, "HH:mm:ss") : "--:--:--"}
                </p>
                {todayAssignment ? (
                  <div className="mt-3">
                    <Badge className="bg-primary">
                      Ca: {todayAssignment.work_shifts?.shift_name}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      {todayAssignment.work_shifts?.start_time?.slice(0, 5)} - {todayAssignment.work_shifts?.end_time?.slice(0, 5)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-3">Không có ca làm hôm nay</p>
                )}
              </div>

              {/* Attendance Button */}
              {todayAssignment && (() => {
                // Calculate attendance status based on shift time and grace periods
                // Same logic as register page
                const LATE_CHECKIN_GRACE_PERIOD = 30 // minutes
                const LATE_CHECKOUT_GRACE_PERIOD = 30 // minutes
                
                const hasCheckedIn = todaySession?.check_in_time
                const hasCheckedOut = todaySession?.check_out_time
                
                const shiftData = todayAssignment.work_shifts
                const now = currentTime || new Date()
                
                let canCheckIn = false
                let canCheckOut = false
                let forgotCheckIn = false
                let isShiftLocked = false
                
                if (shiftData?.start_time && shiftData?.end_time) {
                  const parseTime = (timeStr: string): [number, number] => {
                    if (timeStr.includes('T')) {
                      const timePart = timeStr.split('T')[1]
                      const [h, m] = timePart.split(':').map(Number)
                      return [h, m]
                    }
                    const [h, m] = timeStr.split(':').map(Number)
                    return [h, m]
                  }
                  
                  const [startHour, startMin] = parseTime(shiftData.start_time.toString())
                  const [endHour, endMin] = parseTime(shiftData.end_time.toString())
                  
                  const shiftStartDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0)
                  let shiftEndDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0)
                  
                  // Handle overnight shifts
                  if (endHour < startHour || (endHour === startHour && endMin < startMin)) {
                    shiftEndDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, endHour, endMin, 0)
                  }
                  
                  const checkInDeadline = new Date(shiftStartDateTime.getTime() + LATE_CHECKIN_GRACE_PERIOD * 60 * 1000)
                  const checkOutDeadline = new Date(shiftEndDateTime.getTime() + LATE_CHECKOUT_GRACE_PERIOD * 60 * 1000)
                  
                  const isShiftEnded = now > shiftEndDateTime
                  const isCheckInGracePeriodExpired = now > checkInDeadline
                  const isCheckOutGracePeriodExpired = now > checkOutDeadline
                  
                  canCheckIn = !hasCheckedIn && !isShiftEnded && !isCheckInGracePeriodExpired
                  canCheckOut = !hasCheckedOut && (
                    (hasCheckedIn && !isCheckOutGracePeriodExpired) ||
                    (!hasCheckedIn && isCheckInGracePeriodExpired && !isCheckOutGracePeriodExpired)
                  )
                  forgotCheckIn = !hasCheckedIn && isCheckInGracePeriodExpired && !isCheckOutGracePeriodExpired
                  isShiftLocked = (!hasCheckedIn && isCheckOutGracePeriodExpired) || 
                                  (hasCheckedIn && !hasCheckedOut && isCheckOutGracePeriodExpired)
                }
                
                // Determine button state
                let buttonColor = "bg-primary hover:bg-primary/90" // Default: Vào ca
                let buttonLabel = "Vào ca"
                
                if (hasCheckedOut) {
                  buttonColor = "bg-green-500"
                  buttonLabel = "Hoàn thành"
                } else if (canCheckOut) {
                  if (forgotCheckIn) {
                    buttonColor = "bg-destructive hover:bg-destructive/90"
                    buttonLabel = "Ra ca"
                  } else {
                    buttonColor = "bg-orange-500 hover:bg-orange-600"
                    buttonLabel = "Ra ca"
                  }
                } else if (isShiftLocked && !hasCheckedIn) {
                  buttonColor = "bg-destructive"
                  buttonLabel = "Vắng mặt"
                } else if (isShiftLocked && hasCheckedIn) {
                  buttonColor = "bg-destructive"
                  buttonLabel = "Chưa ra ca"
                } else if (canCheckIn) {
                  buttonColor = "bg-primary hover:bg-primary/90"
                  buttonLabel = "Vào ca"
                }
                
                // Determine icon - CheckCircle2 for completed, Fingerprint for others
                const IconComponent = hasCheckedOut ? CheckCircle2 : Fingerprint
                
                return (
                  <Link href="/store/shifts/register">
                    <div className="flex flex-col items-center">
                      <div className={`h-16 w-16 md:h-20 md:w-20 rounded-full ${buttonColor} flex items-center justify-center shadow-lg cursor-pointer transition-colors`}>
                        <IconComponent className="w-8 h-8 md:w-10 md:h-10 text-white" />
                      </div>
                      <span className="text-xs mt-2 font-medium text-center">
                        {buttonLabel}
                      </span>
                    </div>
                  </Link>
                )
              })()}
            </div>

            {/* Session Status Info */}
            {todayAssignment && todaySession && (
              <div className="mt-4 pt-3 border-t border-primary/20">
                <div className="flex items-center justify-between text-sm">
                  {todaySession.check_in_time && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Vào: {new Date(todaySession.check_in_time).toISOString().slice(11, 16)}</span>
                    </div>
                  )}
                  {todaySession.check_out_time && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ra: {new Date(todaySession.check_out_time).toISOString().slice(11, 16)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dynamic Reminder based on attendance status */}
            {todayAssignment && !todaySession?.check_out_time && (() => {
              // Calculate attendance status - same logic as button
              const LATE_CHECKIN_GRACE_PERIOD = 30
              const LATE_CHECKOUT_GRACE_PERIOD = 30
              
              const hasCheckedIn = todaySession?.check_in_time
              const shiftData = todayAssignment.work_shifts
              const now = currentTime || new Date()
              
              let canCheckIn = false
              let canCheckOut = false
              let forgotCheckIn = false
              
              if (shiftData?.start_time && shiftData?.end_time) {
                const parseTime = (timeStr: string): [number, number] => {
                  if (timeStr.includes('T')) {
                    const timePart = timeStr.split('T')[1]
                    const [h, m] = timePart.split(':').map(Number)
                    return [h, m]
                  }
                  const [h, m] = timeStr.split(':').map(Number)
                  return [h, m]
                }
                
                const [startHour, startMin] = parseTime(shiftData.start_time.toString())
                const [endHour, endMin] = parseTime(shiftData.end_time.toString())
                
                const shiftStartDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0)
                let shiftEndDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0)
                
                if (endHour < startHour || (endHour === startHour && endMin < startMin)) {
                  shiftEndDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, endHour, endMin, 0)
                }
                
                const checkInDeadline = new Date(shiftStartDateTime.getTime() + LATE_CHECKIN_GRACE_PERIOD * 60 * 1000)
                const checkOutDeadline = new Date(shiftEndDateTime.getTime() + LATE_CHECKOUT_GRACE_PERIOD * 60 * 1000)
                
                const isShiftEnded = now > shiftEndDateTime
                const isCheckInGracePeriodExpired = now > checkInDeadline
                const isCheckOutGracePeriodExpired = now > checkOutDeadline
                
                canCheckIn = !hasCheckedIn && !isShiftEnded && !isCheckInGracePeriodExpired
                canCheckOut = (hasCheckedIn && !isCheckOutGracePeriodExpired) ||
                              (!hasCheckedIn && isCheckInGracePeriodExpired && !isCheckOutGracePeriodExpired)
                forgotCheckIn = !hasCheckedIn && isCheckInGracePeriodExpired && !isCheckOutGracePeriodExpired
              }
              
              // Determine reminder message
              if (forgotCheckIn) {
                return (
                  <Link href="/store/shifts/register">
                    <div className="mt-4 pt-3 border-t border-primary/20">
                      <div className="flex items-center justify-between p-2 bg-red-100 dark:bg-red-900/30 rounded-lg cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium text-red-700 dark:text-red-300">
                            Chưa vào ca - Vui lòng ra ca để hoàn tất
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-red-600" />
                      </div>
                    </div>
                  </Link>
                )
              } else if (canCheckOut && hasCheckedIn) {
                return (
                  <Link href="/store/shifts/register">
                    <div className="mt-4 pt-3 border-t border-primary/20">
                      <div className="flex items-center justify-between p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg cursor-pointer hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-orange-600" />
                          <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                            Đang trong ca - Nhớ chấm công ra!
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-orange-600" />
                      </div>
                    </div>
                  </Link>
                )
              } else if (canCheckIn) {
                return (
                  <Link href="/store/shifts/register">
                    <div className="mt-4 pt-3 border-t border-primary/20">
                      <div className="flex items-center justify-between p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-yellow-600" />
                          <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                            Nhớ chấm công vào ca!
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-yellow-600" />
                      </div>
                    </div>
                  </Link>
                )
              }
              
              return null
            })()}
          </CardContent>
        </Card>

        {/* Registration Period Card */}
        <Card className={isRegPeriodOpen ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-orange-500 bg-orange-50 dark:bg-orange-950/20"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isRegPeriodOpen ? "bg-green-500" : "bg-orange-500"} text-white`}>
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold ${isRegPeriodOpen ? "text-green-700 dark:text-green-300" : "text-orange-700 dark:text-orange-300"}`}>
                  {isRegPeriodOpen
                    ? `Đang mở đăng ký ca tháng ${format(targetMonth, "MM/yyyy")}`
                    : `Đăng ký ca tháng ${format(targetMonth, "MM/yyyy")} chưa mở`
                  }
                </h3>
                <p className={`text-sm ${isRegPeriodOpen ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                  {isRegPeriodOpen
                    ? `Còn ${daysRemaining} ngày (đến 28/${format(new Date(), "MM")}). Đã đăng ký: ${registeredNextMonth}/${employmentType === "FULLTIME" ? "22" : "~"} ngày`
                    : `Mở từ ngày 20 hàng tháng (còn ${daysUntilOpen} ngày)`
                  }
                </p>
              </div>
              <Link href="/store/shifts/register">
                <Button size="sm" variant={isRegPeriodOpen ? "default" : "outline"}>
                  Đăng ký
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/store/shifts/register">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <Calendar className="w-6 h-6 mb-2 text-primary" />
                <span className="text-sm font-medium">Đăng ký ca</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/store/shifts/swap">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full relative">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <ArrowRightLeft className="w-6 h-6 mb-2 text-primary" />
                <span className="text-sm font-medium">Đổi ca</span>
                {pendingSwapsCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-red-500">
                    {pendingSwapsCount}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </Link>
          <Link href="/store/shifts/history">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <History className="w-6 h-6 mb-2 text-primary" />
                <span className="text-sm font-medium">Lịch sử</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/store/shifts/swap-approval">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <FileCheck className="w-6 h-6 mb-2 text-primary" />
                <span className="text-sm font-medium">Duyệt đổi ca</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Thống kê tháng này
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <p className="text-2xl font-bold text-green-600">{performance.completedShifts}</p>
                  <p className="text-xs text-green-600/80">Ca hoàn thành</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                  <p className="text-2xl font-bold text-orange-600">{performance.lateCount}</p>
                  <p className="text-xs text-orange-600/80">Đi muộn</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-2xl font-bold text-blue-600">{performance.totalHours}h</p>
                  <p className="text-xs text-blue-600/80">Tổng giờ làm</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20">
                  <p className="text-2xl font-bold text-purple-600">{performance.onTimeRate}%</p>
                  <p className="text-xs text-purple-600/80">Tỷ lệ đúng giờ</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skill Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Đánh giá kỹ năng
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {skills.map((skill) => {
                const Icon = skill.icon
                return (
                  <div key={skill.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span>{skill.name}</span>
                      </div>
                      <span className="font-medium">{skill.value}%</span>
                    </div>
                    <Progress value={skill.value} className="h-2" />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Pending Swap Requests */}
        {swapRequests.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Yêu cầu đổi ca
                </CardTitle>
                <Link href="/store/shifts/swap">
                  <Button variant="ghost" size="sm">
                    Xem tất cả
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {swapRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div>
                      <p className="font-medium text-sm">{request.requester_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {request.requester_shift} → {request.target_shift}
                      </p>
                    </div>
                    <Badge variant="secondary">Chờ duyệt</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Mục tiêu tháng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Ca làm việc</span>
                  <span className="font-medium">{performance.completedShifts}/{performance.totalShifts} ca</span>
                </div>
                <Progress
                  value={performance.totalShifts > 0 ? (performance.completedShifts / performance.totalShifts) * 100 : 0}
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Giờ làm việc</span>
                  <span className="font-medium">{performance.totalHours}/{employmentType === "FULLTIME" ? "176" : "80"}h</span>
                </div>
                <Progress
                  value={(performance.totalHours / (employmentType === "FULLTIME" ? 176 : 80)) * 100}
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Tỷ lệ đúng giờ</span>
                  <span className="font-medium">{performance.onTimeRate}%</span>
                </div>
                <Progress value={performance.onTimeRate} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
