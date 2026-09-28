import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isWarehouseManager, isAdmin, isGeneralManager, isHR, canAccessWarehouse } from "@/lib/auth"
import { getVietnamToday } from "@/lib/server-time"

// GET /api/shifts/assignments - Get assignments for a user on a specific date
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const dateStr = searchParams.get('date')

    if (!userId || !dateStr) {
      return NextResponse.json(
        { success: false, error: "Missing user_id or date" },
        { status: 400 }
      )
    }

    const date = new Date(dateStr)
    const assignments = await prisma.shift_assignments.findMany({
      where: {
        user_id: userId,
        assigned_date: date,
      },
      include: {
        work_shifts: true,
      }
    })

    return NextResponse.json({
      success: true,
      data: assignments
    })

  } catch (error) {
    console.error("Error fetching assignments:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST /api/shifts/assignments - Create/Sync shift assignments
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    console.log('[shift-assignment] User:', user ? {
      id: user.id,
      email: user.email,
      role: user.role,
      warehouseId: user.warehouseId
    } : 'null')

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    const isManager = isWarehouseManager(user)
    const isAdminUser = isAdmin(user)
    const isMainWarehouseManager = user.role === "MANAGER" // Main warehouse manager
    const isGenManager = isGeneralManager(user)
    const isHRUser = isHR(user)

    console.log('[shift-assignment] isWarehouseManager:', isManager, 'isAdmin:', isAdminUser, 'isMainWarehouseManager:', isMainWarehouseManager, 'isGeneralManager:', isGenManager, 'isHR:', isHRUser)

    if (!isManager && !isAdminUser && !isMainWarehouseManager && !isGenManager && !isHRUser) {
      return NextResponse.json(
        { success: false, error: `Unauthorized - Manager or HR access required. Your role: ${user.role}` },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Support both single assignment (legacy) and bulk assignment (new)
    const { work_shift_ids, user_id, assigned_date, notes } = body
    const work_shift_id = body.work_shift_id // Legacy support

    // Validate required fields
    if ((!work_shift_id && !work_shift_ids) || !user_id || !assigned_date) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate assigned_date - use UTC-based dates for consistency
    const assignedDateRaw = new Date(assigned_date)
    const assignedDate = new Date(Date.UTC(
      assignedDateRaw.getUTCFullYear(),
      assignedDateRaw.getUTCMonth(),
      assignedDateRaw.getUTCDate(),
      0, 0, 0, 0
    ))
    const today = getVietnamToday()

    // ALLOW assigning shifts to past dates (requested feature for retroactive attendance)
    // if (assignedDate < today) {
    //   return NextResponse.json(
    //     { success: false, error: "Không thể xếp ca cho ngày đã qua" },
    //     { status: 400 }
    //   )
    // }

    // Không thể xếp ca cho ngày cách hơn 2 tháng
    const nextNextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1, 0, 0, 0, 0))
    if (assignedDate >= nextNextMonth) {
      return NextResponse.json(
        { success: false, error: "Chỉ có thể xếp lịch cho tháng hiện tại và tháng tiếp theo." },
        { status: 400 }
      )
    }

    // Get assigned user's warehouse
    const assignedUser = await prisma.users.findUnique({
      where: { id: user_id },
      select: { warehouse_id: true },
    })

    if (!assignedUser?.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "User is not assigned to a warehouse" },
        { status: 400 }
      )
    }

    const warehouse_id = assignedUser.warehouse_id

    // Check if manager has access to this warehouse - use canAccessWarehouse for proper role support
    if (!isAdminUser && !canAccessWarehouse(user, warehouse_id)) {
      return NextResponse.json(
        { success: false, error: "You can only assign shifts in warehouses you have access to" },
        { status: 403 }
      )
    }

    // --- BULK ASSIGNMENT LOGIC ---
    if (Array.isArray(work_shift_ids)) {
      // 1. Get existing assignments for this day
      const existingAssignments = await prisma.shift_assignments.findMany({
        where: {
          user_id,
          assigned_date: new Date(assigned_date),
        }
      })

      const existingShiftIds = existingAssignments.map(a => a.work_shift_id)
      const newShiftIds = work_shift_ids as string[]

      // 2. Identify shifts to add and remove
      const shiftsToAdd = newShiftIds.filter(id => !existingShiftIds.includes(id))
      const shiftsToRemove = existingAssignments
        .filter(a => !newShiftIds.includes(a.work_shift_id))
        .map(a => a.id)

      // 3. Delete removed shifts
      if (shiftsToRemove.length > 0) {
        await prisma.shift_assignments.deleteMany({
          where: {
            id: { in: shiftsToRemove }
          }
        })
      }

      // 4. Create new shifts
      if (shiftsToAdd.length > 0) {
        await prisma.shift_assignments.createMany({
          data: shiftsToAdd.map(shiftId => ({
            work_shift_id: shiftId,
            user_id,
            warehouse_id,
            assigned_date: new Date(assigned_date),
            assigned_by: user.id,
            notes: notes || null,
          }))
        })
      }

      return NextResponse.json({
        success: true,
        message: "Ca làm việc đã được cập nhật"
      })
    }

    // --- LEGACY SINGLE ASSIGNMENT LOGIC ---
    // Check if user already has THIS SPECIFIC SHIFT assignment for this date
    const existingAssignment = await prisma.shift_assignments.findFirst({
      where: {
        user_id,
        assigned_date: new Date(assigned_date),
        work_shift_id: work_shift_id, // Check for exact shift
      },
      include: {
        work_shifts: true,
      },
    })

    // If user already has the same shift, don't allow duplicate
    if (existingAssignment) {
      return NextResponse.json(
        { success: false, error: "Nhân viên đã được xếp ca này rồi" },
        { status: 400 }
      )
    }

    // Always CREATE new assignment (allow multiple different shifts per day)
    const assignment = await prisma.shift_assignments.create({
      data: {
        work_shift_id,
        user_id,
        warehouse_id,
        assigned_date: new Date(assigned_date),
        assigned_by: user.id,
        notes: notes || null,
      },
      include: {
        work_shifts: true,
        users_assigned: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: assignment,
    })
  } catch (error) {
    console.error("Error creating shift assignment:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
