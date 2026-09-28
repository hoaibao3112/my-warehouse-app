import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import {
  autoApprovePendingRequests,
  isManagerApprovalPeriodEnded,
  MANAGER_APPROVAL_DEADLINE
} from "@/lib/shift-registration-validation"

// GET /api/shifts/registration-requests - Get pending registration requests for manager
/**
 * @swagger
 * /api/shifts/registration-requests:
 *   get:
 *     summary: List Registration Requests
 *     description: List pending shift registration requests for manager approval.
 *     tags: [Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouse_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, ALL]
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2023-12"
 *       - in: query
 *         name: work_shift_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of requests
 *       403:
 *         description: Forbidden
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    // Only managers, general managers and admins can view registration requests
    const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only managers can view registration requests" },
        { status: 403 }
      )
    }

    // Auto-approve pending requests if past deadline (day 29)
    let autoApproveResult = null
    if (isManagerApprovalPeriodEnded()) {
      autoApproveResult = await autoApprovePendingRequests()
      if (autoApproveResult.approvedCount > 0) {
        console.log(`Auto-approved ${autoApproveResult.approvedCount} requests on page load`)
      }
    }

    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get("warehouse_id")
    const status = searchParams.get("status") || "PENDING"
    const month = searchParams.get("month") // format: YYYY-MM
    const workShiftId = searchParams.get("work_shift_id")

    // Build filter conditions
    const whereConditions: Record<string, unknown> = {}

    // Filter by status
    if (status && status !== "ALL") {
      whereConditions.status = status
    }

    // Filter by warehouse
    if (warehouseId) {
      whereConditions.warehouse_id = warehouseId
    } else if (user.role !== "ADMIN" && user.warehouse_id) {
      // Non-admin managers can only see their warehouse
      whereConditions.warehouse_id = user.warehouse_id
    }

    // Filter by month
    if (month) {
      const [year, monthNum] = month.split("-").map(Number)
      const startDate = new Date(year, monthNum - 1, 1)
      const endDate = new Date(year, monthNum, 0)
      whereConditions.requested_date = {
        gte: startDate,
        lte: endDate,
      }
    }

    // Filter by work shift
    if (workShiftId) {
      whereConditions.work_shift_id = workShiftId
    }

    const requests = await prisma.shift_registration_requests.findMany({
      where: whereConditions,
      include: {
        users_requester: {
          select: {
            id: true,
            full_name: true,
            email: true,
            employment_type: true,
          },
        },
        work_shifts: {
          select: {
            id: true,
            shift_name: true,
            shift_code: true,
            start_time: true,
            end_time: true,
          },
        },
        warehouses: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        users_approver: {
          select: {
            id: true,
            full_name: true,
          },
        },
      },
      orderBy: [
        { status: "asc" }, // PENDING first
        { requested_date: "asc" },
        { created_at: "asc" },
      ],
    })

    // Group by date for easier display
    const groupedByDate = requests.reduce((acc, req) => {
      const dateKey = req.requested_date.toISOString().split("T")[0]
      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(req)
      return acc
    }, {} as Record<string, typeof requests>)

    // Count stats
    const stats = {
      total: requests.length,
      pending: requests.filter((r) => r.status === "PENDING").length,
      approved: requests.filter((r) => r.status === "APPROVED").length,
      rejected: requests.filter((r) => r.status === "REJECTED").length,
    }

    return NextResponse.json({
      success: true,
      data: requests,
      groupedByDate,
      stats,
      approvalDeadline: MANAGER_APPROVAL_DEADLINE,
      isPastDeadline: isManagerApprovalPeriodEnded(),
      autoApproved: autoApproveResult?.approvedCount || 0,
    })
  } catch (error) {
    console.error("Error fetching registration requests:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
