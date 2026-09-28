import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"

// GET /api/shifts/available-shifts?date=YYYY-MM-DD&warehouse_id=xxx
// Returns all work shifts available in user's warehouse (or specified warehouse for admin) for a specific date
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
    const dateParam = searchParams.get("date")
    const warehouseIdParam = searchParams.get("warehouse_id")

    if (!dateParam) {
      return NextResponse.json(
        { success: false, error: "Date parameter is required" },
        { status: 400 }
      )
    }

    let targetWarehouseId: string | null = null

    // If warehouse_id is provided and user is admin/manager/general_manager, use that
    if (warehouseIdParam && isValidUUID(warehouseIdParam)) {
      const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
      if (allowedRoles.includes(user.role)) {
        targetWarehouseId = warehouseIdParam
      }
    }

    // If no warehouse_id provided or not allowed, use user's warehouse
    if (!targetWarehouseId) {
      // Get user's warehouse from users table
      const userRecord = await prisma.users.findUnique({
        where: { id: user.id },
        select: { warehouse_id: true }
      })

      targetWarehouseId = userRecord?.warehouse_id || null
    }

    if (!targetWarehouseId) {
      return NextResponse.json(
        { success: false, error: "Bạn chưa được gán vào kho nào" },
        { status: 400 }
      )
    }

    // Get all work shifts for target warehouse
    const shifts = await prisma.work_shifts.findMany({
      where: {
        warehouse_id: targetWarehouseId,
        is_active: true,
      },
      select: {
        id: true,
        shift_name: true,
        shift_code: true,
        start_time: true,
        end_time: true,
      },
      orderBy: {
        start_time: "asc",
      }
    })

    // Convert Date objects to time strings (HH:MM:SS)
    // Use toISOString() to get UTC time, then extract time portion
    const formattedShifts = shifts.map(shift => ({
      id: shift.id,
      shift_name: shift.shift_name,
      shift_code: shift.shift_code,
      start_time: shift.start_time instanceof Date
        ? shift.start_time.toISOString().substring(11, 19)
        : String(shift.start_time).substring(0, 8),
      end_time: shift.end_time instanceof Date
        ? shift.end_time.toISOString().substring(11, 19)
        : String(shift.end_time).substring(0, 8),
    }))

    return NextResponse.json({
      success: true,
      data: formattedShifts,
    })
  } catch (error) {
    console.error("Error fetching available shifts:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
