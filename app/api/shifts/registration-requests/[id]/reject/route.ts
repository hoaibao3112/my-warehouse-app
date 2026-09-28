import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"
import { sendNotificationWithFCM } from "@/lib/notification-helper"


// POST /api/shifts/registration-requests/[id]/reject - Reject a registration request
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

    // Only managers, general managers and admins can reject requests
    const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only managers can reject registration requests" },
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
    const { rejection_reason } = body

    // Find the registration request
    const registrationRequest = await prisma.shift_registration_requests.findUnique({
      where: { id },
      include: {
        users_requester: {
          select: { id: true, full_name: true },
        },
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

    // Update registration request status to rejected
    const updatedRequest = await prisma.shift_registration_requests.update({
      where: { id },
      data: {
        status: "REJECTED",
        approved_by: user.id,
        approved_at: new Date(),
        rejection_reason: rejection_reason || "Không đủ điều kiện",
      },
    })

    // Send notification to the requester (FCM + in-app)
    try {
      await sendNotificationWithFCM({
        userId: registrationRequest.user_id,
        type: "SHIFT_REGISTRATION_REJECTED",
        title: "Đăng ký ca bị từ chối",
        message: `Lý do: ${rejection_reason || "Không đủ điều kiện"}`,
        redirectUrl: "/admin/schedule",
        data: {
          requestId: id,
        },
        fcmType: "shift_pending",
      })
    } catch (notifError) {
      console.error("Failed to send notification:", notifError)
      // Don't fail the request if notification fails
    }


    return NextResponse.json({
      success: true,
      data: updatedRequest,
      message: `Đã từ chối yêu cầu đăng ký của ${registrationRequest.users_requester.full_name}`,
    })
  } catch (error) {
    console.error("Error rejecting registration request:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
