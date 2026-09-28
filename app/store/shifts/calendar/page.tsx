"use client"

import { useEffect, useState } from "react"
import { WeeklyShiftCalendar } from "@/components/shifts/weekly-shift-calendar"
import { StaffMonthlyCalendar } from "@/components/shifts/staff-monthly-calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useAuth } from "@/hooks/use-auth"
import { Calendar, Users, Clock, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { format, addMonths, subMonths } from "date-fns"
import { vi } from "date-fns/locale"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"

export default function ShiftCalendarPage() {
  const { user } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [assignedWarehouseId, setAssignedWarehouseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isManager, setIsManager] = useState(false)

  // Staff calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [assignments, setAssignments] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [employmentType, setEmploymentType] = useState<"FULLTIME" | "PARTTIME">("FULLTIME")
  const [staffCalendarLoading, setStaffCalendarLoading] = useState(false)

  // CRITICAL: Fetch server time to prevent device time manipulation
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const fetchUserWarehouse = async () => {
      try {
        const res = await mobileFetch("/api/auth/me")
        const json = await res.json()

        if (json.success && json.data?.warehouseId) {
          setAssignedWarehouseId(json.data.warehouseId)
          // Check if user is manager
          const role = json.data.role
          setIsManager(role === "WAREHOUSE_MANAGER" || role === "ADMIN" || role === "GENERAL_MANAGER")
          setEmploymentType(json.data.employmentType?.type || "FULLTIME")
        } else {
          toast.error("Không tìm thấy thông tin kho của bạn")
        }
      } catch (error) {
        console.error("Error fetching user warehouse:", error)
        toast.error("Không thể tải thông tin người dùng")
      } finally {
        setLoading(false)
      }
    }

    fetchUserWarehouse()
  }, [toast])

  // CRITICAL SECURITY: Fetch server time to prevent device time manipulation
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

    // Update local clock every second using the calculated offset
    // This avoids calling the API repeatedly
    const timer = setInterval(() => {
      if (serverTimeOffset !== 0) {
        setCurrentTime(new Date(Date.now() + serverTimeOffset))
      } else {
        setCurrentTime(new Date())
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // For GENERAL_MANAGER, use selected warehouse; for others use assigned warehouse
  const warehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : assignedWarehouseId

  // Fetch staff calendar data
  useEffect(() => {
    if (!isManager && warehouseId) {
      fetchStaffCalendarData()
    }

    // Listen for warehouse changes - reload calendar
    const handleWarehouseChange = () => {
      console.log('[Shifts Calendar] Warehouse changed - reloading calendar')
      if (!isManager && warehouseId) {
        fetchStaffCalendarData()
      }
    }
    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [isManager, warehouseId, currentMonth])

  const fetchStaffCalendarData = async () => {
    setStaffCalendarLoading(true)
    try {
      const res = await mobileFetch("/api/shifts/my-schedule")
      const json = await res.json()

      if (json.success) {
        setAssignments(json.data.assignments || [])
        setSessions(json.data.sessions || [])
        setShifts(json.data.shifts || [])
        setPendingRequests(json.data.pendingRequests || [])
      } else {
        console.error("Error fetching staff schedule:", json.error)
      }
    } catch (error) {
      console.error("Error fetching staff schedule:", error)
      toast.error("Không thể tải lịch làm việc")
    } finally {
      setStaffCalendarLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!warehouseId) {
    return (
      <div className="p-6">
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Bạn chưa được gán vào kho nào</p>
          </div>
        </Card>
      </div>
    )
  }

  // Legend items with colors - matching staff-monthly-calendar
  const legendItems = [
    { color: "bg-muted border-muted-foreground/20", label: "Chưa xếp ca", icon: null },
    { color: "bg-purple-100 border-purple-300 dark:bg-purple-950 dark:border-purple-800", label: "Chờ duyệt", icon: Loader2 },
    { color: "bg-blue-100 border-blue-300 dark:bg-blue-950 dark:border-blue-800", label: "Đã xếp ca", icon: Clock },
    { color: "bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-800", label: "Đúng giờ", icon: CheckCircle2 },
    { color: "bg-orange-100 border-orange-300 dark:bg-orange-950 dark:border-orange-800", label: "Đi muộn/Ra sớm", icon: AlertTriangle },
    { color: "bg-amber-100 border-amber-300 dark:bg-amber-950 dark:border-amber-800", label: "Chưa chấm công", icon: XCircle },
    { color: "bg-red-100 border-red-300 dark:bg-red-950 dark:border-red-800", label: "Vắng mặt", icon: XCircle },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="bg-primary text-primary-foreground p-4 rounded-b-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{isManager ? "Xếp ca & Chấm công" : "Lịch làm việc"}</h1>
              <p className="text-sm opacity-80">{isManager ? "Quản lý lịch làm việc" : "Xem lịch làm việc của bạn"}</p>
            </div>
          </div>
        </div>
      )}

      <div className={cn("p-4 space-y-4", !isMobile && "max-w-full p-6")}>
        {/* Desktop Header */}
        {!isMobile && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                <Calendar className="w-8 h-8 text-primary" />
                {isManager ? "Xếp ca và Chấm công" : "Lịch làm việc"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isManager ? "Quản lý lịch làm việc của nhân viên trong kho" : "Xem lịch làm việc và trạng thái đăng ký ca của bạn"}
              </p>
            </div>
          </div>
        )}

        {/* Legend - Mobile: Compact horizontal scroll, Desktop: Full width */}
        <Card className={cn(isMobile ? "p-3" : "p-4")}>
          <div className={cn(
            "flex items-center gap-2",
            isMobile ? "overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" : "flex-wrap gap-4"
          )}>
            <span className={cn(
              "text-muted-foreground font-medium whitespace-nowrap",
              isMobile ? "text-xs" : "text-sm"
            )}>
              Chú thích:
            </span>
            {legendItems.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap",
                  isMobile ? "flex-shrink-0" : ""
                )}
              >
                <div className={cn(
                  "rounded border",
                  item.color,
                  isMobile ? "w-4 h-4" : "w-5 h-5"
                )}>
                  {item.icon && (
                    <item.icon className={cn(
                      "w-full h-full p-0.5",
                      item.color.includes("green") ? "text-green-600" :
                        item.color.includes("yellow") ? "text-yellow-600" :
                          item.color.includes("red") ? "text-red-600" :
                            item.color.includes("blue") ? "text-blue-600" :
                              item.color.includes("purple") ? "text-purple-600" : "text-muted-foreground",
                      item.label === "Chờ duyệt" && "animate-spin"
                    )} />
                  )}
                </div>
                <span className={cn(isMobile ? "text-xs" : "text-sm")}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Calendar Component - Manager vs Staff */}
        {isManager ? (
          <WeeklyShiftCalendar warehouseId={warehouseId} />
        ) : (
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
                onRegister={() => { }}
                onCancel={() => { }}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                employmentType={employmentType}
                readonly={true}
                currentTime={currentTime}
                loading={staffCalendarLoading}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
