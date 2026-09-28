/**
 * Server Time Utilities - SINGLE SOURCE OF TRUTH for all datetime operations
 *
 * CRITICAL RULES:
 * 1. Server MUST be configured to run in Asia/Ho_Chi_Minh timezone
 * 2. All Date objects returned are in Vietnam timezone
 * 3. All times stored to database are Vietnam time (no UTC conversion)
 * 4. Never use browser time or timezone conversions
 * 5. All display formatting MUST use the helpers exported from this module
 *    (e.g. `formatVietnamTime`, `formatTimeNoTz`, `formatDateLongNoTz`) to
 *    ensure consistent Vietnam timezone display without double offsets.
 */

const VIETNAM_TZ = 'Asia/Ho_Chi_Minh'

// Validate server timezone at module load
const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone
if (serverTz !== 'Asia/Ho_Chi_Minh' && serverTz !== 'Asia/Saigon') {
    console.warn('⚠️ WARNING: Server timezone is ' + serverTz + ', not Asia/Ho_Chi_Minh (UTC+7)')
    console.warn('Timezone-dependent operations may produce incorrect results')
    console.warn('Please set TZ=Asia/Ho_Chi_Minh environment variable')
}

/**
 * Get current datetime in Vietnam timezone
 * CRITICAL: Returns a Date where the UTC components represent Vietnam local time
 * 
 * This is essential for Prisma/PostgreSQL compatibility:
 * - Prisma stores DateTime as UTC in PostgreSQL
 * - We want to store Vietnam local time values
 * - So we create a Date where getUTCHours() returns Vietnam hours
 * 
 * Example: If Vietnam time is 06:30:
 * - This function returns a Date where getUTCHours() = 6, getUTCMinutes() = 30
 * - When stored in DB, it will be "2025-12-03T06:30:00.000Z"
 * - When read back and displayed with getUTCHours(), it shows "06:30" correctly
 */
export function getVietnamNow(): Date {
    const now = new Date()
    
    // Check if server is already in Vietnam timezone
    const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
    
    if (isVietnamTz) {
        // Server is in Vietnam timezone
        // Create a new Date using Date.UTC with local Vietnam components
        // This ensures getUTCHours/Minutes/etc return Vietnam local time values
        return new Date(Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds()
        ))
    } else {
        // Server is NOT in Vietnam timezone - calculate Vietnam time from UTC
        const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
        const vietnamNow = new Date(now.getTime() + VIETNAM_OFFSET_MS)
        
        // Return a Date where UTC components = Vietnam local time
        return new Date(Date.UTC(
            vietnamNow.getUTCFullYear(),
            vietnamNow.getUTCMonth(),
            vietnamNow.getUTCDate(),
            vietnamNow.getUTCHours(),
            vietnamNow.getUTCMinutes(),
            vietnamNow.getUTCSeconds(),
            vietnamNow.getUTCMilliseconds()
        ))
    }
}

/**
 * Get current date at 00:00:00 in Vietnam timezone
 * Used for session_date and date-only comparisons
 * Returns a Date object representing midnight UTC which corresponds to the Vietnam date
 */
export function getVietnamToday(): Date {
    // Get current time
    const now = new Date()
    
    // Check if server is already in Vietnam timezone
    const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
    
    let vietnamDate: { year: number; month: number; day: number }
    
    if (isVietnamTz) {
        // Server is in Vietnam timezone - use local date directly
        vietnamDate = {
            year: now.getFullYear(),
            month: now.getMonth(),
            day: now.getDate()
        }
    } else {
        // Server is NOT in Vietnam timezone - calculate Vietnam date from UTC
        const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
        const vietnamNow = new Date(now.getTime() + VIETNAM_OFFSET_MS)
        vietnamDate = {
            year: vietnamNow.getUTCFullYear(),
            month: vietnamNow.getUTCMonth(),
            day: vietnamNow.getUTCDate()
        }
    }
    
    // Return as UTC midnight representing the Vietnam date
    return new Date(Date.UTC(vietnamDate.year, vietnamDate.month, vietnamDate.day, 0, 0, 0, 0))
}

/**
 * Format datetime for Vietnam timezone display (HH:mm:ss)
 * ALWAYS displays in Vietnam timezone regardless of browser/server timezone
 */
