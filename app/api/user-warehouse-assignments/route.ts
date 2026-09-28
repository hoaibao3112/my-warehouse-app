import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isAdmin, isGeneralManager } from "@/lib/auth"

/**
 * GET /api/user-warehouse-assignments
 * Fetch warehouse assignments for a user
 * Required query param: userId
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    // Security: Only admin or the user themselves can query assignments
    if (user.id !== userId && !isAdmin(user)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const assignments = await prisma.user_warehouse_assignments.findMany({
      where: { user_id: userId },
      include: {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            location: true,
            is_active: true
          }
        }
      },
      orderBy: [
        { is_primary: 'desc' },
        { created_at: 'desc' }
      ]
    })

    // Transform to camelCase
    const transformedAssignments = assignments.map(a => ({
      id: a.id,
      userId: a.user_id,
      warehouseId: a.warehouse_id,
      assignedBy: a.assigned_by,
      assignedAt: a.assigned_at,
      isPrimary: a.is_primary,
      createdAt: a.created_at,
      warehouse: {
        id: a.warehouses.id,
        code: a.warehouses.code,
        name: a.warehouses.name,
        type: a.warehouses.type,
        location: a.warehouses.location,
        isActive: a.warehouses.is_active
      }
    }))

    return NextResponse.json({ success: true, data: transformedAssignments })
  } catch (error: any) {
    console.error('[API user-warehouse-assignments GET] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/user-warehouse-assignments
 * Assign warehouses to GENERAL_MANAGER or WAREHOUSE_MANAGER users
 * Body: { userId: string, warehouseIds: string[], primaryWarehouseId?: string }
 * Auth: Admin or GENERAL_MANAGER (GM can only assign STORE warehouses)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    // Admin or GENERAL_MANAGER can assign warehouses
    if (!user || (!isAdmin(user) && !isGeneralManager(user))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const body = await request.json()
    const { userId, warehouseIds, primaryWarehouseId } = body

    // Validation
    if (!userId || !warehouseIds || !Array.isArray(warehouseIds) || warehouseIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: "userId and warehouseIds (non-empty array) are required"
      }, { status: 400 })
    }

    // Verify target user exists and is GENERAL_MANAGER or WAREHOUSE_MANAGER
    const targetUser = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, full_name: true }
    })

    if (!targetUser) {
      return NextResponse.json({
        success: false,
        error: "User not found"
      }, { status: 404 })
    }

    if (targetUser.role !== 'GENERAL_MANAGER' && targetUser.role !== 'WAREHOUSE_MANAGER') {
      return NextResponse.json({
        success: false,
        error: "Only GENERAL_MANAGER and WAREHOUSE_MANAGER can have multiple warehouse assignments"
      }, { status: 400 })
    }

    // Verify all warehouses exist and check type restrictions
    const warehouses = await prisma.warehouses.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, type: true, name: true }
    })

    if (warehouses.length !== warehouseIds.length) {
      return NextResponse.json({
        success: false,
        error: "One or more warehouses not found"
      }, { status: 404 })
    }

    // If GENERAL_MANAGER is assigning (not Admin), check warehouse restrictions
    // GENERAL_MANAGER can only assign STORE warehouses (not MAIN)
    if (isGeneralManager(user)) {
      const mainWarehouses = warehouses.filter(w => w.type === 'MAIN')
      if (mainWarehouses.length > 0) {
        return NextResponse.json({
          success: false,
          error: `GENERAL_MANAGER cannot assign MAIN warehouse. Found: ${mainWarehouses.map(w => w.name).join(', ')}`
        }, { status: 403 })
      }

      // Also check that GENERAL_MANAGER can only assign to their own managed warehouses
      if (!user.warehouseIds) {
        return NextResponse.json({
          success: false,
          error: "GENERAL_MANAGER has no warehouse assignments"
        }, { status: 403 })
      }

      const unauthorizedWarehouses = warehouseIds.filter(id => !user.warehouseIds?.includes(id))
      if (unauthorizedWarehouses.length > 0) {
        return NextResponse.json({
          success: false,
          error: "GENERAL_MANAGER can only assign warehouses they manage"
        }, { status: 403 })
      }
    }

    // GENERAL_MANAGER target users should only get STORE warehouses
    if (targetUser.role === 'GENERAL_MANAGER') {
      const mainWarehouses = warehouses.filter(w => w.type === 'MAIN')
      if (mainWarehouses.length > 0) {
        return NextResponse.json({
          success: false,
          error: `GENERAL_MANAGER cannot be assigned MAIN warehouses. Found: ${mainWarehouses.map(w => w.name).join(', ')}`
        }, { status: 400 })
      }
    }

    // Determine primary warehouse
    const primaryId = primaryWarehouseId || warehouseIds[0]
    if (!warehouseIds.includes(primaryId)) {
      return NextResponse.json({
        success: false,
        error: "Primary warehouse must be in the warehouseIds list"
      }, { status: 400 })
    }

    // Transaction: Delete old assignments and create new ones
    await prisma.$transaction([
      // Delete existing assignments
      prisma.user_warehouse_assignments.deleteMany({
        where: { user_id: userId }
      }),
      // Create new assignments
      prisma.user_warehouse_assignments.createMany({
        data: warehouseIds.map((warehouseId: string) => ({
          user_id: userId,
          warehouse_id: warehouseId,
          assigned_by: user.id,
          is_primary: warehouseId === primaryId
        }))
      }),
      // Update user's warehouse_id for backward compatibility
      prisma.users.update({
        where: { id: userId },
        data: { warehouse_id: primaryId }
      })
    ])

    console.log(`[API user-warehouse-assignments POST] Successfully assigned ${warehouseIds.length} warehouses to ${targetUser.role} ${targetUser.full_name} (${userId}) by ${user.role} ${user.id}`)

    return NextResponse.json({
      success: true,
      message: `Successfully assigned ${warehouseIds.length} warehouses to ${targetUser.role}`,
      data: {
        userId,
        warehouseIds,
        primaryWarehouseId: primaryId
      }
    })
  } catch (error: any) {
    console.error('[API user-warehouse-assignments POST] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
