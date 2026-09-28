import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"
import { createNotification } from "@/lib/notification-service"
import { format } from "date-fns"
import { vi } from "date-fns/locale"



// POST /api/shifts/registration-requests/[id]/approve - Approve a registration request
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

    // Only managers, general managers and admins can approve requests
    const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only managers can approve registration requests" },
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
    const { notes } = body

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

    // Check if user already has an assignment for this date
    const existingAssignment = await prisma.shift_assignments.findFirst({
      where: {
        user_id: registrationRequest.user_id,
        assigned_date: registrationRequest.requested_date,
      },
    })

    if (existingAssignment) {
      return NextResponse.json(
        { success: false, error: "Nhân viên này đã có ca làm việc vào ngày này" },
        { status: 400 }
      )
    }

    // Optional: Check shift capacity (limit number of staff per shift)
    const maxStaffPerShift = 10 // You can make this configurable
    const existingStaffOnShift = await prisma.shift_assignments.count({
      where: {
        work_shift_id: registrationRequest.work_shift_id,
        assigned_date: registrationRequest.requested_date,
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

    // Create the shift assignment and update request in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create shift assignment
      const assignment = await tx.shift_assignments.create({
        data: {
          work_shift_id: registrationRequest.work_shift_id,
          user_id: registrationRequest.user_id,
          warehouse_id: registrationRequest.warehouse_id,
          assigned_date: registrationRequest.requested_date,
          assigned_by: user.id,
          notes: notes || registrationRequest.notes,
        },
        include: {
          work_shifts: true,
          users_assigned: {
            select: { id: true, full_name: true },
          },
        },
      })

      // Update registration request status
      const updatedRequest = await tx.shift_registration_requests.update({
        where: { id },
        data: {
          status: "APPROVED",
          approved_by: user.id,
          approved_at: new Date(),
        },
      })

      return { assignment, updatedRequest }
    })

    // Send notification to the requester (in-app only - no FCM to avoid spam when approving multiple shifts)
    try {
      const formattedDate = format(registrationRequest.requested_date, "dd/MM/yyyy", { locale: vi })
      await createNotification({
        userId: registrationRequest.user_id,
        type: "SHIFT_REGISTRATION_APPROVED",
        title: "Đăng ký ca được chấp thuận",
        message: `Ca làm việc ${registrationRequest.work_shifts.shift_name} ngày ${formattedDate} đã được duyệt`,
        redirectUrl: "/admin/schedule",
        data: {
          requestId: id,
          shiftDate: registrationRequest.requested_date.toISOString(),
          shiftId: registrationRequest.work_shift_id,
        },
      })
    } catch (notifError) {
      console.error("Failed to send notification:", notifError)
      // Don't fail the request if notification fails
    }



    return NextResponse.json({
      success: true,
      data: result,
      message: `Đã phê duyệt ca cho ${registrationRequest.users_requester.full_name}`,
    })
  } catch (error) {
    console.error("Error approving registration request:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
