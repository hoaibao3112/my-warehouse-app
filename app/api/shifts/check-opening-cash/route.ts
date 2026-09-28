import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { getVietnamToday } from "@/lib/server-time"

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const workShiftId = searchParams.get("work_shift_id")

    if (!workShiftId) {
      return NextResponse.json(
        { success: false, error: "work_shift_id is required" },
        { status: 400 }
      )
    }

    // Get user's warehouse, role and permissions
    const userWithWarehouse = await prisma.users.findUnique({
      where: { id: user.id },
      select: { warehouse_id: true, role: true, permissions: true }
    })

    if (!userWithWarehouse?.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "User is not assigned to a warehouse" },
        { status: 400 }
      )
    }

    // Check if user has sales permission
    const isStaff = userWithWarehouse.role === "STAFF"
    let permissions: string[] = []
    try {
      if (typeof userWithWarehouse.permissions === 'string') {
        permissions = JSON.parse(userWithWarehouse.permissions)
      } else if (Array.isArray(userWithWarehouse.permissions)) {
        permissions = userWithWarehouse.permissions as string[]
      }
    } catch (e) {
      permissions = []
    }
    const hasSalesPermission = permissions.includes("sales")
    const mustEnterOpeningCash = isStaff && hasSalesPermission

    // If user doesn't need to enter opening cash (no sales permission), return as if cash already entered
    if (!mustEnterOpeningCash) {
      return NextResponse.json({
        success: true,
        data: {
          hasOpeningCash: true, // Treat as already entered
          openingCash: null,
          enteredBy: null,
          notRequired: true // Flag to indicate cash entry is not required for this user
        }
      })
    }

    const today = getVietnamToday()

    // Check if any SALES session in the same shift today exists
    // In new model, creating a sales_sessions record means opening cash was entered
    const sessionWithOpeningCash = await prisma.sales_sessions.findFirst({
      where: {
        warehouse_id: userWithWarehouse.warehouse_id,
        work_shift_id: workShiftId,
        session_date: today,
        status: "IN_PROGRESS"
      },
      select: {
        id: true,
        opening_cash: true,
        users_sales_sessions_user_idTousers: {
          select: {
            full_name: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        hasOpeningCash: !!sessionWithOpeningCash,
        openingCash: sessionWithOpeningCash?.opening_cash?.toString() || null,
        enteredBy: sessionWithOpeningCash?.users_sales_sessions_user_idTousers?.full_name || null,
        notRequired: false
      }
    })

  } catch (error) {
    console.error("Error checking opening cash:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
