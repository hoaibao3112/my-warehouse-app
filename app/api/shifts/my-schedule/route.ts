import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { startOfMonth, endOfMonth } from "date-fns"
import {
  getMonthShiftAssignments,
  findConsecutiveEmptyDays,
  FULLTIME_MIN_SHIFTS,
  PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS,
} from "@/lib/shift-registration-validation"

export const dynamic = 'force-dynamic'

/**
 * @swagger
 * /api/shifts/my-schedule:
 *   get:
 *     summary: Get My Schedule
 *     tags: [Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User schedule and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const yearStr = searchParams.get("year")
    const monthStr = searchParams.get("month")

    // Default to current month
    const now = new Date()
    const year = yearStr ? parseInt(yearStr) : now.getFullYear()
    const month = monthStr ? parseInt(monthStr) : now.getMonth() + 1

    // Get user's employment type
    const userProfile = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        employment_type: true,
        warehouse_id: true,
      },
    })

    const employmentType = userProfile?.employment_type || "FULLTIME"

    // Get all assignments for the month
    const assignments = await getMonthShiftAssignments(user.id, year, month)

    // Serialize time fields in work_shifts
    const serializedAssignments = assignments.map((assignment: any) => ({
      ...assignment,
      work_shifts: assignment.work_shifts
        ? {
          ...assignment.work_shifts,
          start_time:
            assignment.work_shifts.start_time instanceof Date
              ? assignment.work_shifts.start_time.toISOString().substr(11, 8)
              : assignment.work_shifts.start_time,
          end_time:
            assignment.work_shifts.end_time instanceof Date
              ? assignment.work_shifts.end_time.toISOString().substr(11, 8)
              : assignment.work_shifts.end_time,
        }
        : null,
    }))

    // Merge both session types - prioritize attendance_sessions for same date AND assignment
    // CRITICAL: attendance_sessions is the new attendance-only table
    // shift_sessions may still contain legacy data
    const startDate = startOfMonth(new Date(year, month - 1, 1))
    const endDate = endOfMonth(startDate)

    const sessions = await prisma.shift_sessions.findMany({
      where: {
        user_id: user.id,
        session_date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        session_date: true,
        check_in_time: true,
        check_out_time: true,
        status: true,
        work_shift_id: true,
        shift_assignment_id: true, // Request this field if available, or fallback
        notes: true,
        actual_duration: true,
        // Sales columns moved to sales_sessions table
        modified_by: true,
        users_shift_sessions_modified_byTousers: {
          select: {
            id: true,
            full_name: true,
          }
        },
      },
    })

    // CRITICAL FIX: Also get attendance_sessions for NEW attendance check-ins
    const attendanceSessions = await prisma.attendance_sessions.findMany({
      where: {
        user_id: user.id,
        session_date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { check_in_time: 'desc' },
      select: {
        id: true,
        session_date: true,
        check_in_time: true,
        check_out_time: true,
        status: true,
        work_shift_id: true,
        shift_assignment_id: true,
        notes: true,
        actual_duration: true,
        modified_by: true,
        users_attendance_sessions_modified_byTousers: {
          select: {
            id: true,
            full_name: true,
          }
        },
      },
    })

    // Merge both session types - prioritize attendance_sessions for same date
    const sessionMap = new Map()

    // Add shift_sessions first
    sessions.forEach(session => {
      const dateKey = new Date(session.session_date).toISOString().split('T')[0]
      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'legacy'
      const key = `${dateKey}_${uniqueId}`
      sessionMap.set(key, session)
    })

    // Override with attendance_sessions (newer system)
    attendanceSessions.forEach(session => {
      const dateKey = new Date(session.session_date).toISOString().split('T')[0]
      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'new'
      const key = `${dateKey}_${uniqueId}`

      // Only overwrite if existing is not checked-in OR new one is checked-in
      // (Priority to sessions with check-in time)
      const existing = sessionMap.get(key)
      if (!existing || session.check_in_time || !existing.check_in_time) {
        sessionMap.set(key, session)
      }
    })

    const mergedSessions = Array.from(sessionMap.values())

    // Get pending registration requests for the month
    const pendingRequests = await prisma.shift_registration_requests.findMany({
      where: {
        user_id: user.id,
        requested_date: {
          gte: startDate,
          lte: endDate,
        },
        status: { in: ["PENDING", "REJECTED"] },
      },
      include: {
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
    })

    // Serialize pending requests
    const serializedPendingRequests = pendingRequests.map((req: any) => ({
      ...req,
      work_shifts: req.work_shifts
        ? {
          ...req.work_shifts,
          start_time:
            req.work_shifts.start_time instanceof Date
              ? req.work_shifts.start_time.toISOString().substr(11, 8)
              : req.work_shifts.start_time,
          end_time:
            req.work_shifts.end_time instanceof Date
              ? req.work_shifts.end_time.toISOString().substr(11, 8)
              : req.work_shifts.end_time,
        }
        : null,
    }))

    // Get all active shifts
    const allShifts = await prisma.work_shifts.findMany({
      where: { is_active: true },
      select: {
        id: true,
        shift_name: true,
        shift_code: true,
        start_time: true,
        end_time: true,
      },
    })

    // Serialize shifts
    const serializedShifts = allShifts.map((shift: any) => ({
      ...shift,
      start_time:
        shift.start_time instanceof Date
          ? shift.start_time.toISOString().substr(11, 8)
          : shift.start_time,
      end_time:
        shift.end_time instanceof Date
          ? shift.end_time.toISOString().substr(11, 8)
          : shift.end_time,
    }))

    // Calculate statistics - use mergedSessions
    const totalShifts = assignments.length
    const completedSessions = mergedSessions.filter((s) => s.status === "COMPLETED").length
    const pendingSessions = mergedSessions.filter((s) => s.status === "PENDING_APPROVAL").length
    const inProgressSessions = mergedSessions.filter((s) => s.status === "IN_PROGRESS").length

    // Employment type specific stats
    let employmentTypeStats: any = {}

    if (employmentType === "FULLTIME") {
      const remaining = Math.max(0, FULLTIME_MIN_SHIFTS - totalShifts)
      employmentTypeStats = {
        type: "FULLTIME",
        minRequired: FULLTIME_MIN_SHIFTS,
        current: totalShifts,
        remaining,
        met: totalShifts >= FULLTIME_MIN_SHIFTS,
      }
    } else if (employmentType === "PARTTIME") {
      const emptyPeriods = await findConsecutiveEmptyDays(user.id, year, month)
      const violations = emptyPeriods.filter(
        (period) => period.count > PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS
      )

      employmentTypeStats = {
        type: "PARTTIME",
        maxConsecutiveEmpty: PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS,
        emptyPeriods: emptyPeriods.map((p) => ({
          start: p.start.toISOString().split("T")[0],
          end: p.end.toISOString().split("T")[0],
          count: p.count,
          violation: p.count > PARTTIME_MAX_CONSECUTIVE_EMPTY_DAYS,
        })),
        hasViolations: violations.length > 0,
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        assignments: serializedAssignments,
        sessions: mergedSessions, // CRITICAL: Return merged sessions
        shifts: serializedShifts,
        pendingRequests: serializedPendingRequests,
        statistics: {
          totalShifts,
          completedSessions,
          pendingSessions,
          inProgressSessions,
          pendingRequests: serializedPendingRequests.filter((r: any) => r.status === "PENDING").length,
          employmentType: employmentTypeStats,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching my schedule:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
