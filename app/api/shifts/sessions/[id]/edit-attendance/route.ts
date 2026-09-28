import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/lib/generated/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { revalidatePath } from "next/cache"
import { isValidUUID } from "@/lib/utils"
import {
    getVietnamNow,
    parseShiftTime,
    getMinutesDifference,
    isAfter,
    isBefore,
} from "@/lib/server-time"

/**
 * Calculate work duration capped at shift duration
 * Returns duration in MINUTES
 *
 * Logic:
 * - If check-in is AFTER shift end → 0 (no work time)
 * - If check-out is BEFORE shift start → 0 (no work time)
 * - Otherwise: duration = overlap between [checkIn, checkOut] and [shiftStart, shiftEnd]
 */
function calculateCappedDuration(
    checkIn: Date | null,
    checkOut: Date | null,
    shiftStart: Date,
    shiftEnd: Date
): number | null {
    if (!checkIn || !checkOut) return null

    // If check-in is after shift end, or check-out is before shift start, no overlap
    if (checkIn >= shiftEnd || checkOut <= shiftStart) {
        return 0
    }

    // Calculate effective start (max of checkIn, shiftStart)
    const effectiveStart = checkIn > shiftStart ? checkIn : shiftStart

    // Calculate effective end (min of checkOut, shiftEnd)
    const effectiveEnd = checkOut < shiftEnd ? checkOut : shiftEnd

    const diffMinutes = getMinutesDifference(effectiveStart, effectiveEnd)
    if (diffMinutes <= 0) return 0

    return diffMinutes
}

/** 
 * POST /api/shifts/sessions/[id]/edit-attendance
 * 
 * Manager edits employee attendance times
 * Also supports creating a new session for absent employees (when id is assignment_id)
 * 
 * CRITICAL TIMEZONE RULES:
 * - All datetime parsing uses Vietnam server time
 * - NO UTC conversions or offset calculations
 * - All calculations match check-in/check-out route logic
 */
// ... (imports remain same)

