"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Plus, Loader2, Pencil } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths } from "date-fns"
import { vi } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { formatTime, AttendanceStatus, getStatusColor, determineAttendanceStatus } from "@/lib/shift-status"
import { parseShiftTime, createShiftDateTime, isAfter, isBefore } from "@/lib/server-time"

interface StaffMonthlyCalendarProps {
  assignments: any[]
  sessions: any[]
  shifts: any[]
  pendingRequests?: any[]
  onRegister: (date: Date) => void
  onCancel: (date: Date) => void
  onManage?: (date: Date, pendingRequest: any) => void // Open manage dialog for pending request
  currentMonth: Date
  onMonthChange: (date: Date) => void
  employmentType: "FULLTIME" | "PARTTIME"
  readonly?: boolean
  currentTime?: Date // CRITICAL: Server time for accurate status determination
  loading?: boolean // Show loading state when fetching data
}

// ===== VIETNAM TIMEZONE DETECTION =====
// CRITICAL: Check if server/client is already in Vietnam timezone to avoid double offset
const serverTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

// Get Vietnam date string from a Date (using server time)
function getVietnamDateStr(fromTime: Date): string {
  if (isVietnamTz) {
    // Already in Vietnam timezone - use local date directly
    const year = fromTime.getFullYear()
    const month = String(fromTime.getMonth() + 1).padStart(2, '0')
    const day = String(fromTime.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } else {
    // Not in Vietnam timezone - calculate from UTC
    const vnTime = new Date(fromTime.getTime() + VIETNAM_OFFSET_MS)
    return vnTime.toISOString().split('T')[0]
  }
}

// Check if current date is in registration period (20-28 of month)
// CRITICAL: Must use server time!
function isRegistrationPeriodOpen(serverTime: Date): boolean {
  let day: number
  if (isVietnamTz) {
    day = serverTime.getDate()
  } else {
    const vnTime = new Date(serverTime.getTime() + VIETNAM_OFFSET_MS)
    day = vnTime.getUTCDate()
  }
  return day >= 20 && day <= 28
}

export function StaffMonthlyCalendar({
  assignments,
  sessions,
  shifts,
  pendingRequests = [],
  onRegister,
  onCancel,
  onManage,
  currentMonth,
  onMonthChange,
  employmentType,
  readonly = false,
  currentTime = new Date(), // Default to current time if not provided
  loading = false,
}: StaffMonthlyCalendarProps) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Start from Monday (weekStartsOn: 1)
  const firstDayOfWeek = monthStart.getDay() // 0 = Sunday, 1 = Monday, etc.
  const startPadding = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Adjust for Monday start

  // Helper to extract date string from Date (server is in Vietnam timezone)
  const formatDateStr = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toISOString().split('T')[0]
  }

  const getAssignment = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return assignments.find((a) => {
      const assignedDateStr = formatDateStr(a.assigned_date)
      return assignedDateStr === dateStr
    })
  }

  const getPendingRequest = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const matchingRequests = pendingRequests.filter((r) => {
      const requestedDateStr = formatDateStr(r.requested_date)
      return requestedDateStr === dateStr
    })

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

  const getSession = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    // Find session by session_date
    return sessions.find((s) => {
      const sessionDateStr = formatDateStr(s.session_date)
      return sessionDateStr === dateStr
    })
  }

  const getShift = (shiftId: string) => {
    return shifts.find((s) => s.id === shiftId)
  }

  const handlePreviousMonth = () => {
    onMonthChange(subMonths(currentMonth, 1))
  }

  const handleNextMonth = () => {
    onMonthChange(addMonths(currentMonth, 1))
  }

  const handleToday = () => {
    onMonthChange(new Date())
  }

  const canRegisterForDate = (date: Date) => {
    // CRITICAL: Use server time (currentTime) to determine today
    const serverTodayStr = getVietnamDateStr(currentTime)
    const targetDateStr = format(date, 'yyyy-MM-dd')

    // Cannot register for past dates (compare with server date)
    if (targetDateStr < serverTodayStr) return false

    // Only allow registration from 20-28 for next month
    if (!isRegistrationPeriodOpen(currentTime)) return false

    // Can only register for next month during registration period
    // Calculate next month based on server time
    let nextMonth: Date
    if (isVietnamTz) {
      nextMonth = addMonths(new Date(currentTime.getFullYear(), currentTime.getMonth(), 1), 1)
    } else {
      const vnTime = new Date(currentTime.getTime() + VIETNAM_OFFSET_MS)
      nextMonth = addMonths(new Date(vnTime.getUTCFullYear(), vnTime.getUTCMonth(), 1), 1)
    }
    if (!isSameMonth(date, nextMonth)) return false

    // Cannot register if already have assignment
    if (getAssignment(date)) return false

    return true
  }

  // Helper to check if a date is today using server time
  const isTodayByServer = (date: Date): boolean => {
    return format(date, 'yyyy-MM-dd') === getVietnamDateStr(currentTime)
  }

  return (
    <div className="space-y-3">
      {/* Month Navigation */}
      <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePreviousMonth} disabled={loading}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold min-w-[110px] text-center">
            {format(currentMonth, "MM/yyyy")}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth} disabled={loading}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleToday} disabled={loading}>
            Hôm nay
          </Button>
          {loading && (
            <div className="flex items-center gap-1.5 text-muted-foreground ml-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Đang tải...</span>
            </div>
          )}
        </div>
        <Badge variant={employmentType === "FULLTIME" ? "default" : "secondary"} className="text-xs">
          {employmentType === "FULLTIME" ? "Full-time" : "Part-time"}
        </Badge>
      </div>

      {/* Calendar Grid */}
      <div className={cn("bg-white rounded-lg border shadow-sm overflow-hidden relative", loading && "opacity-60")}>
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Đang tải dữ liệu...</span>
            </div>
          </div>
        )}

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
            <div
              key={day}
              className="text-center font-semibold text-xs text-gray-700 py-2 border-r last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Body */}
        <div className="grid grid-cols-7">
          {/* Empty cells for padding */}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div
              key={`padding-${i}`}
              className="h-20 bg-gray-50/30 border-r border-b last:border-r-0"
            />
          ))}

          {/* Calendar days */}
          {daysInMonth.map((day, idx) => {
            const dayAssignments = assignments.filter((a) => {
              const assignedDateStr = formatDateStr(a.assigned_date)
              return assignedDateStr === format(day, 'yyyy-MM-dd')
            })

            // If no assignments, check for pending requests
            const pendingRequest = getPendingRequest(day)
            const pendingShift = pendingRequest ? getShift(pendingRequest.work_shift_id) : null

            // Determine if we should show register button
            // Only show register if NO assignments AND can register
            // (If already assigned, we show the assignments, not the plus button)
            const canRegister = !readonly && canRegisterForDate(day) && !pendingRequest && dayAssignments.length === 0

            const isToday = isTodayByServer(day)

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "h-20 relative group border-r border-b last:border-r-0 overflow-y-auto no-scrollbar",
                  isToday && "bg-blue-50/50 ring-1 ring-inset ring-blue-200",
                  !isSameMonth(day, currentMonth) && "bg-gray-50/30"
                )}
              >
                {/* Date number */}
                <div className={cn(
                  "absolute top-1 right-1.5 text-xs font-medium z-10",
                  isToday && "text-blue-600 font-bold",
                  !isSameMonth(day, currentMonth) && "text-gray-400"
                )}>
                  {format(day, "d")}
                </div>

                <div className="pt-5 px-1 pb-1 flex flex-col items-center justify-start gap-1 min-h-full">
                  {/* Render Assignments */}
                  {dayAssignments.length > 0 && dayAssignments.map((assignment, i) => {
                    const shift = getShift(assignment.work_shift_id)
                    if (!shift) return null

                    // Find session matching this assignment
                    // Priority: 1. shift_assignment_id match, 2. work_shift_id match on same date
                    // CRITICAL: Must properly link session to assignment for correct status display
                    const session = sessions.find(s => {
                      const sessionDateStr = formatDateStr(s.session_date)
                      const dayDateStr = formatDateStr(day)

                      // Priority 1: Exact assignment match
                      if (s.shift_assignment_id === assignment.id) return true
                      if (s.assignment_id === assignment.id) return true

                      // Priority 2: Same date + same work_shift_id (for legacy data)
                      if (sessionDateStr === dayDateStr && s.work_shift_id === assignment.work_shift_id) {
                        return true
                      }

                      return false
                    })

                    const status = determineAttendanceStatus(assignment, session, shift, currentTime)

                    // CRITICAL: Explicitly check for late/early
                    let isLate = false
                    let isEarly = false

                    if (session?.check_in_time && session?.check_out_time && shift?.start_time && shift?.end_time) {
                      const sessionDate = assignment.assigned_date ? new Date(assignment.assigned_date) : new Date()
                      const sessionDateUTC = new Date(Date.UTC(
                        sessionDate.getUTCFullYear(),
                        sessionDate.getUTCMonth(),
                        sessionDate.getUTCDate(),
                        0, 0, 0, 0
                      ))

                      const { hours: startHours, minutes: startMinutes } = parseShiftTime(shift.start_time)
                      const { hours: endHours, minutes: endMinutes } = parseShiftTime(shift.end_time)

                      let shiftStartDateTime = createShiftDateTime(sessionDateUTC, startHours, startMinutes)
                      let shiftEndDateTime = createShiftDateTime(sessionDateUTC, endHours, endMinutes)

                      if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
                        shiftEndDateTime = new Date(shiftEndDateTime.getTime() + 24 * 60 * 60 * 1000)
                      }

                      const checkInTime = new Date(session.check_in_time)
                      const checkOutTime = new Date(session.check_out_time)

                      isLate = isAfter(checkInTime, shiftStartDateTime)
                      isEarly = isBefore(checkOutTime, shiftEndDateTime)
                    }

                    const hasLateOrEarly = isLate || isEarly

                    let colorClass = ""
                    if (hasLateOrEarly && session?.check_in_time && session?.check_out_time) {
                      colorClass = "bg-orange-100 text-orange-700"
                    } else if (status === AttendanceStatus.COMPLETED_ON_TIME || status === AttendanceStatus.ON_TIME) {
                      colorClass = "bg-green-100 text-green-700"
                    } else if (status === AttendanceStatus.LATE_CHECKIN || status === AttendanceStatus.EARLY_CHECKOUT) {
                      colorClass = "bg-orange-100 text-orange-700"
                    } else if (status === AttendanceStatus.SCHEDULED_PENDING) {
                      if (session?.check_in_time && session?.check_out_time) {
                        colorClass = "bg-green-100 text-green-700"
                      } else {
                        colorClass = "bg-yellow-100 text-yellow-700"
                      }
                    } else if (status === AttendanceStatus.SCHEDULED_FUTURE) {
                      colorClass = "bg-blue-100 text-blue-700"
                    } else if (status === AttendanceStatus.INCOMPLETE) {
                      colorClass = "bg-amber-100 text-amber-700"
                    } else if (status === AttendanceStatus.ABSENT) {
                      colorClass = "bg-red-100 text-red-700"
                    }

                    return (
                      <div key={assignment.id} className="w-full flex flex-col items-center">
                        <div className={cn(
                          "text-[10px] font-bold px-1 py-0.5 rounded text-center w-full truncate",
                          colorClass
                        )}>
                          {shift.shift_code}
                        </div>
                        <div className="text-[8px] text-gray-500 mt-0.5 leading-tight">
                          {formatTime(shift.start_time)}-{formatTime(shift.end_time)}
                        </div>
                        {/* Attendance Time */}
                        {(session?.check_in_time || session?.check_out_time) && (
                          <div className={cn(
                            "text-[8px] font-medium mt-0.5 leading-tight text-center",
                            (session?.check_in_time && session?.check_out_time) ? "text-green-600" : "text-amber-600"
                          )}>
                            {session?.check_in_time && session?.check_out_time ? (
                              <>{formatTime(session.check_in_time)} - {formatTime(session.check_out_time)}</>
                            ) : session?.check_in_time ? (
                              <>{formatTime(session.check_in_time)} - ...</>
                            ) : (
                              <>... - {formatTime(session.check_out_time)}</>
                            )}
                          </div>
                        )}
                        {/* Incomplete Status */}
                        {status === AttendanceStatus.INCOMPLETE && (
                          <div className="text-[8px] text-amber-600 font-medium mt-0.5 leading-tight text-center">
                            {!session?.check_in_time && session?.check_out_time ? "Chưa vào" :
                              session?.check_in_time && !session?.check_out_time ? "Chưa ra" :
                                "Chưa chấm"}
                          </div>
                        )}
                        {/* Manager Edit Button */}
                        {onManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 bg-white/90 hover:bg-purple-100 p-0 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm absolute top-1 left-1"
                            onClick={(e) => { e.stopPropagation(); onManage(day, { work_shifts: shift, assignment_id: assignment.id }) }}
                            title="Quản lý ca"
                          >
                            <Pencil className="h-2.5 w-2.5 text-purple-600" />
                          </Button>
                        )}
                      </div>
                    )
                  })}

                  {/* Pending Request */}
                  {dayAssignments.length === 0 && pendingRequest && pendingShift && (
                    <div className="h-full pt-1 px-1 flex flex-col items-center justify-start w-full">
                      <div className={cn(
                        "text-[10px] font-bold px-1 py-0.5 rounded text-center w-full",
                        pendingRequest.status === "PENDING" && "bg-purple-100 text-purple-700",
                        pendingRequest.status === "REJECTED" && "bg-red-100 text-red-700 line-through"
                      )}>
                        {pendingShift.shift_code}
                      </div>
                      <div className="text-[8px] text-gray-500 mt-0.5 leading-tight">
                        {formatTime(pendingShift.start_time)}-{formatTime(pendingShift.end_time)}
                      </div>
                      <div className={cn(
                        "text-[8px] font-medium mt-0.5 leading-tight",
                        pendingRequest.status === "PENDING" && "text-purple-600",
                        pendingRequest.status === "REJECTED" && "text-red-600"
                      )}>
                        {pendingRequest.status === "PENDING" ? "⏳ Chờ duyệt" : "✗ Từ chối"}
                      </div>
                      {/* Manage button for PENDING requests */}
                      {(pendingRequest.status === "PENDING" && !readonly && onManage) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-1 left-1 h-4 w-4 bg-white/90 hover:bg-purple-100 p-0 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          onClick={(e) => { e.stopPropagation(); onManage(day, pendingRequest) }}
                          title="Quản lý đăng ký"
                        >
                          <Pencil className="h-2.5 w-2.5 text-purple-600" />
                        </Button>
                      )}
                      {/* Re-register button */}
                      {(pendingRequest.status === "REJECTED" && !readonly && canRegisterForDate(day)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 h-5 text-[9px] px-1.5 bg-white hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); onRegister(day) }}
                        >
                          Đăng ký lại
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Register Button */}
                  {canRegister && (
                    <button
                      className="w-full h-full flex items-center justify-center hover:bg-blue-50 transition-colors absolute inset-0"
                      onClick={() => onRegister(day)}
                    >
                      <Plus className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-700">Đúng giờ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span className="text-gray-700">Đi muộn</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-700">Vắng</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-gray-700">Chưa chấm công</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-gray-700">Đã xếp ca</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-gray-700">Chờ duyệt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-600" />
          <span className="text-gray-700">Từ chối</span>
        </div>
      </div>
    </div>
  )
}
