// Shift registration validation helpers
// CRITICAL: All date operations use server-time utilities for Vietnam timezone consistency

import { prisma } from "./prisma"
import { startOfMonth, endOfMonth, differenceInDays, addDays, isSameDay, getDate, addMonths, isSameMonth } from "date-fns"
import { getVietnamNow, getVietnamToday } from "./server-time"

// Minimum shifts required per month for full-time employees
export const FULLTIME_MIN_SHIFTS = 22

// Maximum consecutive empty days for part-time employees
export const PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS = 3

// Registration period: 20-28 of current month for next month
export const REGISTRATION_PERIOD_START = 20
export const REGISTRATION_PERIOD_END = 28

// Manager approval deadline: 29 of current month
// After this date, all pending requests will be auto-approved
export const MANAGER_APPROVAL_DEADLINE = 29

/**
 * Check if current date is in registration period (20-28 of month)
 * CRITICAL: Uses server time (Vietnam timezone)
 */
export function isInRegistrationPeriod(): boolean {
  const today = getVietnamNow()
  const day = today.getDate()
  return day >= REGISTRATION_PERIOD_START && day <= REGISTRATION_PERIOD_END
}

/**
 * Get the target month for registration (next month from current)
 * CRITICAL: Uses server time (Vietnam timezone)
 */
export function getTargetRegistrationMonth(): Date {
  return addMonths(getVietnamNow(), 1)
}

/**
 * Check if a date is in the allowed registration period
 * - During registration period (20-28): Can register for NEXT month only
 * - Outside registration period: Cannot register
 * CRITICAL: Uses server time (Vietnam timezone)
 */
export function isValidRegistrationPeriod(targetDate: Date): {
  valid: boolean
  error?: string
} {
  const now = getVietnamNow()
  const today = getVietnamToday()
  const currentDay = now.getDate()

  // Convert targetDate to UTC midnight for consistent comparison with getVietnamToday()
  // This ensures we compare dates without timezone issues
  const targetDateUTC = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0))

  const targetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
  // Use server time (now) to calculate next month, not device time
  const nextMonth = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1)

  // Cannot register for past dates
  if (targetDateUTC < today) {
    return {
      valid: false,
      error: "Không thể đăng ký ca cho ngày đã qua"
    }
  }

  // Check if in registration period (20-28)
  const inRegistrationPeriod = currentDay >= REGISTRATION_PERIOD_START && currentDay <= REGISTRATION_PERIOD_END

  if (!inRegistrationPeriod) {
    return {
      valid: false,
      error: `Chỉ được đăng ký ca trong khoảng ngày ${REGISTRATION_PERIOD_START}-${REGISTRATION_PERIOD_END} hàng tháng`
    }
  }

  // During registration period, only allow registration for next month
  if (!isSameMonth(targetDate, nextMonth)) {
    return {
      valid: false,
      error: "Trong thời gian đăng ký, chỉ được đăng ký cho tháng sau"
    }
  }

  return { valid: true }
}

/**
 * Get all shift assignments for a user in a given month
 */
export async function getMonthShiftAssignments(
  userId: string,
  year: number,
  month: number
) {
  const startDate = startOfMonth(new Date(year, month - 1, 1))
  const endDate = endOfMonth(startDate)

  return prisma.shift_assignments.findMany({
    where: {
      user_id: userId,
      assigned_date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      work_shifts: true,
    },
    orderBy: {
      assigned_date: "asc",
    },
  })
}

/**
 * Validate full-time employee shift requirements
 * Full-time must have at least 22 shifts per month
 */
export async function validateFullTimeShifts(
  userId: string,
  year: number,
  month: number
): Promise<{ valid: boolean; error?: string; currentCount: number }> {
  const assignments = await getMonthShiftAssignments(userId, year, month)
  const currentCount = assignments.length

  if (currentCount < FULLTIME_MIN_SHIFTS) {
    return {
      valid: false,
      error: `Nhân viên full-time phải đăng ký tối thiểu ${FULLTIME_MIN_SHIFTS} ca/tháng. Hiện tại: ${currentCount} ca.`,
      currentCount,
    }
  }

  return { valid: true, currentCount }
}

/**
 * Find consecutive empty days in a month
 * Returns array of periods with consecutive empty days
 */
