import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"
import { getVietnamNow, getVietnamToday, parseShiftTime, createShiftDateTime, isAfter, isBefore } from "@/lib/server-time"
import { addDays } from "date-fns"

/**
 * POST /api/attendance/check-out
 * Records check-out for an attendance session (chấm công)
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await verifyAuth(request)
        if (!authUser) {
            return NextResponse.json({ success: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }, { status: 401 })
        }

        const user = await prisma.users.findUnique({
            where: { id: authUser.id },
            select: { id: true, warehouse_id: true, full_name: true, role: true }
        })

        if (!user) {
            return NextResponse.json({ success: false, error: "Không tìm thấy thông tin người dùng" }, { status: 404 })
        }

        const body = await request.json()
        const {
            session_id,
            latitude,
            longitude,
            notes,
            device_id
        } = body

        // Check permission (owner or manager)
        const userWithRole = await prisma.users.findUnique({
            where: { id: user.id },
            select: { role: true }
        })
        const canBypassGPS = userWithRole?.role === "MANAGER" || userWithRole?.role === "ADMIN" || userWithRole?.role === "HR" || userWithRole?.role === "GENERAL_MANAGER" || userWithRole?.role === "WAREHOUSE_MANAGER"

        // Require GPS location for check-out (unless Manager/Admin correction)
        if ((!latitude || !longitude) && !canBypassGPS) {
            return NextResponse.json(
                { success: false, error: "Không thể lấy vị trí GPS. Vui lòng bật định vị." },
                { status: 400 }
            )
        }

        const now = getVietnamNow()
        const today = getVietnamToday()

        // Find the attendance session to check out
        let attendanceSession
        if (session_id) {
            attendanceSession = await prisma.attendance_sessions.findUnique({
                where: { id: session_id },
                include: { work_shifts: true }
            })
        } else {
            // Find current user's active attendance session
            attendanceSession = await prisma.attendance_sessions.findFirst({
                where: {
                    user_id: user.id,
                    status: { in: ["CHECKED_IN", "LATE"] }
                },
                orderBy: { check_in_time: 'desc' },
                include: { work_shifts: true }
            })
        }

        if (!attendanceSession) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy phiên chấm công để ra ca" },
                { status: 404 }
            )
        }

        if (attendanceSession.status === "COMPLETED") {
            return NextResponse.json(
                { success: false, error: "Bạn đã chấm công ra rồi" },
                { status: 400 }
            )
        }

        // Check permission (owner or manager)
        const isOwner = attendanceSession.user_id === user.id
        const isManager = user.role === "MANAGER" || user.role === "ADMIN"
        if (!isOwner && !isManager) {
            return NextResponse.json(
                { success: false, error: "Bạn không có quyền chấm công ra cho phiên này" },
                { status: 403 }
            )
        }

        // Get IP address
        const forwardedFor = request.headers.get('x-forwarded-for')
        const checkOutIp = forwardedFor ? forwardedFor.split(',')[0].trim() :
            request.headers.get('x-real-ip') || 'unknown'

        // Prepare device info
        const userAgent = request.headers.get('user-agent') || ''
        const checkOutDeviceInfo = device_id
            ? `DeviceID: ${device_id}\nUA: ${userAgent.substring(0, 200)}`
            : `UA: ${userAgent.substring(0, 200)}`

        // Prepare location
        const checkOutLocation = { latitude, longitude }

        // Calculate early checkout
        let isEarly = false
        let earlyMinutes = 0
        if (attendanceSession.work_shifts) {
            // Use session_date as anchor, not "today", to handle check-outs for past shifts (e.g. forgotten checkout)
            const sessionDate = new Date(attendanceSession.session_date)

            const { hours: startH, minutes: startM } = parseShiftTime(attendanceSession.work_shifts.start_time)
            const { hours: endH, minutes: endM } = parseShiftTime(attendanceSession.work_shifts.end_time)

            // Construct shift end time based on SESSION DATE
            let shiftEndTime = createShiftDateTime(sessionDate, endH, endM)

            // Handle overnight shift: if end time < start time, it means end time is next day
            if (endH < startH || (endH === startH && endM <= startM)) {
                shiftEndTime = addDays(shiftEndTime, 1)
            }

            // Check if checking out before shift end
            if (isBefore(now, shiftEndTime)) {
                isEarly = true
                earlyMinutes = Math.floor((shiftEndTime.getTime() - now.getTime()) / (1000 * 60))
            }
        }

        // Calculate actual duration in minutes
        const checkInTime = attendanceSession.check_in_time
        const actualDuration = checkInTime
            ? Math.floor((now.getTime() - new Date(checkInTime).getTime()) / (1000 * 60))
            : null

        // Update the session
        const updatedSession = await prisma.attendance_sessions.update({
            where: { id: attendanceSession.id },
            data: {
                check_out_time: now,
                check_out_ip: checkOutIp,
                check_out_location: checkOutLocation,
                check_out_device_info: checkOutDeviceInfo,
                is_early_checkout: isEarly,
                early_minutes: earlyMinutes,
                actual_duration: actualDuration,
                status: "COMPLETED",
                notes: notes || attendanceSession.notes,
                updated_at: now
            },
            include: {
                work_shifts: true,
                warehouses: { select: { name: true, code: true } }
            }
        })

        return NextResponse.json({
            success: true,
            message: isEarly
                ? `Chấm công ra thành công (Về sớm ${earlyMinutes} phút)`
                : "Chấm công ra thành công",
            data: {
                ...updatedSession,
                isEarly,
                earlyMinutes,
                actualDuration
            }
        })

    } catch (error) {
        console.error("Error creating attendance check-out:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống khi chấm công ra" },
            { status: 500 }
        )
    }
}
