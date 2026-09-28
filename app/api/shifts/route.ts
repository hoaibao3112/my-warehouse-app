import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isAdmin, isWarehouseManager, isGeneralManager, isHR } from "@/lib/auth"

/**
 * @swagger
 * /api/shifts:
 *   get:
 *     summary: List Shift Sessions
 *     tags: [Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [IN_PROGRESS, PENDING_APPROVAL, COMPLETED, REJECTED]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of shift sessions
 *       403:
 *         description: Insufficient permissions
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

    // Only WAREHOUSE_MANAGER, GENERAL_MANAGER, HR, and ADMIN can view shifts
    if (!isWarehouseManager(user) && !isGeneralManager(user) && !isHR(user) && !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") // IN_PROGRESS, PENDING_APPROVAL, COMPLETED, REJECTED
    const userId = searchParams.get("userId")
    const warehouseId = searchParams.get("warehouseId")
    const fromDate = searchParams.get("fromDate")
    const toDate = searchParams.get("toDate")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (userId) {
      where.user_id = userId
    }

    // Warehouse filtering based on role
    if (isHR(user)) {
      // HR can see all warehouses - no filter
      if (warehouseId) {
        where.warehouse_id = warehouseId
      }
    } else if (isGeneralManager(user)) {
      // GENERAL_MANAGER can only see shifts from their assigned warehouses
      const assignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: user.id },
        select: { warehouse_id: true }
      })
      const assignedWarehouseIds = assignments.map(a => a.warehouse_id)

      if (warehouseId) {
        // Check if requested warehouse is in their assigned list
        if (!assignedWarehouseIds.includes(warehouseId)) {
          return NextResponse.json(
            { success: false, error: "You don't have access to this warehouse" },
            { status: 403 }
          )
        }
        where.warehouse_id = warehouseId
      } else {
        // Filter to only their assigned warehouses
        where.warehouse_id = { in: assignedWarehouseIds }
      }
    } else if (isWarehouseManager(user)) {
      // WAREHOUSE_MANAGER can only see their warehouse
      where.warehouse_id = user.warehouseId
    } else if (isAdmin(user)) {
      // ADMIN can see all warehouses
      if (warehouseId) {
        where.warehouse_id = warehouseId
      }
    }

    if (fromDate || toDate) {
      where.session_date = {}
      if (fromDate) {
        where.session_date.gte = new Date(fromDate)
      }
      if (toDate) {
        const toDateObj = new Date(toDate)
        toDateObj.setHours(23, 59, 59, 999)
        where.session_date.lte = toDateObj
      }
    }

    // Get total count
    const total = await prisma.shift_sessions.count({ where })

    // Get shifts with pagination
    const shifts = await prisma.shift_sessions.findMany({
      where,
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
      },
      orderBy: {
        session_date: "desc"
      },
      skip: (page - 1) * limit,
      take: limit
    })

    return NextResponse.json({
      success: true,
      data: shifts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error("Get shifts error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
