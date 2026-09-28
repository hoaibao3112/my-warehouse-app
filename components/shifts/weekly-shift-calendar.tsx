"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Calendar, Users, Clock, CalendarDays, CalendarRange, CalendarClock, Banknote, Loader2, FileSpreadsheet } from "lucide-react"
import { ShiftCell } from "./shift-cell"
import { ShiftAssignmentDialog } from "./shift-assignment-dialog"
import { ShiftDetailDialog } from "./shift-detail-dialog"
import { ShiftImportDialog } from "./shift-import-dialog"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { format, startOfWeek, endOfWeek, startOfMonth, addDays, addWeeks, subWeeks, addMonths, subMonths, isSameDay, getDaysInMonth, isSameWeek } from "date-fns"
import { vi } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatTime, AttendanceStatus, determineAttendanceStatus, getStatusColor } from "@/lib/shift-status"
import { mobileFetch } from "@/lib/mobile/api-client"
// View mode type
type ViewMode = "7days" | "30days" | "day"

// Helper functions for date formatting
// Server is in Vietnam timezone, so we format dates directly
// DEPRECATED: Use currentTime state instead to get server time
function getVietnamNow(): Date {
  return new Date()
}

function formatDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

// Format local Date to Vietnam date string (yyyy-MM-dd)
function formatToVietnamDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

// Format DB date (stored as UTC midnight) to Vietnam date string
function formatDBDateToVietnamStr(dbDate: Date | string): string {
  const d = typeof dbDate === 'string' ? new Date(dbDate) : dbDate
  // Extract the date part from UTC midnight representation
  return d.toISOString().split('T')[0]
}

// Timeline hours (6:00 - 23:00)
const TIMELINE_START = 6
const TIMELINE_END = 23
const TIMELINE_HOURS = Array.from({ length: TIMELINE_END - TIMELINE_START + 1 }, (_, i) => TIMELINE_START + i)

// Parse time string to hours (decimal)
function parseTimeToHours(timeStr: string): number {
  if (!timeStr) return 0
  // Handle ISO datetime
  if (timeStr.includes('T')) {
    const date = new Date(timeStr)
    // CRITICAL: DB stores Vietnam time as UTC, so use getUTCHours() to get correct time
    const hours = date.getUTCHours()
    const minutes = date.getUTCMinutes()
    return hours + minutes / 60
  }
  // Handle HH:MM:SS format
  const parts = timeStr.split(':')
  const hours = parseInt(parts[0], 10)
  const minutes = parseInt(parts[1] || '0', 10)
  return hours + minutes / 60
}

