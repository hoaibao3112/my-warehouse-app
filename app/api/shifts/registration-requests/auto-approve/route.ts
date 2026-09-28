import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { 
  autoApprovePendingRequests, 
  isManagerApprovalPeriodEnded,
  MANAGER_APPROVAL_DEADLINE,
  REGISTRATION_PERIOD_END 
} from "@/lib/shift-registration-validation"
import { getVietnamNow } from "@/lib/server-time"

/**
 * POST /api/shifts/registration-requests/auto-approve
 * 
 * Automatically approve all pending shift registration requests
 * after the manager approval deadline (day 29).
 * 
 * Timeline:
 * - Day 20-28: Staff can register shifts for next month
 * - Day 29: Manager's last day to approve/reject
 * - Day 30+: All pending requests are auto-approved
 * 
 * This endpoint can be:
 * 1. Called manually by admin
 * 2. Triggered by cron job daily
 * 3. Called when manager opens the approval page
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Only managers, general managers and admins can trigger auto-approve
    const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only managers can trigger auto-approval" },
        { status: 403 }
      )
    }

    const now = getVietnamNow()
    const currentDay = now.getDate()

    // Check if we're past the approval deadline
    if (!isManagerApprovalPeriodEnded()) {
      return NextResponse.json({
        success: true,
        message: `Chưa đến hạn tự động duyệt. Quản lý có thể duyệt đến hết ngày ${MANAGER_APPROVAL_DEADLINE}.`,
        currentDay,
        deadline: MANAGER_APPROVAL_DEADLINE,
        approvedCount: 0,
      })
    }

    // Run auto-approval
    const result = await autoApprovePendingRequests()

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error || "Failed to auto-approve requests" 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.approvedCount > 0 
        ? `Đã tự động phê duyệt ${result.approvedCount} đơn đăng ký ca.`
        : "Không có đơn nào cần tự động phê duyệt.",
      approvedCount: result.approvedCount,
      currentDay,
    })
  } catch (error) {
    console.error("Error in auto-approve endpoint:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/shifts/registration-requests/auto-approve
 * 
 * Get status of auto-approval timeline
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const now = getVietnamNow()
    const currentDay = now.getDate()
    const isPastDeadline = isManagerApprovalPeriodEnded()

    return NextResponse.json({
      success: true,
      data: {
        currentDay,
        registrationPeriodEnd: REGISTRATION_PERIOD_END,
        managerApprovalDeadline: MANAGER_APPROVAL_DEADLINE,
        isPastDeadline,
        message: isPastDeadline
          ? "Đã quá hạn duyệt. Các đơn chưa duyệt sẽ được tự động phê duyệt."
          : `Quản lý có thể duyệt đến hết ngày ${MANAGER_APPROVAL_DEADLINE}.`,
      },
    })
  } catch (error) {
    console.error("Error getting auto-approve status:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
