import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isWarehouseManager, isAdmin, isGeneralManager, isHR, canAccessWarehouse } from "@/lib/auth"
import { isValidUUID } from "@/lib/utils"

// PATCH /api/shifts/assignments/[id] - Update shift assignment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid ID format" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { work_shift_id, notes } = body

    if (!work_shift_id) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chọn ca làm việc" },
        { status: 400 }
      )
    }

    // Check if assignment exists
    const assignment = await prisma.shift_assignments.findUnique({
      where: { id },
      include: {
        users_assigned: {
          select: { id: true, full_name: true, warehouse_id: true },
        },
        work_shifts: true,
      },
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy ca làm việc" },
        { status: 404 }
      )
    }

    // Check permissions: Manager/Admin/HR can edit any, Staff can only edit their own
    const isManagerOrAdmin = isWarehouseManager(user) || isAdmin(user) || user.role === "MANAGER" || isGeneralManager(user) || isHR(user)
    const isOwnAssignment = assignment.user_id === user.id

    if (!isManagerOrAdmin && !isOwnAssignment) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền sửa ca này" },
        { status: 403 }
      )
    }

    // Check if manager has access to this warehouse - use canAccessWarehouse for proper role support
    if (!isAdmin(user) && isManagerOrAdmin && !canAccessWarehouse(user, assignment.warehouse_id)) {
      return NextResponse.json(
        { success: false, error: "Bạn chỉ có thể quản lý ca trong các kho bạn được phân công" },
        { status: 403 }
      )
    }

    // If same shift, no need to update
    if (assignment.work_shift_id === work_shift_id) {
      return NextResponse.json(
        { success: false, error: "Đã là ca này rồi, không cần đổi" },
        { status: 400 }
      )
    }

    // Verify new shift exists
    const newShift = await prisma.work_shifts.findUnique({
      where: { id: work_shift_id },
    })

    if (!newShift) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy ca làm việc mới" },
        { status: 404 }
      )
    }

    // Check if there's an active shift session (can't change while working)
    const activeSession = await prisma.shift_sessions.findFirst({
      where: {
        user_id: assignment.user_id,
        session_date: assignment.assigned_date,
        status: "IN_PROGRESS",
      },
    })

    if (activeSession) {
      return NextResponse.json(
        { success: false, error: "Không thể đổi ca khi đang trong ca làm việc" },
        { status: 400 }
      )
    }

    // Format shift time for display
    const formatShiftTime = (time: Date | string) => {
      if (time instanceof Date) {
        return time.toISOString().substring(11, 16)
      }
      return String(time).substring(0, 5)
    }

    const oldShiftName = assignment.work_shifts?.shift_name || 'Ca cũ'

    // Update assignment
    const updatedAssignment = await prisma.shift_assignments.update({
      where: { id },
      data: {
        work_shift_id,
        assigned_by: user.id,
        notes: notes || `Đã đổi ca: ${oldShiftName} → ${newShift.shift_name}`,
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
      data: updatedAssignment,
      message: `Đã đổi sang ca ${newShift.shift_name} (${formatShiftTime(newShift.start_time)} - ${formatShiftTime(newShift.end_time)})`,
    })
  } catch (error) {
    console.error("Error updating shift assignment:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE /api/shifts/assignments/[id] - Remove shift assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user || (!isWarehouseManager(user) && !isAdmin(user) && !isGeneralManager(user) && !isHR(user))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Manager or HR access required" },
        { status: 403 }
      )
    }

    const { id } = await params

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid ID format" },
        { status: 400 }
      )
    }

    // Check if assignment exists
    const assignment = await prisma.shift_assignments.findUnique({
      where: { id },
      include: {
        users_assigned: {
          select: { full_name: true },
        },
      },
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Assignment not found" },
        { status: 404 }
      )
    }

    // Check if manager has access to this warehouse - use canAccessWarehouse for proper role support
    if (!isAdmin(user) && !canAccessWarehouse(user, assignment.warehouse_id)) {
      return NextResponse.json(
        { success: false, error: "You can only manage shifts in warehouses you have access to" },
        { status: 403 }
      )
    }

    // Check if there's an active shift session
    const activeSession = await prisma.shift_sessions.findFirst({
      where: {
        user_id: assignment.user_id,
        session_date: assignment.assigned_date,
        status: "IN_PROGRESS",
      },
    })

    if (activeSession) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot remove assignment while shift is in progress",
        },
        { status: 400 }
      )
    }

    // Delete assignment
    await prisma.shift_assignments.delete({
      where: { id },
    })

    // TODO: Send FCM notification (Phase 4)

    return NextResponse.json({
      success: true,
      message: "Shift assignment removed",
    })
  } catch (error) {
    console.error("Error deleting shift assignment:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