// Format hours to HH:MM
function formatHoursToTime(hours: number): string {
  const h = Math.floor(hours) % 24
  const m = Math.round((hours - Math.floor(hours)) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

interface WeeklyShiftCalendarProps {
  warehouseId: string
}

export function WeeklyShiftCalendar({ warehouseId }: WeeklyShiftCalendarProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")

  // CRITICAL: Fetch server time to prevent device time manipulation
  const [currentTime, setCurrentTime] = useState(new Date())

  // View mode: 7days, 30days, or day
  const [viewMode, setViewMode] = useState<ViewMode>("7days")
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  )
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDateState] = useState<Date>(new Date())

  const [loading, setLoading] = useState(false)
  const [shifts, setShifts] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])

  // Dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [selectedDateForDialog, setSelectedDateForDialog] = useState<Date | null>(null)
  const [currentAssignment, setCurrentAssignment] = useState<any | null>(null)
  const [currentPendingRequest, setCurrentPendingRequest] = useState<any | null>(null)
  const [autoOpenCreate, setAutoOpenCreate] = useState(false) // NEW: State to trigger auto-open create dialog

  // Mobile: Selected day for viewing
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const diff = Math.floor((today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
    return Math.min(Math.max(diff, 0), 6)
  })

  // Generate days based on view mode
  const days = useMemo(() => {
    if (viewMode === "7days") {
      return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))
    } else if (viewMode === "30days") {
      const daysInMonth = getDaysInMonth(currentMonth)
      return Array.from({ length: daysInMonth }, (_, i) => addDays(currentMonth, i))
    } else {
      return [selectedDate]
    }
  }, [viewMode, currentWeekStart, currentMonth, selectedDate])

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))
    , [currentWeekStart])

  const fetchCalendarData = async () => {
    setLoading(true)
    try {
      let startDate: string, endDate: string

      if (viewMode === "7days") {
        startDate = format(currentWeekStart, "yyyy-MM-dd")
        endDate = format(addDays(currentWeekStart, 6), "yyyy-MM-dd")
      } else if (viewMode === "30days") {
        startDate = format(currentMonth, "yyyy-MM-dd")
        const daysInMonth = getDaysInMonth(currentMonth)
        endDate = format(addDays(currentMonth, daysInMonth - 1), "yyyy-MM-dd")
      } else {
        startDate = format(selectedDate, "yyyy-MM-dd")
        endDate = format(selectedDate, "yyyy-MM-dd")
      }

      const res = await mobileFetch(`/api/shifts/assignments/calendar?startDate=${startDate}&endDate=${endDate}&warehouseId=${warehouseId}`
      )
      const json = await res.json()

      if (json.success) {
        setShifts(json.data.shifts || [])
        setUsers(json.data.users || [])
        setAssignments(json.data.assignments || [])
        setSessions(json.data.sessions || [])
        setPendingRequests(json.data.pendingRequests || [])
      } else {
        toast.error(json.error || "Không thể tải dữ liệu lịch")
      }
    } catch (error) {
      console.error("Error fetching calendar data:", error)
      toast.error("Không thể tải dữ liệu lịch")
    } finally {
      setLoading(false)
    }
  }

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

  useEffect(() => {
    fetchCalendarData()
  }, [currentWeekStart, currentMonth, selectedDate, viewMode, warehouseId])

  // Navigation handlers
  const handlePrevious = () => {
    if (viewMode === "7days") {
      setCurrentWeekStart(subWeeks(currentWeekStart, 1))
    } else if (viewMode === "30days") {
      setCurrentMonth(subMonths(currentMonth, 1))
    } else {
      setSelectedDateState(addDays(selectedDate, -1))
    }
  }

  const handleNext = () => {
    if (viewMode === "7days") {
      setCurrentWeekStart(addWeeks(currentWeekStart, 1))
    } else if (viewMode === "30days") {
      setCurrentMonth(addMonths(currentMonth, 1))
    } else {
      setSelectedDateState(addDays(selectedDate, 1))
    }
  }

  const handleToday = () => {
    // CRITICAL: Use currentTime (server time) instead of new Date() (device time)
    const today = currentTime
    setCurrentWeekStart(startOfWeek(today, { weekStartsOn: 1 }))
    setCurrentMonth(startOfMonth(today))
    setSelectedDateState(today)
  }

  // When changing view mode, sync the dates
  const handleViewModeChange = (mode: ViewMode) => {
    // CRITICAL: Use currentTime (server time) instead of new Date() (device time)
    const today = currentTime

    if (mode === "7days" && viewMode !== "7days") {
      // When switching to week view, use today's week (not the month start)
      // This ensures we always show the current/relevant week
      if (viewMode === "30days") {
        // From month view: check if today is in the current month, if so use today's week
        // otherwise use the first day of that month's week
        const monthStart = currentMonth
        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
        if (today >= monthStart && today <= monthEnd) {
          setCurrentWeekStart(startOfWeek(today, { weekStartsOn: 1 }))
        } else {
          setCurrentWeekStart(startOfWeek(currentMonth, { weekStartsOn: 1 }))
        }
      } else {
        // From day view: use the selected date's week
        setCurrentWeekStart(startOfWeek(selectedDate, { weekStartsOn: 1 }))
      }
    } else if (mode === "30days" && viewMode !== "30days") {
      const refDate = viewMode === "day" ? selectedDate : currentWeekStart
      setCurrentMonth(startOfMonth(refDate))
    } else if (mode === "day" && viewMode !== "day") {
      // When switching to day view, prefer today if it's in the current range
      if (viewMode === "7days") {
        const weekEnd = addDays(currentWeekStart, 6)
        if (today >= currentWeekStart && today <= weekEnd) {
          setSelectedDateState(today)
        } else {
          setSelectedDateState(currentWeekStart)
        }
      } else {
        // From month view
        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
        if (today >= currentMonth && today <= monthEnd) {
          setSelectedDateState(today)
        } else {
          setSelectedDateState(currentMonth)
        }
      }
    }
    setViewMode(mode)
  }

  const handleCellClick = (user: any, date: Date) => {
    // Legacy handler - kept for backward compatibility
    // This should only be called for empty cells or as a fallback
    const dateStr = formatToVietnamDateStr(date)
    const assignment = assignments.find(
      (a) =>
        a.user_id === user.id &&
        formatDBDateToVietnamStr(a.assigned_date) === dateStr
    )

    // Find pending request
    const request = pendingRequests.find(
      (r) =>
        r.user_id === user.id &&
        formatDBDateToVietnamStr(r.requested_date) === dateStr &&
        r.status === "PENDING"
    )

    setSelectedUser(user)
    setSelectedDateForDialog(date)

    if (request) {
      setCurrentPendingRequest(request)
      setCurrentAssignment(null)
      setDetailDialogOpen(true)
    } else if (assignment) {
      setCurrentAssignment(assignment)
      setCurrentPendingRequest(null)
      setDetailDialogOpen(true)
    } else {
      setCurrentAssignment(null)
      setCurrentPendingRequest(null)
      setAssignDialogOpen(true)
    }
  }

  // NEW: Handler for adding a new shift assignment
  const handleAddShift = (user: any, date: Date) => {
    setSelectedUser(user)
    setSelectedDateForDialog(date)
    setCurrentAssignment(null)
    setCurrentPendingRequest(null)
    setAssignDialogOpen(true)
  }

  // NEW: Handler for editing an existing shift assignment
  const handleEditShift = (user: any, date: Date, targetAssignment: any) => {
    setSelectedUser(user)
    setSelectedDateForDialog(date)
    setCurrentAssignment(targetAssignment)
    setCurrentPendingRequest(null)
    setDetailDialogOpen(true)
  }

  // NEW: Handler for viewing pending request
  const handleViewRequest = (user: any, date: Date, request: any) => {
    setSelectedUser(user)
    setSelectedDateForDialog(date)
    setCurrentPendingRequest(request)
    setCurrentAssignment(null)
    setDetailDialogOpen(true)
  }

  const handleSaveAssignment = (assignment?: any, createAttendance?: boolean) => {
    fetchCalendarData()
    setAssignDialogOpen(false)

    // Handle "Create Attendance Now" flow
    if (createAttendance && assignment) {
      setCurrentAssignment(assignment)
      setCurrentPendingRequest(null)
      setAutoOpenCreate(true)
      // Small timeout to allow dialog animation/state update
      setTimeout(() => setDetailDialogOpen(true), 100)
    }
  }



  // Helper to get assignment for a specific user and date
  const getAssignment = (userId: string, date: Date) => {
    const dateStr = formatToVietnamDateStr(date)
    return assignments.find(
      (a) =>
        a.user_id === userId &&
        formatDBDateToVietnamStr(a.assigned_date) === dateStr
    )
  }

  // Helper to get session for a specific user and date
  // UNIFIED LOGIC: Matches standard ShiftCell logic exactly to prevent "Grid Green / Dialog Absent" mismatch.
  const getShiftSession = (userId: string, date: Date, assignment?: any) => {
    const dateStr = formatToVietnamDateStr(date)

    // 1. Get candidate sessions for this user/date
    const candidates = sessions.filter(s =>
      s.user_id === userId &&
      formatDBDateToVietnamStr(s.session_date) === dateStr
    )

    // 2. If looking for a specific assignment
    if (assignment) {
      // 2a. Absolute Best: Exact ID Match
      if (assignment.id) {
        const exactMatch = candidates.find(s => s.shift_assignment_id === assignment.id)
        if (exactMatch) return exactMatch
      }

      // 2b. Recovery/Permissive Match (Matches ShiftCell logic):
      // If we can't find exact ID, check if there's a session for the SAME SHIFT TYPE (e.g. Ca Sáng).
      // We explicitly allow sessions even if they have a mismatched/old assignment ID.
      if (assignment.work_shift_id) {
        return candidates.find(s => s.work_shift_id === assignment.work_shift_id)
      }

      // If we have an assignment object but can't match anything, return nothing (Absent).
      return undefined
    }

    // 3. Fallback (No Assignment provided): Find legacy session (Strictly no ID)
    return candidates.find(s => !s.shift_assignment_id)
  }

  // Helper to get shift template by ID
  const getShiftTemplate = (shiftId: string) => {
    return shifts.find((s) => s.id === shiftId)
  }

  // NEW: Helper to get ALL assignments for a specific user and date
  const getAssignments = (userId: string, date: Date) => {
    const dateStr = formatToVietnamDateStr(date)
    return assignments.filter(
      (a) =>
        a.user_id === userId &&
        formatDBDateToVietnamStr(a.assigned_date) === dateStr
    )
  }

  // NEW: Helper to get ALL sessions for a specific user and date
  const getShiftSessions = (userId: string, date: Date) => {
    const dateStr = formatToVietnamDateStr(date)
    return sessions.filter(
      (s) =>
        s.user_id === userId &&
        formatDBDateToVietnamStr(s.session_date) === dateStr
    )
  }

  // Helper to get pending/rejected request for a specific user and date
  // Priority: PENDING > REJECTED, and if multiple, get the most recent one
  const getPendingRequest = (userId: string, date: Date) => {
    const dateStr = formatToVietnamDateStr(date)
    const matchingRequests = pendingRequests.filter(
      (r) =>
        r.user_id === userId &&
        formatDBDateToVietnamStr(r.requested_date) === dateStr
    )

    if (matchingRequests.length === 0) return undefined

    // Sort: PENDING first, then by created_at descending (newest first)
    matchingRequests.sort((a, b) => {
      // PENDING has higher priority
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1
      // Same status, sort by created_at descending
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return matchingRequests[0]
  }



  if (loading && users.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full"></div>
          <span>Đang tải dữ liệu...</span>
        </div>
      </Card>
    )
  }

  // Mobile Layout
  if (isMobile) {
    const selectedDay = weekDays[selectedDayIndex]

    return (
      <div className="space-y-4">
        {/* Week Navigation - Compact for mobile */}
        <Card className={cn(loading && "opacity-60")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="icon" onClick={handlePrevious} disabled={loading}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="text-center flex items-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                <div>
                  <p className="text-sm font-semibold">
                    {format(currentWeekStart, "dd/MM", { locale: vi })} - {format(addDays(currentWeekStart, 6), "dd/MM", { locale: vi })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(currentWeekStart, "yyyy")}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleNext} disabled={loading}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Day Selector - Horizontal scroll */}
            <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {weekDays.map((day, index) => {
                const isToday = isSameDay(day, new Date())
                const isSelected = index === selectedDayIndex
                const dayDateStr = formatToVietnamDateStr(day)
                const dayAssignments = assignments.filter(a =>
                  formatDBDateToVietnamStr(a.assigned_date) === dayDateStr
                )

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDayIndex(index)}
                    className={cn(
                      "flex-shrink-0 flex flex-col items-center p-2 rounded-xl min-w-[48px] transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-md"
                        : isToday
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                    )}
                  >
                    <span className="text-[10px] font-medium uppercase">
                      {format(day, "EEE", { locale: vi })}
                    </span>
                    <span className={cn(
                      "text-lg font-bold",
                      isSelected ? "" : isToday ? "text-primary" : ""
                    )}>
                      {format(day, "dd")}
                    </span>
                    {dayAssignments.length > 0 && (
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full mt-0.5",
                        isSelected ? "bg-primary-foreground" : "bg-primary"
                      )} />
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Today Button + Import Button */}
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              handleToday()
              setSelectedDayIndex(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
            }}
            className="text-xs"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Hôm nay
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
            className="text-xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Button>
        </div>

        {/* Selected Day Header */}
        <div className="flex items-center justify-between px-1">
          <h3 className="font-semibold">
            {format(selectedDay, "EEEE, dd/MM", { locale: vi })}
          </h3>
          <Badge variant="secondary" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {/* Compute displayed users for count */}
            {(() => {
              const displayedUsers = users.filter(user => {
                // Always show staff roles
                if (['STAFF', 'ATTENDANCE_STAFF', 'WAREHOUSE_STAFF'].includes(user.role)) return true;
                // For managers or others, only show if they have assignments/sessions/requests in the current view
                // Optimization: Check if they have ANY activity in the loaded data (assignments/sessions are for the whole period)
                const hasActivity = assignments.some(a => a.user_id === user.id) ||
                  sessions.some(s => s.user_id === user.id) ||
                  pendingRequests.some(r => r.user_id === user.id);
                return hasActivity;
              });
              return displayedUsers.length;
            })()} nhân viên
          </Badge>
        </div>

        {/* Employee List for Selected Day */}
        <div className="space-y-2">
          {(() => {
            const displayedUsers = users.filter(user => {
              // Always show staff roles
              if (['STAFF', 'ATTENDANCE_STAFF', 'WAREHOUSE_STAFF'].includes(user.role)) return true;

              // For managers or others, only show if they have assignments/sessions/requests
              const hasActivity = assignments.some(a => a.user_id === user.id) ||
                sessions.some(s => s.user_id === user.id) ||
                pendingRequests.some(r => r.user_id === user.id);
              return hasActivity;
            });

            if (displayedUsers.length === 0) {
              return (
                <Card className="p-8">
                  <div className="text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Không có nhân viên chấm công nào trong kho này</p>
                  </div>
                </Card>
              )
            }

            return displayedUsers.map((user) => {
              // Use new helper functions for multiple shifts
              const userAssignments = getAssignments(user.id, selectedDay)
              const userSessions = getShiftSessions(user.id, selectedDay)
              const pendingRequest = getPendingRequest(user.id, selectedDay)

              // Legacy support - try to match session to the first assignment
              const assignment = getAssignment(user.id, selectedDay)
              const session = getShiftSession(user.id, selectedDay, assignment)
              const shiftTemplate = assignment
                ? getShiftTemplate(assignment.work_shift_id)
                : pendingRequest
                  ? getShiftTemplate(pendingRequest.work_shift_id)
                  : null

              return (
                <Card
                  key={user.id}
                  className="overflow-hidden border-l-4 border-l-transparent hover:border-l-primary transition-all hover:shadow-md"
                >
                  <CardContent className="p-0">
                    <div className="flex h-full min-h-[100px]">
                      {/* Shift Cell - Left side (User Info) */}
                      <div
                        className="w-[120px] flex-shrink-0 bg-muted/30 p-3 flex flex-col justify-center border-r"
                      >
                        <div className="font-medium text-sm line-clamp-2" title={user.full_name}>
                          {user.full_name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {user.role === "WAREHOUSE_MANAGER" ? "Quản lý" : "Nhân viên"}
                        </div>

                        {/* Summary of shifts */}
                        <div className="mt-2">
                          {userAssignments.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] mt-0.5">
                              {userAssignments.length} ca
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Shift Cell - Right side */}
                      <div className="flex-1 min-w-0">
                        <ShiftCell
                          assignment={assignment}
                          assignments={userAssignments}
                          shiftSession={session}
                          shiftSessions={userSessions}
                          shiftTemplate={shiftTemplate}
                          pendingRequest={pendingRequest}
                          onClick={() => {
                            // Handle pending request click
                            if (pendingRequest) {
                              handleViewRequest(user, selectedDay, pendingRequest)
                            }
                          }}
                          onAdd={() => {
                            setSelectedUser(user)
                            setSelectedDateForDialog(selectedDay)
                            setCurrentAssignment(null)
                            setCurrentPendingRequest(null)
                            setAssignDialogOpen(true)
                          }}
                          onEdit={(targetAssignment: any) => {
                            setSelectedUser(user)
                            setSelectedDateForDialog(selectedDay)
                            setCurrentAssignment(targetAssignment)
                            setCurrentPendingRequest(null)
                            // Note: ShiftDetailDialog consumes 'shiftSession' as a single prop.
                            // The dialog should look up the session for the specific assignment if needed.
                            setDetailDialogOpen(true)
                          }}
                          readOnly={false}
                          className="rounded-none border-0 min-h-0 h-full"
                          currentTime={currentTime}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          })()}
        </div>

        {/* Dialogs */}
        <ShiftAssignmentDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          user={selectedUser}
          date={selectedDate}
          currentAssignment={currentAssignment}
          shifts={shifts}
          onSave={handleSaveAssignment}
        />

        <ShiftDetailDialog
          key={currentAssignment?.id || currentPendingRequest?.id || 'empty-dialog'} // CRITICAL FIX: Force re-mount when assignment changes to clear stale state
          open={detailDialogOpen}
          onOpenChange={(open) => {
            setDetailDialogOpen(open)
            if (!open) {
              setAutoOpenCreate(false)
            }
          }}
          assignment={currentAssignment}
          shiftSession={currentAssignment ? getShiftSession(currentAssignment.user_id, selectedDateForDialog || selectedDate, currentAssignment) : null}
          shiftTemplate={currentAssignment
            ? getShiftTemplate(currentAssignment.work_shift_id)
            : currentPendingRequest
              ? getShiftTemplate(currentPendingRequest.work_shift_id)
              : null
          }
          user={selectedUser}
          date={selectedDateForDialog || selectedDate}
          pendingRequest={currentPendingRequest}
          onEdit={() => {
            setDetailDialogOpen(false)
            setAssignDialogOpen(true)
            setAutoOpenCreate(false)
          }}
          onDelete={() => {
            fetchCalendarData()
          }}
          defaultOpenCreate={autoOpenCreate}
        />
      </div>
    )
  }

  // Desktop Layout
  return (
    <div className="space-y-4">
      {/* Navigation & View Mode Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* View Mode Tabs */}
            <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as ViewMode)} className="w-full lg:w-auto">
              <TabsList className="grid w-full lg:w-auto grid-cols-3">
                <TabsTrigger value="day" className="flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4" />
                  <span className="hidden sm:inline">Theo ngày</span>
                </TabsTrigger>
                <TabsTrigger value="7days" className="flex items-center gap-1.5">
                  <CalendarRange className="w-4 h-4" />
                  <span className="hidden sm:inline">Theo tuần</span>
                </TabsTrigger>
                <TabsTrigger value="30days" className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  <span className="hidden sm:inline">Theo tháng</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Navigation Controls */}
            <div className="flex items-center gap-2 flex-wrap justify-center lg:justify-end">
              <Button variant="outline" size="sm" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Day: Date Picker */}
              {viewMode === "day" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="min-w-[200px]">
                      <Calendar className="h-4 w-4 mr-2" />
                      {format(selectedDate, "EEEE, dd/MM/yyyy", { locale: vi })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <CalendarPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDateState(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}

              {/* Week: Week Picker via Calendar */}
              {viewMode === "7days" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="min-w-[180px]">
                      <Calendar className="h-4 w-4 mr-2" />
                      {format(currentWeekStart, "dd/MM", { locale: vi })} - {format(addDays(currentWeekStart, 6), "dd/MM/yyyy", { locale: vi })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <CalendarPicker
                      mode="single"
                      selected={currentWeekStart}
                      onSelect={(date) => {
                        if (date) {
                          setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }))
                        }
                      }}
                      modifiers={{
                        selectedWeek: (date) => isSameWeek(date, currentWeekStart, { weekStartsOn: 1 }),
                        weekStart: (date) => isSameDay(date, currentWeekStart),
                        weekEnd: (date) => isSameDay(date, endOfWeek(currentWeekStart, { weekStartsOn: 1 }))
                      }}
                      modifiersClassNames={{
                        selectedWeek: "!bg-primary !text-primary-foreground hover:!bg-primary hover:!text-primary-foreground",
                        weekStart: "rounded-l-md",
                        weekEnd: "rounded-r-md",
                        today: "!bg-primary/30 !text-primary font-bold"
                      }}
                      weekStartsOn={1}
                      initialFocus
                      classNames={{
                        day: "rounded-none",
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}

              {/* Month: Month Selector */}
              {viewMode === "30days" && (
                <Select
                  value={format(currentMonth, "yyyy-MM")}
                  onValueChange={(v) => setCurrentMonth(new Date(v + "-01"))}
                >
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue>{format(currentMonth, "MMMM yyyy", { locale: vi })}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => {
                      const date = new Date(currentMonth.getFullYear(), i, 1)
                      return (
                        <SelectItem key={i} value={format(date, "yyyy-MM")}>
                          {format(date, "MMMM yyyy", { locale: vi })}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              )}

              <Button variant="outline" size="sm" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button variant="outline" size="sm" onClick={handleToday}>
                <Calendar className="h-4 w-4 mr-2" />
                Hôm nay
              </Button>

              <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Import
              </Button>

              {loading && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Đang tải...</span>
                </div>
              )}

              <Badge variant="secondary">
                <Users className="w-3.5 h-3.5 mr-1.5" />
                {users.length} nhân viên
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid - Different layouts based on view mode */}
      {viewMode === "day" ? (
        // Day View - Timeline layout with 24h axis
        <Card className={cn("overflow-hidden relative", loading && "opacity-60")}>
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Đang tải dữ liệu...</span>
              </div>
            </div>
          )}
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Timeline - {format(selectedDate, "EEEE, dd/MM/yyyy", { locale: vi })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                {/* Timeline Header */}
                <div className="flex border-b bg-muted/30">
                  <div className="w-48 flex-shrink-0 p-3 font-medium text-sm border-r bg-muted/50">
                    Nhân viên
                  </div>
                  <div className="flex-1 flex">
                    {TIMELINE_HOURS.map((hour) => {
                      // CRITICAL: Use currentTime (server time) instead of new Date() (device time)
                      const isCurrentHour = isSameDay(selectedDate, currentTime) && hour === currentTime.getHours()
                      return (
                        <div
                          key={hour}
                          className={cn(
                            "flex-1 min-w-[50px] p-2 text-center text-xs font-medium border-r",
                            isCurrentHour && "bg-primary/10 text-primary"
                          )}
                        >
                          {hour.toString().padStart(2, '0')}:00
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Timeline Body */}
                {users.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Không có nhân viên nào trong kho này</p>
                  </div>
                ) : (
                  users.map((user) => {
                    const assignment = getAssignment(user.id, selectedDate)
                    const session = getShiftSession(user.id, selectedDate)
                    const pendingRequest = getPendingRequest(user.id, selectedDate)
                    const shiftTemplate = assignment
                      ? getShiftTemplate(assignment.work_shift_id)
                      : pendingRequest
                        ? getShiftTemplate(pendingRequest.work_shift_id)
                        : null

                    // Calculate shift bar position
                    let shiftStart = 0
                    let shiftEnd = 0
                    let checkInHour = 0
                    let checkOutHour = 0

                    if (shiftTemplate) {
                      shiftStart = parseTimeToHours(shiftTemplate.start_time)
                      shiftEnd = parseTimeToHours(shiftTemplate.end_time)
                    }

                    if (session?.check_in_time) {
                      checkInHour = parseTimeToHours(session.check_in_time)
                    }
                    if (session?.check_out_time) {
                      checkOutHour = parseTimeToHours(session.check_out_time)
                    }

                    const timelineWidth = TIMELINE_END - TIMELINE_START + 1
                    const shiftLeftPercent = shiftTemplate ? Math.max(0, ((shiftStart - TIMELINE_START) / timelineWidth) * 100) : 0
                    const shiftWidthPercent = shiftTemplate ? Math.min(100 - shiftLeftPercent, ((shiftEnd - shiftStart) / timelineWidth) * 100) : 0
                    const isToday = isSameDay(selectedDate, new Date())

                    // Determine status for consistent coloring
                    const attendanceStatus = pendingRequest?.status === "PENDING"
                      ? AttendanceStatus.PENDING_APPROVAL
                      : pendingRequest?.status === "REJECTED"
                        ? AttendanceStatus.REJECTED
                        : determineAttendanceStatus(assignment, session, shiftTemplate, currentTime)
                    const statusColorClass = getStatusColor(attendanceStatus)

                    return (
                      <div
                        key={user.id}
                        className="flex border-b hover:bg-muted/20 transition-colors"
                      >
                        {/* User Info */}
                        <div className="w-48 flex-shrink-0 p-3 border-r flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                            {user.full_name?.substring(0, 2).toUpperCase() || "??"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{user.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email?.split("@")[0]}</p>
                          </div>
                        </div>

                        {/* Timeline Bar */}
                        <div className="flex-1 relative h-16">
                          {/* Hour grid lines */}
                          <div className="absolute inset-0 flex">
                            {TIMELINE_HOURS.map((hour) => {
                              // CRITICAL: Use currentTime (server time) instead of new Date() (device time)
                              const isCurrentHour = isToday && hour === currentTime.getHours()
                              return (
                                <div
                                  key={hour}
                                  className={cn(
                                    "flex-1 border-r border-dashed border-muted-foreground/20",
                                    isCurrentHour && "bg-primary/5"
                                  )}
                                />
                              )
                            })}
                          </div>

                          {/* Current time indicator */}
                          {isToday && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                              style={{
                                // CRITICAL: Use currentTime (server time) instead of new Date() (device time)
                                left: `${((currentTime.getHours() + currentTime.getMinutes() / 60 - TIMELINE_START) / timelineWidth) * 100}%`
                              }}
                            />
                          )}

                          {/* Shift bar */}
                          {shiftTemplate && shiftLeftPercent >= 0 && shiftWidthPercent > 0 && (
                            <div
                              className={cn(
                                "absolute top-2 bottom-2 rounded-md flex items-center justify-center text-xs font-medium shadow-sm transition-all border",
                                statusColorClass
                              )}
                              style={{
                                left: `${shiftLeftPercent}%`,
                                width: `${shiftWidthPercent}%`,
                              }}
                            >
                              <span className="truncate px-2">
                                {shiftTemplate.shift_code}
                                {session?.check_in_time && (
                                  <span className="ml-1 text-[10px]">
                                    ({formatHoursToTime(checkInHour)}
                                    {session.check_out_time ? ` - ${formatHoursToTime(checkOutHour)}` : ""})
                                  </span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* No shift placeholder */}
                          {!shiftTemplate && (
                            <div className="absolute inset-2 flex items-center justify-center text-muted-foreground text-sm italic">
                              Chưa xếp ca
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "30days" ? (
        // 30 Days View - Monthly grid with check-in/out times
        <Card className={cn("overflow-hidden relative", loading && "opacity-60")}>
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Đang tải dữ liệu...</span>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: `${200 + days.length * 70}px` }}>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left font-medium sticky left-0 bg-muted/50 z-10 min-w-[180px] border-r">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs">Nhân viên</span>
                    </div>
                  </th>
                  {days.map((day) => {
                    const isToday = isSameDay(day, new Date())
                    const dayOfWeek = day.getDay()
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                    return (
                      <th
                        key={day.toISOString()}
                        className={cn(
                          "p-1 text-center font-medium min-w-[70px] max-w-[70px] border-r",
                          isToday && "bg-primary/10",
                          isWeekend && !isToday && "bg-muted/30"
                        )}
                      >
                        <div className="flex flex-col items-center">
                          <span className={cn(
                            "text-[10px] font-medium uppercase",
                            isToday && "text-primary",
                            isWeekend && !isToday && "text-muted-foreground"
                          )}>
                            {format(day, "EEE", { locale: vi })}
                          </span>
                          <span className={cn(
                            "text-xs",
                            isToday ? "text-primary font-bold bg-primary/20 rounded-full w-5 h-5 flex items-center justify-center" : "",
                            isWeekend && !isToday && "text-muted-foreground"
                          )}>
                            {format(day, "d")}
                          </span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={days.length + 1} className="p-8 text-center text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Không có nhân viên nào trong kho này</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-2 sticky left-0 bg-background z-10 border-r">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0">
                            {user.full_name?.substring(0, 2).toUpperCase() || "??"}
                          </div>
                          <span className="text-xs font-medium truncate max-w-[100px]">
                            {user.full_name}
                          </span>
                        </div>
                      </td>
                      {days.map((day) => {
                        // Use new helper functions for multiple shifts
                        const userAssignments = getAssignments(user.id, day)
                        const userSessions = getShiftSessions(user.id, day)
                        const pendingRequest = getPendingRequest(user.id, day)

                        // Legacy support
                        const assignment = getAssignment(user.id, day)
                        const session = getShiftSession(user.id, day)
                        const shiftTemplate = assignment
                          ? getShiftTemplate(assignment.work_shift_id)
                          : pendingRequest
                            ? getShiftTemplate(pendingRequest.work_shift_id)
                            : null

                        const isToday = isSameDay(day, new Date())
                        const dayOfWeek = day.getDay()
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

                        return (
                          <td
                            key={day.toISOString()}
                            className={cn(
                              "p-0.5 border-r cursor-pointer hover:bg-muted/40 transition-colors",
                              isToday && "bg-primary/5",
                              isWeekend && !isToday && "bg-muted/20"
                            )}
                          >
                            <ShiftCell
                              assignment={assignment}
                              assignments={userAssignments}
                              shiftSession={session}
                              shiftSessions={userSessions}
                              shiftTemplate={shiftTemplate}
                              pendingRequest={pendingRequest}
                              onClick={() => {
                                // Handle pending request click
                                if (pendingRequest) {
                                  handleViewRequest(user, day, pendingRequest)
                                }
                              }}
                              onAdd={() => handleAddShift(user, day)}
                              onEdit={(targetAssignment: any) => handleEditShift(user, day, targetAssignment)}
                              readOnly={false}
                              compact={true}
                              className="h-14"
                              currentTime={currentTime}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        // 7 Days View - Original weekly layout
        <Card className={cn("overflow-hidden relative", loading && "opacity-60")}>
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Đang tải dữ liệu...</span>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>Nhân viên</span>
                    </div>
                  </th>
                  {weekDays.map((day) => {
                    const isToday = isSameDay(day, new Date())
                    return (
                      <th
                        key={day.toISOString()}
                        className={cn(
                          "p-3 text-center font-medium min-w-[130px]",
                          isToday && "bg-primary/5"
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(
                            "text-xs font-semibold uppercase",
                            isToday && "text-primary"
                          )}>
                            {format(day, "EEEE", { locale: vi })}
                          </span>
                          <span className={cn(
                            "text-sm",
                            isToday ? "text-primary font-bold" : "text-muted-foreground"
                          )}>
                            {format(day, "dd/MM")}
                          </span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Không có nhân viên nào trong kho này</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3 sticky left-0 bg-background z-10 border-r">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                            {user.full_name?.substring(0, 2).toUpperCase() || "??"}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate">
                              {user.full_name}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {user.email?.split("@")[0]}
                            </span>
                          </div>
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        // Use new helper functions for multiple shifts
                        const userAssignments = getAssignments(user.id, day)
                        const userSessions = getShiftSessions(user.id, day)
                        const pendingRequest = getPendingRequest(user.id, day)

                        // Legacy support
                        const assignment = getAssignment(user.id, day)
                        const session = getShiftSession(user.id, day)
                        const shiftTemplate = assignment
                          ? getShiftTemplate(assignment.work_shift_id)
                          : pendingRequest
                            ? getShiftTemplate(pendingRequest.work_shift_id)
                            : null
                        const isToday = isSameDay(day, new Date())

                        return (
                          <td
                            key={day.toISOString()}
                            className={cn("p-2", isToday && "bg-primary/5")}
                          >
                            <ShiftCell
                              assignment={assignment}
                              assignments={userAssignments}
                              shiftSession={session}
                              shiftSessions={userSessions}
                              shiftTemplate={shiftTemplate}
                              pendingRequest={pendingRequest}
                              onClick={() => {
                                // Handle pending request click
                                if (pendingRequest) {
                                  handleViewRequest(user, day, pendingRequest)
                                }
                              }}
                              onAdd={() => handleAddShift(user, day)}
                              onEdit={(targetAssignment: any) => handleEditShift(user, day, targetAssignment)}
                              readOnly={false}
                              currentTime={currentTime}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )
      }

      {/* Assignment Dialog - for creating new assignments */}
      <ShiftAssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        user={selectedUser}
        date={selectedDateForDialog}
        currentAssignment={currentAssignment}
        shifts={shifts}
        onSave={handleSaveAssignment}
      />

      {/* Detail Dialog - for viewing existing shift details */}
      <ShiftDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        // IMPORTANT: Mobile view uses 'selectedDay' which is computed from week start + index.
        // We must use this specific date, not the general 'selectedDate' state.
        assignment={currentAssignment}
        shiftSession={currentAssignment ? getShiftSession(currentAssignment.user_id, selectedDateForDialog || selectedDate, currentAssignment) : null}
        shiftTemplate={currentAssignment
          ? getShiftTemplate(currentAssignment.work_shift_id)
          : currentPendingRequest
            ? getShiftTemplate(currentPendingRequest.work_shift_id)
            : null
        }
        user={selectedUser}
        date={selectedDateForDialog || selectedDate}
        pendingRequest={currentPendingRequest}
        onEdit={() => {
          // Close detail dialog and open assign dialog for editing
          setDetailDialogOpen(false)
          setAssignDialogOpen(true)
        }}
        onDelete={() => {
          // Refresh calendar after delete
          fetchCalendarData()
        }}
      />

      {/* Import Dialog */}
      <ShiftImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        warehouseId={warehouseId}
        onSuccess={() => {
          fetchCalendarData()
        }}
      />
    </div >
  )
}
