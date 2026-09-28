import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getAuthToken } from '@/lib/auth-server'

/**
 * @swagger
 * /api/sales/invoices:
 *   get:
 *     summary: List Sales Invoices (Detailed)
 *     tags: [Sales]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices with details
 *       400:
 *         description: Forbidden
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user - supports both cookie and Bearer token
    const token = getAuthToken(request)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Get current user info
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, warehouse_id: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // For GENERAL_MANAGER, load warehouse assignments
    let warehouseIds: string[] = []
    if (user.role === 'GENERAL_MANAGER') {
      const assignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: user.id },
        select: { warehouse_id: true }
      })
      warehouseIds = assignments.map((a: any) => a.warehouse_id)
    }
    const userWithAssignments = { ...user, warehouseIds }

    // Build where clause for warehouse filtering
    const where: any = {}

    const searchParams = request.nextUrl.searchParams
    const warehouseIdParam = searchParams.get('warehouseId')

    // For non-admin users, enforce their assigned warehouse
    // For non-admin users, enforce their assigned warehouse
    if (user.role === "ADMIN") {
      if (warehouseIdParam) {
        where.warehouse_id = warehouseIdParam
      }
    } else if (user.role === "GENERAL_MANAGER") {
      // General Manager must have warehouse assignments
      if (!userWithAssignments.warehouseIds || userWithAssignments.warehouseIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "General Manager has no assigned warehouses" } as ApiResponse<null>,
          { status: 403 }
        )
      }

      if (warehouseIdParam) {
        // Verify access to requested warehouse
        if (userWithAssignments.warehouseIds.includes(warehouseIdParam)) {
          where.warehouse_id = warehouseIdParam
        } else {
          return NextResponse.json(
            { success: false, error: "Forbidden: No access to this warehouse" } as ApiResponse<null>,
            { status: 403 }
          )
        }
      } else {
        // Show data from all assigned warehouses
        where.warehouse_id = { in: userWithAssignments.warehouseIds }
      }
    } else {
      // MANAGER, STAFF, etc. locked to their single warehouse
      if (!user.warehouse_id) {
        return NextResponse.json(
          { success: false, error: "User not assigned to any warehouse" } as ApiResponse<null>,
          { status: 403 }
        )
      }
      where.warehouse_id = user.warehouse_id
    }

    const invoices = await prisma.sales_invoices.findMany({
      where,
      include: {
        items: {
          include: {
            product_recipes: {
              select: {
                name: true,
              },
            },
          },
        },
        users: {
          select: {
            full_name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    })

    const data = invoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      total_amount: inv.total_amount,
      discount_amount: inv.discount_amount,
      promotion_id: inv.promotion_id,
      gift_promotion_id: inv.gift_promotion_id,
      voucher_id: inv.voucher_id,
      notes: inv.notes,
      created_at: inv.created_at,
      created_by: inv.users?.full_name || inv.created_by, // Use full_name if available
      items: inv.items,
      has_vat: inv.has_vat,
      vat_amount: inv.vat_amount,
    }))

    return NextResponse.json(
      {
        success: true,
        data,
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi lấy hóa đơn' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
