import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

// GET /api/shifts/available - Get available work shifts for staff registration
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    // Get all active work shifts
    const shifts = await prisma.work_shifts.findMany({
      where: {
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
      },
    })

    // Serialize time fields
    const serializedShifts = shifts.map((shift) => ({
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

    return NextResponse.json({
      success: true,
      data: serializedShifts,
    })
  } catch (error) {
    console.error("Error fetching available shifts:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
