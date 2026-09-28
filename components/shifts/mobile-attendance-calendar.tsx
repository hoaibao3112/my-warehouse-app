"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns"
import { vi } from "date-fns/locale"
import { cn } from "@/lib/utils"
import {
  formatTime,
  AttendanceStatus,
  getStatusColor,
  getStatusLabel,
  determineAttendanceStatus,
} from "@/lib/shift-status"
import { formatTimeNoTz } from "@/lib/server-time"
import { MobileBottomSheet } from "@/components/mobile/mobile-bottom-sheet"

interface MobileAttendanceCalendarProps {
  assignments: any[]
  sessions: any[]
  shifts: any[]
  currentMonth: Date
  onMonthChange: (date: Date) => void
  viewMode?: "month" | "week"
  currentTime?: Date // CRITICAL: Server time for accurate status determination
}

export function MobileAttendanceCalendar({
  assignments,
  sessions,
  shifts,
  currentMonth,
  onMonthChange,
  viewMode = "month",
  currentTime = new Date(), // Default to current time if not provided
}: MobileAttendanceCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const getAssignments = (date: Date) => {
    return assignments.filter((a) => isSameDay(new Date(a.assigned_date), date))
  }

  const getSessions = (date: Date) => {
    return sessions.filter((s) => isSameDay(new Date(s.session_date), date))
  }

  const getShift = (shiftId: string) => {
    return shifts.find((s) => s.id === shiftId)
  }

  const handleDayClick = (day: Date) => {
    const dayAssignments = getAssignments(day)
    if (dayAssignments.length > 0) {
      setSelectedDay(day)
      setSheetOpen(true)
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      onMonthChange(addMonths(currentMonth, 1))
    } else if (isRightSwipe) {
      onMonthChange(subMonths(currentMonth, 1))
    }
  }

  const selectedAssignments = selectedDay ? getAssignments(selectedDay) : []
  const selectedSessions = selectedDay ? getSessions(selectedDay) : []

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-white sticky top-0 z-10 py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-bold">Tháng {format(currentMonth, "MM/yyyy")}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar Grid with Swipe */}
      <Card
        className="p-3"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid grid-cols-7 gap-1">
          {/* Weekday Headers */}
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
            <div key={day} className="text-center font-semibold text-xs text-muted-foreground py-2">
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {allDays.map((day) => {
            const dayAssignments = getAssignments(day)
            const daySessions = getSessions(day)

            const isToday = isSameDay(day, new Date())
            const isCurrentMonth = isSameMonth(day, currentMonth)

            // Determine if there are any issues (late/absent) to color the border
            let borderColorClass = "border-gray-100"
            let bgClass = "bg-gray-50"

            if (dayAssignments.length > 0) {
              // Check the "worst" status among shifts
              const statuses = dayAssignments.map(assignment => {
                const shift = getShift(assignment.work_shift_id)
                const session = daySessions.find(s => true) || (daySessions.length > 0 ? daySessions[0] : undefined) // Checking simplified overlap

                return determineAttendanceStatus(assignment, session, shift, currentTime)
              })

              if (statuses.includes(AttendanceStatus.ABSENT)) {
                borderColorClass = "border-red-300 bg-red-50"
              } else if (statuses.includes(AttendanceStatus.LATE_CHECKIN) || statuses.includes(AttendanceStatus.EARLY_CHECKOUT)) {
                borderColorClass = "border-yellow-300 bg-yellow-50"
              } else if (statuses.includes(AttendanceStatus.COMPLETED_ON_TIME) || statuses.includes(AttendanceStatus.ON_TIME)) {
                borderColorClass = "border-green-300 bg-green-50"
              } else {
                borderColorClass = "border-blue-200"
              }

              bgClass = ""
            }

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                disabled={dayAssignments.length === 0}
                className={cn(
                  "aspect-square rounded-lg p-1 transition-all relative flex flex-col justify-between overflow-hidden",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500",
                  isToday && "ring-2 ring-blue-500",
                  !isCurrentMonth && "opacity-40",
                  dayAssignments.length > 0 ? cn("active:scale-95 border-2", borderColorClass, bgClass) : "bg-gray-50 border border-gray-100"
                )}
              >
                {/* Date number */}
                <div
                  className={cn(
                    "text-xs font-bold leading-none select-none",
                    !isCurrentMonth && "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </div>

                {/* Shift indicators */}
                <div className="flex flex-col gap-0.5 w-full mt-1">
                  {dayAssignments.slice(0, 2).map((assignment, idx) => {
                    const shift = getShift(assignment.work_shift_id)
                    return (
                      <div key={idx} className="text-[7px] font-bold truncate leading-none bg-white/50 rounded px-0.5 py-px text-center">
                        {shift?.shift_code || "-"}
                      </div>
                    )
                  })}
                  {dayAssignments.length > 2 && (
                    <div className="text-[6px] font-bold text-center leading-none">+{dayAssignments.length - 2}</div>
                  )}
                </div>

                {/* Check-in indicator (dot) */}
                {daySessions.length > 0 && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Legend - Simplified */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <div className="w-3 h-3 rounded bg-blue-50 border-2 border-blue-200" />
          <span>Đã xếp ca</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <div className="w-3 h-3 rounded bg-green-100 border-2 border-green-300" />
          <span>Hoàn thành/Đúng giờ</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <div className="w-3 h-3 rounded bg-yellow-100 border-2 border-yellow-300" />
          <span>Trễ/Sớm</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <div className="w-3 h-3 rounded bg-red-100 border-2 border-red-300" />
          <span>Vắng</span>
        </div>
      </div>

      {/* Detail Bottom Sheet */}
      <MobileBottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={selectedDay ? format(selectedDay, "dd/MM/yyyy") : ""}
      >
        <div className="space-y-6 pb-4">
          {selectedAssignments.map((assignment, index) => {
            const shift = getShift(assignment.work_shift_id)
            if (!shift) return null

            const relatedSession = selectedSessions[index] // Fallback mapping by index

            const status = determineAttendanceStatus(assignment, relatedSession, shift, currentTime)

            return (
              <div key={index} className="space-y-4 border-b pb-4 last:border-0 last:pb-0">
                {/* Shift Info Header */}
                <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                  <span className="font-bold text-sm">Ca {shift.shift_code}</span>
                  <Badge variant="outline" className="text-xs">{shift.shift_name}</Badge>
                </div>

                <div className="space-y-2 px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Giờ làm việc</span>
                    <span className="font-mono text-sm font-medium">
                      {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Trạng thái</span>
                    <Badge
                      className={cn(
                        "border-2",
                        status === AttendanceStatus.ON_TIME && "bg-green-100 text-green-800 border-green-300",
                        status === AttendanceStatus.COMPLETED_ON_TIME && "bg-green-100 text-green-800 border-green-300",
                        status === AttendanceStatus.LATE_CHECKIN && "bg-yellow-100 text-yellow-800 border-yellow-300",
                        status === AttendanceStatus.SCHEDULED_PENDING && "bg-red-100 text-red-800 border-red-300",
                        status === AttendanceStatus.SCHEDULED_FUTURE && "bg-blue-50 text-blue-700 border-blue-200"
                      )}
                    >
                      {getStatusLabel(status)}
                    </Badge>
                  </div>
                </div>

                {/* Check-in/out Times */}
                {relatedSession && (
                  <div className="space-y-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-800">Check-in</span>
                      <span className="font-mono text-sm font-bold text-green-900">
                        {formatTimeNoTz(relatedSession.check_in_time)}
                      </span>
                    </div>
                    {relatedSession.check_out_time && (
                      <div className="flex items-center justify-between pt-2 border-t border-green-200">
                        <span className="text-sm font-medium text-green-800">Check-out</span>
                        <span className="font-mono text-sm font-bold text-green-900">
                          {formatTimeNoTz(relatedSession.check_out_time)}
                        </span>
                      </div>
                    )}
                    {relatedSession.check_out_time && (
                      <div className="flex items-center justify-between pt-2 border-t border-green-200">
                        <span className="text-sm font-medium text-green-800">Tổng giờ làm</span>
                        <span className="font-mono text-sm font-bold text-green-900">
                          {relatedSession.actual_duration != null && relatedSession.actual_duration > 0
                            ? `${Math.floor(relatedSession.actual_duration / 60)}h ${relatedSession.actual_duration % 60}m`
                            : (() => {
                              const diffMs = new Date(relatedSession.check_out_time).getTime() - new Date(relatedSession.check_in_time).getTime()
                              const hours = Math.floor(diffMs / (1000 * 60 * 60))
                              const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
                              return `${hours}h ${minutes}m`
                            })()
                          }
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {assignment.notes && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Ghi chú</span>
                    <p className="text-sm text-muted-foreground p-2 bg-gray-50 rounded">
                      {assignment.notes}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </MobileBottomSheet>
    </div>
  )
}
