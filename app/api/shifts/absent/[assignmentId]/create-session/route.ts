import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"
import {
    getVietnamNow,
    parseShiftTime,
    getMinutesDifference,
    isAfter,
    isBefore,
} from "@/lib/server-time"

/**
 * POST /api/shifts/absent/[assignmentId]/create-session
 * 
 * Create a shift session for an absent employee
 * This allows managers to manually add check-in/check-out times for employees who missed their shift
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ assignmentId: string }> }
) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            )
        }

        // Only managers and general managers can create sessions for absent employees
        if (user.role !== "WAREHOUSE_MANAGER" && user.role !== "ADMIN" && user.role !== "GENERAL_MANAGER") {
            return NextResponse.json(
                { success: false, error: "Only managers can create sessions for absent employees" },
                { status: 403 }
            )
        }

        const { assignmentId } = await params

        if (!isValidUUID(assignmentId)) {
            return NextResponse.json(
                { success: false, error: "Invalid assignment ID format" },
                { status: 400 }
            )
        }

        const body = await request.json()
        const { check_in_time, check_out_time, notes } = body

        // At least one time must be provided
        if (!check_in_time && !check_out_time) {
            return NextResponse.json(
                { success: false, error: "Vui lòng cung cấp ít nhất giờ vào hoặc giờ ra" },
                { status: 400 }
            )
        }

        // Get the assignment
        const assignment = await prisma.shift_assignments.findUnique({
            where: { id: assignmentId },
            include: {
                work_shifts: true,
                users_assigned: true,
                warehouses: true,
            },
        })

        if (!assignment) {
            return NextResponse.json(
                { success: false, error: "Assignment not found" },
                { status: 404 }
            )
        }

        // Check if manager has access to this warehouse
        if (user.role === "WAREHOUSE_MANAGER" && user.warehouse_id !== assignment.warehouse_id) {
            return NextResponse.json(
                { success: false, error: "You can only manage employees in your warehouse" },
                { status: 403 }
            )
        }

        // GENERAL_MANAGER must have access to warehouse
        if (user.role === "GENERAL_MANAGER" && !user.warehouseIds?.includes(assignment.warehouse_id)) {
            return NextResponse.json(
                { success: false, error: "You can only manage employees in your warehouse" },
                { status: 403 }
            )
        }

        // Check if session already exists for THIS SPECIFIC ASSIGNMENT
        // CRITICAL: Must check by shift_assignment_id to support multiple shifts per day
        // Check in BOTH tables: shift_sessions (legacy) and attendance_sessions (new)
        const [existingLegacySession, existingNewSession] = await Promise.all([
            prisma.shift_sessions.findFirst({
                where: { shift_assignment_id: assignmentId },
            }),
            prisma.attendance_sessions.findFirst({
                where: { shift_assignment_id: assignmentId },
            }),
        ])

        if (existingLegacySession || existingNewSession) {
            return NextResponse.json(
                { success: false, error: "Ca này đã có phiên chấm công. Vui lòng dùng chức năng chỉnh sửa thay vì tạo mới." },
                { status: 400 }
            )
        }

        // Get current Vietnam time for modification timestamp
        const now = getVietnamNow()

        // Parse times from datetime-local format
        let parsedCheckIn: Date | null = null
        let parsedCheckOut: Date | null = null

        if (check_in_time) {
            const [datePart, timePart] = check_in_time.split('T')
            const [year, month, day] = datePart.split('-').map(Number)
            const [hours, minutes] = timePart.split(':').map(Number)
            parsedCheckIn = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
        }

        if (check_out_time) {
            const [datePart, timePart] = check_out_time.split('T')
            const [year, month, day] = datePart.split('-').map(Number)
            const [hours, minutes] = timePart.split(':').map(Number)
            parsedCheckOut = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
        }

        // Calculate duration if both times present
        let actualDuration: number | null = null
        if (parsedCheckIn && parsedCheckOut) {
            actualDuration = getMinutesDifference(parsedCheckIn, parsedCheckOut)
        }

        // Calculate late/early info and build notes
        let sessionNotes = notes || ""
        let isLateCheckin = false
        let lateMinutesCalc: number | null = null
        let isEarlyCheckout = false
        let earlyMinutesCalc: number | null = null

        if (assignment.work_shifts) {
            const { hours: startHours, minutes: startMinutes } = parseShiftTime(assignment.work_shifts.start_time)
            const { hours: endHours, minutes: endMinutes } = parseShiftTime(assignment.work_shifts.end_time)

            const d = new Date(assignment.assigned_date)
            const year = d.getUTCFullYear()
            const month = d.getUTCMonth()
            const day = d.getUTCDate()

            const shiftStartDateTime = new Date(Date.UTC(year, month, day, startHours, startMinutes, 0, 0))
            let shiftEndDateTime = new Date(Date.UTC(year, month, day, endHours, endMinutes, 0, 0))

            // Handle overnight shifts
            if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
                shiftEndDateTime = new Date(shiftEndDateTime.getTime() + 24 * 60 * 60 * 1000)
            }

            // Calculate late check-in
            if (parsedCheckIn && isAfter(parsedCheckIn, shiftStartDateTime)) {
                isLateCheckin = true
                lateMinutesCalc = getMinutesDifference(shiftStartDateTime, parsedCheckIn)
                const lateNote = `Đi muộn ${lateMinutesCalc} phút.`
                sessionNotes = sessionNotes ? `${sessionNotes} ${lateNote}` : lateNote
            }

            // Calculate early checkout
            if (parsedCheckOut && isBefore(parsedCheckOut, shiftEndDateTime)) {
                isEarlyCheckout = true
                earlyMinutesCalc = getMinutesDifference(parsedCheckOut, shiftEndDateTime)
                const earlyNote = `Về sớm ${earlyMinutesCalc} phút.`
                sessionNotes = sessionNotes ? `${sessionNotes} ${earlyNote}` : earlyNote
            }
        }

        // Add note that this was created by manager for absent employee
        const managerNote = `Quản lý chấm công bù cho nhân viên vắng mặt.`
        sessionNotes = sessionNotes ? `${managerNote} ${sessionNotes}` : managerNote

        // Determine status
        // If both times provided, mark as COMPLETED
        // If only check_in, mark as IN_PROGRESS (but past date so effectively INCOMPLETE)
        // For manager creating absent session, we'll set to COMPLETED
        const status = "COMPLETED"

        // Create the session in attendance_sessions (NEW table)
        // CRITICAL: Must use attendance_sessions for compatibility with edit-attendance and audit-logs APIs
        const newSession = await prisma.attendance_sessions.create({
            data: {
                user_id: assignment.user_id,
                warehouse_id: assignment.warehouse_id,
                work_shift_id: assignment.work_shift_id,
                shift_assignment_id: assignmentId, // IMPORTANT: Link to specific assignment
                session_date: assignment.assigned_date,
                check_in_time: parsedCheckIn,
                check_out_time: parsedCheckOut,
                actual_duration: actualDuration,
                status: status as any, // Cast to attendance_status enum
                notes: sessionNotes.trim(),
                is_late_checkin: isLateCheckin,
                late_minutes: lateMinutesCalc,
                is_early_checkout: isEarlyCheckout,
                early_minutes: earlyMinutesCalc,
                modified_by: user.id,
                modified_at: now,
                modification_reason: "Quản lý chấm công bù cho nhân viên vắng mặt",
            },
            include: {
                users_attendance_sessions_user_idTousers: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                    },
                },
                warehouses: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                    },
                },
                work_shifts: true,
            },
        })


        // Create audit log entry
        await prisma.$executeRawUnsafe(`
            INSERT INTO shift_attendance_audit_logs (
                session_id,
                old_check_in_time,
                old_check_out_time,
                old_status,
                old_notes,
                new_check_in_time,
                new_check_out_time,
                new_status,
                new_notes,
                modified_by,
                modified_at,
                action_type
            ) VALUES (
                $1::uuid, NULL, NULL, 'ABSENT', NULL, $2, $3, $4, $5, $6::uuid, $7, $8
            )
        `,
            newSession.id,
            parsedCheckIn,
            parsedCheckOut,
            status,
            sessionNotes.trim(),
            user.id,
            now,
            "CREATE_FROM_ABSENT"
        )

        return NextResponse.json({
            success: true,
            message: "Đã tạo chấm công cho nhân viên vắng mặt",
            data: {
                session: newSession,
            },
        })
    } catch (error) {
        console.error("Create absent session error:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}
