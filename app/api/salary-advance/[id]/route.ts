import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"
import { sendNotificationWithFCM } from "@/lib/notification-helper"
import { format } from "date-fns"
import { vi } from "date-fns/locale"

// PUT /api/salary-advance/[id] - Approve or reject salary advance request
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

        if (!action || !["approve", "reject"].includes(action)) {
            return NextResponse.json({ success: false, error: "Hành động không hợp lệ" }, { status: 400 })
        }

        // Check user role - only HR and ADMIN can approve/reject
        const userRecord = await prisma.users.findUnique({
            where: { id: user.id },
            select: { role: true, full_name: true }
        })

        if (!userRecord || (userRecord.role !== "HR" && userRecord.role !== "ADMIN")) {
            return NextResponse.json({ success: false, error: "Không có quyền phê duyệt" }, { status: 403 })
        }

        // Get the request
        const salaryRequest = await prisma.salary_advance_requests.findUnique({
            where: { id },
            include: {
                users_requester: {
                    select: { full_name: true }
                }
            }
        })

        if (!salaryRequest) {
            return NextResponse.json({ success: false, error: "Không tìm thấy yêu cầu" }, { status: 404 })
        }

        // Check current status and determine what action can be taken
        const currentStatus = salaryRequest.status
        const formattedAmount = new Intl.NumberFormat('vi-VN').format(Number(salaryRequest.amount))

        if (action === "approve") {
            // Two-step approval process:
            // Step 1: HR approves (PENDING -> HR_APPROVED)
            // Step 2: Admin approves payment (HR_APPROVED -> APPROVED)

            if (currentStatus === "PENDING") {
                // Step 1: HR Approval
                if (userRecord.role !== "HR") {
                    return NextResponse.json({
                        success: false,
                        error: "Chỉ HR mới có thể duyệt yêu cầu ở bước này"
                    }, { status: 403 })
                }

                await prisma.salary_advance_requests.update({
                    where: { id },
                    data: {
                        status: "HR_APPROVED",
                        hr_approved_by: user.id,
                        hr_approved_at: new Date(),
                        updated_at: new Date()
                    }
                })

                // Send notification to requester and Admin
                try {
                    // Notify requester
                    await sendNotificationWithFCM({
                        userId: salaryRequest.user_id,
                        type: "SALARY_ADVANCE_APPROVED",
                        title: "HR đã duyệt yêu cầu",
                        message: `Yêu cầu ứng lương đã được HR ${userRecord.full_name} phê duyệt. Chờ Admin chi tiền.`,
                        redirectUrl: "/attendance/forms",
                        data: { requestId: id }
                    })

                    // Notify Admin to process payment
                    const adminUsers = await prisma.users.findMany({
                        where: {
                            role: "ADMIN",
                            is_active: true
                        },
                        select: { id: true }
                    })

                    if (adminUsers.length > 0) {
                        await sendNotificationWithFCM({
                            userId: adminUsers.map(u => u.id),
                            type: "SALARY_ADVANCE_CREATED",
                            title: "Yêu cầu ứng lương cần chi tiền",
                            message: `${salaryRequest.users_requester.full_name} đã được HR duyệt. Cần chi tiền.`,
                            redirectUrl: "/hr/salary-advance",
                            data: { requestId: id }
                        })
                    }
                } catch (notifError) {
                    console.error("Failed to send notification:", notifError)
                }

                return NextResponse.json({
                    success: true,
                    message: `Đã duyệt yêu cầu ứng lương của ${salaryRequest.users_requester.full_name}. Chờ Admin chi tiền.`
                })

            } else if (currentStatus === "HR_APPROVED") {
                // Step 2: Admin Payment Approval
                if (userRecord.role !== "ADMIN") {
                    return NextResponse.json({
                        success: false,
                        error: "Chỉ Admin mới có thể duyệt chi tiền"
                    }, { status: 403 })
                }

                await prisma.salary_advance_requests.update({
                    where: { id },
                    data: {
                        status: "APPROVED",
                        admin_approved_by: user.id,
                        admin_approved_at: new Date(),
                        updated_at: new Date()
                    }
                })

                // Send notification to requester
                try {
                    await sendNotificationWithFCM({
                        userId: salaryRequest.user_id,
                        type: "SALARY_ADVANCE_APPROVED",
                        title: "Yêu cầu đã được chi tiền",
                        message: `Yêu cầu ứng lương đã được Admin ${userRecord.full_name} chi tiền. Yêu cầu hoàn tất.`,
                        redirectUrl: "/attendance/forms",
                        data: { requestId: id }
                    })
                } catch (notifError) {
                    console.error("Failed to send notification:", notifError)
                }

                return NextResponse.json({
                    success: true,
                    message: `Đã chi tiền cho ${salaryRequest.users_requester.full_name}`
                })

            } else {
                return NextResponse.json({
                    success: false,
                    error: "Yêu cầu này đã được xử lý hoặc ở trạng thái không hợp lệ"
                }, { status: 400 })
            }
        }

        if (action === "reject") {
            // Both HR and Admin can reject at any step
            if (currentStatus !== "PENDING" && currentStatus !== "HR_APPROVED") {
                return NextResponse.json({
                    success: false,
                    error: "Yêu cầu này đã được xử lý"
                }, { status: 400 })
            }
            await prisma.salary_advance_requests.update({
                where: { id },
                data: {
                    status: "REJECTED",
                    approved_by: user.id,
                    approved_at: new Date(),
                    rejection_reason: rejection_reason || undefined,
                    updated_at: new Date()
                }
            })

            // Send notification to requester
            try {
                await sendNotificationWithFCM({
                    userId: salaryRequest.user_id,
                    type: "SALARY_ADVANCE_REJECTED",
                    title: "Yêu cầu ứng lương bị từ chối",
                    message: `Yêu cầu ứng lương bị từ chối${rejection_reason ? `. Lý do: ${rejection_reason}` : ""}`,
                    redirectUrl: "/attendance/forms",
                    data: { requestId: id }
                })
            } catch (notifError) {
                console.error("Failed to send notification:", notifError)
            }

            return NextResponse.json({
                success: true,
                message: `Đã từ chối yêu cầu ứng lương của ${salaryRequest.users_requester.full_name}`
            })
        }

    } catch (error) {
        console.error("Error updating salary advance request:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}

// DELETE /api/salary-advance/[id] - Cancel own pending request
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

        const salaryRequest = await prisma.salary_advance_requests.findUnique({
            where: { id }
        })

        if (!salaryRequest) {
            return NextResponse.json({ success: false, error: "Không tìm thấy yêu cầu" }, { status: 404 })
        }

        // Only requester can cancel
        if (salaryRequest.user_id !== user.id) {
            return NextResponse.json({ success: false, error: "Bạn không thể hủy yêu cầu của người khác" }, { status: 403 })
        }

        if (salaryRequest.status !== "PENDING") {
            return NextResponse.json({ success: false, error: "Chỉ có thể hủy yêu cầu đang chờ duyệt" }, { status: 400 })
        }

        // Delete the request instead of changing status
        await prisma.salary_advance_requests.delete({
            where: { id }
        })

        return NextResponse.json({
            success: true,
            message: "Đã hủy yêu cầu ứng lương"
        })

    } catch (error) {
        console.error("Error cancelling salary advance request:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}