export function formatVietnamTime(date: Date): string {
    // Use UTC components to avoid re-applying any timezone offsets
    const h = date.getUTCHours().toString().padStart(2, '0')
    const m = date.getUTCMinutes().toString().padStart(2, '0')
    const s = date.getUTCSeconds().toString().padStart(2, '0')
    return `${h}:${m}:${s}`
}

/**
 * Format datetime for Vietnam timezone display (HH:mm)
 * ALWAYS displays in Vietnam timezone regardless of browser/server timezone
 */
export function formatVietnamTimeShort(date: Date): string {
    const h = date.getUTCHours().toString().padStart(2, '0')
    const m = date.getUTCMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
}

/**
 * Format date for Vietnam timezone display (dd/MM/yyyy)
 * ALWAYS displays in Vietnam timezone regardless of browser/server timezone
 */
export function formatVietnamDate(date: Date): string {
    const d = date.getUTCDate().toString().padStart(2, '0')
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
    const y = date.getUTCFullYear()
    return `${d}/${m}/${y}`
}

/**
 * Format full datetime for Vietnam timezone display (dd/MM/yyyy HH:mm:ss)
 * ALWAYS displays in Vietnam timezone regardless of browser/server timezone
 */
export function formatVietnamDateTime(date: Date): string {
    const d = formatVietnamDate(date)
    const t = formatVietnamTime(date)
    return `${d} ${t}`
}

/**
 * Format a stored time or datetime without applying timezone conversion.
 * If the input is a full ISO string (contains 'T') we format using UTC
 * components which avoids applying an extra +7 offset for values that were
 * serialized with a trailing Z but represent local Vietnam time.
 */
export function formatTimeNoTz(value: Date | string | null | undefined): string {
    if (!value) return '—'

    if (typeof value === 'string') {
        if (value.includes('T')) {
            const d = new Date(value)
            return formatVietnamTimeShort(d)
        }
        return value.substring(0, 5)
    }

    return formatVietnamTimeShort(value)
}

/**
 * Format a long date (weekday, day month year) using UTC components
 * so we avoid applying an extra timezone conversion. Uses Intl for localization.
 */
export function formatDateLongNoTz(date: Date, locale: string = 'vi'): string {
    try {
        const opts: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: '2-digit',
            timeZone: 'UTC'
        }
        return new Intl.DateTimeFormat(locale, opts).format(date)
    } catch (err) {
        return formatVietnamDate(date)
    }
}

/**
 * Parse user input time string (HH:mm or HH:mm:ss) and combine with a base date
 * to create a full datetime in Vietnam timezone
 * 
 * CRITICAL: Returns Date where UTC components = Vietnam local time
 * for consistency with database storage
 */
export function parseVietnamTime(timeString: string, baseDate: Date = getVietnamToday()): Date {
    const parts = timeString.split(':').map(p => parseInt(p, 10))

    if (parts.length < 2 || parts.some(p => isNaN(p))) {
        throw new Error('Invalid time format. Expected HH:mm or HH:mm:ss')
    }

    const [hours, minutes, seconds = 0] = parts

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        throw new Error('Invalid time values')
    }

    // Use UTC components from baseDate (which already has UTC = Vietnam date)
    const year = baseDate.getUTCFullYear()
    const month = baseDate.getUTCMonth()
    const day = baseDate.getUTCDate()

    // Create Date using Date.UTC for consistency
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds, 0))
}

/**
 * Parse ISO datetime string to Vietnam Date
 * Input should be in format: "2025-11-28T10:30:00" or full ISO string
 */
export function parseVietnamDateTime(dateTimeString: string): Date {
    const date = new Date(dateTimeString)

    if (isNaN(date.getTime())) {
        throw new Error('Invalid datetime string')
    }

    return date
}

/**
 * Calculate difference between two dates in minutes
 */
export function getMinutesDifference(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime()
    return Math.floor(diffMs / (1000 * 60))
}

/**
 * Calculate difference between two dates in hours (decimal)
 */
export function getHoursDifference(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime()
    return diffMs / (1000 * 60 * 60)
}

