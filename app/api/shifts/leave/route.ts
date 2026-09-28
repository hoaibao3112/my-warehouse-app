import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { startOfMonth, endOfMonth, format } from "date-fns"
import { vi } from "date-fns/locale"
import { createNotification } from "@/lib/notification-service"

// Maximum leave days per month for fulltime employees
const MAX_LEAVE_DAYS_PER_MONTH = 2

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // Optional filter by status
    const type = searchParams.get("type") // "all" for managers to see all requests
    const forApproval = searchParams.get("for_approval") === "true" // For managers to see pending requests
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    // Build where clause
    const where: any = {}

    // Only add date filter if dates are provided
    if (startDateParam || endDateParam) {
      where.leave_date = {}
      if (startDateParam) {
        where.leave_date.gte = new Date(startDateParam)
      }
      if (endDateParam) {
        where.leave_date.lte = new Date(endDateParam)
      }
    }

    // If type=all or for_approval, show all requests in warehouse (for managers)
    if (type === "all" || forApproval) {
      const userWithWarehouse = await prisma.users.findUnique({
        where: { id: user.id },
        select: { warehouse_id: true, role: true }
      })

      // Check role first - ADMIN and HR can access without warehouse
      const allowedRoles = ["WAREHOUSE_MANAGER", "ADMIN", "GENERAL_MANAGER", "HR"]
      if (!allowedRoles.includes(userWithWarehouse?.role || "")) {
        return NextResponse.json({ success: false, error: "Không có quyền" }, { status: 403 })
      }

      // HR and ADMIN can see all warehouses, managers only see their own
      if (userWithWarehouse?.role === "HR" || userWithWarehouse?.role === "ADMIN") {
        // Don't filter by warehouse - see all
      } else if (userWithWarehouse?.warehouse_id) {
        where.warehouse_id = userWithWarehouse.warehouse_id
      } else {
        return NextResponse.json({ success: false, error: "Không có quyền" }, { status: 403 })
      }
      // If for_approval (but not type=all), only show pending
      if (forApproval && type !== "all") {
        where.status = "PENDING"
      }
    } else {
      // Show user's own requests
      where.user_id = user.id
      if (status) {
        where.status = status
      }
    }

    const leaveRequests = await prisma.leave_requests.findMany({
      where,
      include: {
        users_requester: {
          select: { id: true, full_name: true, email: true }
        },
        work_shifts: {
          select: { id: true, shift_name: true, shift_code: true, start_time: true, end_time: true }
        },
        users_approver: {
          select: { id: true, full_name: true }
        }
      },
      orderBy: { leave_date: "asc" }
    })

    // Count approved leaves this month for the user
    const currentMonthStart = startOfMonth(new Date())
    const currentMonthEnd = endOfMonth(new Date())

    const approvedCount = await prisma.leave_requests.count({
      where: {
        user_id: user.id,
        leave_date: {
          gte: currentMonthStart,
          lte: currentMonthEnd,
        },
        status: "APPROVED"
      }
    })

    // Count pending leaves this month
    const pendingCount = await prisma.leave_requests.count({
      where: {
        user_id: user.id,
        leave_date: {
          gte: currentMonthStart,
          lte: currentMonthEnd,
        },
        status: "PENDING"
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        requests: leaveRequests,
        stats: {
          approved: approvedCount,
          pending: pendingCount,
          remaining: Math.max(0, MAX_LEAVE_DAYS_PER_MONTH - approvedCount - pendingCount),
          maxPerMonth: MAX_LEAVE_DAYS_PER_MONTH
        }
      }
    })

  } catch (error) {
    console.error("Error fetching leave requests:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { leave_date, work_shift_id, reason } = body

    if (!leave_date) {
      return NextResponse.json({ success: false, error: "Ngày nghỉ phép là bắt buộc" }, { status: 400 })
    }

    // Get user info
    const userInfo = await prisma.users.findUnique({
      where: { id: user.id },
      select: { warehouse_id: true, employment_type: true, full_name: true }
    })

    if (!userInfo?.warehouse_id) {
      return NextResponse.json({ success: false, error: "Bạn chưa được phân bổ vào kho" }, { status: 400 })
    }

    // Only fulltime employees can request leave
    if (userInfo.employment_type !== "FULLTIME") {
      return NextResponse.json({
        success: false,
        error: "Chỉ nhân viên toàn thời gian (fulltime) mới được xin nghỉ phép"
      }, { status: 400 })
    }

    const leaveDate = new Date(leave_date)
    const startDate = startOfMonth(leaveDate)
    const endDate = endOfMonth(leaveDate)

    // Check if already requested for this date
    const existingRequest = await prisma.leave_requests.findUnique({
      where: {
        user_id_leave_date: {
          user_id: user.id,
          leave_date: leaveDate
        }
      }
    })

    if (existingRequest) {
      return NextResponse.json({
        success: false,
        error: "Bạn đã có yêu cầu nghỉ phép cho ngày này"
      }, { status: 400 })
    }

    // Count approved + pending leaves this month
    const existingCount = await prisma.leave_requests.count({
      where: {
        user_id: user.id,
        leave_date: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ["APPROVED", "PENDING"]
        }
      }
    })

    if (existingCount >= MAX_LEAVE_DAYS_PER_MONTH) {
      return NextResponse.json({
        success: false,
        error: `Bạn đã sử dụng hết ${MAX_LEAVE_DAYS_PER_MONTH} ngày phép trong tháng này`
      }, { status: 400 })
    }

    // Create leave request
    const leaveRequest = await prisma.leave_requests.create({
      data: {
        user_id: user.id,
        warehouse_id: userInfo.warehouse_id,
        leave_date: leaveDate,
        work_shift_id: work_shift_id || null,
        reason: reason || null,
        status: "PENDING"
      },
      include: {
        work_shifts: {
          select: { shift_name: true }
        }
      }
    })

    // Send notifications to HR and Warehouse Manager
    try {
      const formattedDate = format(leaveDate, "dd/MM/yyyy (EEEE)", { locale: vi })

      // Find HR users to notify
      const hrUsers = await prisma.users.findMany({
        where: { role: "HR" },
        select: { id: true }
      })

      // Find Warehouse Manager of this warehouse
      const warehouseManagers = await prisma.users.findMany({
        where: {
          warehouse_id: userInfo.warehouse_id,
          role: "WAREHOUSE_MANAGER"
        },
        select: { id: true }
      })

      // Collect all recipient IDs
      const recipientIds = [
        ...hrUsers.map(u => u.id),
        ...warehouseManagers.map(u => u.id)
      ]

      if (recipientIds.length > 0) {
        await createNotification({
          userId: recipientIds,
          type: "LEAVE_REQUEST_PENDING",
          title: "Yêu cầu nghỉ phép mới",
          message: `${userInfo.full_name} xin nghỉ phép ngày ${formattedDate}${reason ? `. Lý do: ${reason}` : ""}`,
          redirectUrl: "/hr/leave-requests",
          data: { requestId: leaveRequest.id, leaveDate: leaveDate.toISOString() }
        })
      }
    } catch (notifError) {
      console.error("Failed to send leave request notification:", notifError)
    }

    return NextResponse.json({
      success: true,
      message: "Đã gửi yêu cầu nghỉ phép",
      data: leaveRequest
    })

  } catch (error) {
    console.error("Error creating leave request:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