/** 
 * POST /api/shifts/sessions/[id]/edit-attendance
 * 
 * Manager edits employee attendance times
 * Also supports creating a new session for absent employees (when id is assignment_id)
 * 
 * CRITICAL TIMEZONE RULES:
 * - All datetime parsing uses Vietnam server time
 * - NO UTC conversions or offset calculations
 * - All calculations match check-in/check-out route logic
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            )
        }

        // Check if user is manager, general manager or HR
        if (user.role !== "WAREHOUSE_MANAGER" && user.role !== "ADMIN" && user.role !== "HR" && user.role !== "GENERAL_MANAGER") {
            return NextResponse.json(
                { success: false, error: "Only managers and HR can edit attendance" },
                { status: 403 }
            )
        }

        const { id: sessionId } = await params

        if (!isValidUUID(sessionId)) {
            return NextResponse.json(
                { success: false, error: "Invalid ID format" },
                { status: 400 }
            )
        }

        const body = await request.json()
        const { check_in_time, check_out_time, modification_ip, modification_gps } = body

        // Get the session (from NEW table)
        let session = await prisma.attendance_sessions.findUnique({
            where: { id: sessionId },
            include: {
                work_shifts: true,
                users_attendance_sessions_user_idTousers: true,
            }
        })

        // If session not found, check if this is an absent employee (session needs to be created)
        // We treat the sessionId as potentially an assignment ID
        if (!session) {
            // This is an absent employee - we need to create a new session
            const assignment = await prisma.shift_assignments.findUnique({
                where: { id: sessionId },
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
            const isAdminUser = user.role === "ADMIN" || user.role === "AdminKhoTong"
            if (!isAdminUser) {
                if (user.role === "WAREHOUSE_MANAGER" && user.warehouseId !== assignment.warehouse_id) {
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
            }

            // Check if session already exists (race condition check)
            // CRITICAL FIX: Must match by assignment ID to prevent picking up a session from a DIFFERENT shift on the same day
            const existingSession = await prisma.attendance_sessions.findFirst({
                where: {
                    shift_assignment_id: assignment.id
                },
            })

            if (existingSession) {
                // Session was created in the meantime, use it
                session = await prisma.attendance_sessions.findUnique({
                    where: { id: existingSession.id },
                    include: {
                        work_shifts: true,
                        users_attendance_sessions_user_idTousers: true,
                    }
                })
            } else {
                // Create a new session for the absent employee
                const now = getVietnamNow()

                // Parse times
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

                // Calculate duration capped at shift duration
                let actualDuration: number | null = null
                if (parsedCheckIn && parsedCheckOut && assignment.work_shifts) {
                    const { hours: startHours, minutes: startMinutes } = parseShiftTime(assignment.work_shifts.start_time)
                    const { hours: endHours, minutes: endMinutes } = parseShiftTime(assignment.work_shifts.end_time)

                    const d = new Date(assignment.assigned_date)
                    const year = d.getUTCFullYear()
                    const month = d.getUTCMonth()
                    const day = d.getUTCDate()

                    const shiftStartDateTime = new Date(Date.UTC(year, month, day, startHours, startMinutes, 0, 0))
                    let shiftEndDateTime = new Date(Date.UTC(year, month, day, endHours, endMinutes, 0, 0))

                    // Handle overnight shift
                    if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
                        shiftEndDateTime = new Date(shiftEndDateTime.getTime() + 24 * 60 * 60 * 1000)
                    }

                    actualDuration = calculateCappedDuration(parsedCheckIn, parsedCheckOut, shiftStartDateTime, shiftEndDateTime)
                }

                // Calculate late/early notes and structured fields
                let sessionNotes = ""
                let isLateCheckin = false
                let lateMinutesVal = 0
                let isEarlyCheckout = false
                let earlyMinutesVal = 0

                if (assignment.work_shifts) {
                    const { hours: startHours, minutes: startMinutes } = parseShiftTime(assignment.work_shifts.start_time)
                    const { hours: endHours, minutes: endMinutes } = parseShiftTime(assignment.work_shifts.end_time)

                    const d = new Date(assignment.assigned_date)
                    const year = d.getUTCFullYear()
                    const month = d.getUTCMonth()
                    const day = d.getUTCDate()

                    const shiftStartDateTime = new Date(Date.UTC(year, month, day, startHours, startMinutes, 0, 0))
                    let shiftEndDateTime = new Date(Date.UTC(year, month, day, endHours, endMinutes, 0, 0))

                    if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
                        shiftEndDateTime = new Date(shiftEndDateTime.getTime() + 24 * 60 * 60 * 1000)
                    }

                    if (parsedCheckIn && isAfter(parsedCheckIn, shiftStartDateTime)) {
                        const late = getMinutesDifference(shiftStartDateTime, parsedCheckIn)
                        sessionNotes = `Đi muộn ${late} phút.`
                        isLateCheckin = true
                        lateMinutesVal = late
                    }

                    if (parsedCheckOut && isBefore(parsedCheckOut, shiftEndDateTime)) {
                        const early = getMinutesDifference(parsedCheckOut, shiftEndDateTime)
                        const earlyNote = `Về sớm ${early} phút.`
                        sessionNotes = sessionNotes ? `${sessionNotes} ${earlyNote}` : earlyNote
                        isEarlyCheckout = true
                        earlyMinutesVal = early
                    }
                }

                const managerNote = `Quản lý chấm công bù cho nhân viên vắng mặt.`
                sessionNotes = sessionNotes ? `${managerNote} ${sessionNotes}` : managerNote

                // Create new session in NEW TABLE
                const newSession = await prisma.attendance_sessions.create({
                    data: {
                        user_id: assignment.user_id,
                        warehouse_id: assignment.warehouse_id,
                        work_shift_id: assignment.work_shift_id,
                        session_date: assignment.assigned_date,
                        shift_assignment_id: assignment.id, // Important linkage
                        check_in_time: parsedCheckIn,
                        check_out_time: parsedCheckOut,
                        actual_duration: actualDuration,
                        status: "COMPLETED",
                        notes: sessionNotes.trim(),

                        // Structured data
                        is_late_checkin: isLateCheckin,
                        late_minutes: lateMinutesVal,
                        is_early_checkout: isEarlyCheckout,
                        early_minutes: earlyMinutesVal,

                        modified_by: user.id,
                        modified_at: now,
                    },
                    include: {
                        users_attendance_sessions_user_idTousers: true,
                        users_attendance_sessions_modified_byTousers: true,
                        work_shifts: true,
                    },
                })

                // Create audit log
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
                        modification_ip,
                        modification_gps,
                        action_type
                    ) VALUES (
                        $1::uuid, NULL, NULL, 'ABSENT', NULL, $2, $3, $4, $5, $6::uuid, $7, $8, $9::jsonb, $10
                    )
                `,
                    newSession.id,
                    parsedCheckIn,
                    parsedCheckOut,
                    "COMPLETED",
                    sessionNotes.trim(),
                    user.id,
                    now,
                    modification_ip || null,
                    modification_gps || null,
                    "CREATE_FROM_ABSENT"
                )

                revalidatePath("/store/shifts/manage")
                // Revalidate calendar API to show the new session
                revalidatePath("/api/shifts/assignments/calendar")

                return NextResponse.json({
                    success: true,
                    message: "Đã tạo chấm công cho nhân viên vắng mặt",
                    data: {
                        session: newSession,
                    },
                })
            }
        }

        if (!session) {
            return NextResponse.json(
                { success: false, error: "Session not found" },
                { status: 404 }
            )
        }

        // Get current Vietnam time for modification timestamp
        const now = getVietnamNow()

        // Prepare updateData
        const updateData: any = {
            modified_by: user.id,
            modified_at: now,
        }

        // Parse and validate check-in time if provided
        if (check_in_time !== undefined) {
            if (check_in_time) {
                // CRITICAL: Input is in format "YYYY-MM-DDTHH:mm" (datetime-local)
                // This represents Vietnam time, but we need to store it as-is in UTC format
                // Because our DB stores Vietnam time under UTC column (no conversion)
                // So we parse it as UTC to preserve the exact time values
                const [datePart, timePart] = check_in_time.split('T')
                const [year, month, day] = datePart.split('-').map(Number)
                const [hours, minutes] = timePart.split(':').map(Number)
                updateData.check_in_time = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
            } else {
                updateData.check_in_time = null
            }
        }

        // Parse and validate check-out time if provided
        if (check_out_time !== undefined) {
            if (check_out_time) {
                const [datePart, timePart] = check_out_time.split('T')
                const [year, month, day] = datePart.split('-').map(Number)
                const [hours, minutes] = timePart.split(':').map(Number)
                updateData.check_out_time = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
            } else {
                updateData.check_out_time = null
            }
        }

        // Calculate effective times
        const effectiveCheckIn = updateData.check_in_time !== undefined
            ? updateData.check_in_time
            : session.check_in_time
        const effectiveCheckOut = updateData.check_out_time !== undefined
            ? updateData.check_out_time
            : session.check_out_time

        // Calculate duration capped at shift duration if both times are present
        if (effectiveCheckIn && effectiveCheckOut) {
            if (session.work_shifts) {
                const { hours: startHours, minutes: startMinutes } = parseShiftTime(session.work_shifts.start_time)
                const { hours: endHours, minutes: endMinutes } = parseShiftTime(session.work_shifts.end_time)

                const d = new Date(session.session_date)
                const year = d.getUTCFullYear()
                const month = d.getUTCMonth()
                const day = d.getUTCDate()

                const shiftStartDateTime = new Date(Date.UTC(year, month, day, startHours, startMinutes, 0, 0))
                let shiftEndDateTime = new Date(Date.UTC(year, month, day, endHours, endMinutes, 0, 0))

                // Handle overnight shift
                if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
                    shiftEndDateTime = new Date(shiftEndDateTime.getTime() + 24 * 60 * 60 * 1000)
                }

                updateData.actual_duration = calculateCappedDuration(effectiveCheckIn, effectiveCheckOut, shiftStartDateTime, shiftEndDateTime)
            } else {
                // No shift info, use raw duration
                updateData.actual_duration = getMinutesDifference(effectiveCheckIn, effectiveCheckOut)
            }
        }

        // Recalculate Late/Early notes and Structured Fields
        if (session.work_shifts) {
            const { hours: startHours, minutes: startMinutes } = parseShiftTime(session.work_shifts.start_time)
            const { hours: endHours, minutes: endMinutes } = parseShiftTime(session.work_shifts.end_time)

            const d = new Date(session.session_date)
            const year = d.getUTCFullYear()
            const month = d.getUTCMonth()
            const day = d.getUTCDate()

            const shiftStartDateTime = new Date(Date.UTC(year, month, day, startHours, startMinutes, 0, 0))
            let shiftEndDateTime = new Date(Date.UTC(year, month, day, endHours, endMinutes, 0, 0))

            if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
                shiftEndDateTime = new Date(shiftEndDateTime.getTime() + 24 * 60 * 60 * 1000)
            }

            let notes = session.notes || ""
            notes = notes
                .replace(/Đi muộn \d+ phút\.? ?/g, "")
                .replace(/Về sớm \d+ phút\.? ?/g, "")
                .replace(/Chưa chấm công vào ca\.? ?/g, "")
                .trim()

            // Reset flags
            updateData.is_late_checkin = false
            updateData.late_minutes = 0
            updateData.is_early_checkout = false
            updateData.early_minutes = 0

            // Recalculate late check-in
            if (effectiveCheckIn) {
                if (isAfter(effectiveCheckIn, shiftStartDateTime)) {
                    const late = getMinutesDifference(shiftStartDateTime, effectiveCheckIn)
                    const lateNote = `Đi muộn ${late} phút.`
                    notes = notes ? `${notes} ${lateNote}` : lateNote

                    updateData.is_late_checkin = true
                    updateData.late_minutes = late
                }
            }

            // Recalculate early checkout
            if (effectiveCheckOut) {
                if (isBefore(effectiveCheckOut, shiftEndDateTime)) {
                    const early = getMinutesDifference(effectiveCheckOut, shiftEndDateTime)
                    const earlyNote = `Về sớm ${early} phút.`
                    notes = notes ? `${notes} ${earlyNote}` : earlyNote

                    updateData.is_early_checkout = true
                    updateData.early_minutes = early
                }
            }

            updateData.notes = notes.trim()
        }

        // Set status to COMPLETED
        updateData.status = "COMPLETED"

        // Determine action type for audit log
        let actionType = "EDIT_BOTH"
        if (check_in_time !== undefined && check_out_time === undefined) {
            actionType = "EDIT_CHECKIN"
        } else if (check_out_time !== undefined && check_in_time === undefined) {
            actionType = "EDIT_CHECKOUT"
        }

        // Create audit log for ALL edits
        const transactionOperations = [
            // Update the session in NEW TABLE
            // CRITICAL FIX: Use session.id (Attendance Session ID) not sessionId (which might be Assignment ID)
            prisma.attendance_sessions.update({
                where: { id: session.id },
                data: updateData,
                include: {
                    users_attendance_sessions_user_idTousers: true,
                    users_attendance_sessions_modified_byTousers: true,
                    work_shifts: true,
                }
            }),
            // Create audit log entry
            prisma.$executeRawUnsafe(`
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
                    modification_ip,
                    modification_gps,
                    action_type
                ) VALUES (
                    $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11, $12, $13::jsonb, $14
                )
            `,
                sessionId,
                session.check_in_time,
                session.check_out_time,
                session.status,
                session.notes,
                effectiveCheckIn,
                effectiveCheckOut,
                updateData.status,
                updateData.notes,
                user.id,
                now,
                modification_ip || null,
                modification_gps || null,
                actionType
            )
        ];

        const [updatedSession] = await prisma.$transaction(transactionOperations)

        // Revalidate relevant paths
        revalidatePath("/store/shifts/manage")
        revalidatePath(`/api/shifts/${sessionId}`)
        revalidatePath("/api/shifts/assignments/calendar")

        return NextResponse.json({
            success: true,
            message: "Attendance updated successfully",
            data: {
                session: updatedSession,
            }
        })

    } catch (error) {
        console.error("Edit attendance error:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}
