import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isValidUUID } from "@/lib/utils"

export async function GET(
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

    const { id } = await params

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid shift session ID format" },
        { status: 400 }
      )
    }

    // 1. Try to find in attendance_sessions (NEW TABLE)
    const attendanceSession = await prisma.attendance_sessions.findUnique({
      where: { id },
      include: {
        users_attendance_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true,
            warehouse_id: true // Include warehouse_id to allow managers to view their staff's check-ins at other locations
          }
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        users_attendance_sessions_modified_byTousers: {
          select: {
            id: true,
            full_name: true,
            email: true
          }
        },
        work_shifts: true
      }
    })

    if (attendanceSession) {
      // Check permissions
      const isStaffRole = user.role === "STAFF" || user.role === "ATTENDANCE_STAFF" || user.role === "WAREHOUSE_STAFF"
      if (isStaffRole && attendanceSession.user_id !== user.id) {
        return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
      }
      if (user.role === "WAREHOUSE_MANAGER") {
        const isOwnShift = attendanceSession.user_id === user.id
        const isInTheirWarehouse = user.warehouseId && attendanceSession.warehouse_id === user.warehouseId
        // Also allow if the employee belongs to the manager's warehouse
        const isUserInManagerWarehouse = user.warehouseId && attendanceSession.users_attendance_sessions_user_idTousers?.warehouse_id === user.warehouseId

        if (!isOwnShift && !isInTheirWarehouse && !isUserInManagerWarehouse) {
          return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
        }
      }

      // Map to legacy format for frontend compatibility
      return NextResponse.json({
        success: true,
        data: {
          ...attendanceSession,
          type: 'attendance_session',
          // Legacy aliases
          users_shift_sessions_user_idTousers: attendanceSession.users_attendance_sessions_user_idTousers,
          warehouses: attendanceSession.warehouses,
          users_shift_sessions_modified_byTousers: attendanceSession.users_attendance_sessions_modified_byTousers,
          work_shifts: attendanceSession.work_shifts
        }
      })
    }

    // 2. Try to find in shift_sessions (LEGACY TABLE)
    const shiftSession = await prisma.shift_sessions.findUnique({
      where: { id },
      include: {
        users_shift_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true
          }
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        users_shift_sessions_modified_byTousers: {
          select: {
            id: true,
            full_name: true,
            email: true
          }
        },
        work_shifts: true
      }
    })

    if (shiftSession) {
      // Check permissions for shift_sessions - staff roles can only see their own shifts
      const isStaffRole = user.role === "STAFF" || user.role === "ATTENDANCE_STAFF" || user.role === "WAREHOUSE_STAFF"
      if (isStaffRole) {
        if (shiftSession.user_id !== user.id) {
          return NextResponse.json(
            { success: false, error: "Insufficient permissions" },
            { status: 403 }
          )
        }
      } else if (user.role === "WAREHOUSE_MANAGER") {
        const isOwnShift = shiftSession.user_id === user.id
        const isInTheirWarehouse = user.warehouseId && shiftSession.warehouse_id === user.warehouseId

        if (!isOwnShift && !isInTheirWarehouse) {
          return NextResponse.json(
            { success: false, error: "Insufficient permissions" },
            { status: 403 }
          )
        }
      } else if (user.role === "GENERAL_MANAGER") {
        const hasAccess = user.warehouseIds?.includes(shiftSession.warehouse_id)
        if (!hasAccess) {
          return NextResponse.json(
            { success: false, error: "Insufficient permissions" },
            { status: 403 }
          )
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          ...shiftSession,
          type: 'attendance_session'
        }
      })
    }

    // 3. Try to find in sales_sessions
    const salesSession = await prisma.sales_sessions.findUnique({
      where: { id },
      include: {
        users_sales_sessions_user_idTousers: {
          select: { id: true, full_name: true, email: true }
        },
        warehouses: {
          select: { id: true, code: true, name: true }
        },
        work_shifts: true,
        sales_invoices_new: {
          include: {
            items: { include: { product_recipes: true } }
          },
          orderBy: { created_at: "desc" }
        }
      }
    })

    if (!salesSession) {
      return NextResponse.json(
        { success: false, error: "Shift session not found" },
        { status: 404 }
      )
    }

    // Return sales session data
    return NextResponse.json({
      success: true,
      data: {
        ...salesSession,
        type: 'sales_session',
        invoices: salesSession.sales_invoices_new
      }
    })
  } catch (error) {
    console.error("Get shift detail error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
