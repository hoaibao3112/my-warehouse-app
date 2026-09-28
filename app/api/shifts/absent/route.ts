import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { getVietnamToday, getVietnamNow } from "@/lib/server-time"

/**
 * GET /api/shifts/absent
 * 
 * Get list of absent employees - employees who have shift assignments but no shift sessions
 * for past dates (they didn't check in at all)
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

    // Only WAREHOUSE_MANAGER, GENERAL_MANAGER and ADMIN can view absent employees
    if (user.role !== "WAREHOUSE_MANAGER" && user.role !== "ADMIN" && user.role !== "GENERAL_MANAGER") {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const fromDate = searchParams.get("fromDate")
    const toDate = searchParams.get("toDate")
    const warehouseId = searchParams.get("warehouseId")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    // Get today's date (Vietnam time)
    const today = getVietnamToday()

    // Build where clause for assignments
    const assignmentWhere: any = {
      assigned_date: {
        lt: today, // Only past dates
      },
    }

    // Apply date filters
    if (fromDate) {
      const from = new Date(fromDate)
      assignmentWhere.assigned_date = {
        ...assignmentWhere.assigned_date,
        gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0)),
      }
    }
    if (toDate) {
      const to = new Date(toDate)
      assignmentWhere.assigned_date = {
        ...assignmentWhere.assigned_date,
        lte: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999)),
      }
    }

    // Warehouse filter
    if (user.role === "WAREHOUSE_MANAGER") {
      assignmentWhere.warehouse_id = user.warehouse_id
    } else if (warehouseId) {
      assignmentWhere.warehouse_id = warehouseId
    }

    // Get all past assignments
    const allAssignments = await prisma.shift_assignments.findMany({
      where: assignmentWhere,
      include: {
        work_shifts: true,
        users_assigned: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        assigned_date: "desc",
      },
    })

    // Get all existing sessions for these dates and users
    const assignmentKeys = allAssignments.map(a => ({
      user_id: a.user_id,
      session_date: a.assigned_date,
    }))

    // Get sessions matching any of these user_id + session_date combinations
    let existingSessions: { user_id: string; session_date: Date }[] = []
    
    if (assignmentKeys.length > 0) {
      existingSessions = await prisma.shift_sessions.findMany({
        where: {
          OR: assignmentKeys.map(k => ({
            user_id: k.user_id,
            session_date: k.session_date,
          })),
        },
        select: {
          user_id: true,
          session_date: true,
        },
      })
    }

    // Create a set of existing session keys for quick lookup
    const sessionKeySet = new Set(
      existingSessions.map(s => `${s.user_id}_${s.session_date.toISOString()}`)
    )

    // Filter assignments that don't have corresponding sessions (absent)
    const absentAssignments = allAssignments.filter(a => {
      const key = `${a.user_id}_${a.assigned_date.toISOString()}`
      return !sessionKeySet.has(key)
    })

    // Apply pagination
    const total = absentAssignments.length
    const paginatedAbsent = absentAssignments.slice((page - 1) * limit, page * limit)

    // Transform to a format similar to shift sessions
    const absentList = paginatedAbsent.map(a => ({
      id: a.id, // Use assignment ID as identifier
      assignment_id: a.id,
      user_id: a.user_id,
      session_date: a.assigned_date,
      work_shift_id: a.work_shift_id,
      warehouse_id: a.warehouse_id,
      check_in_time: null,
      check_out_time: null,
      status: "ABSENT" as const,
      notes: a.notes,
      users_shift_sessions_user_idTousers: a.users_assigned,
      warehouses: a.warehouses,
      work_shifts: a.work_shifts,
    }))

    return NextResponse.json({
      success: true,
      data: absentList,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Get absent employees error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
