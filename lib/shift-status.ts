// Shift attendance status types and helpers
// REWRITTEN to use server-time utilities for consistency

import {
  parseShiftTime,
  createShiftDateTime,
  getMinutesDifference,
  formatVietnamTimeShort,
  isAfter,
  isBefore,
  addDays,
  getVietnamNow,
  getVietnamToday
} from './server-time'

export enum AttendanceStatus {
  NOT_SCHEDULED = "NOT_SCHEDULED",           // Gray - No shift assigned
  PENDING_APPROVAL = "PENDING_APPROVAL",      // Purple - Waiting for manager approval
  REJECTED = "REJECTED",                      // Red/strikethrough - Manager rejected
  SCHEDULED_FUTURE = "SCHEDULED_FUTURE",      // Blue - Scheduled for future
  SCHEDULED_PENDING = "SCHEDULED_PENDING",    // Yellow - Should have checked in
  ON_TIME = "ON_TIME",                        // Green - Checked in on time
  LATE_CHECKIN = "LATE_CHECKIN",             // Orange - Checked in late
  EARLY_CHECKOUT = "EARLY_CHECKOUT",          // Orange - Checked out early
  COMPLETED_ON_TIME = "COMPLETED_ON_TIME",    // Dark Green - Completed on time
  INCOMPLETE = "INCOMPLETE",                  // Pink - Forgot to check-in or check-out
  ABSENT = "ABSENT",                          // Red - No check-in and no check-out for past shift
}

// Grace period for check-in/out (minutes) - after this, mark as "forgot"
export const LATE_CHECKIN_GRACE_PERIOD = 60
export const LATE_CHECKOUT_GRACE_PERIOD = 60

/**
 * Determine attendance status based on assignment, shift session, and shift template
 * 
 * CRITICAL: Uses server-time utilities for ALL time comparisons
 * NO manual timezone conversions or UTC offsets
 * 
 * @param assignment - Shift assignment record
 * @param shiftSession - Attendance session record  
 * @param shiftTemplate - Shift template/work_shifts record
 * @param currentTime - Current time (MUST be server time to prevent device manipulation)
 */
