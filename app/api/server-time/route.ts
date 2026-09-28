import { NextResponse } from 'next/server'

/**
 * GET /api/server-time
 * Returns REAL current time in Vietnam timezone
 * CRITICAL: Handles both Vietnam-timezone servers and UTC servers correctly
 */
export async function GET() {
    try {
        const now = new Date()
        
        // Check if server is already in Vietnam timezone
        const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
        
        let year: number, month: number, day: number, hours: number, minutes: number, seconds: number, ms: number
        
        if (isVietnamTz) {
            // Server is in Vietnam timezone - use local date/time directly
            year = now.getFullYear()
            month = now.getMonth() + 1
            day = now.getDate()
            hours = now.getHours()
            minutes = now.getMinutes()
            seconds = now.getSeconds()
            ms = now.getMilliseconds()
        } else {
            // Server is NOT in Vietnam timezone - calculate Vietnam time from UTC
            const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
            const vietnamNow = new Date(now.getTime() + VIETNAM_OFFSET_MS)
            year = vietnamNow.getUTCFullYear()
            month = vietnamNow.getUTCMonth() + 1
            day = vietnamNow.getUTCDate()
            hours = vietnamNow.getUTCHours()
            minutes = vietnamNow.getUTCMinutes()
            seconds = vietnamNow.getUTCSeconds()
            ms = vietnamNow.getUTCMilliseconds()
        }

        const pad = (n: number, l = 2) => String(n).padStart(l, '0')
        // Vietnam offset is +07:00
        const vietnamTimeISO = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(ms).padStart(3, '0')}+07:00`

        return NextResponse.json({
            success: true,
            data: {
                currentTime: vietnamTimeISO
            }
        })
    } catch (error) {
        console.error('Error getting server time:', error)
        return NextResponse.json({
            success: false,
            error: 'Failed to get server time'
        }, { status: 500 })
    }
}
