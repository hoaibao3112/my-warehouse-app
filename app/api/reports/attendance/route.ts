import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

export const dynamic = "force-dynamic"

async function getUser(request: NextRequest) {
    const token = getAuthToken(request)

    if (!token) {
        return null
    }

    try {
        const user = verifyToken(token)
        return user as any
    } catch {
        return null
    }
}

// Helper to calculate work hours from shift times, capping at shift duration
function calculateWorkHours(
    checkIn: Date | null,
    checkOut: Date | null,
    shiftStart: Date | null,
    shiftEnd: Date | null,
    sessionDate: Date | null
): number {
    if (!checkIn || !checkOut) return 0

    // If no shift info, return raw duration
    if (!shiftStart || !shiftEnd || !sessionDate) {
        const diffMs = checkOut.getTime() - checkIn.getTime()
        return Math.max(0, diffMs / (1000 * 60 * 60))
    }

    // Construct valid shift start/end times for this session
    const validStart = new Date(sessionDate)
    validStart.setHours(shiftStart.getHours(), shiftStart.getMinutes(), 0, 0)

    const validEnd = new Date(sessionDate)
    validEnd.setHours(shiftEnd.getHours(), shiftEnd.getMinutes(), 0, 0)

    // Handle overnight shift 
    if (validEnd < validStart) {
        validEnd.setDate(validEnd.getDate() + 1)
    }

    // Calculate effective start (max of checkIn, shiftStart)
    const effectiveStart = checkIn > validStart ? checkIn : validStart

    // Calculate effective end (min of checkOut, shiftEnd)
    const effectiveEnd = checkOut < validEnd ? checkOut : validEnd

    const diffMs = effectiveEnd.getTime() - effectiveStart.getTime()
    if (diffMs <= 0) return 0

    return diffMs / (1000 * 60 * 60)
}

// Helper to calculate late minutes
function calculateLateMinutes(
    checkIn: Date | null,
    shiftStart: Date | null,
    sessionDate: Date
): number {
    if (!checkIn || !shiftStart) return 0

    // Create expected start time using session date + shift start time
    const expectedStart = new Date(sessionDate)
    expectedStart.setHours(shiftStart.getHours(), shiftStart.getMinutes(), 0, 0)

    const diffMs = checkIn.getTime() - expectedStart.getTime()
    if (diffMs <= 0) return 0 // Not late

    return Math.floor(diffMs / (1000 * 60)) // Convert to minutes
}

// Helper to calculate early leave minutes
function calculateEarlyMinutes(
    checkOut: Date | null,
    shiftEnd: Date | null,
    sessionDate: Date
): number {
    if (!checkOut || !shiftEnd) return 0

    // Create expected end time using session date + shift end time
    const expectedEnd = new Date(sessionDate)
    expectedEnd.setHours(shiftEnd.getHours(), shiftEnd.getMinutes(), 0, 0)

    // Handle overnight shifts
    if (shiftEnd.getHours() < 6) {
        expectedEnd.setDate(expectedEnd.getDate() + 1)
    }

    const diffMs = expectedEnd.getTime() - checkOut.getTime()
    if (diffMs <= 0) return 0 // Not early

    return Math.floor(diffMs / (1000 * 60)) // Convert to minutes
}