export function determineAttendanceStatus(
  assignment: any | null,
  shiftSession: any | null,
  shiftTemplate: any | null,
  currentTime: Date = getVietnamNow() // Use Vietnam server time
): AttendanceStatus {
  // No assignment = not scheduled
  if (!assignment) return AttendanceStatus.NOT_SCHEDULED

  // CRITICAL: Use currentTime parameter (server time) for all date comparisons
  // currentTime should be from getVietnamNow() which has UTC components = Vietnam time
  const now = currentTime

  // Create today as UTC midnight representing Vietnam date
  const today = new Date(Date.UTC(
    currentTime.getUTCFullYear(),
    currentTime.getUTCMonth(),
    currentTime.getUTCDate(),
    0, 0, 0, 0
  ))

  // Parse assigned_date - it's stored as UTC representing Vietnam date
  const assignedDateRaw = new Date(assignment.assigned_date)
  const assignedDate = new Date(Date.UTC(
    assignedDateRaw.getUTCFullYear(),
    assignedDateRaw.getUTCMonth(),
    assignedDateRaw.getUTCDate(),
    0, 0, 0, 0
  ))

  const isPastDate = assignedDate < today
  const isToday = assignedDate.getTime() === today.getTime()

  // Future shift
  if (assignedDate > today) {
    return AttendanceStatus.SCHEDULED_FUTURE
  }

  // Get shift times if available
  let shiftStartDateTime: Date | null = null
  let shiftEndDateTime: Date | null = null

  if (shiftTemplate?.start_time && shiftTemplate?.end_time) {
    const { hours: startHours, minutes: startMinutes } = parseShiftTime(shiftTemplate.start_time)
    const { hours: endHours, minutes: endMinutes } = parseShiftTime(shiftTemplate.end_time)

    shiftStartDateTime = createShiftDateTime(assignedDate, startHours, startMinutes)
    shiftEndDateTime = createShiftDateTime(assignedDate, endHours, endMinutes)

    // Handle overnight shifts (end time < start time means next day)
    if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
      shiftEndDateTime = addDays(shiftEndDateTime, 1)
    }
  }

  // No session (no check-in)
  if (!shiftSession || (!shiftSession.check_in_time && !shiftSession.check_out_time)) {
    // Past date with no session = absent
    if (isPastDate) {
      return AttendanceStatus.ABSENT
    }

    // Today with no check-in
    if (isToday && shiftStartDateTime && shiftEndDateTime) {
      // SIMPLIFIED: If past shift end time → ABSENT (no grace period needed)
      const minutesAfterEnd = getMinutesDifference(shiftEndDateTime, now)
      if (minutesAfterEnd > 0) {
        // Shift has ended with no check-in = absent
        return AttendanceStatus.ABSENT
      }

      // Check if past shift start
      const minutesAfterStart = getMinutesDifference(shiftStartDateTime, now)
      if (minutesAfterStart > LATE_CHECKIN_GRACE_PERIOD) {
        // More than 60 minutes after shift start but shift not ended yet = absent
        return AttendanceStatus.ABSENT
      }

      // Past shift start but within grace period = should check in now
      if (minutesAfterStart > 0) {
        return AttendanceStatus.SCHEDULED_PENDING
      }
    }

    return AttendanceStatus.SCHEDULED_FUTURE
  }

  // Has session with check-in time
  const hasCheckIn = !!shiftSession.check_in_time
  const hasCheckOut = !!shiftSession.check_out_time

  // Session exists but no check-in and no check-out (shouldn't happen normally)
  if (!hasCheckIn && !hasCheckOut) {
    if (isPastDate) return AttendanceStatus.ABSENT

    // Today - check if past shift end + grace period
    if (isToday && shiftEndDateTime) {
      const minutesAfterEnd = getMinutesDifference(shiftEndDateTime, now)
      if (minutesAfterEnd > LATE_CHECKOUT_GRACE_PERIOD) {
        return AttendanceStatus.ABSENT
      }
    }

    return AttendanceStatus.SCHEDULED_PENDING
  }

  // Special case: has check-out but no check-in -> incomplete (forgot to check-in)
  // API may create a session with only check_out_time (e.g., manual checkout)
  if (!hasCheckIn && hasCheckOut) {
    return AttendanceStatus.INCOMPLETE
  }

  // Check if notes indicate late check-in or early checkout (from API calculation)
  const hasLateNote = shiftSession.notes?.includes("Đi muộn")
  const hasEarlyNote = shiftSession.notes?.includes("Về sớm")

  // Has checked in - need shift template to analyze times
  if (!hasCheckIn) {
    // Defensive: if we somehow reached here without a check-in, treat as incomplete
    return AttendanceStatus.INCOMPLETE
  }

  if (!shiftTemplate || !shiftStartDateTime || !shiftEndDateTime) {
    // If checked in but no template, rely on notes from API
    if (hasLateNote) {
      return hasCheckOut ? AttendanceStatus.LATE_CHECKIN : AttendanceStatus.LATE_CHECKIN
    }
    // Check for incomplete (has check-in but no check-out for past dates)
    if (hasCheckIn && !hasCheckOut && isPastDate) {
      return AttendanceStatus.INCOMPLETE
    }
    if (!hasCheckOut) {
      return AttendanceStatus.ON_TIME
    }
    return AttendanceStatus.COMPLETED_ON_TIME
  }

  // Has checked in - analyze times with shift template
  const checkInTime = new Date(shiftSession.check_in_time)

  // CRITICAL FIX: Any check-in AFTER shift start = late
  // Use same logic as API routes
  const isLate = isAfter(checkInTime, shiftStartDateTime)

  // Still in progress (not checked out yet)
  if (!hasCheckOut) {
    // Past date with no checkout = incomplete (forgot checkout)
    if (isPastDate) {
      return AttendanceStatus.INCOMPLETE
    }

    // Today - check if past shift end + grace period
    if (isToday) {
      const minutesAfterEnd = getMinutesDifference(shiftEndDateTime, now)
      if (minutesAfterEnd > LATE_CHECKOUT_GRACE_PERIOD) {
        return AttendanceStatus.INCOMPLETE // Forgot to checkout
      }
    }

    if (isLate) return AttendanceStatus.LATE_CHECKIN
    return AttendanceStatus.ON_TIME
  }

  // Checked out - full analysis
  const checkOutTime = new Date(shiftSession.check_out_time)

  // CRITICAL FIX: Any checkout BEFORE shift end = early checkout
  // Use same logic as API routes
  const isEarlyCheckout = isBefore(checkOutTime, shiftEndDateTime)

  if (isLate) return AttendanceStatus.LATE_CHECKIN
  if (isEarlyCheckout) return AttendanceStatus.EARLY_CHECKOUT
  return AttendanceStatus.COMPLETED_ON_TIME
}

/**
 * Get Tailwind CSS color classes for attendance status
 */
