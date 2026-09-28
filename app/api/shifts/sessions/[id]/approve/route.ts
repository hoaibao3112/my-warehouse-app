import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isWarehouseManager, isAdmin } from "@/lib/auth"
import { isValidUUID } from "@/lib/utils"

// POST /api/shifts/sessions/[id]/approve - Approve or reject a shift session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user || (!isWarehouseManager(user) && !isAdmin(user))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Manager access required" },
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
    const { action, reason } = body

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Must be 'approve' or 'reject'" },
        { status: 400 }
      )
    }

    // Get the session
    const session = await prisma.shift_sessions.findUnique({
      where: { id },
      include: {
        users_shift_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            warehouse_id: true,
          },
        },
      },
    })

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      )
    }

    // Check warehouse access for managers
    if (isWarehouseManager(user) && session.warehouse_id !== user.warehouseId) {
      return NextResponse.json(
        { success: false, error: "You can only approve sessions in your warehouse" },
        { status: 403 }
      )
    }

    if (action === "approve") {
      // Update session status to COMPLETED
      const updatedSession = await prisma.shift_sessions.update({
        where: { id },
        data: {
          status: "COMPLETED",
          approved_by: user.id,
          approved_at: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: "Đã duyệt chấm công thành công",
        data: updatedSession,
      })
    } else {
      // Reject
      if (!reason?.trim()) {
        return NextResponse.json(
          { success: false, error: "Rejection reason is required" },
          { status: 400 }
        )
      }

      const updatedSession = await prisma.shift_sessions.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejection_reason: reason,
          approved_by: user.id,
          approved_at: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: "Đã từ chối chấm công",
        data: updatedSession,
      })
    }
  } catch (error) {
    console.error("Error approving/rejecting session:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
