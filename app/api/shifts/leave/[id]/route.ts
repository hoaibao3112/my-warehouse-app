import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"
import { sendNotificationWithFCM } from "@/lib/notification-helper"
import { format } from "date-fns"
import { vi } from "date-fns/locale"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    if (!isValidUUID(id)) {
      return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 })
    }

    const body = await request.json()
    const { action, rejection_reason } = body

    if (!action || !["approve", "reject", "cancel"].includes(action)) {
      return NextResponse.json({ success: false, error: "Hành động không hợp lệ" }, { status: 400 })
    }

    // Get the leave request
    const leaveRequest = await prisma.leave_requests.findUnique({
      where: { id },
      include: {
        users_requester: {
          select: { full_name: true }
        }
      }
    })

    if (!leaveRequest) {
      return NextResponse.json({ success: false, error: "Không tìm thấy yêu cầu nghỉ phép" }, { status: 404 })
    }

    // Cancel action - only requester can cancel their own request, or ADMIN
    if (action === "cancel") {
      const isAdminUser = user.role === "ADMIN" || user.role === "AdminKhoTong"
      if (leaveRequest.user_id !== user.id && !isAdminUser) {
        return NextResponse.json({ success: false, error: "Bạn không thể hủy yêu cầu của người khác" }, { status: 403 })
      }

      if (leaveRequest.status !== "PENDING") {
        return NextResponse.json({ success: false, error: "Chỉ có thể hủy yêu cầu đang chờ duyệt" }, { status: 400 })
      }

      // Delete the leave request instead of changing status
      await prisma.leave_requests.delete({
        where: { id }
      })

      return NextResponse.json({
        success: true,
        message: "Đã hủy yêu cầu nghỉ phép"
      })
    }

    // Approve/Reject - only managers can do this
    const userInfo = await prisma.users.findUnique({
      where: { id: user.id },
      select: { warehouse_id: true, role: true }
    })

    if (!userInfo || (userInfo.role !== "WAREHOUSE_MANAGER" && userInfo.role !== "ADMIN" && userInfo.role !== "GENERAL_MANAGER" && userInfo.role !== "HR")) {
      return NextResponse.json({ success: false, error: "Không có quyền phê duyệt" }, { status: 403 })
    }

    // Check if manager is from same warehouse
    if (userInfo.role === "WAREHOUSE_MANAGER" && userInfo.warehouse_id !== leaveRequest.warehouse_id) {
      return NextResponse.json({ success: false, error: "Bạn chỉ có thể phê duyệt yêu cầu từ kho của mình" }, { status: 403 })
    }

    // GENERAL_MANAGER must have access to warehouse
    if (userInfo.role === "GENERAL_MANAGER" && !user.warehouseIds?.includes(leaveRequest.warehouse_id)) {
      return NextResponse.json({ success: false, error: "Bạn chỉ có thể phê duyệt yêu cầu từ kho của mình" }, { status: 403 })
    }

    if (leaveRequest.status !== "PENDING") {
      return NextResponse.json({ success: false, error: "Yêu cầu này đã được xử lý" }, { status: 400 })
    }

    if (action === "approve") {
      // If there's a shift assignment for this date, we might want to remove it
      // or mark it as leave day
      await prisma.leave_requests.update({
        where: { id },
        data: {
          status: "APPROVED",
          approved_by: user.id,
          approved_at: new Date(),
          updated_at: new Date()
        }
      })

      // Optionally remove shift assignment for this date
      await prisma.shift_assignments.deleteMany({
        where: {
          user_id: leaveRequest.user_id,
          assigned_date: leaveRequest.leave_date
        }
      })

      // Send approval notification (FCM + in-app)
      try {
        const formattedDate = format(leaveRequest.leave_date, "dd/MM/yyyy", { locale: vi })
        await sendNotificationWithFCM({
          userId: leaveRequest.user_id,
          type: "LEAVE_REQUEST_APPROVED",
          title: "Yêu cầu nghỉ phép được chấp thuận",
          message: `Yêu cầu nghỉ phép ngày ${formattedDate} đã được phê duyệt`,
          redirectUrl: "/admin/schedule",
          data: {
            requestId: id,
            leaveDate: leaveRequest.leave_date.toISOString(),
          },
          fcmType: "shift_pending",
        })
      } catch (notifError) {
        console.error("Failed to send notification:", notifError)
      }

      return NextResponse.json({
        success: true,
        message: `Đã phê duyệt nghỉ phép cho ${leaveRequest.users_requester.full_name}`
      })
    }

    if (action === "reject") {
      await prisma.leave_requests.update({
        where: { id },
        data: {
          status: "REJECTED",
          approved_by: user.id,
          approved_at: new Date(),
          rejection_reason: rejection_reason || undefined,
          updated_at: new Date()
        }
      })

      // Send rejection notification (FCM + in-app)
      try {
        const formattedDate = format(leaveRequest.leave_date, "dd/MM/yyyy", { locale: vi })
        await sendNotificationWithFCM({
          userId: leaveRequest.user_id,
          type: "LEAVE_REQUEST_REJECTED",
          title: "Yêu cầu nghỉ phép bị từ chối",
          message: `Yêu cầu nghỉ phép ngày ${formattedDate} bị từ chối${rejection_reason ? `. Lý do: ${rejection_reason}` : ""}`,
          redirectUrl: "/admin/schedule",
          data: {
            requestId: id,
            leaveDate: leaveRequest.leave_date.toISOString(),
          },
          fcmType: "shift_pending",
        })
      } catch (notifError) {
        console.error("Failed to send notification:", notifError)
      }

      return NextResponse.json({
        success: true,
        message: `Đã từ chối yêu cầu nghỉ phép của ${leaveRequest.users_requester.full_name}`
      })
    }

  } catch (error) {
    console.error("Error updating leave request:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const leaveRequest = await prisma.leave_requests.findUnique({
      where: { id }
    })

    if (!leaveRequest) {
      return NextResponse.json({ success: false, error: "Không tìm thấy yêu cầu nghỉ phép" }, { status: 404 })
    }

    // Only requester can delete their own pending request, or ADMIN can delete any
    const isAdminUser = user.role === "ADMIN" || user.role === "AdminKhoTong"
    if (leaveRequest.user_id !== user.id && !isAdminUser) {
      return NextResponse.json({ success: false, error: "Bạn không thể xóa yêu cầu của người khác" }, { status: 403 })
    }

    if (leaveRequest.status !== "PENDING" && !isAdminUser) {
      return NextResponse.json({ success: false, error: "Chỉ có thể xóa yêu cầu đang chờ duyệt" }, { status: 400 })
    }

    await prisma.leave_requests.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: "Đã xóa yêu cầu nghỉ phép"
    })

  } catch (error) {
    console.error("Error deleting leave request:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