export function getStatusColor(status: AttendanceStatus): string {
  const colors: Record<AttendanceStatus, string> = {
    [AttendanceStatus.NOT_SCHEDULED]: "bg-gray-50 text-gray-500 border-gray-200",
    [AttendanceStatus.PENDING_APPROVAL]: "bg-purple-100 text-purple-700 border-purple-400",
    [AttendanceStatus.REJECTED]: "bg-red-50 text-red-400 border-red-200 line-through opacity-60",
    [AttendanceStatus.SCHEDULED_FUTURE]: "bg-blue-100 text-blue-700 border-blue-300",
    [AttendanceStatus.SCHEDULED_PENDING]: "bg-yellow-100 text-yellow-700 border-yellow-300",
    [AttendanceStatus.ON_TIME]: "bg-green-100 text-green-800 border-green-300",
    [AttendanceStatus.LATE_CHECKIN]: "bg-orange-100 text-orange-800 border-orange-300",
    [AttendanceStatus.EARLY_CHECKOUT]: "bg-orange-100 text-orange-800 border-orange-300",
    [AttendanceStatus.COMPLETED_ON_TIME]: "bg-green-100 text-green-800 border-green-300",
    [AttendanceStatus.INCOMPLETE]: "bg-amber-100 text-amber-700 border-amber-300",
    [AttendanceStatus.ABSENT]: "bg-red-100 text-red-700 border-red-300",
  }
  return colors[status]
}

/**
 * Get Vietnamese label for attendance status
 */
export function getStatusLabel(status: AttendanceStatus): string {
  const labels: Record<AttendanceStatus, string> = {
    [AttendanceStatus.NOT_SCHEDULED]: "Chưa xếp ca",
    [AttendanceStatus.PENDING_APPROVAL]: "Chờ duyệt",
    [AttendanceStatus.REJECTED]: "Bị từ chối",
    [AttendanceStatus.SCHEDULED_FUTURE]: "Đã xếp ca",
    [AttendanceStatus.SCHEDULED_PENDING]: "Chờ checkin",
    [AttendanceStatus.ON_TIME]: "Đúng giờ",
    [AttendanceStatus.LATE_CHECKIN]: "Đi muộn",
    [AttendanceStatus.EARLY_CHECKOUT]: "Về sớm",
    [AttendanceStatus.COMPLETED_ON_TIME]: "Hoàn thành",
    [AttendanceStatus.INCOMPLETE]: "Chưa chấm công",
    [AttendanceStatus.ABSENT]: "Vắng mặt",
  }
  return labels[status]
}

/**
 * Format time from database to display string
 * 
 * CRITICAL: Uses Vietnam server time, NO manual timezone conversions
 * 
 * @param time - Time value from database (can be Time string "HH:MM:SS" or full DateTime)
 * @returns Formatted time string (HH:MM)
 */
export function formatTime(time: string | Date | null | undefined): string {
  if (!time) return "—"

  if (typeof time === "string") {
    // Check if it's a full ISO datetime string (e.g., "2025-11-26T03:18:21.897Z")
    if (time.includes("T")) {
      const date = new Date(time)
      return formatVietnamTimeShort(date)
    }
    // If it's already a time string like "08:30:00", extract HH:MM
    return time.substring(0, 5)
  }

  // If it's a Date object
  // Check if it's a full datetime or just time
  const year = time.getUTCFullYear()
  if (year > 1970) {
    // Full datetime - use server-time formatter
    return formatVietnamTimeShort(time)
  }

  // PostgreSQL Time type is stored as UTC but represents local time
  const hours = time.getUTCHours().toString().padStart(2, "0")
  const minutes = time.getUTCMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

/**
 * DEPRECATED: Use parseShiftTime from server-time.ts instead
 * Kept for backward compatibility
 */
export function combineDateAndTime(dateStr: string | Date, timeStr: string | Date): Date {
  const dateObj = new Date(dateStr)
  // Use UTC components to create day at midnight (consistent with getVietnamToday)
  const day = new Date(Date.UTC(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth(),
    dateObj.getUTCDate(),
    0, 0, 0, 0
  ))

  let hours: number, minutes: number

  if (timeStr instanceof Date) {
    hours = timeStr.getUTCHours()
    minutes = timeStr.getUTCMinutes()
  } else if (typeof timeStr === 'string') {
    if (timeStr.includes('T')) {
      const timeDate = new Date(timeStr)
      hours = timeDate.getUTCHours()
      minutes = timeDate.getUTCMinutes()
    } else {
      const parts = timeStr.split(':').map(Number)
      hours = parts[0] || 0
      minutes = parts[1] || 0
    }
  } else {
    hours = 0
    minutes = 0
  }

  return createShiftDateTime(day, hours, minutes)
}

/**
 * DEPRECATED: Use getMinutesDifference from server-time.ts instead
 * Kept for backward compatibility
 */
export function differenceInMinutes(date1: Date, date2: Date): number {
  return getMinutesDifference(date2, date1) // Note: reversed order
}
