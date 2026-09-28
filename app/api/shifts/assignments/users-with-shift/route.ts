import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

// GET /api/shifts/assignments/users-with-shift?date=YYYY-MM-DD
// Get list of users who have shifts on a specific date (for shift swap)
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
    const dateStr = searchParams.get("date")

    if (!dateStr) {
      return NextResponse.json(
        { success: false, error: "Missing date parameter" },
        { status: 400 }
      )
    }

    const targetDate = new Date(dateStr)

    // Get all assignments for this date in the same warehouse, excluding current user
    const assignments = await prisma.shift_assignments.findMany({
      where: {
        assigned_date: targetDate,
        user_id: {
          not: user.id, // Exclude current user
        },
        users_assigned: {
          warehouse_id: user.warehouseId, // Same warehouse
          is_active: true,
          role: {
            in: ["WAREHOUSE_STAFF", "ATTENDANCE_STAFF"],
          },
        },
      },
      include: {
        users_assigned: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        work_shifts: {
          select: {
            shift_name: true,
            shift_code: true,
            start_time: true,
            end_time: true,
          },
        },
      },
    })

    // Format response
    const usersWithShifts = assignments.map((assignment) => ({
      user_id: assignment.users_assigned.id,
      user_name: assignment.users_assigned.full_name,
      user_email: assignment.users_assigned.email,
      shift_name: assignment.work_shifts.shift_name,
      shift_code: assignment.work_shifts.shift_code,
      start_time:
        assignment.work_shifts.start_time instanceof Date
          ? assignment.work_shifts.start_time.toISOString().substr(11, 8)
          : assignment.work_shifts.start_time,
      end_time:
        assignment.work_shifts.end_time instanceof Date
          ? assignment.work_shifts.end_time.toISOString().substr(11, 8)
          : assignment.work_shifts.end_time,
    }))

    return NextResponse.json({
      success: true,
      data: usersWithShifts,
    })
  } catch (error) {
    console.error("Error fetching users with shifts:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