// Format duration as "H:mm"
function formatHours(hours: number): string {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}:${m.toString().padStart(2, "0")}`
}

export async function GET(request: NextRequest) {
    try {
        const user = await getUser(request)
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const searchParams = request.nextUrl.searchParams
        const warehouseId = searchParams.get("warehouseId")
        const startDate = searchParams.get("startDate")
        const endDate = searchParams.get("endDate")
        const reportType = searchParams.get("type") || "daily" // daily, late, summary

        if (!startDate || !endDate) {
            return NextResponse.json(
                { success: false, error: "startDate and endDate are required" },
                { status: 400 }
            )
        }

        const start = new Date(startDate)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)

        // Build where clause
        const whereClause: any = {
            session_date: {
                gte: start,
                lte: end,
            },
        }

        if (warehouseId) {
            whereClause.warehouse_id = warehouseId
        }

        // Fetch shift sessions with related data (LEGACY)
        const legacySessions = await prisma.shift_sessions.findMany({
            where: whereClause,
            include: {
                users_shift_sessions_user_idTousers: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                        role: true,
                    },
                },
                warehouses: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                work_shifts: {
                    select: {
                        id: true,
                        shift_name: true,
                        shift_code: true,
                        start_time: true,
                        end_time: true,
                    },
                },
            },
            orderBy: [
                { session_date: "asc" },
                { users_shift_sessions_user_idTousers: { full_name: "asc" } },
            ],
        })

        // Fetch attendance sessions with related data (NEW)
        const attendanceSessions = await prisma.attendance_sessions.findMany({
            where: whereClause,
            include: {
                users_attendance_sessions_user_idTousers: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                        role: true,
                    },
                },
                warehouses: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                work_shifts: {
                    select: {
                        id: true,
                        shift_name: true,
                        shift_code: true,
                        start_time: true,
                        end_time: true,
                    },
                },
            },
            orderBy: [
                { session_date: "asc" },
                { users_attendance_sessions_user_idTousers: { full_name: "asc" } },
            ],
        })

        // Merge sessions: Legacy < New (AttendanceSessions override Legacy if exist for same user/date/shift)
        const sessionMap = new Map<string, any>()

        // Add legacy sessions first
        legacySessions.forEach(session => {
            const dateKey = session.session_date instanceof Date
                ? session.session_date.toISOString().split('T')[0]
                : new Date(session.session_date).toISOString().split('T')[0]
            // CRITICAL: Include work_shift_id in key to allow multiple shifts per day
            const key = `${session.user_id}_${dateKey}_${session.work_shift_id || 'unknown'}`

            // Normalize user/warehouse/shift relations to common property names
            const normalizedSession = {
                ...session,
                user: session.users_shift_sessions_user_idTousers,
                warehouse: session.warehouses,
                work_shift: session.work_shifts
            }

            sessionMap.set(key, normalizedSession)
        })

        // Override with new attendance sessions
        attendanceSessions.forEach(session => {
            const dateKey = session.session_date instanceof Date
                ? session.session_date.toISOString().split('T')[0]
                : new Date(session.session_date).toISOString().split('T')[0]
            // CRITICAL: Include work_shift_id in key to allow multiple shifts per day
            const key = `${session.user_id}_${dateKey}_${session.work_shift_id || 'unknown'}`

            // Normalize user/warehouse/shift relations to common property names
            const normalizedSession = {
                ...session,
                user: session.users_attendance_sessions_user_idTousers,
                warehouse: session.warehouses,
                work_shift: session.work_shifts
            }

            sessionMap.set(key, normalizedSession)
        })

        const allSessions = Array.from(sessionMap.values())

        // Fetch leave requests
        const leaveRequests = await prisma.leave_requests.findMany({
            where: {
                user_id: { in: allSessions.map((s) => s.user_id) },
                leave_date: {
                    gte: start,
                    lte: end,
                },
                status: "APPROVED",
            },
        })

        // Group sessions by user
        const userSessions = new Map<string, any[]>()
        const userInfo = new Map<string, any>()

        // Generate array of dates in range
        const dates: Date[] = []
        let currentDate = new Date(start)
        while (currentDate <= end) {
            dates.push(new Date(currentDate))
            currentDate.setDate(currentDate.getDate() + 1)
        }
        const days = dates // Alias for clarity

        for (const session of allSessions) {
            // REMOVED: Skipping STAFF users. Now we include everyone who has a session.
            const userRole = session.user.role
            // if (userRole === 'STAFF') continue

            const userId = session.user_id
            if (!userSessions.has(userId)) {
                userSessions.set(userId, [])
                userInfo.set(userId, {
                    id: userId,
                    employeeCode: session.user.email || "",
                    fullName: session.user.full_name || "Unknown",
                    warehouse: session.warehouse.name,
                    role: session.user.role,
                })
            }
            userSessions.get(userId)!.push(session)
        }

        // Build response based on report type
        if (reportType === "daily") {
            // Bảng chấm công - daily attendance grid
            const dailyData = Array.from(userInfo.entries()).map(([userId, user], index) => {
                const sessions = userSessions.get(userId) || []

                // Create daily hours map
                const dailyHours: Record<string, string | null> = {}
                let totalHours = 0
                let workDays = 0

                for (const day of days) {
                    const dateKey = day.toISOString().split("T")[0]
                    // Find ALL sessions for this day (handling multiple shifts)
                    const daySessions = sessions.filter(
                        (s) => new Date(s.session_date).toISOString().split("T")[0] === dateKey
                    )

                    if (daySessions.length > 0) {
                        let dayTotalHours = 0
                        let hasIncomplete = false
                        let hasData = false

                        daySessions.forEach(daySession => {
                            if (daySession.check_in_time && daySession.check_out_time) {
                                const shift = daySession.work_shift
                                const hours = calculateWorkHours(
                                    new Date(daySession.check_in_time),
                                    new Date(daySession.check_out_time),
                                    shift ? new Date(shift.start_time) : null,
                                    shift ? new Date(shift.end_time) : null,
                                    new Date(daySession.session_date)
                                )
                                dayTotalHours += hours
                                hasData = true
                            } else if (daySession.check_in_time) {
                                hasIncomplete = true
                                hasData = true
                            }
                        })

                        if (hasData) {
                            if (dayTotalHours > 0) {
                                dailyHours[dateKey] = formatHours(dayTotalHours)
                                totalHours += dayTotalHours
                                workDays++ // Count as 1 day of work even if multiple shifts
                            } else if (hasIncomplete) {
                                dailyHours[dateKey] = "..."
                            } else {
                                dailyHours[dateKey] = "0:00" // Present but 0 hours?
                            }
                        } else {
                            dailyHours[dateKey] = null
                        }
                    } else {
                        dailyHours[dateKey] = null
                    }
                }

                return {
                    stt: index + 1,
                    employeeCode: user.employeeCode,
                    fullName: user.fullName,
                    warehouse: user.warehouse,
                    role: user.role,
                    dailyHours,
                    totalHours: formatHours(totalHours),
                    totalHoursNumber: totalHours,
                    workDays,
                }
            })

            return NextResponse.json({
                success: true,
                data: {
                    type: "daily",
                    dateRange: { start: startDate, end: endDate },
                    days: days.map((d) => ({
                        date: d.toISOString().split("T")[0],
                        dayOfWeek: d.toLocaleDateString("vi-VN", { weekday: "long" }),
                    })),
                    employees: dailyData,
                },
            })
        } else if (reportType === "late") {
            // Đi muộn về sớm - late/early report
            const lateData = Array.from(userInfo.entries()).map(([userId, user], index) => {
                const sessions = userSessions.get(userId) || []

                let lateCount = 0
                let totalLateMinutes = 0
                let earlyCount = 0
                let totalEarlyMinutes = 0

                for (const session of sessions) {
                    if (session.work_shift && session.check_in_time) {
                        const lateMinutes = calculateLateMinutes(
                            new Date(session.check_in_time),
                            new Date(session.work_shift.start_time),
                            new Date(session.session_date)
                        )
                        if (lateMinutes > 0) {
                            lateCount++
                            totalLateMinutes += lateMinutes
                        }
                    }

                    if (session.work_shift && session.check_out_time) {
                        const earlyMinutes = calculateEarlyMinutes(
                            new Date(session.check_out_time),
                            new Date(session.work_shift.end_time),
                            new Date(session.session_date)
                        )
                        if (earlyMinutes > 0) {
                            earlyCount++
                            totalEarlyMinutes += earlyMinutes
                        }
                    }
                }

                return {
                    stt: index + 1,
                    employeeCode: user.employeeCode,
                    fullName: user.fullName,
                    warehouse: user.warehouse,
                    lateCount,
                    totalLateMinutes,
                    earlyCount,
                    totalEarlyMinutes,
                }
            })

            return NextResponse.json({
                success: true,
                data: {
                    type: "late",
                    dateRange: { start: startDate, end: endDate },
                    employees: lateData.filter((e) => e.lateCount > 0 || e.earlyCount > 0),
                },
            })
        } else if (reportType === "summary") {
            // Bảng tổng hợp - summary report
            const summaryData = Array.from(userInfo.entries()).map(([userId, user], index) => {
                const sessions = userSessions.get(userId) || []
                const userLeaves = leaveRequests.filter((l) => l.user_id === userId)

                let totalHours = 0
                let workDays = 0
                let lateCount = 0
                let earlyCount = 0

                for (const session of sessions) {
                    if (session.check_in_time && session.check_out_time) {
                        const shift = session.work_shift
                        totalHours += calculateWorkHours(
                            new Date(session.check_in_time),
                            new Date(session.check_out_time),
                            shift ? new Date(shift.start_time) : null,
                            shift ? new Date(shift.end_time) : null,
                            new Date(session.session_date)
                        )
                        workDays++
                    }

                    if (session.work_shift && session.check_in_time) {
                        const lateMinutes = calculateLateMinutes(
                            new Date(session.check_in_time),
                            new Date(session.work_shift.start_time),
                            new Date(session.session_date)
                        )
                        if (lateMinutes > 0) lateCount++
                    }

                    if (session.work_shift && session.check_out_time) {
                        const earlyMinutes = calculateEarlyMinutes(
                            new Date(session.check_out_time),
                            new Date(session.work_shift.end_time),
                            new Date(session.session_date)
                        )
                        if (earlyMinutes > 0) earlyCount++
                    }
                }

                return {
                    stt: index + 1,
                    employeeCode: user.employeeCode,
                    fullName: user.fullName,
                    warehouse: user.warehouse,
                    role: user.role,
                    totalHours: formatHours(totalHours),
                    totalHoursNumber: totalHours,
                    workDays,
                    paidLeaveDays: userLeaves.length,
                    unpaidLeaveDays: 0, // Would need separate tracking
                    holidayDays: 0, // Would need holiday calendar
                    lateCount,
                    earlyCount,
                }
            })

            return NextResponse.json({
                success: true,
                data: {
                    type: "summary",
                    dateRange: { start: startDate, end: endDate },
                    employees: summaryData,
                    totals: {
                        totalEmployees: summaryData.length,
                        totalWorkDays: summaryData.reduce((a, b) => a + b.workDays, 0),
                        totalHours: summaryData.reduce((a, b) => a + b.totalHoursNumber, 0),
                    },
                },
            })
        }

        return NextResponse.json(
            { success: false, error: "Invalid report type" },
            { status: 400 }
        )
    } catch (error) {
        console.error("Error fetching attendance report:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}
