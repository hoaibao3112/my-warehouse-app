import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"

// POST /api/shifts/registration-requests/[id]/reassign - Reassign a different shift to the registration request
export async function POST(
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

    // Only managers, general managers and admins can reassign shifts
    const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only managers can reassign shifts" },
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

    const body = await request.json()
    const { new_work_shift_id, notes } = body

    if (!new_work_shift_id || !isValidUUID(new_work_shift_id)) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chọn ca làm việc mới" },
        { status: 400 }
      )
    }

    // Find the registration request
    const registrationRequest = await prisma.shift_registration_requests.findUnique({
      where: { id },
      include: {
        users_requester: {
          select: { id: true, full_name: true },
        },
        work_shifts: true,
        warehouses: true,
      },
    })

    if (!registrationRequest) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy yêu cầu đăng ký" },
        { status: 404 }
      )
    }

    if (registrationRequest.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Yêu cầu này đã được xử lý" },
        { status: 400 }
      )
    }

    // Verify the new shift exists and belongs to the same warehouse
    const newShift = await prisma.work_shifts.findUnique({
      where: { id: new_work_shift_id },
    })

    if (!newShift) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy ca làm việc mới" },
        { status: 404 }
      )
    }

    if (newShift.warehouse_id !== registrationRequest.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "Ca làm việc mới phải thuộc cùng kho" },
        { status: 400 }
      )
    }

    // Check if user already has an assignment for this date
    const existingAssignment = await prisma.shift_assignments.findFirst({
      where: {
        user_id: registrationRequest.user_id,
        assigned_date: registrationRequest.requested_date,
      },
      include: {
        work_shifts: true,
      },
    })

    // If user already has the same shift, no need to reassign
    if (existingAssignment && existingAssignment.work_shift_id === new_work_shift_id) {
      return NextResponse.json(
        { success: false, error: "Nhân viên đã được xếp ca này rồi" },
        { status: 400 }
      )
    }

    // Check shift capacity for the new shift (exclude existing assignment if updating)
    const maxStaffPerShift = 10
    const existingStaffOnShift = await prisma.shift_assignments.count({
      where: {
        work_shift_id: new_work_shift_id,
        assigned_date: registrationRequest.requested_date,
        // Exclude the user's existing assignment if they have one
        ...(existingAssignment ? { id: { not: existingAssignment.id } } : {}),
      },
    })

    if (existingStaffOnShift >= maxStaffPerShift) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Ca này đã đủ ${maxStaffPerShift} nhân viên. Không thể thêm người mới.` 
        },
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

    // Create or update the shift assignment with the new shift and update request in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let assignment;
      
      if (existingAssignment) {
        // UPDATE existing assignment to new shift
        const oldShiftName = existingAssignment.work_shifts?.shift_name || 'Ca cũ';
        assignment = await tx.shift_assignments.update({
          where: { id: existingAssignment.id },
          data: {
            work_shift_id: new_work_shift_id,
            assigned_by: user.id,
            notes: notes || `Quản lý đã đổi ca: ${oldShiftName} → ${newShift.shift_name} (${formatShiftTime(newShift.start_time)} - ${formatShiftTime(newShift.end_time)})`,
          },
          include: {
            work_shifts: true,
            users_assigned: {
              select: { id: true, full_name: true },
            },
          },
        })
      } else {
        // CREATE new shift assignment
        assignment = await tx.shift_assignments.create({
          data: {
            work_shift_id: new_work_shift_id,
            user_id: registrationRequest.user_id,
            warehouse_id: registrationRequest.warehouse_id,
            assigned_date: registrationRequest.requested_date,
            assigned_by: user.id,
            notes: notes || `Quản lý đã xếp ca khác: ${newShift.shift_name} (${formatShiftTime(newShift.start_time)} - ${formatShiftTime(newShift.end_time)})`,
          },
          include: {
            work_shifts: true,
            users_assigned: {
              select: { id: true, full_name: true },
            },
          },
        })
      }

      // Update registration request status to APPROVED (with reassignment info)
      const updatedRequest = await tx.shift_registration_requests.update({
        where: { id },
        data: {
          status: "APPROVED",
          approved_by: user.id,
          approved_at: new Date(),
          // Store the original requested shift and the reassigned shift info in notes
          notes: `${registrationRequest.notes || ""}\n[Đã xếp ca khác: ${newShift.shift_name} thay vì ${registrationRequest.work_shifts.shift_name}]`.trim(),
        },
      })

      return { assignment, updatedRequest, newShift, wasUpdated: !!existingAssignment }
    })

    const actionVerb = result.wasUpdated ? 'Đã đổi sang' : 'Đã xếp';
    
    return NextResponse.json({
      success: true,
      data: result,
      message: `${actionVerb} ca ${result.newShift.shift_name} (${formatShiftTime(result.newShift.start_time)} - ${formatShiftTime(result.newShift.end_time)}) cho ${registrationRequest.users_requester.full_name}`,
    })
  } catch (error) {
    console.error("Error reassigning shift:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
