import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/lib/generated/prisma"
import { verifyAuth } from "@/lib/auth-server"
import {
  getVietnamNow,
  getVietnamToday,
  parseShiftTime,
  createShiftDateTime,
  isAfter,
  isBefore,
  getMinutesDifference,
  addMinutes,
  addDays,
  formatVietnamTimeShort
} from "@/lib/server-time"
import {
  validateGPSAgainstCheckpoints,
  type GPSValidationResult
} from "@/lib/server-geo"

/**
 * @swagger
 * /api/shifts/check-in:
 *   post:
 *     summary: Shift Check-in
 *     tags: [Shifts]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shift_assignment_id:
 *                 type: string
 *               opening_cash:
 *                 type: number
 *               notes:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               accuracy:
 *                 type: number
 *     responses:
 *       200:
 *         description: Checked in successfully
 *       400:
 *         description: Check-in failed (too late or invalid location)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { shift_assignment_id, opening_cash, notes, warehouse_id, work_shift_id, forgot_checkin, latitude, longitude, accuracy, check_in_ip: bodyCheckInIp } = body

    // Validate GPS data is required
    if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
      return NextResponse.json(
        { success: false, error: "GPS location is required for check-in. Please enable location services." },
        { status: 400 }
      )
    }

    // Capture audit trail information
    const headerIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip')

    // Prefer IP from body (client-side fetch), fallback to headers
    const checkInIp = bodyCheckInIp || headerIp

    // Validate IP is required
    if (!checkInIp) {
      return NextResponse.json(
        { success: false, error: "Network information is required for check-in. Please check your internet connection." },
        { status: 400 }
      )
    }

    // Base check-in location - will be enhanced with checkpoint info after validation
    let checkInLocation: Prisma.InputJsonValue | typeof Prisma.JsonNull = (latitude && longitude) ? {
      latitude,
      longitude,
      accuracy: accuracy || null
    } : Prisma.JsonNull

    // Get user's warehouse and role
    const userWithWarehouse = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        warehouse_id: true,
        role: true,
        permissions: true,
        warehouses_users_warehouse_idTowarehouses: {
          select: {
            id: true,
            name: true,
            checkin_radius_meters: true
          }
        }
      }
    })

    if (!userWithWarehouse?.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "User is not assigned to a warehouse" },
        { status: 400 }
      )
    }

    const userWarehouseId = userWithWarehouse.warehouse_id

    // Initialize warehouseId with request body or user's assigned warehouse
    // We will attempt to override this with GPS validation result below
    let warehouseId = warehouse_id || userWarehouseId

    // Get current Vietnam time and date
    const checkInTime = getVietnamNow()
    const today = getVietnamToday()

    // --- ANTI-CHEAT & VALIDATION ---
    // 1. Truncate User Agent / Device Info to prevent overflow
    let checkInDeviceInfo = (request.headers.get('user-agent') || 'unknown') +
      (body.device_id ? ` | DeviceID: ${body.device_id}` : '')

    if (checkInDeviceInfo.length > 1000) {
      checkInDeviceInfo = checkInDeviceInfo.substring(0, 1000) + '...'
    }

    // 2. Prevent Device Reuse (Anti-Cheat)
    // If a device_id is provided, check if it has been used by a DIFFERENT user today
    if (body.device_id) {
      // Find any session today with this device_id but different user_id
      // We look for the DeviceID string inside the stored check_in_device_info
      const sharedDeviceSession = await prisma.shift_sessions.findFirst({
        where: {
          session_date: today,
          check_in_device_info: {
            contains: `DeviceID: ${body.device_id}`
          },
          user_id: {
            not: user.id // Different user
          }
        },
        include: {
          users_shift_sessions_user_idTousers: true
        }
      })

      if (sharedDeviceSession) {
        const otherUser = sharedDeviceSession.users_shift_sessions_user_idTousers
        console.warn(`[ANTI-CHEAT] Device shared detected. DeviceID: ${body.device_id} used by ${user.id} but already used by ${otherUser.id} (${otherUser.full_name})`)

        return NextResponse.json(
          {
            success: false,
            error: `Thiết bị này đã được sử dụng để chấm công cho nhân viên ${otherUser.full_name} trong hôm nay. Vui lòng sử dụng thiết bị của riêng bạn.`
          },
          { status: 403 }
        )
      }
    }
    // --- END ANTI-CHEAT ---

    // --- GPS LOCATION VALIDATION ---
    // ADMIN and HR can bypass GPS validation
    const canBypassGPS = userWithWarehouse.role === "ADMIN" || userWithWarehouse.role === "HR"
    let gpsValidationResult: GPSValidationResult | null = null
    let validatedWarehouseId: string | null = null

    if (!canBypassGPS && !forgot_checkin) {
      // Get ALL warehouses with GPS configured
      const warehousesWithGPS = await prisma.warehouses.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true,
          code: true,
          name: true,
          latitude: true,
          longitude: true,
          checkin_radius_meters: true,
        },
      })

      if (warehousesWithGPS.length > 0) {
        // Check if user is within range of ANY warehouse
        gpsValidationResult = validateGPSAgainstCheckpoints(
          latitude,
          longitude,
          warehousesWithGPS.map(w => ({
            id: w.id,
            code: w.code,
            name: w.name,
            latitude: w.latitude!,
            longitude: w.longitude!,
            checkin_radius_meters: w.checkin_radius_meters || 3000,
          })),
          "check_in"
        )

        if (!gpsValidationResult.isValid) {
          // Not in range of any warehouse - return error with nearest info  
          return NextResponse.json(
            {
              success: false,
              error: gpsValidationResult.error,
              data: {
                distanceMeters: gpsValidationResult.distanceMeters,
                nearestWarehouse: gpsValidationResult.nearestCheckpoint,
              },
            },
            { status: 400 }
          )
        }

        // Store validated warehouse ID
        validatedWarehouseId = gpsValidationResult.checkpoint?.id || null

        // IMPORTANT: Override user's warehouse with the validated GPS location's warehouse
        // This enables opening shifts at "other points" (các điểm kho khác)
        if (validatedWarehouseId) {
          warehouseId = validatedWarehouseId
        }

        console.log("[GPS VALIDATION] Warehouse validated:", {
          userId: user.id,
          originalWarehouseId: userWarehouseId,
          finalWarehouseId: warehouseId,
          warehouseName: gpsValidationResult.checkpoint?.name,
          distance: gpsValidationResult.checkpoint?.distanceMeters,
        })
      } else {
        // No warehouses with GPS configured - skip GPS validation
        console.log("[GPS VALIDATION] No warehouses with GPS configured, skipping validation")
      }
    } else if (canBypassGPS) {
      console.log("[GPS VALIDATION] Bypassed for ADMIN/HR:", { userId: user.id, role: userWithWarehouse.role })
    }

    // Enhance checkInLocation with validated warehouse info
    if (validatedWarehouseId && gpsValidationResult?.checkpoint) {
      checkInLocation = {
        latitude,
        longitude,
        accuracy: accuracy || null,
        validated_warehouse_id: validatedWarehouseId,
        validated_warehouse_name: gpsValidationResult.checkpoint.name,
        distance_meters: gpsValidationResult.checkpoint.distanceMeters,
      }
    }
    // --- END GPS LOCATION VALIDATION ---

    // --- WAREHOUSE TYPE VALIDATION (Cross-check logic) ---
    // Strict isolation for Sales Sessions as well
    if (!canBypassGPS && userWithWarehouse.warehouse_id) {
      // Fetch both warehouse types
      const warehousesToCheck = await prisma.warehouses.findMany({
        where: {
          id: { in: [warehouseId, userWithWarehouse.warehouse_id] }
        },
        select: { id: true, type: true, name: true }
      })

      const userHomeWarehouse = warehousesToCheck.find(w => w.id === userWithWarehouse.warehouse_id)
      const targetWarehouse = warehousesToCheck.find(w => w.id === warehouseId)

      if (userHomeWarehouse && targetWarehouse) {
        // Rule 1: Store staff cannot check in at Partner (Franchise)
        if (userHomeWarehouse.type === 'STORE' && targetWarehouse.type === 'PARTNER') {
          return NextResponse.json(
            { success: false, error: "Nhân viên kho cửa hàng không thể mở ca bán hàng tại kho nhượng quyền" },
            { status: 403 }
          )
        }

        // Rule 2: Partner (Franchise) staff cannot check in at Store
        if (userHomeWarehouse.type === 'PARTNER' && targetWarehouse.type === 'STORE') {
          return NextResponse.json(
            { success: false, error: "Nhân viên kho nhượng quyền không thể mở ca bán hàng tại kho cửa hàng" },
            { status: 403 }
          )
        }

        // Rule 3: Partner staff can ONLY check in at their assigned warehouse
        if (userHomeWarehouse.type === 'PARTNER' && userWithWarehouse.warehouse_id !== warehouseId) {
          return NextResponse.json(
            { success: false, error: "Nhân viên nhượng quyền chỉ có thể mở ca bán hàng tại kho được giao" },
            { status: 403 }
          )
        }
      }
    }

    // MODE: Sales shift opening with opening_cash
    // Attendance check-in has been moved to a separate endpoint

    // Validate opening_cash is required
    if (opening_cash === undefined || opening_cash === null || opening_cash < 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập số tiền mặt đầu ca" },
        { status: 400 }
      )
    }

    // Check if this user already has an active sales session today
    const existingSession = await prisma.sales_sessions.findFirst({
      where: {
        user_id: user.id,
        session_date: {
          gte: today,
          lt: addDays(today, 1)
        },
        status: "IN_PROGRESS"
      },
      include: {
        work_shifts: { select: { shift_code: true, shift_name: true } }
      }
    })

    if (existingSession) {
      const shiftInfo = existingSession.work_shifts
        ? `ca ${existingSession.work_shifts.shift_code} (${existingSession.work_shifts.shift_name})`
        : 'ca bán hàng'
      return NextResponse.json(
        { success: false, error: `Bạn đang mở ${shiftInfo}. Vui lòng đóng ca trước khi mở ca mới.` },
        { status: 400 }
      )
    }

    // Check if any OTHER user has an active session in this warehouse today
    const otherUserSession = await prisma.sales_sessions.findFirst({
      where: {
        warehouse_id: warehouseId,
        status: "IN_PROGRESS",
        session_date: {
          gte: today,
          lt: addDays(today, 1)
        },
        user_id: { not: user.id }
      },
      include: {
        users_sales_sessions_user_idTousers: { select: { full_name: true } },
        work_shifts: { select: { shift_code: true, shift_name: true } },
        warehouses: { select: { name: true } }
      }
    })

    if (otherUserSession) {
      const otherUserName = otherUserSession.users_sales_sessions_user_idTousers?.full_name || 'Nhân viên khác'
      const shiftInfo = otherUserSession.work_shifts
        ? `ca ${otherUserSession.work_shifts.shift_code} (${otherUserSession.work_shifts.shift_name})`
        : 'ca bán hàng'
      const warehouseName = otherUserSession.warehouses?.name || 'kho này'

      return NextResponse.json(
        {
          success: false,
          error: `⚠️ ${otherUserName} đang mở ${shiftInfo} tại ${warehouseName}. Vui lòng đợi họ đóng ca.`
        },
        { status: 400 }
      )
    }

    // Validate Work Shift ID if provided
    let verifiedWorkShiftId = null
    if (work_shift_id) {
      const wShift = await prisma.work_shifts.findUnique({
        where: { id: work_shift_id }
      })
      if (wShift && wShift.warehouse_id === warehouseId) {
        verifiedWorkShiftId = wShift.id
      }
    }

    // Create sales session (NOT shift_session - sales columns moved to sales_sessions)
    const salesSession = await prisma.sales_sessions.create({
      data: {
        warehouse_id: warehouseId,
        user_id: user.id,
        session_date: today,
        shift_opened_at: getVietnamNow(),
        opening_cash: parseFloat(opening_cash),
        opening_cash_user_id: user.id,
        status: "IN_PROGRESS",
        work_shift_id: verifiedWorkShiftId,
        notes: notes || null,
        total_orders: 0,
        total_revenue: 0,
        total_discount: 0,
        cash_orders: 0,
        transfer_orders: 0,
        ewallet_orders: 0,
        transfer_total: 0,
        ewallet_total: 0,
        vouchers_used: 0,
      },
      include: {
        users_sales_sessions_user_idTousers: true,
        warehouses: true,
        work_shifts: true
      }
    })

    return NextResponse.json({
      success: true,
      message: "Mở ca bán hàng thành công",
      data: salesSession
    })
  } catch (error) {
    console.error("Check-in error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
