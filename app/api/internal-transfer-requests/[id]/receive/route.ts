import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { verifyToken, isStaff, isWarehouseManager, isGeneralManager, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { sendNotificationWithFCM } from "@/lib/notification-helper"
import { prisma } from "@/lib/prisma"

/**
 * PUT /api/internal-transfer-requests/[id]/receive
 * 
 * NEW ARCHITECTURE:
 * Uses transferService.receiveTransfer() with proper unit conversion
 * 
 * FIXES:
 * - Unit validation
 * - Conversion to base units
 * - PROPER discrepancy calculation (in base units!)
 * - Atomic stock addition
 * - Optimistic locking
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

    // Staff, Manager, or GM from the store can receive
    if (!isStaff(user) && !isWarehouseManager(user) && !isGeneralManager(user) && !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Only store staff can confirm receipt" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { items } = body || {}

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate items format
    for (const item of items) {
      if (!item.itemId || item.receivedQuantity === undefined || !item.receivedUnitId) {
        return NextResponse.json(
          { success: false, error: "Each item must have itemId, receivedQuantity, and receivedUnitId" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // Fetch transfer request
    const transferRequest = await prisma.internal_transfer_requests.findUnique({
      where: { id },
      include: {
        warehouses_from: true,
        warehouses_to: true,
        items: true
      }
    })

    if (!transferRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Check status
    if (transferRequest.status !== 'DA_XUAT_KHO') {
      return NextResponse.json(
        { success: false, error: `Request must be in DA_XUAT_KHO status, current: ${transferRequest.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check warehouse access
    if (!isAdmin(user)) {
      const warehouseIds = isGeneralManager(user)
        ? (user.warehouseIds || [])
        : isWarehouseManager(user)
          ? (user.warehouseIds && user.warehouseIds.length > 0 ? user.warehouseIds : (user.warehouseId ? [user.warehouseId] : []))
          : (user.warehouseId ? [user.warehouseId] : [])

      if (!warehouseIds.includes(transferRequest.to_warehouse_id)) {
        return NextResponse.json(
          { success: false, error: "Cannot receive for other warehouses" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

    // Use NEW transfer service
    const { transferService } = await import('@/lib/services')

    await transferService.receiveTransfer({
      transferId: id,
      receiveDate: new Date(),
      items: items.map((item: any) => ({
        itemId: item.itemId,
        receivedQuantity: item.receivedQuantity,
        receivedUnitId: item.receivedUnitId
      })),
      receivedBy: user.id
    })

    // Calculate discrepancies using pre-calculated values from DB
    // (discrepancy_quantity was already calculated in receiveTransfer)
    const { unitConversionService } = await import('@/lib/services')

    // Get updated transfer with all items
    const updatedTransfer = await transferService.getTransferById(id)

    let hasDiscrepancy = false
    const discrepancies: any[] = []

    for (const item of updatedTransfer?.items || []) {
      if (!item.exported_quantity || !item.exported_unit_id ||
        !item.received_quantity || !item.received_unit_id) {
        continue
      }

      // Use discrepancy_quantity from DB (already calculated in receiveTransfer)
      const discrepancyQty = item.discrepancy_quantity || 0

      if (discrepancyQty !== 0) {
        hasDiscrepancy = true
        discrepancies.push({
          productName: item.product?.name,
          exportedQty: item.exported_quantity,
          exportedUnit: item.exported_unit?.code,
          receivedQty: item.received_quantity,
          receivedUnit: item.received_unit?.code,
          discrepancyBase: discrepancyQty,
          baseUnit: item.product?.product_units?.code
        })
      }
    }

    // Status and discrepancy flag are now updated in transferService.receiveTransfer
    // We just proceed to notifications


    if (hasDiscrepancy) {
      // Notify main warehouse about discrepancy
      try {
        const mainWarehouseStaff = await prisma.users.findMany({
          where: {
            role: { in: ['ADMIN', 'MANAGER'] },
            is_active: true
          },
          select: { id: true }
        })

        if (mainWarehouseStaff.length > 0) {
          await sendNotificationWithFCM({
            userId: mainWarehouseStaff.map(u => u.id),
            type: "TRANSFER_RECEIVED",
            title: "Chênh lệch khi nhận hàng",
            message: `${transferRequest.warehouses_to.name} đã nhận hàng nhưng có chênh lệch. Cần xác nhận.`,
            redirectUrl: "/admin/internal-transfers",
            data: { requestId: id, hasDiscrepancy: true }
          })
        }
      } catch (notifError) {
        console.error("[ITR Receive] Failed to send discrepancy notification:", notifError)
      }

      return NextResponse.json({
        success: true,
        message: "Receipt confirmed with discrepancies. Waiting for confirmation.",
        data: {
          status: 'CHO_XAC_NHAN_CHENH_LECH',
          hasDiscrepancy: true,
          discrepancies
        }
      } as ApiResponse<any>)
    } else {
      // Get the actual updated status from DB
      const finalTransfer = await prisma.internal_transfer_requests.findUnique({
        where: { id },
        select: { status: true, has_discrepancy: true }
      })

      // Check if status is CHO_DONG_BO_KHO_TONG (source warehouse locked for inventory check)
      if (finalTransfer?.status === 'CHO_DONG_BO_KHO_TONG') {
        // Source was locked - notify main warehouse
        try {
          const mainWarehouseStaff = await prisma.users.findMany({
            where: {
              role: { in: ['ADMIN', 'MANAGER'] },
              is_active: true
            },
            select: { id: true }
          })

          if (mainWarehouseStaff.length > 0) {
            await sendNotificationWithFCM({
              userId: mainWarehouseStaff.map(u => u.id),
              type: "TRANSFER_RECEIVED",
              title: "Chờ đồng bộ tồn kho",
              message: `${transferRequest.warehouses_to.name} đã nhận đủ hàng. Vui lòng xác nhận sau khi hoàn thành kiểm kê kho tổng.`,
              redirectUrl: "/admin/internal-transfers",
              data: { requestId: id, pendingDueToInventoryCheck: true }
            })
          }
        } catch (notifError) {
          console.error("[ITR Receive] Failed to send pending notification:", notifError)
        }

        return NextResponse.json({
          success: true,
          message: "Đã nhận hàng đầy đủ. Hàng đã được cộng vào kho của bạn. Chờ kho tổng xác nhận để hoàn tất.",
          data: {
            status: 'CHO_DONG_BO_KHO_TONG',
            hasDiscrepancy: false,
            pendingReason: 'SOURCE_INVENTORY_CHECK'
          }
        } as ApiResponse<any>)
      }

      // Normal completion - Notify all parties that transfer is complete
      try {
        const recipients = [transferRequest.created_by]
        if (transferRequest.manager_approved_by) recipients.push(transferRequest.manager_approved_by)
        if (transferRequest.gm_approved_by) recipients.push(transferRequest.gm_approved_by)
        if (transferRequest.exported_by) recipients.push(transferRequest.exported_by)

        await sendNotificationWithFCM({
          userId: recipients,
          type: "TRANSFER_RECEIVED",
          title: "Nhập hàng nội bộ hoàn tất",
          message: `Yêu cầu nhập hàng nội bộ đã hoàn tất thành công.`,
          redirectUrl: "/warehouse/internal-transfers",
          data: { requestId: id }
        })
      } catch (notifError) {
        console.error("[ITR Receive] Failed to send completion notification:", notifError)
      }

      return NextResponse.json({
        success: true,
        message: "Receipt confirmed. Transfer completed successfully with BASE UNIT conversion.",
        data: { status: 'HOAN_THANH', hasDiscrepancy: false }
      } as ApiResponse<any>)
    }
  } catch (error: any) {
    console.error("[API internal-transfer-requests receive] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
