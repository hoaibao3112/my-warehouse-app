import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"
import { getVietnamNow, getVietnamToday, parseShiftTime, createShiftDateTime, isAfter, addMinutes, formatVietnamTimeShort } from "@/lib/server-time"
import { addDays } from "date-fns"
import { validateGPSAgainstCheckpoints, type GPSValidationResult } from "@/lib/server-geo"

/**
 * POST /api/attendance/check-in
 * Creates an attendance session for employee check-in (chấm công)
 * 
 * This is SEPARATE from sales session management.
 * An attendance session tracks when employees check in/out for their assigned shifts.
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await verifyAuth(request)
        if (!authUser) {
            return NextResponse.json({ success: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }, { status: 401 })
        }

        const user = await prisma.users.findUnique({
            where: { id: authUser.id },
            select: {
                id: true,
                warehouse_id: true,
                full_name: true,
                role: true,
                permissions: true
            }
        })

        if (!user) {
            return NextResponse.json({ success: false, error: "Không tìm thấy thông tin người dùng" }, { status: 404 })
        }

        const body = await request.json()
        const {
            shift_assignment_id,
            work_shift_id,
            latitude,
            longitude,
            notes,
            device_id
        } = body

        // Require GPS location for check-in
        if (!latitude || !longitude) {
            return NextResponse.json(
                { success: false, error: "Không thể lấy vị trí GPS. Vui lòng bật định vị." },
                { status: 400 }
            )
        }

        const now = getVietnamNow()
        const today = getVietnamToday()

        // Get IP address
        const forwardedFor = request.headers.get('x-forwarded-for')
        const checkInIp = forwardedFor ? forwardedFor.split(',')[0].trim() :
            request.headers.get('x-real-ip') || 'unknown'

        // Prepare device info
        const userAgent = request.headers.get('user-agent') || ''
        const checkInDeviceInfo = device_id
            ? `DeviceID: ${device_id}\nUA: ${userAgent.substring(0, 200)}`
            : `UA: ${userAgent.substring(0, 200)}`

        // Prepare location
        let checkInLocation: any = { latitude, longitude }

        // --- GPS LOCATION VALIDATION ---
        // ADMIN and HR can bypass GPS validation
        const canBypassGPS = user.role === "ADMIN" || user.role === "HR"
        let gpsValidationResult: GPSValidationResult | null = null
        let validatedWarehouseId: string | null = null

        // Default warehouseId (from body or user's aligned warehouse)
        let warehouseId = body.warehouse_id || user.warehouse_id

        if (!canBypassGPS) {
            // Get ALL active warehouses with GPS configured
            const warehousesWithGPS = await prisma.warehouses.findMany({
                where: {
                    is_active: true,
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
                // Log tất cả warehouses được kiểm tra
                console.log("[ATTENDANCE GPS] Checking against", warehousesWithGPS.length, "warehouses:")
                warehousesWithGPS.forEach(w => {
                    console.log(`  - ${w.name} (${w.code}): lat=${w.latitude}, lng=${w.longitude}, radius=${w.checkin_radius_meters || 3000}m`)
                })
                console.log("[ATTENDANCE GPS] User location:", { latitude, longitude })

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

                // IMPORTANT: Override user's warehouse with the validated GPS location's warehouse
                // This enables attendance at "other points" (các điểm khác)
                validatedWarehouseId = gpsValidationResult.checkpoint?.id || null
                if (validatedWarehouseId) {
                    warehouseId = validatedWarehouseId
                }

                console.log("[ATTENDANCE GPS] Warehouse validated:", {
                    userId: user.id,
                    originalWarehouseId: user.warehouse_id,
                    validatedWarehouseId,
                    warehouseName: gpsValidationResult.checkpoint?.name,
                    distance: gpsValidationResult.checkpoint?.distanceMeters,
                })
            } else {
                console.log("[ATTENDANCE GPS] No warehouses with GPS configured, skipping validation")
            }
        } else {
            console.log("[ATTENDANCE GPS] Bypassed for ADMIN/HR:", { userId: user.id, role: user.role })
        }

        // Enhance checkInLocation with validated warehouse info
        if (validatedWarehouseId && gpsValidationResult?.checkpoint) {
            checkInLocation = {
                latitude,
                longitude,
                validated_warehouse_id: validatedWarehouseId,
                validated_warehouse_name: gpsValidationResult.checkpoint.name,
                distance_meters: gpsValidationResult.checkpoint.distanceMeters,
            }
        }

        // Final check: User must have a warehouse (either assigned or detected)
        if (!warehouseId) {
            return NextResponse.json(
                { success: false, error: "Không xác định được kho (bạn không có kho được giao và không ở trong phạm vi kho nào)." },
                { status: 400 }
            )
        }

        // --- WAREHOUSE TYPE VALIDATION (Cross-check logic) ---
        // Validate that user is allowed to check in at this specific warehouse type based on their home warehouse
        if (!canBypassGPS && user.warehouse_id) {
            // Fetch both warehouse types
            const warehousesToCheck = await prisma.warehouses.findMany({
                where: {
                    id: { in: [warehouseId, user.warehouse_id] }
                },
                select: { id: true, type: true, name: true }
            })

            const userHomeWarehouse = warehousesToCheck.find(w => w.id === user.warehouse_id)
            const targetWarehouse = warehousesToCheck.find(w => w.id === warehouseId)

            if (userHomeWarehouse && targetWarehouse) {
                // Rule 1: Store staff cannot check in at Partner (Franchise)
                if (userHomeWarehouse.type === 'STORE' && targetWarehouse.type === 'PARTNER') {
                    return NextResponse.json(
                        { success: false, error: "Nhân viên kho cửa hàng không thể chấm công tại kho nhượng quyền" },
                        { status: 403 }
                    )
                }

                // Rule 2: Partner (Franchise) staff cannot check in at Store
                if (userHomeWarehouse.type === 'PARTNER' && targetWarehouse.type === 'STORE') {
                    return NextResponse.json(
                        { success: false, error: "Nhân viên kho nhượng quyền không thể chấm công tại kho cửa hàng" },
                        { status: 403 }
                    )
                }

                // Rule 3: Partner staff can ONLY check in at their assigned warehouse (Strict isolation for Franchise)
                // This prevents Partner A from checking in at Partner B
                if (userHomeWarehouse.type === 'PARTNER' && user.warehouse_id !== warehouseId) {
                    return NextResponse.json(
                        { success: false, error: "Nhân viên nhượng quyền chỉ có thể chấm công tại kho được giao" },
                        { status: 403 }
                    )
                }

                // Implicit Rule 4: Store staff CAN check in at any Store is allowed (no error thrown)
                // Implicit Rule 5: Main warehouse staff? Usually they should be able to check in anywhere or just Main/Store.
                // Assuming Main can go to Store, but maybe not Partner? 
                // For now, adhering strictly to the User's request about Store vs Partner isolation.
            }
        }

        // Variables for late check-in detection
        let isLate = false
        let lateMinutes = 0
        let effectiveWorkShiftId = work_shift_id
        let sessionWarehouseId = warehouseId

        // If shift_assignment_id is provided, validate it
        if (shift_assignment_id) {
            const assignment = await prisma.shift_assignments.findUnique({
                where: { id: shift_assignment_id },
                include: { work_shifts: true }
            })

            if (!assignment) {
                return NextResponse.json(
                    { success: false, error: "Không tìm thấy ca đã phân công" },
                    { status: 404 }
                )
            }

            if (assignment.user_id !== user.id) {
                return NextResponse.json(
                    { success: false, error: "Ca này không phải của bạn" },
                    { status: 403 }
                )
            }

            // Force session warehouse to be the same as the assignment
            // This prevents sessions from bleeding into other warehouses 
            // due to GPS radius overlap or user's primary warehouse default.
            if (assignment.warehouse_id) {
                sessionWarehouseId = assignment.warehouse_id
            }

            // Check if already checked in for this assignment
            const existingSession = await prisma.attendance_sessions.findFirst({
                where: {
                    shift_assignment_id: shift_assignment_id,
                    user_id: user.id
                }
            })

            if (existingSession) {
                return NextResponse.json(
                    { success: false, error: "Bạn đã chấm công vào ca này rồi" },
                    { status: 400 }
                )
            }

            effectiveWorkShiftId = assignment.work_shift_id

            // Calculate late status
            if (assignment.work_shifts) {
                const { hours: startH, minutes: startM } = parseShiftTime(assignment.work_shifts.start_time)
                const shiftStartTime = createShiftDateTime(today, startH, startM)

                if (isAfter(now, shiftStartTime)) {
                    isLate = true
                    lateMinutes = Math.floor((now.getTime() - shiftStartTime.getTime()) / (1000 * 60))
                }
            }
        } else {
            // Check if already checked in today for any shift
            const existingSession = await prisma.attendance_sessions.findFirst({
                where: {
                    user_id: user.id,
                    session_date: {
                        gte: today,
                        lt: addDays(today, 1)
                    },
                    status: { in: ["CHECKED_IN", "LATE"] }
                }
            })

            if (existingSession) {
                return NextResponse.json(
                    { success: false, error: "Bạn đã chấm công vào hôm nay rồi" },
                    { status: 400 }
                )
            }
        }

        // Determine session date: prioritize assignment date to ensure alignment (e.g. late checkin across midnight)
        let sessionDate = today
        if (shift_assignment_id) {
            const assignment = await prisma.shift_assignments.findUnique({
                where: { id: shift_assignment_id },
                select: { assigned_date: true }
            })
            if (assignment) {
                // Ensure we capture the date part correctly regardless of time
                const aDate = new Date(assignment.assigned_date)
                sessionDate = new Date(Date.UTC(aDate.getUTCFullYear(), aDate.getUTCMonth(), aDate.getUTCDate(), 0, 0, 0, 0))
            }
        }

        // Create attendance session
        const attendanceSession = await prisma.attendance_sessions.create({
            data: {
                user_id: user.id,
                warehouse_id: sessionWarehouseId,
                session_date: sessionDate,
                work_shift_id: effectiveWorkShiftId || null,
                shift_assignment_id: shift_assignment_id || null,
                check_in_time: now,
                check_in_ip: checkInIp,
                check_in_location: checkInLocation,
                check_in_device_info: checkInDeviceInfo,
                is_late_checkin: isLate,
                late_minutes: lateMinutes,
                status: isLate ? "LATE" : "CHECKED_IN",
                notes: notes || (isLate ? `Đi muộn ${lateMinutes} phút` : null),
            },
            include: {
                work_shifts: true,
                warehouses: { select: { name: true, code: true } }
            }
        })

        return NextResponse.json({
            success: true,
            message: isLate
                ? `Chấm công thành công (Đi muộn ${lateMinutes} phút)`
                : "Chấm công thành công",
            data: {
                ...attendanceSession,
                isLate,
                lateMinutes
            }
        })

    } catch (error) {
        console.error("Error creating attendance check-in:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống khi chấm công" },
            { status: 500 }
        )
    }
}
