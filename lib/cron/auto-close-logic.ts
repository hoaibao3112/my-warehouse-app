import { prisma } from "@/lib/prisma"
import { getVietnamNow, parseShiftTime, createShiftDateTime, addMinutes, isAfter, formatVietnamDateTime } from "@/lib/server-time"

// Auto-close expired IN_PROGRESS sales sessions after 30 minutes past shift end time
// NOTE: This is for SALES sessions only (bán hàng), not attendance tracking (chấm công)
// Uses the new sales_sessions table
export async function runAutoCloseShifts(): Promise<{ closedCount: number, message: string }> {
    try {
        const now = getVietnamNow()
        const today = new Date(now)
        today.setHours(0, 0, 0, 0)

        let closedCount = 0

        // AUTO-CLOSE LOGIC for sales_sessions (NOT shift_sessions)
        // Find all IN_PROGRESS sales sessions with a work_shift
        const activeSessions = await prisma.sales_sessions.findMany({
            where: {
                status: 'IN_PROGRESS',
                work_shift_id: { not: null }
            },
            include: {
                work_shifts: true,
                users_sales_sessions_user_idTousers: { select: { full_name: true } }
            }
        })

        console.log(`[AutoClose Sales] Checking ${activeSessions.length} active sales sessions at ${formatVietnamDateTime(now)}`)

        for (const session of activeSessions) {
            if (!session.work_shifts) continue

            // Parse times
            const { hours: endH, minutes: endM } = parseShiftTime(session.work_shifts.end_time)
            const { hours: startH, minutes: startM } = parseShiftTime(session.work_shifts.start_time)

            const startDateTime = createShiftDateTime(session.session_date, startH, startM)
            let endDateTime = createShiftDateTime(session.session_date, endH, endM)

            // Handle cross-day shifts
            if (isAfter(startDateTime, endDateTime)) {
                endDateTime = addMinutes(endDateTime, 24 * 60) // Add 1 day
            }

            // 30 minutes buffer after shift end time
            const autoCloseThreshold = addMinutes(endDateTime, 30)

            if (isAfter(now, autoCloseThreshold)) {
                const userName = session.users_sales_sessions_user_idTousers?.full_name || 'Unknown'
                console.log(`[AutoClose Sales] Closing session ${session.id} for ${userName}. Now: ${formatVietnamDateTime(now)}, Threshold: ${formatVietnamDateTime(autoCloseThreshold)}`)

                // Auto-close with closing_cash = 0
                await prisma.sales_sessions.update({
                    where: { id: session.id },
                    data: {
                        status: 'COMPLETED',
                        closing_cash: 0,
                        closing_cash_user_id: session.user_id,
                        shift_closed_at: now,
                        expected_cash: Number(session.opening_cash) + Number(session.total_revenue),
                        cash_difference: 0 - (Number(session.opening_cash) + Number(session.total_revenue)),
                        notes: (session.notes || '') + '\n[TỰ ĐỘNG ĐÓNG CA] Hệ thống tự động đóng do quá 30 phút sau giờ kết thúc ca. Tiền cuối ca = 0.',
                        updated_at: now
                    }
                })

                closedCount++
            }
        }

        // NOTE: This is ONLY for sales sessions
        // Attendance tracking uses a separate module (attendance_sessions table)

        return {
            closedCount,
            message: `Processed ${activeSessions.length} active sales sessions. Auto-closed ${closedCount}.`
        }
    } catch (error) {
        console.error("Auto-close sales sessions error:", error)
        throw error
    }
}