export async function findConsecutiveEmptyDays(
  userId: string,
  year: number,
  month: number
): Promise<{ start: Date; end: Date; count: number }[]> {
  const startDate = startOfMonth(new Date(year, month - 1, 1))
  const endDate = endOfMonth(startDate)

  const assignments = await getMonthShiftAssignments(userId, year, month)
  const assignedDates = new Set(
    assignments.map((a) => a.assigned_date.toISOString().split("T")[0])
  )

  const periods: { start: Date; end: Date; count: number }[] = []
  let currentPeriodStart: Date | null = null
  let currentPeriodCount = 0

  let currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split("T")[0]
    const hasShift = assignedDates.has(dateStr)

    if (!hasShift) {
      // Empty day
      if (currentPeriodStart === null) {
        currentPeriodStart = new Date(currentDate)
        currentPeriodCount = 1
      } else {
        currentPeriodCount++
      }
    } else {
      // Has shift - end current period if exists
      if (currentPeriodStart !== null && currentPeriodCount > 0) {
        periods.push({
          start: currentPeriodStart,
          end: addDays(currentDate, -1),
          count: currentPeriodCount,
        })
        currentPeriodStart = null
        currentPeriodCount = 0
      }
    }

    currentDate = addDays(currentDate, 1)
  }

  // Add final period if exists
  if (currentPeriodStart !== null && currentPeriodCount > 0) {
    periods.push({
      start: currentPeriodStart,
      end: currentDate,
      count: currentPeriodCount,
    })
  }

  return periods
}

/**
 * Validate part-time employee shift requirements
 * Part-time cannot have more than 3 consecutive empty days
 */
export async function validatePartTimeShifts(
  userId: string,
  year: number,
  month: number
): Promise<{ valid: boolean; error?: string; violations?: any[] }> {
  const emptyPeriods = await findConsecutiveEmptyDays(userId, year, month)
  const violations = emptyPeriods.filter(
    (period) => period.count > PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS
  )

  if (violations.length > 0) {
    const violationDetails = violations
      .map(
        (v) => {
          // Format dates using UTC components since database stores Vietnam time as UTC
          const formatDate = (d: Date) => {
            const day = d.getUTCDate().toString().padStart(2, '0');
            const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}/${month}/${year}`;
          };
          return `${v.count} ngày liên tiếp không có ca (${formatDate(v.start)} - ${formatDate(v.end)})`;
        }
      )
      .join(", ")

    return {
      valid: false,
      error: `Nhân viên part-time không được trống lịch quá ${PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS} ngày liên tiếp. Vi phạm: ${violationDetails}`,
      violations,
    }
  }

  return { valid: true }
}

/**
 * Comprehensive validation for shift registration
 */
export async function validateShiftRegistration(
  userId: string,
  targetDate: Date,
  employmentType: "FULLTIME" | "PARTTIME"
): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
  // Check registration period
  const periodCheck = isValidRegistrationPeriod(targetDate)
  if (!periodCheck.valid) {
    return periodCheck
  }

  const warnings: string[] = []
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth() + 1

  // Validate based on employment type
  if (employmentType === "FULLTIME") {
    const fullTimeCheck = await validateFullTimeShifts(userId, year, month)
    if (!fullTimeCheck.valid && fullTimeCheck.error) {
      warnings.push(fullTimeCheck.error)
    }
  } else if (employmentType === "PARTTIME") {
    const partTimeCheck = await validatePartTimeShifts(userId, year, month)
    if (!partTimeCheck.valid) {
      return { valid: false, error: partTimeCheck.error }
    }
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

/**
 * Check if manager approval period has ended
 * Manager has until end of day 29 to approve requests
 * After that, all pending requests should be auto-approved
 */
export function isManagerApprovalPeriodEnded(): boolean {
  const now = getVietnamNow()
  const currentDay = now.getDate()
  return currentDay > MANAGER_APPROVAL_DEADLINE
}

/**
 * Check if we're in the manager approval period (after registration ends, before deadline)
 * This is day 29 of the month
 */
export function isInManagerApprovalPeriod(): boolean {
  const now = getVietnamNow()
  const currentDay = now.getDate()
  return currentDay === MANAGER_APPROVAL_DEADLINE
}

/**
 * Get the target month for pending requests that should be auto-approved
 * If we're past day 29, we need to auto-approve requests for next month
 */
export function getAutoApprovalTargetMonth(): Date {
  const now = getVietnamNow()
  // Requests submitted during 20-28 are for next month
  // So auto-approval on day 30+ should target next month
  return addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1)
}

/**
 * Auto-approve all pending shift registration requests after manager deadline
 * This should be called when:
 * 1. Current day > 29 (MANAGER_APPROVAL_DEADLINE)
 * 2. There are PENDING requests for next month
 * 
 * Returns the count of auto-approved requests
 */
export async function autoApprovePendingRequests(): Promise<{
  success: boolean
  approvedCount: number
  error?: string
}> {
  // Auto-approval is disabled per user request
  return {
    success: true,
    approvedCount: 0,
  }
}
