import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { verifyToken, isAdmin, isWarehouseManager } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"

/**
 * PUT /api/internal-transfer-requests/[id]/confirm-discrepancy
 * 
 * Xác nhận chênh lệch hoặc đồng bộ tồn kho từ kho tổng
 * 
 * Request Body (optional for CHO_XAC_NHAN_CHENH_LECH):
 * {
 *   items: [
 *     { itemId: string, confirmedQuantity: number, confirmedUnitId: string }
 *   ]
 * }
 * 
 * Logic:
 * - CHO_XAC_NHAN_CHENH_LECH (có chênh lệch): 
 *   + Trừ kho tổng theo số kho tổng XÁC NHẬN (confirmedQuantity hoặc received_quantity nếu không có)
 *   + Cộng kho con theo số kho tổng XÁC NHẬN
 * - CHO_DONG_BO_KHO_TONG (không chênh lệch, chỉ sync):
 *   + Trừ kho tổng theo số đã XUẤT (exported_quantity)
 *   + Kho con đã được cộng rồi
 * - Update status → HOAN_THANH
 */

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Only admin or manager can confirm discrepancy
    if (!isAdmin(user) && user.role !== 'MANAGER') {
      return NextResponse.json(
        { success: false, error: "Only managers or admins can confirm discrepancy" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Parse request body for confirmed items (optional)
    let confirmedItems: Array<{ itemId: string; confirmedQuantity: number; confirmedUnitId: string }> = []
    try {
      const body = await request.json()
      if (body?.items && Array.isArray(body.items)) {
        confirmedItems = body.items
      }
    } catch {
      // No body or invalid JSON - will use default (received_quantity)
    }

    // Create a map for quick lookup of confirmed quantities
    const confirmedItemsMap = new Map<string, { confirmedQuantity: number; confirmedUnitId: string }>()
    for (const item of confirmedItems) {
      confirmedItemsMap.set(item.itemId, {
        confirmedQuantity: item.confirmedQuantity,
        confirmedUnitId: item.confirmedUnitId
      })
    }

    // Fetch transfer request
    const transfer = await prisma.internal_transfer_requests.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            exported_unit: true,
            received_unit: true
          }
        },
        warehouses_from: true,
        warehouses_to: true
      }
    })

    if (!transfer) {
      return NextResponse.json(
        { success: false, error: "Transfer not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Check status - accept both discrepancy and sync pending statuses
    const validStatuses = ['CHO_XAC_NHAN_CHENH_LECH', 'CHO_DONG_BO_KHO_TONG']
    if (!validStatuses.includes(transfer.status)) {
      return NextResponse.json(
        { success: false, error: `Phiếu phải ở trạng thái chờ xác nhận. Trạng thái hiện tại: ${transfer.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // ✅ CRITICAL: Check if source warehouse is locked for inventory check
    // Cannot confirm discrepancy while inventory check is in progress
    const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
    const sourceCheck = await checkInventoryCheckLock(transfer.from_warehouse_id)
    if (sourceCheck.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Kho tổng đang có phiếu kiểm kê (${sourceCheck.checkNumber}). Vui lòng hoàn thành hoặc xóa phiếu kiểm kê trước khi xác nhận.`
        } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // ✅ OPTIMIZED: Process stock updates with batch operations
    const { inventoryService } = await import('@/lib/services')

    await prisma.$transaction(async (tx) => {
      // 1. Batch fetch all necessary product base units to avoid N+1
      const productIds = Array.from(new Set(transfer.items.map(i => i.product_id)))
      const products = await tx.products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, unit_id: true }
      })
      const productMap = new Map(products.map(p => [p.id, p]))

      // 2. Batch fetch all package units used in this transfer (both received and exported)
      const receivedUnitIds = Array.from(new Set(transfer.items.map(i => i.received_unit_id).filter(Boolean) as string[]))
      const exportedUnitIds = Array.from(new Set(transfer.items.map(i => i.exported_unit_id).filter(Boolean) as string[]))
      const allUnitIds = Array.from(new Set([...receivedUnitIds, ...exportedUnitIds]))

      const packageUnits = await tx.product_package_units.findMany({
        where: {
          product_id: { in: productIds },
          package_unit_id: { in: allUnitIds }
        }
      })

      console.log(`[Confirm Discrepancy] Processing ${transfer.items.length} items with ${products.length} products`)

      // NEW LOGIC: Source was already deducted when exporting
      // This endpoint now:
      // 1. Adjusts source if confirmed != exported (add back difference)
      // 2. Adds confirmed amount to destination
      console.log(`[Confirm Discrepancy] Status: ${transfer.status}`)

      // ✅ CRITICAL OPTIMIZATION: Prepare all stock update data first
      const stockUpdatesData: Array<{
        warehouseId: string
        productId: string
        baseQuantity: number
        baseUnitId: string
        operation: 'OUT' | 'IN'
      }> = []

      for (const item of transfer.items) {
        if (!item.received_quantity || !item.received_unit_id || item.discrepancy_quantity === undefined) {
          continue
        }

        const product = productMap.get(item.product_id)
        if (!product) continue

        // Calculate received base quantity (default for confirmation)
        let receivedBaseQty = item.received_quantity

        if (item.received_unit_id !== product.unit_id) {
          const packageUnit = packageUnits.find(pu =>
            pu.product_id === item.product_id &&
            pu.package_unit_id === item.received_unit_id
          )
          if (packageUnit) {
            receivedBaseQty = item.received_quantity * Number(packageUnit.base_quantity)
          }
        }

        // Calculate exported base quantity
        let exportedBaseQty = item.exported_quantity || 0
        if (item.exported_unit_id && item.exported_unit_id !== product.unit_id) {
          const exportPackageUnit = packageUnits.find(pu =>
            pu.product_id === item.product_id &&
            pu.package_unit_id === item.exported_unit_id
          )
          if (exportPackageUnit) {
            exportedBaseQty = (item.exported_quantity || 0) * Number(exportPackageUnit.base_quantity)
          }
        }

        // Calculate CONFIRMED base quantity (what warehouse manager submitted)
        // Default to received quantity if no confirmed input provided
        let confirmedBaseQty = receivedBaseQty
        const confirmedInput = confirmedItemsMap.get(item.id)
        if (confirmedInput) {
          // Use confirmed quantity from input
          let confirmedQty = confirmedInput.confirmedQuantity
          const confirmedUnitId = confirmedInput.confirmedUnitId

          // Convert to base unit if needed
          if (confirmedUnitId && confirmedUnitId !== product.unit_id) {
            const confirmedPackageUnit = packageUnits.find(pu =>
              pu.product_id === item.product_id &&
              pu.package_unit_id === confirmedUnitId
            )
            if (confirmedPackageUnit) {
              confirmedBaseQty = confirmedQty * Number(confirmedPackageUnit.base_quantity)
            } else {
              confirmedBaseQty = confirmedQty // Fallback if no package unit found
            }
          } else {
            confirmedBaseQty = confirmedQty
          }
        }

        console.log(
          `[Confirm Discrepancy] Product: ${item.product?.name}`,
          `Exported: ${exportedBaseQty} (base)`,
          `Received: ${receivedBaseQty} (base)`,
          `Confirmed: ${confirmedBaseQty} (base)`,
          `Discrepancy: ${item.discrepancy_quantity} (base)`
        )

        // NEW LOGIC: Source was ALREADY deducted by exportedBaseQty during export
        // Now we need to:
        // 1. ADJUST source if confirmed != exported (add back the difference)
        // 2. ADD to destination by confirmed amount

        // Calculate adjustment for source warehouse
        // If exported 100 but confirmed 85, we need to ADD BACK 15 to source
        const sourceAdjustment = exportedBaseQty - confirmedBaseQty

        if (sourceAdjustment !== 0) {
          // Add back the difference to source warehouse
          // sourceAdjustment > 0 (e.g. 100 - 85 = 15): Confirmed less than exported -> Add back 15 to source (IN)
          // sourceAdjustment < 0 (e.g. 100 - 110 = -10): Confirmed more than exported -> Deduct 10 more from source (OUT)
          stockUpdatesData.push({
            warehouseId: transfer.from_warehouse_id,
            productId: item.product_id,
            baseQuantity: Math.abs(sourceAdjustment),
            baseUnitId: product.unit_id,
            operation: sourceAdjustment > 0 ? 'IN' : 'OUT'
          })
          console.log(`[Confirm Discrepancy] Adjusting source warehouse by ${sourceAdjustment} (${sourceAdjustment > 0 ? 'adding back' : 'deducting more'})`)
        } else {
          console.log(`[Confirm Discrepancy] No source adjustment needed (confirmed = exported)`)
        }

        // Add confirmed amount to destination warehouse
        stockUpdatesData.push({
          warehouseId: transfer.to_warehouse_id,
          productId: item.product_id,
          baseQuantity: confirmedBaseQty,
          baseUnitId: product.unit_id,
          operation: 'IN'
        })
        console.log(`[Confirm Discrepancy] Adding ${confirmedBaseQty} to destination warehouse`)
      }

      console.log(`[Confirm Discrepancy] Prepared ${stockUpdatesData.length} stock updates`)

      // ✅ BATCH UPDATE: Use raw SQL for maximum performance with all updates
      // Group by warehouse and operation for efficient batch processing
      const updatesByWarehouse = new Map<string, typeof stockUpdatesData>()
      for (const update of stockUpdatesData) {
        if (!updatesByWarehouse.has(update.warehouseId)) {
          updatesByWarehouse.set(update.warehouseId, [])
        }
        updatesByWarehouse.get(update.warehouseId)?.push(update)
      }

      // Execute all warehouse updates in parallel
      await Promise.all(
        Array.from(updatesByWarehouse.values()).map(async (updates) => {
          // Process updates. Note: check if this is Source or Destination warehouse to update correct column
          // We can check one item since grouped by warehouse
          const warehouseId = updates[0].warehouseId
          const isSourceWarehouse = warehouseId === transfer.from_warehouse_id

          for (const update of updates) {
            // Ensure numeric type for PostgreSQL Decimal columns
            const baseQty = Number(update.baseQuantity) || 0
            const quantityChange = update.operation === 'OUT' ? -baseQty : baseQty

            if (isSourceWarehouse) {
              // SOURCE WAREHOUSE: 
              // Adjusting previously recorded export.
              // If IN (add back): quantity increase, qty_transferred_out decrease
              // If OUT (deduct more): quantity decrease, qty_transferred_out increase
              // quantityChange tracks (+/-) for stock quantity.
              // For transfer column, we inverse: Stock Up = Transferred Down.

              await tx.$executeRaw`
                INSERT INTO warehouse_stock_realtime (
                  warehouse_id, product_id, unit_id,
                  quantity, qty_imported, qty_produced, qty_sold,
                  qty_transferred_in, qty_transferred_out, qty_adjusted, version,
                  last_updated
                )
                VALUES (
                  ${update.warehouseId}::uuid,
                  ${update.productId}::uuid,
                  ${update.baseUnitId}::uuid,
                  ${quantityChange}::numeric, 0, 0, 0,
                  0, ${-quantityChange}::numeric, 0, 1,
                  NOW()
                )
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET
                  quantity = warehouse_stock_realtime.quantity + ${quantityChange}::numeric,
                  qty_transferred_out = warehouse_stock_realtime.qty_transferred_out - ${quantityChange}::numeric,
                  version = warehouse_stock_realtime.version + 1,
                  last_updated = NOW()
              `
            } else {
              // DESTINATION WAREHOUSE:
              // Receiving goods.
              // Always IN usually.
              // quantity increases, qty_transferred_in increases.

              await tx.$executeRaw`
                INSERT INTO warehouse_stock_realtime (
                  warehouse_id, product_id, unit_id,
                  quantity, qty_imported, qty_produced, qty_sold,
                  qty_transferred_in, qty_transferred_out, qty_adjusted, version,
                  last_updated
                )
                VALUES (
                  ${update.warehouseId}::uuid,
                  ${update.productId}::uuid,
                  ${update.baseUnitId}::uuid,
                  ${quantityChange}::numeric, 0, 0, 0,
                  ${quantityChange}::numeric, 0, 0, 1,
                  NOW()
                )
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET
                  quantity = warehouse_stock_realtime.quantity + ${quantityChange}::numeric,
                  qty_transferred_in = warehouse_stock_realtime.qty_transferred_in + ${quantityChange}::numeric,
                  version = warehouse_stock_realtime.version + 1,
                  last_updated = NOW()
              `
            }
          }
        })
      )

      console.log(`[Confirm Discrepancy] Completed ${stockUpdatesData.length} stock updates in batches`)

      // Update transfer status
      await tx.internal_transfer_requests.update({
        where: { id },
        data: {
          status: 'HOAN_THANH',
          users_discrepancy: { connect: { id: user.id } },
          discrepancy_confirmed_at: new Date()
        }
      })
    }, {
      timeout: 120000 // Increased timeout to 120s for large transfers
    })

    // Send notification
    try {
      const { sendNotificationWithFCM } = await import('@/lib/notification-helper')

      const recipients = [transfer.created_by]
      if (transfer.exported_by) recipients.push(transfer.exported_by)
      if (transfer.received_by) recipients.push(transfer.received_by)

      await sendNotificationWithFCM({
        userId: recipients,
        type: "TRANSFER_RECEIVED", // Fixed: Use valid enum value
        title: "Chênh lệch đã được xác nhận",
        message: `Yêu cầu chuyển kho ${transfer.warehouses_from.name} → ${transfer.warehouses_to.name} đã hoàn tất.`,
        redirectUrl: "/warehouse/internal-transfers",
        data: { requestId: id }
      })
    } catch (notifError) {
      console.error("[Confirm Discrepancy] Failed to send notification:", notifError)
    }

    return NextResponse.json({
      success: true,
      message: "Discrepancy confirmed. Stock updated and transfer completed.",
      data: { status: 'HOAN_THANH' }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("[API confirm-discrepancy] Error:", error)

    // Check for inventory locked error
    if (error?.message?.includes('đang tiến hành') || error?.message?.includes('423')) {
      return NextResponse.json(
        { success: false, error: error.message } as ApiResponse<null>,
        { status: 423 }
      )
    }

    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
