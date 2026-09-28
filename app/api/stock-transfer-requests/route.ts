import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { randomUUID } from "crypto"
import { verifyToken, isStoreManager, isAdmin, isStaff, canAccessWarehouse } from "@/lib/auth"
import { TRANSFER_STATUS } from "@/lib/transfer-status"
import { prisma } from "@/lib/prisma"

/**
 * @swagger
 * /api/stock-transfer-requests:
 *   get:
 *     summary: List Stock Transfer Requests
 *     tags: [Warehouse Ops]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: toWarehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of requests
 *   post:
 *     summary: Create Stock Transfer Request
 *     description: Create request from Store to Main Warehouse.
 *     tags: [Warehouse Ops]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromWarehouseId, details]
 *             properties:
 *               fromWarehouseId:
 *                 type: string
 *               requiresApproval:
 *                 type: boolean
 *               details:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     requestedQuantity:
 *                       type: number
 *                     unitId:
 *                       type: string
 *     responses:
 *       201:
 *         description: Request created
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
    const status = searchParams.get("status")
    const toWarehouseId = searchParams.get("toWarehouseId")
    const fromWarehouseId = searchParams.get("fromWarehouseId")
    const categoryId = searchParams.get("categoryId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize)
    const where: any = {}

    // Filter by status if provided
    if (status) {
      where.status = status
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) {
        where.created_at.gte = new Date(startDate)
      }
      if (endDate) {
        // Add 1 day to include the end date fully if it's just a date string, or use as is if ISO
        // Simply parsing it: assumes client sends valid formatted date
        where.created_at.lte = new Date(endDate)
      }
    }

    // Kho Con chỉ xem yêu cầu của kho mình
    if (isStoreManager(user)) {
      where.to_warehouse_id = user.warehouseId
    }

    // Admin can filter by any warehouse
    if (isAdmin(user)) {
      if (toWarehouseId) {
        where.to_warehouse_id = toWarehouseId
      }
      if (fromWarehouseId) {
        where.from_warehouse_id = fromWarehouseId
      }
    }

    let total = await prisma.warehouse_transfers.count({ where })
    let rows = await prisma.warehouse_transfers.findMany({
      where,
      include: {
        warehouse_transfer_items: {
          include: {
            products: {
              select: { id: true, name: true, code: true, category_id: true }
            },
            product_units: {
              select: { id: true, name: true }
            }
          }
        },
        warehouses_warehouse_transfers_from_warehouse_idTowarehouses: {
          select: { id: true, name: true }
        },
        warehouses_warehouse_transfers_to_warehouse_idTowarehouses: {
          select: { id: true, name: true }
        }
      },
      orderBy: { created_at: 'desc' }
    })

    // Filter by category if provided
    if (categoryId) {
      rows = rows.filter((row: any) =>
        row.warehouse_transfer_items.some((item: any) => item.products?.category_id === categoryId)
      )
      total = rows.length
    }

    // Apply pagination after category filtering
    const paginatedRows = rows.slice(offset, offset + pageSize)

    // Map the response to include warehouse names and items
    const mappedRows = paginatedRows.map((row: any) => {
      const items = row.warehouse_transfer_items.map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name,
        product_code: item.products?.code,
        unit_id: item.unit_id,
        unit_name: item.product_units?.name,
        unit_code: item.product_units?.code || item.product_units?.name,
        requested_quantity: item.requested_quantity || item.quantity,
        quantity: item.requested_quantity || item.quantity,
        received_quantity: item.received_quantity,
        approved_quantity: item.approved_quantity,
        actual_received_quantity: item.actual_received_quantity,
        admin_approved_quantity: item.admin_approved_quantity,
        approved_unit_id: item.approved_unit_id,
        price: item.products?.price ? Number(item.products.price) : 0
      }))

      return {
        ...row,
        from_warehouse_name: row.warehouses_warehouse_transfers_from_warehouse_idTowarehouses?.name,
        to_warehouse_name: row.warehouses_warehouse_transfers_to_warehouse_idTowarehouses?.name,
        items: items,
        itemsList: items
      }
    })

    return NextResponse.json(
      {
        success: true,
        data: mappedRows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Only store managers, staff and admin can create requests
    if (!isStoreManager(user) && !isStaff(user) && !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ nhân viên kho con hoặc admin mới được tạo yêu cầu" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Verify staff belong to a warehouse
    if (isStaff(user) && !user.warehouseId) {
      return NextResponse.json(
        { success: false, error: "Nhân viên phải thuộc một kho" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { fromWarehouseId, details, requiresApproval } = body || {}

    if (!fromWarehouseId || !details || !Array.isArray(details) || details.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid input: fromWarehouseId and details are required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Determine initial status based on user role
    // Staff: Always requires approval (CHO_DUYET)
    // Manager: Can choose (based on requiresApproval flag)
    let initialStatus = TRANSFER_STATUS.CHO_DUYET
    if (isStoreManager(user) && requiresApproval === false) {
      // Manager explicitly wants to skip approval
      initialStatus = TRANSFER_STATUS.DA_DUYET
    }

    // Verify from_warehouse is MAIN type and to_warehouse is user's warehouse
    const fromWarehouseCheck = (await query(
      `SELECT type FROM warehouses WHERE id = ?`,
      [fromWarehouseId]
    )) as any[]

    if (!fromWarehouseCheck || fromWarehouseCheck.length === 0) {
      return NextResponse.json(
        { success: false, error: "Kho Tổng không tồn tại" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (fromWarehouseCheck[0].type !== "MAIN") {
      return NextResponse.json(
        { success: false, error: "Chỉ có thể yêu cầu từ Kho Tổng (MAIN)" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const transferId = randomUUID()
    const transferNumber = `STR-${new Date().getFullYear()}-${Date.now()}`
    const now = getVietnamTime()

    await runTransaction(async (tx) => {
      // Create main transfer record
      // Insert using the determined status based on user role
      await tx.query(
        `INSERT INTO warehouse_transfers
        (id, transfer_number, from_warehouse_id, to_warehouse_id, status, requested_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?::transfer_status, ?, ?::timestamp, ?::timestamp)`,
        [
          transferId,
          transferNumber,
          fromWarehouseId,
          user.warehouseId,
          initialStatus,
          user.id,
          now,
          now,
        ]
      )

      // Create item records
      for (const detail of details) {
        const itemId = randomUUID()
        const requestedQty = Number(detail.requestedQuantity) || 0

        if (requestedQty <= 0) {
          throw new Error("requestedQuantity phải > 0")
        }

        // Use unitId from frontend if provided, otherwise use product's default unit_id
        let unitId = detail.unitId

        if (!unitId) {
          // Fallback to product's default unit_id if not provided
          const productRow = (await tx.query(
            `SELECT unit_id FROM products WHERE id = ?`,
            [detail.productId]
          )) as any[]

          if (!productRow || productRow.length === 0 || !productRow[0].unit_id) {
            throw new Error(`Không tìm thấy đơn vị cho sản phẩm ${detail.productId}`)
          }

          unitId = productRow[0].unit_id
        }

        // If manager creates with no approval required (requiresApproval = false),
        // automatically set received_quantity = requestedQty
        const receivedQty = initialStatus === TRANSFER_STATUS.DA_DUYET ? requestedQty : 0

        await tx.query(
          `INSERT INTO warehouse_transfer_items
          (id, transfer_id, product_id, quantity, received_quantity, unit_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?::timestamp)`,
          [
            itemId,
            transferId,
            detail.productId,
            requestedQty,
            receivedQty,
            unitId,
            now,
          ]
        )
      }
    })

    // Fetch created transfer with items
    const transferData = (await query(
      `SELECT * FROM warehouse_transfers WHERE id = ?`,
      [transferId]
    )) as any[]

    const itemsData = (await query(
      `SELECT * FROM warehouse_transfer_items WHERE transfer_id = ?`,
      [transferId]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        data: { ...transferData[0], items: itemsData },
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
