/**
 * DEPRECATED: This file is kept for backward compatibility only
 * NEW CODE SHOULD USE: lib/server-time.ts
 * 
 * This module now simply re-exports from server-time.ts
 * All timezone logic has been simplified - server runs in Vietnam timezone
 */

import {
  getVietnamNow as serverGetVietnamNow,
  getVietnamToday as serverGetVietnamToday,
  formatVietnamDate as serverFormatVietnamDate,
  formatVietnamDateTime,
  isSameDay
} from './server-time'

/**
 * Format date/time in Vietnam timezone
 * @deprecated Use formatVietnamDateTime from server-time.ts instead
 */
export const formatVietnamDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    return formatVietnamDateTime(date)
  } catch {
    return dateString
  }
}

/**
 * Format date only (without time)
 * @deprecated Use formatVietnamDate from server-time.ts instead
 */
export const formatVietnamDateOnly = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    return serverFormatVietnamDate(date)
  } catch {
    return dateString
  }
}

/**
 * Get current date in Vietnam timezone at 00:00:00
 * Server MUST be running in Asia/Ho_Chi_Minh timezone
 */
export function getVietnamToday(): Date {
  return serverGetVietnamToday()
}

/**
 * Get current datetime in Vietnam timezone
 * Server MUST be running in Asia/Ho_Chi_Minh timezone
 */
export function getVietnamNow(): Date {
  return serverGetVietnamNow()
}

/**
 * Convert a date to Vietnam date (start of day)
 * CRITICAL: Uses UTC components to match database storage convention
 */
export function toVietnamDate(date: Date): Date {
  // Use UTC components to create UTC midnight - matches getVietnamToday() behavior
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ))
}

/**
 * Check if two dates are the same day in Vietnam timezone
 */
export function isSameVietnamDay(date1: Date, date2: Date): boolean {
  return isSameDay(date1, date2)
}
