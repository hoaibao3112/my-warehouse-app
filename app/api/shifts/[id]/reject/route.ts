import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Only WAREHOUSE_MANAGER, GENERAL_MANAGER and ADMIN can reject shifts
    if (user.role !== "WAREHOUSE_MANAGER" && user.role !== "ADMIN" && user.role !== "GENERAL_MANAGER") {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const { id } = await params

    const body = await request.json()
    const { rejection_reason } = body

    if (!rejection_reason || rejection_reason.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Rejection reason is required" },
        { status: 400 }
      )
    }

    const shiftSession = await prisma.shift_sessions.findUnique({
      where: { id }
    })

    if (!shiftSession) {
      return NextResponse.json(
        { success: false, error: "Shift session not found" },
        { status: 404 }
      )
    }

    // Check permissions - WAREHOUSE_MANAGER and GENERAL_MANAGER can only reject their warehouse's shifts
    if (user.role === "WAREHOUSE_MANAGER" && shiftSession.warehouse_id !== user.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    // GENERAL_MANAGER must have access to warehouse
    if (user.role === "GENERAL_MANAGER" && !user.warehouseIds?.includes(shiftSession.warehouse_id)) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    // Can only reject PENDING_APPROVAL shifts
    if (shiftSession.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { success: false, error: `Cannot reject a ${shiftSession.status} shift` },
        { status: 400 }
      )
    }

    // Update shift session to REJECTED
    const updatedSession = await prisma.shift_sessions.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejection_reason,
        approved_by: user.id,
        approved_at: new Date()
      },
      include: {
        users_shift_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true
          }
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedSession
    })
  } catch (error) {
    console.error("Reject shift error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