/**
 * Create a shift datetime for a specific time on a given date
 * CRITICAL: Must maintain Vietnam timezone consistency
 * 
 * This function creates a datetime where UTC components represent Vietnam local time
 * to match how getVietnamNow() works for database storage
 * 
 * @param baseDate - The date to use (typically session_date which has UTC components = Vietnam date)
 * @param hours - Hour (0-23) in Vietnam time
 * @param minutes - Minutes (0-59)
 */
export function createShiftDateTime(baseDate: Date, hours: number, minutes: number): Date {
    // baseDate from getVietnamToday() has UTC components = Vietnam date
    // So we use getUTCFullYear/Month/Date to extract the correct date
    const year = baseDate.getUTCFullYear()
    const month = baseDate.getUTCMonth()
    const day = baseDate.getUTCDate()

    // Create Date using Date.UTC so that getUTCHours() returns the Vietnam hours
    // This ensures consistency with getVietnamNow() and proper database storage
    return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0))
}

/**
 * Parse shift time from database (can be Date or string "HH:mm:ss")
 * Returns hours and minutes
 * 
 * CRITICAL: PostgreSQL Time type is returned as Date with UTC time
 * We must use getUTCHours/getUTCMinutes to get the correct values
 */
export function parseShiftTime(time: Date | string): { hours: number; minutes: number } {
    if (time instanceof Date) {
        // CRITICAL FIX: Use UTC methods because PostgreSQL Time is stored in UTC
        // but represents local Vietnam time
        return {
            hours: time.getUTCHours(),
            minutes: time.getUTCMinutes()
        }
    }

    if (typeof time === 'string' && time.includes('T')) {
        // Handle JSON serialized Date strings from API (e.g. "1970-01-01T06:30:00.000Z")
        const parsedDate = new Date(time)
        return {
            hours: parsedDate.getUTCHours(),
            minutes: parsedDate.getUTCMinutes()
        }
    }

    // Parse string format "HH:mm:ss" or "HH:mm"
    const parts = time.split(':').map(p => parseInt(p, 10))
    return {
        hours: parts[0] || 0,
        minutes: parts[1] || 0
    }
}

/**
 * Check if a datetime is after another datetime
 */
export function isAfter(date1: Date, date2: Date): boolean {
    return date1.getTime() > date2.getTime()
}

/**
 * Check if a datetime is before another datetime
 */
export function isBefore(date1: Date, date2: Date): boolean {
    return date1.getTime() < date2.getTime()
}

/**
 * Check if two dates are the same day (ignoring time)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    )
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000)
}

/**
 * Add hours to a date
 */
export function addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
}

/**
 * Format a datetime string from database for display (HH:mm)
 * Database stores Vietnam time as UTC, so we use UTC components directly
 * @param dateString - ISO string from database (e.g., "2025-12-01T10:30:00.000Z")
 * @returns Formatted time string (e.g., "10:30")
 */
export function formatDbTimeToDisplay(dateString?: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'
    return formatVietnamTimeShort(date)
}

/**
 * Format a datetime string from database for display with seconds (HH:mm:ss)
 * @param dateString - ISO string from database
 * @returns Formatted time string (e.g., "10:30:45")
 */
export function formatDbTimeFullToDisplay(dateString?: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'
    return formatVietnamTime(date)
}

/**
 * Format a date string from database for display (dd/MM/yyyy)
 * Database stores dates as UTC midnight representing Vietnam date
 * @param dateString - ISO string from database
 * @returns Formatted date string (e.g., "01/12/2025")
 */
export function formatDbDateToDisplay(dateString?: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'
    return formatVietnamDate(date)
}

/**
 * Format a datetime string from database for full display (dd/MM/yyyy HH:mm)
 * @param dateString - ISO string from database
 * @returns Formatted datetime string (e.g., "01/12/2025 10:30")
 */
export function formatDbDateTimeToDisplay(dateString?: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'

    // ALWAYS add +7 hours to convert from UTC to Vietnam time
    // Database stores timestamps in UTC, we need to display in Vietnam timezone (UTC+7)
    const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
    const vietnamDate = new Date(date.getTime() + VIETNAM_OFFSET_MS)
    return `${formatVietnamDate(vietnamDate)} ${formatVietnamTimeShort(vietnamDate)}`
}
