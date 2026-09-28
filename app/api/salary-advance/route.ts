import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { startOfMonth, endOfMonth } from "date-fns"
import { sendNotificationWithFCM } from "@/lib/notification-helper"

// GET /api/salary-advance - Get salary advance requests
// For ATTENDANCE_STAFF: their own requests
// For HR/ADMIN: all requests
export async function GET(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const status = searchParams.get("status")
        const startDateParam = searchParams.get("startDate")
        const endDateParam = searchParams.get("endDate")

        // Get user role
        const userRecord = await prisma.users.findUnique({
            where: { id: user.id },
            select: { role: true, warehouse_id: true }
        })

        const isHRorAdmin = userRecord?.role === "HR" || userRecord?.role === "ADMIN"

        // Build where clause
        const where: any = {}

        // Only add date filter if dates are provided
        if (startDateParam || endDateParam) {
            where.created_at = {}
            if (startDateParam) {
                where.created_at.gte = new Date(startDateParam)
            }
            if (endDateParam) {
                where.created_at.lte = new Date(endDateParam)
            }
        }

        // HR and ADMIN see all requests, others see only own
        if (!isHRorAdmin) {
            where.user_id = user.id
        }

        if (status && status !== "all") {
            where.status = status
        }

        const requests = await prisma.salary_advance_requests.findMany({
            where,
            include: {
                users_requester: {
                    select: { id: true, full_name: true, email: true, employee_code: true, employment_type: true }
                },
                users_approver: {
                    select: { id: true, full_name: true }
                },
                users_hr_approver: {
                    select: { id: true, full_name: true }
                },
                users_admin_approver: {
                    select: { id: true, full_name: true }
                },
                warehouses: {
                    select: { id: true, name: true, code: true }
                }
            },
            orderBy: { created_at: "desc" }
        })

        return NextResponse.json({
            success: true,
            data: requests
        })

    } catch (error) {
        console.error("Error fetching salary advance requests:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}

// POST /api/salary-advance - Create salary advance request
// Only ATTENDANCE_STAFF can create
export async function POST(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { reason, desired_date, amount } = body

        // Validate required fields
        if (!reason || !reason.trim()) {
            return NextResponse.json({ success: false, error: "Lý do là bắt buộc" }, { status: 400 })
        }

        if (!desired_date) {
            return NextResponse.json({ success: false, error: "Ngày muốn nhận là bắt buộc" }, { status: 400 })
        }

        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, error: "Số tiền phải lớn hơn 0" }, { status: 400 })
        }

        // Get user info
        const userInfo = await prisma.users.findUnique({
            where: { id: user.id },
            select: { warehouse_id: true, role: true, full_name: true }
        })

        if (!userInfo?.warehouse_id) {
            return NextResponse.json({ success: false, error: "Bạn chưa được phân bổ vào cửa hàng" }, { status: 400 })
        }

        // Create request
        const salaryAdvanceRequest = await prisma.salary_advance_requests.create({
            data: {
                user_id: user.id,
                warehouse_id: userInfo.warehouse_id,
                reason: reason.trim(),
                desired_date: new Date(desired_date),
                amount: amount,
                status: "PENDING"
            }
        })

        // Notify HR about new request (only HR, not ADMIN yet)
        try {
            const hrUsers = await prisma.users.findMany({
                where: {
                    role: "HR",
                    is_active: true
                },
                select: { id: true }
            })

            if (hrUsers.length > 0) {
                await sendNotificationWithFCM({
                    userId: hrUsers.map(u => u.id),
                    type: "SALARY_ADVANCE_CREATED",
                    title: "Yêu cầu ứng lương mới",
                    message: `${userInfo.full_name} đã tạo phiếu yêu cầu ứng lương`,
                    redirectUrl: "/hr/salary-advance",
                    data: { requestId: salaryAdvanceRequest.id }
                })
            }
        } catch (notifError) {
            console.error("Failed to send notification:", notifError)
        }

        return NextResponse.json({
            success: true,
            message: "Đã gửi yêu cầu ứng lương",
            data: salaryAdvanceRequest
        })

    } catch (error) {
        console.error("Error creating salary advance request:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}
