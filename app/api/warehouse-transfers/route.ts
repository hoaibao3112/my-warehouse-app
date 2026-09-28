import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { verifyToken, isStoreManager, canAccessWarehouse } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"

/**
 * @swagger
 * /api/warehouse-transfers:
 *   get:
 *     summary: List Warehouse Transfers
 *     tags: [Warehouse Ops]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromWarehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: toWarehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of transfers
 *   post:
 *     summary: Create Transfer
 *     tags: [Warehouse Ops]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromWarehouseId, toWarehouseId, items]
 *             properties:
 *               fromWarehouseId:
 *                 type: string
 *               toWarehouseId:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitId:
 *                       type: string
 *     responses:
 *       201:
 *         description: Transfer created
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

    // Get current user info from database
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
      // Allow access to ALL warehouses except MAIN
      const storeWarehouses = await prisma.warehouses.findMany({
        where: { type: { not: 'MAIN' }, is_active: true },
        select: { id: true }
      })
      warehouseIds = storeWarehouses.map((w: any) => w.id)
    }
    // Convert warehouse_id to warehouseId for consistency
    const userWithAssignments = {
      ...user,
      warehouseId: user.warehouse_id,
      warehouseIds
    }

    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
    const status = searchParams.get("status")
    let fromWarehouseId = searchParams.get("fromWarehouseId")
    let toWarehouseId = searchParams.get("toWarehouseId")

    // Check warehouse access permissions using canAccessWarehouse helper
    // This handles ADMIN, HR, GENERAL_MANAGER, and single-warehouse roles
    if (userWithAssignments.role !== "ADMIN" && userWithAssignments.role !== "HR") {
      if (!userWithAssignments.warehouseId && userWithAssignments.role !== "GENERAL_MANAGER") {
        return NextResponse.json(
          { success: false, error: "User not assigned to any warehouse" } as ApiResponse<null>,
          { status: 403 }
        )
      }

      // If filtering by specific warehouses, verify user has access to at least one
      if (fromWarehouseId || toWarehouseId) {
        const hasAccessFrom = fromWarehouseId ? canAccessWarehouse(userWithAssignments as any, fromWarehouseId) : false
        const hasAccessTo = toWarehouseId ? canAccessWarehouse(userWithAssignments as any, toWarehouseId) : false

        if (!hasAccessFrom && !hasAccessTo) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Cannot access other warehouse's transfers" } as ApiResponse<null>,
            { status: 403 }
          )
        }
      }
    }

    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize)
    const where: string[] = []
    const params: any[] = []

    // For non-admin/non-HR users, automatically filter to transfers related to their accessible warehouses
    if (userWithAssignments.role !== "ADMIN" && userWithAssignments.role !== "HR") {
      if (userWithAssignments.role === "GENERAL_MANAGER") {
        // GENERAL_MANAGER: filter by their assigned warehouses
        const accessibleWarehouseIds = userWithAssignments.warehouseIds || []
        if (accessibleWarehouseIds.length > 0) {
          const placeholders = accessibleWarehouseIds.map(() => "?").join(",")
          where.push(`(from_warehouse_id IN (${placeholders}) OR to_warehouse_id IN (${placeholders}))`)
          params.push(...accessibleWarehouseIds, ...accessibleWarehouseIds)
        }
      } else if (userWithAssignments.warehouseId) {
        // Single warehouse users
        where.push("(from_warehouse_id = ? OR to_warehouse_id = ?)")
        params.push(userWithAssignments.warehouseId, userWithAssignments.warehouseId)
      }
    }

    if (status) { where.push("status = ?::transfer_status"); params.push(status) }
    if (fromWarehouseId) { where.push("from_warehouse_id = ?"); params.push(fromWarehouseId) }
    if (toWarehouseId) { where.push("to_warehouse_id = ?"); params.push(toWarehouseId) }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
    const rows = (await query(`SELECT * FROM warehouse_transfers ${whereSql} ORDER BY transfer_number DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset])) as any[]
    const countRows = (await query(`SELECT COUNT(*) as cnt FROM warehouse_transfers ${whereSql}`, params)) as any[]
    const total = Number((countRows && countRows[0] && countRows[0].cnt) || rows.length)

    return NextResponse.json({ success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } as PaginatedResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const payload = token ? verifyToken(token) : null
    if (!payload) return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 403 })

    // Get current user info from database
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
      // Allow access to ALL warehouses except MAIN
      const storeWarehouses = await prisma.warehouses.findMany({
        where: { type: { not: 'MAIN' }, is_active: true },
        select: { id: true }
      })
      warehouseIds = storeWarehouses.map((w: any) => w.id)
    }
    // Convert warehouse_id to warehouseId for consistency
    const userWithAssignments = {
      ...user,
      warehouseId: user.warehouse_id,
      warehouseIds
    }

    const body = await request.json()
    const { fromWarehouseId, toWarehouseId, items } = body || {}
    if (!fromWarehouseId || !toWarehouseId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Invalid input" } as ApiResponse<null>, { status: 400 })
    }

    // If store manager, ensure they can only request from their warehouse
    if (isStoreManager(userWithAssignments as any) && !canAccessWarehouse(userWithAssignments as any, fromWarehouseId)) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const transferId = randomUUID()
    const transferNumber = `WT-${new Date().getFullYear()}-${Date.now()}`
    const now = getVietnamTime()
    const createdTxnIds: string[] = []

    await runTransaction(async () => {
      await query(`INSERT INTO warehouse_transfers (id, transfer_number, from_warehouse_id, to_warehouse_id, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?::transfer_status, ?, ?::timestamp, CURRENT_TIMESTAMP)`, [
        transferId,
        transferNumber,
        fromWarehouseId,
        toWarehouseId,
        'CHO_DUYET',
        user.id,
        now,
      ])

      for (const it of items) {
        const itemId = randomUUID()
        // Store original quantity and unit in transfer items
        await query(`INSERT INTO warehouse_transfer_items (id, transfer_id, product_id, quantity, unit_id, received_quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?::timestamp)`, [
          itemId,
          transferId,
          it.productId,
          it.quantity || 0,
          it.unitId || null,  // Store original unit
          0,
          now,
        ])

        // NOTE: Stock transactions are created during APPROVE, not here
        // We only reserve stock when admin approves the transfer
        // So we skip creating TRANSFER_OUT transaction here
      }
    })

    const transfer = (await query(`SELECT * FROM warehouse_transfers WHERE id = ?`, [transferId])) as any[]
    return NextResponse.json({ success: true, data: { ...(transfer && transfer[0]), transferNumber, createdTxnIds } } as ApiResponse<any>, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
