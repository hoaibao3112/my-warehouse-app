import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin, canAccessWarehouse } from "@/lib/auth"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"

/**
 * GET /api/purchase-orders-detail/[id]
 * Lấy thông tin chi tiết phiếu nhập
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Authenticate user
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
    const userWithAssignments: any = {
      ...user,
      warehouseId: user.warehouse_id,
      warehouseIds
    }

    const { id } = await params

    const order = (await query(
      `SELECT pod.*, s.name as supplier_name, w.name as warehouse_name
       FROM purchase_orders_detail pod
       LEFT JOIN suppliers s ON pod.supplier_id = s.id
       LEFT JOIN warehouses w ON pod.warehouse_id = w.id
       WHERE pod.id = ?`,
      [id]
    )) as any[]

    if (!order || order.length === 0) {
      return NextResponse.json(
        { success: false, error: "Phiếu nhập không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Check warehouse access
    const orderWarehouseId = order[0].warehouse_id
    if (!canAccessWarehouse(userWithAssignments, orderWarehouseId)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cannot access other warehouse's data" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const items = (await query(
      `SELECT podi.*,
              p.code as product_code,
              p.name as product_name,
              u.name as unit_name,
              u.code as unit_code
       FROM purchase_orders_detail_items podi
       LEFT JOIN products p ON podi.product_id = p.id
       LEFT JOIN product_units u ON podi.unit_id = u.id
       WHERE podi.purchase_order_id = ?`,
      [id]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        data: {
          ...order[0],
          items,
        },
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/purchase-orders-detail/[id]
 * Chỉnh sửa phiếu nhập hàng
 * - Điều chỉnh tồn kho dựa trên sự thay đổi của items
 * - Xử lý: xóa item cũ, thêm item mới, cập nhật item hiện có
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id } = await params
    const body = await request.json()
    const { supplierId, warehouseId, items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Get existing order
    const orders = (await query(
      `SELECT * FROM purchase_orders_detail WHERE id = ?`,
      [id]
    )) as any[]

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy phiếu" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const order = orders[0]
    const orderWarehouseId = order.warehouse_id

    // Check if user has permission to edit purchase order for this warehouse
    // Admin, GENERAL_MANAGER, and Warehouse Manager with access can edit
    if (!canAccessWarehouse(userWithAssignments, orderWarehouseId)) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền chỉnh sửa phiếu nhập cho kho này" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Check if there's a COMPLETED inventory check that would lock this purchase order
    const checkRows = (await query(`
      SELECT id, number, status
      FROM inventory_checks
      WHERE warehouse_id = ? AND status = 'COMPLETED'
      ORDER BY created_at DESC
      LIMIT 1
    `, [orderWarehouseId])) as any[]

    if (checkRows && checkRows.length > 0) {
      const completedCheck = checkRows[0]
      return NextResponse.json({
        success: false,
        error: `Không thể chỉnh sửa phiếu nhập hàng. Kho đã có phiếu kiểm kê hoàn thành (${completedCheck.number}). Vui lòng xóa phiếu kiểm kê trước.`
      } as ApiResponse<null>, { status: 403 })
    }
    const now = getVietnamTime()

    // Get existing items
    const existingItems = (await query(
      `SELECT * FROM purchase_orders_detail_items WHERE purchase_order_id = ?`,
      [id]
    )) as any[]

    let totalAmount = 0

    await runTransaction(async (tx) => {
      // If order was already received, we need to adjust stock
      if (order.status === "RECEIVED") {
        // Step 1: Subtract all old items from stock
        for (const oldItem of existingItems) {
          const stock = (await tx.query(
            `SELECT id, quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
            [order.warehouse_id, oldItem.product_id]
          )) as any[]

          if (stock.length > 0) {
            const newQty = Number(stock[0].quantity) - Number(oldItem.received_quantity)
            await tx.query(
              `UPDATE warehouse_stock SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [newQty, stock[0].id]
            )
          }

          // Delete old stock transaction
          // Removed: stock_transactions table no longer exists

          // Revert realtime stock
          const qtyToRevert = Number(oldItem.received_quantity)
          if (qtyToRevert > 0) {
            await tx.query(`
                 UPDATE warehouse_stock_realtime 
                 SET quantity = quantity - ?,
                     qty_imported = qty_imported - ?,
                     version = version + 1,
                     last_updated = NOW()
                 WHERE warehouse_id = ? AND product_id = ?
             `, [qtyToRevert, qtyToRevert, order.warehouse_id, oldItem.product_id])
          }
        }
      }

      // Step 2: Delete all old items
      await tx.query(
        `DELETE FROM purchase_orders_detail_items WHERE purchase_order_id = ?`,
        [id]
      )

      // Step 3: Update order details if needed
      if (supplierId) {
        await tx.query(
          `UPDATE purchase_orders_detail SET supplier_id = ?, updated_at = ?::timestamp WHERE id = ?`,
          [supplierId, now, id]
        )
      }
      if (warehouseId) {
        await tx.query(
          `UPDATE purchase_orders_detail SET warehouse_id = ?, updated_at = ?::timestamp WHERE id = ?`,
          [warehouseId, now, id]
        )
      }

      // Step 4: Insert new items and add to stock
      const targetWarehouseId = warehouseId || order.warehouse_id
      const targetSupplierId = supplierId || order.supplier_id

      for (const item of items) {
        let { productId, quantity, unitId } = item
        const qty = Number(quantity) || 0

        if (qty <= 0) continue

        // Get product's base unit
        const prodRows = (await tx.query(
          `SELECT unit_id FROM products WHERE id = ?`,
          [productId]
        )) as any[]
        const productBaseUnit = prodRows && prodRows[0] ? prodRows[0].unit_id : null

        if (!unitId && productBaseUnit) {
          unitId = productBaseUnit
        }

        const storedQuantity = qty
        let stockQuantityToAdd = qty
        let multiplier = 1

        if (unitId && productBaseUnit && unitId !== productBaseUnit) {
          multiplier = 1

          const direct = (await tx.query(
            `SELECT multiplier FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`,
            [unitId, productBaseUnit]
          )) as any[]

          if (direct && direct[0]) {
            multiplier = Number(direct[0].multiplier || 1)
          } else {
            const rev = (await tx.query(
              `SELECT multiplier FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`,
              [productBaseUnit, unitId]
            )) as any[]

            if (rev && rev[0]) {
              const val = Number(rev[0].multiplier || 1)
              if (val !== 0) multiplier = 1 / val
            }
          }

          stockQuantityToAdd = qty * multiplier
        }

        // Get supplier product price
        const supplierProduct = (await tx.query(
          `SELECT unit_price FROM supplier_products WHERE supplier_id = ? AND product_id = ?`,
          [targetSupplierId, productId]
        )) as any[]

        const unitPrice = supplierProduct?.[0]?.unit_price || 0
        const lineTotal = stockQuantityToAdd * Number(unitPrice)
        totalAmount += lineTotal

        const itemId = randomUUID()
        await tx.query(
          `INSERT INTO purchase_orders_detail_items (id, purchase_order_id, product_id, quantity, unit_id, unit_price, line_total, received_quantity, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [itemId, id, productId, storedQuantity, unitId || null, unitPrice, lineTotal, stockQuantityToAdd, now]
        )

        // Add new stock transaction
        // Add new stock transaction
        if (order.status === "RECEIVED") {
          // Add to warehouse stock realtime
          if (stockQuantityToAdd > 0) {
            await tx.query(`
                INSERT INTO warehouse_stock_realtime (
                    warehouse_id, product_id, unit_id, 
                    quantity, qty_imported, qty_produced, qty_sold, 
                    qty_transferred_in, qty_transferred_out, qty_adjusted, version, last_updated
                )
                VALUES (
                    $1::uuid, 
                    $2::uuid, 
                    $3::uuid,
                    $4, -- quantity
                    $4, -- qty_imported
                    0, 0, 0, 0, 0, 1, NOW()
                )
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET
                    quantity = warehouse_stock_realtime.quantity + $4,
                    qty_imported = warehouse_stock_realtime.qty_imported + $4,
                    version = warehouse_stock_realtime.version + 1,
                    last_updated = NOW()
            `, [
              targetWarehouseId,
              productId,
              productBaseUnit,
              stockQuantityToAdd
            ])
          }

          // Add to warehouse stock
          const updateRes = (await tx.query(
            `UPDATE warehouse_stock SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? RETURNING id`,
            [stockQuantityToAdd, targetWarehouseId, productId]
          )) as any[]

          if (!updateRes || updateRes.length === 0) {
            await tx.query(
              `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity, created_at, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [randomUUID(), targetWarehouseId, productId, stockQuantityToAdd]
            )
          }
        }
      }

      // Step 5: Update total amount
      await tx.query(
        `UPDATE purchase_orders_detail SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [totalAmount, id]
      )
    })

    // Return updated order
    const updatedOrder = (await query(
      `SELECT pod.*, s.name as supplier_name, w.name as warehouse_name
       FROM purchase_orders_detail pod
       LEFT JOIN suppliers s ON pod.supplier_id = s.id
       LEFT JOIN warehouses w ON pod.warehouse_id = w.id
       WHERE pod.id = ?`,
      [id]
    )) as any[]

    const items_data = (await query(
      `SELECT podi.id, podi.product_id, podi.quantity, podi.unit_id, podi.unit_price, podi.line_total,
              p.name as product_name, p.code as product_code,
              u.name as unit_name, u.code as unit_code
       FROM purchase_orders_detail_items podi
       LEFT JOIN products p ON podi.product_id = p.id
       LEFT JOIN product_units u ON podi.unit_id = u.id
       WHERE podi.purchase_order_id = ?`,
      [id]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        message: "Phiếu nhập hàng đã được cập nhật",
        data: {
          ...updatedOrder[0],
          items: items_data,
        },
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/purchase-orders-detail/[id]
 * Xóa phiếu nhập hàng và trừ số lượng khỏi tồn kho
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const { id } = await params

    // Get purchase order details
    const orders = (await query(
      `SELECT * FROM purchase_orders_detail WHERE id = ?`,
      [id]
    )) as any[]

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy phiếu" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const order = orders[0]
    const orderWarehouseId = order.warehouse_id

    // Check if user has permission to delete purchase order for this warehouse
    // Admin, GENERAL_MANAGER, and Warehouse Manager with access can delete
    if (!canAccessWarehouse(user, orderWarehouseId)) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền xóa phiếu nhập cho kho này" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Check if there's a COMPLETED inventory check that would lock this purchase order
    const checkRows = (await query(`
      SELECT id, number, status
      FROM inventory_checks
      WHERE warehouse_id = ? AND status = 'COMPLETED'
      ORDER BY created_at DESC
      LIMIT 1
    `, [orderWarehouseId])) as any[]

    if (checkRows && checkRows.length > 0) {
      const completedCheck = checkRows[0]
      return NextResponse.json({
        success: false,
        error: `Không thể xóa phiếu nhập hàng. Kho đã có phiếu kiểm kê hoàn thành (${completedCheck.number}). Vui lòng xóa phiếu kiểm kê trước.`
      } as ApiResponse<null>, { status: 403 })
    }

    // Get order items
    const items = (await query(
      `SELECT * FROM purchase_orders_detail_items WHERE purchase_order_id = ?`,
      [id]
    )) as any[]

    const now = getVietnamTime()

    await runTransaction(async (tx) => {
      // Revert stock in warehouse_stock_realtime if order was received
      if (order.status === 'RECEIVED') {
        for (const item of items) {
          const qtyToRevert = Number(item.received_quantity || 0)
          if (qtyToRevert > 0) {
            await tx.query(`
                   UPDATE warehouse_stock_realtime
                   SET quantity = quantity - ?,
                       qty_imported = qty_imported - ?,
                       version = version + 1,
                       last_updated = NOW()
                   WHERE warehouse_id = ? AND product_id = ?
               `, [qtyToRevert, qtyToRevert, orderWarehouseId, item.product_id])
          }
        }
      }

      // Delete stock transactions for this purchase order (Legacy, if any)
      // Removed: stock_transactions table no longer exists

      // Delete order items
      await tx.query(
        `DELETE FROM purchase_orders_detail_items WHERE purchase_order_id = ?`,
        [id]
      )

      // Delete order
      await tx.query(
        `DELETE FROM purchase_orders_detail WHERE id = ?`,
        [id]
      )

      // Rebuild warehouse_stock (Legacy sync)
      // Since we modified realtime stock, we should ideally sync warehouse_stock too
      // However, for efficiency, we can just update it decrementally like realtime
      if (order.status === 'RECEIVED') {
        for (const item of items) {
          const qtyToRevert = Number(item.received_quantity || 0)
          if (qtyToRevert > 0) {
            await tx.query(`
                    UPDATE warehouse_stock
                    SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                    WHERE warehouse_id = ? AND product_id = ?
                 `, [qtyToRevert, orderWarehouseId, item.product_id])
          }
        }
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: "Phiếu đã được xóa",
      } as ApiResponse<null>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
