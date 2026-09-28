import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/lib/generated/prisma"
import { verifyAuth } from "@/lib/auth-server"
import {
  getVietnamNow,
  getVietnamToday,
  parseShiftTime,
  createShiftDateTime,
  isBefore,
  getMinutesDifference,
  addDays
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
  checkOut: Date,
  shiftStart: Date,
  shiftEnd: Date
): number {
  if (!checkIn) return 0

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
 * @swagger
 * /api/shifts/check-out:
 *   post:
 *     summary: Shift Check-out
 *     tags: [Shifts]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               session_id:
 *                 type: string
 *               closing_cash:
 *                 type: number
 *               notes:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Checked out successfully
 *       400:
 *         description: Check-out failed
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { session_id, closing_cash, notes, latitude, longitude, accuracy, check_out_ip: bodyCheckOutIp } = body

    // Validate GPS data is required
    if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
      return NextResponse.json(
        { success: false, error: "Vui lòng bật định vị GPS để chấm công." },
        { status: 400 }
      )
    }

    // Capture audit trail information
    const headerIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip')

    const checkOutIp = bodyCheckOutIp || headerIp

    // Validate IP is required
    if (!checkOutIp) {
      return NextResponse.json(
        { success: false, error: "Không thể xác định thông tin mạng. Vui lòng kiểm tra kết nối internet." },
        { status: 400 }
      )
    }

    const userAgent = request.headers.get('user-agent') || 'unknown'
    let checkOutDeviceInfo = userAgent +
      (body.device_id ? ` | DeviceID: ${body.device_id}` : '')

    // Truncate if too long to prevent DB errors
    if (checkOutDeviceInfo.length > 1000) {
      checkOutDeviceInfo = checkOutDeviceInfo.substring(0, 1000) + '...'
    }
    const checkOutLocation = (latitude && longitude) ? {
      latitude,
      longitude,
      accuracy: accuracy || null
    } : Prisma.JsonNull

    // Get current Vietnam time
    const checkOutTime = getVietnamNow()
    const today = getVietnamToday()

    let shiftSession

    // Two modes:
    // 1. With session_id - simple attendance check-out
    // 2. With closing_cash - full shift session with cash management (old mode)

    // Mode 1: Simple attendance check-out with session_id
    if (session_id) {
      shiftSession = await prisma.shift_sessions.findUnique({
        where: { id: session_id },
      })

      if (!shiftSession) {
        return NextResponse.json(
          { success: false, error: "Không tìm thấy phiên làm việc" },
          { status: 404 }
        )
      }

      if (shiftSession.user_id !== user.id) {
        // Check if user is a manager or admin
        const userRole = await prisma.users.findUnique({
          where: { id: user.id },
          select: { role: true }
        })

        const isManager = userRole?.role === "MANAGER" || userRole?.role === "ADMIN"

        if (!isManager) {
          return NextResponse.json(
            { success: false, error: "Phiên làm việc này không thuộc về bạn" },
            { status: 403 }
          )
        }
      }

      if (shiftSession.check_out_time) {
        return NextResponse.json(
          { success: false, error: "Bạn đã chấm công ra rồi" },
          { status: 400 }
        )
      }

      // Get work shift to check early checkout and calculate capped duration
      const workShift = shiftSession.work_shift_id
        ? await prisma.work_shifts.findUnique({
          where: { id: shiftSession.work_shift_id }
        })
        : null

      // Calculate duration capped at shift duration
      let actual_duration = 0
      let isEarlyCheckout = false
      let earlyMinutes = 0
      let additionalNotes = ""

      if (workShift?.start_time && workShift?.end_time) {
        // Parse shift times
        const { hours: startHours, minutes: startMinutes } = parseShiftTime(workShift.start_time)
        const { hours: endHours, minutes: endMinutes } = parseShiftTime(workShift.end_time)

        // Create shift start/end datetime
        // CRITICAL: session_date from DB has UTC components = Vietnam date
        // Use it directly with createShiftDateTime which also uses UTC
        const sessionDay = new Date(shiftSession.session_date)

        const shiftStartDateTime = createShiftDateTime(sessionDay, startHours, startMinutes)
        let shiftEndDateTime = createShiftDateTime(sessionDay, endHours, endMinutes)

        // If end time <= start time, it's an overnight shift - add one day to end time
        if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
          shiftEndDateTime = addDays(shiftEndDateTime, 1)
        }

        console.log('[CHECK-OUT TIMES]', {
          checkOutTime: checkOutTime.toISOString(),
          shiftStartDateTime: shiftStartDateTime.toISOString(),
          shiftEndDateTime: shiftEndDateTime.toISOString(),
          isBeforeEnd: isBefore(checkOutTime, shiftEndDateTime)
        })

        // Calculate duration capped at shift duration
        actual_duration = calculateCappedDuration(
          shiftSession.check_in_time,
          checkOutTime,
          shiftStartDateTime,
          shiftEndDateTime
        )

        // Any checkout before shift end = early checkout
        if (isBefore(checkOutTime, shiftEndDateTime)) {
          isEarlyCheckout = true
          earlyMinutes = getMinutesDifference(checkOutTime, shiftEndDateTime)
          additionalNotes = `Về sớm ${earlyMinutes} phút`
        }
      } else {
        // No shift info, use raw duration
        actual_duration = shiftSession.check_in_time
          ? getMinutesDifference(shiftSession.check_in_time, checkOutTime)
          : 0
      }

      // Combine existing notes with new notes
      const existingNotes = shiftSession.notes || ""
      let combinedNotes = existingNotes

      if (notes) {
        combinedNotes = existingNotes ? `${existingNotes}. ${notes}` : notes
      }

      const finalNotes = additionalNotes
        ? (combinedNotes ? `${combinedNotes}. ${additionalNotes}` : additionalNotes)
        : combinedNotes

      // MODE 1: Pure attendance check-out
      // Closing cash is NOT required for attendance check-out
      // Closing cash is only handled in Mode 2 (sales shift management)

      // Check if manager override
      const isManagerOverride = shiftSession.user_id !== user.id

      // Update session with check-out time
      const updatedSession = await prisma.shift_sessions.update({
        where: { id: session_id },
        data: {
          check_out_time: checkOutTime,
          // Note: shift_closed_at is NOT set in Mode 1 (attendance check-out)
          // shift_closed_at is only set in Mode 2 when user enters closing_cash
          actual_duration,
          status: "COMPLETED",
          notes: finalNotes || null,
          // Note: closing_cash is NOT set in Mode 1 (attendance check-out)
          // Closing cash is only handled in Mode 2 (sales shift management)
          check_out_ip: checkOutIp,
          check_out_location: checkOutLocation,
          check_out_device_info: checkOutDeviceInfo,
          // Add modification info if manager override
          modified_by: isManagerOverride ? user.id : undefined,
          modified_at: isManagerOverride ? checkOutTime : undefined,
          modification_reason: isManagerOverride ? "Manager Check-out" : undefined,
        },
      })

      return NextResponse.json({
        success: true,
        message: isEarlyCheckout
          ? `Chấm công ra thành công (Về sớm ${earlyMinutes} phút)`
          : "Chấm công ra thành công",
        data: {
          ...updatedSession,
          isEarlyCheckout,
          earlyMinutes,
        },
      })
    }

    // Mode 2: Sales shift closing - now uses sales_sessions table
    // Validate input
    if (!closing_cash || closing_cash < 0) {
      return NextResponse.json(
        { success: false, error: "Số tiền đóng ca phải lớn hơn hoặc bằng 0" },
        { status: 400 }
      )
    }

    // Get current sales session (not shift_sessions)
    const salesSession = await prisma.sales_sessions.findFirst({
      where: {
        user_id: user.id,
        session_date: {
          gte: today,
          lt: addDays(today, 1)
        },
        status: "IN_PROGRESS"
      },
      include: {
        work_shifts: true
      }
    })

    if (!salesSession) {
      return NextResponse.json(
        { success: false, error: "Không có ca bán hàng đang mở" },
        { status: 404 }
      )
    }

    // Calculate actual duration
    const shiftStartTime = salesSession.shift_opened_at
    let actual_duration = 0

    if (salesSession.work_shifts?.start_time && salesSession.work_shifts?.end_time && shiftStartTime) {
      const { hours: startHours, minutes: startMinutes } = parseShiftTime(salesSession.work_shifts.start_time)
      const { hours: endHours, minutes: endMinutes } = parseShiftTime(salesSession.work_shifts.end_time)

      const sessionDay = new Date(salesSession.session_date)
      const shiftStartDateTime = createShiftDateTime(sessionDay, startHours, startMinutes)
      let shiftEndDateTime = createShiftDateTime(sessionDay, endHours, endMinutes)

      if (endHours < startHours || (endHours === startHours && endMinutes <= startMinutes)) {
        shiftEndDateTime = addDays(shiftEndDateTime, 1)
      }

      actual_duration = calculateCappedDuration(
        shiftStartTime,
        checkOutTime,
        shiftStartDateTime,
        shiftEndDateTime
      )
    } else {
      actual_duration = shiftStartTime
        ? getMinutesDifference(shiftStartTime, checkOutTime)
        : 0
    }

    // Get invoices for this sales session
    const invoices = await prisma.sales_invoices.findMany({
      where: {
        sales_session_id: salesSession.id
      }
    })

    // Calculate totals
    let cashSalesTotal = 0
    let transferOrdersCount = 0
    let ewalletOrdersCount = 0
    let transferTotal = 0
    let ewalletTotal = 0

    for (const invoice of invoices) {
      const amount = invoice.total_amount ? parseFloat(invoice.total_amount.toString()) : 0

      if (invoice.notes) {
        if (invoice.notes.includes("Tiền mặt") || invoice.notes.includes("CASH")) {
          cashSalesTotal += amount
        } else if (invoice.notes.includes("Chuyển khoản") || invoice.notes.includes("TRANSFER")) {
          transferOrdersCount++
          transferTotal += amount
        } else if (invoice.notes.includes("Ví Điện Tử") || invoice.notes.includes("EWALLET")) {
          ewalletOrdersCount++
          ewalletTotal += amount
        }
      }
    }

    // Calculate expected cash
    const openingCash = Number(salesSession.opening_cash) || 0
    const expectedCash = openingCash + cashSalesTotal
    const closingCashAmount = parseFloat(closing_cash)
    const cashDifference = closingCashAmount - expectedCash

    // Update sales session (NOT shift_sessions)
    const updatedSession = await prisma.sales_sessions.update({
      where: { id: salesSession.id },
      data: {
        shift_closed_at: getVietnamNow(),
        closing_cash: closingCashAmount,
        closing_cash_user_id: user.id,
        expected_cash: expectedCash,
        cash_difference: cashDifference,
        total_orders: invoices.length,
        total_revenue: invoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
        total_discount: invoices.reduce((sum, inv) => sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0),
        cash_orders: invoices.filter(inv => inv.notes?.includes("Tiền mặt") || inv.notes?.includes("CASH")).length,
        transfer_orders: transferOrdersCount,
        ewallet_orders: ewalletOrdersCount,
        transfer_total: transferTotal,
        ewallet_total: ewalletTotal,
        status: "PENDING_APPROVAL",
        notes: notes || salesSession.notes,
      },
      include: {
        users_sales_sessions_user_idTousers: true,
        warehouses: true,
        work_shifts: true
      }
    })

    return NextResponse.json({
      success: true,
      message: "Đóng ca bán hàng thành công",
      data: {
        ...updatedSession,
        summary: {
          total_orders: invoices.length,
          cash_orders: invoices.filter(inv => inv.notes?.includes("Tiền mặt") || inv.notes?.includes("CASH")).length,
          transfer_orders: transferOrdersCount,
          ewallet_orders: ewalletOrdersCount,
          total_revenue: invoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
          total_discount: invoices.reduce((sum, inv) => sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0),
          cash_total: cashSalesTotal,
          transfer_total: transferTotal,
          ewallet_total: ewalletTotal,
          actual_duration,
          cash_difference: cashDifference
        }
      }
    })
  } catch (error) {
    console.error("Check-out error:", error)
    return NextResponse.json(
      { success: false, error: "Lỗi hệ thống khi chấm công ra" },
      { status: 500 }
    )
  }
}
