import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isWarehouseManager, isAdmin, canApproveOnBehalfOfWarehouseManager, isGeneralManager } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { sendNotificationWithFCM } from "@/lib/notification-helper"

/**
 * PUT /api/internal-transfer-requests/[id]/manager-approve
 * Manager approves request (can modify quantities/units) or rejects it
 * Body: { items?: [{ itemId, quantity, unitId }], rejectionReason?: string }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Allow: WAREHOUSE_MANAGER, ADMIN, or GENERAL_MANAGER with special permission
    const canApproveAsManager = isWarehouseManager(user) || isAdmin(user) || canApproveOnBehalfOfWarehouseManager(user)
    if (!user || !canApproveAsManager) {
      return NextResponse.json(
        { success: false, error: "Only WAREHOUSE_MANAGER (or GENERAL_MANAGER with permission) can approve requests" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { items, rejectionReason } = body || {}

    // Fetch request
    const requests = (await query(
      `SELECT * FROM internal_transfer_requests WHERE id = ?`,
      [id]
    )) as any[]

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { success: false, error: "Request not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const requestData = requests[0]

    // Check status
    if (requestData.status !== 'CHO_QUAN_LY_DUYET') {
      return NextResponse.json(
        { success: false, error: `Request must be in CHO_QUAN_LY_DUYET status, current: ${requestData.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check warehouse access (admin can approve any, WM/GM only their warehouses)
    if (!isAdmin(user)) {
      const warehouseIds = user.warehouseIds && user.warehouseIds.length > 0
        ? user.warehouseIds
        : (user.warehouseId ? [user.warehouseId] : [])

      if (!warehouseIds.includes(requestData.to_warehouse_id)) {
        return NextResponse.json(
          { success: false, error: "Cannot approve requests for warehouses you don't manage" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

    // Track if GM is approving on behalf of WM (for audit purposes)
    const isGMApprovingAsWM = isGeneralManager(user) && canApproveOnBehalfOfWarehouseManager(user)

    const now = getVietnamTime()

    // Handle rejection
    if (rejectionReason && rejectionReason.trim().length > 0) {
      await query(
        `UPDATE internal_transfer_requests
         SET status = ?::internal_transfer_status, 
             rejected_by = ?,
             rejection_reason = ?,
             updated_at = ?::timestamp
         WHERE id = ?`,
        ['TU_CHOI', user.id, rejectionReason.trim(), now, id]
      )

      // Send notification to staff who created the request
      try {
        await sendNotificationWithFCM({
          userId: requestData.created_by,
          type: "TRANSFER_REJECTED",
          title: "Yêu cầu nhập hàng bị từ chối",
          message: `Yêu cầu nhập hàng bị quản lý từ chối${rejectionReason ? `: ${rejectionReason}` : ""}`,
          redirectUrl: "/warehouse/internal-transfers",
          data: { requestId: id }
        })
      } catch (notifError) {
        console.error("[ITR Manager Reject] Failed to send notification:", notifError)
      }

      return NextResponse.json({
        success: true,
        message: "Request rejected",
        data: { status: 'TU_CHOI' }
      } as ApiResponse<any>)
    }

    // Handle approval with optional modifications
    if (items && Array.isArray(items) && items.length > 0) {
      // Update item quantities/units
      for (const item of items) {
        const { itemId, quantity, unitId } = item

        if (!itemId) {
          throw new Error("Each item must have itemId")
        }

        // Get original item
        const originalItems = (await query(
          `SELECT * FROM internal_transfer_request_items WHERE id = ? AND request_id = ?`,
          [itemId, id]
        )) as any[]

        if (!originalItems || originalItems.length === 0) {
          throw new Error(`Item ${itemId} not found in request`)
        }

        const originalItem = originalItems[0]

        // Update manager-approved quantities and units
        const manager_quantity = quantity !== undefined ? quantity : originalItem.requested_quantity
        const manager_unit_id = unitId !== undefined ? unitId : originalItem.requested_unit_id

        await query(
          `UPDATE internal_transfer_request_items
           SET manager_quantity = ?::numeric,
               manager_unit_id = ?,
               updated_at = ?::timestamp
           WHERE id = ?`,
          [manager_quantity, manager_unit_id, now, itemId]
        )
      }
    }

    // Update request status to CHO_TONG_QUAN_LY_DUYET
    await query(
      `UPDATE internal_transfer_requests
       SET status = ?::internal_transfer_status,
           manager_approved_by = ?,
           manager_approved_at = ?::timestamp,
           updated_at = ?::timestamp
       WHERE id = ?`,
      ['CHO_TONG_QUAN_LY_DUYET', user.id, now, now, id]
    )

    // Get general managers for notification
    const generalManagers = (await query(
      `SELECT id FROM users WHERE role = 'GENERAL_MANAGER' AND is_active = true`,
      []
    )) as any[]

    // Send notification to general managers
    if (generalManagers.length > 0) {
      try {
        // Get warehouse name
        const warehouse = (await query(
          `SELECT name FROM warehouses WHERE id = ?`,
          [requestData.to_warehouse_id]
        )) as any[]

        const warehouseName = warehouse[0]?.name || "cửa hàng"

        await sendNotificationWithFCM({
          userId: generalManagers.map(gm => gm.id),
          type: "TRANSFER_CREATED",
          title: "Yêu cầu nhập hàng cần duyệt",
          message: `Quản lý ${warehouseName} đã duyệt yêu cầu nhập hàng. Cần TQL phê duyệt.`,
          redirectUrl: "/warehouse/internal-transfers",
          data: { requestId: id }
        })
      } catch (notifError) {
        console.error("[ITR Manager Approve] Failed to send notification:", notifError)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Request approved by manager and forwarded to General Manager",
      data: { status: 'CHO_TONG_QUAN_LY_DUYET' }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("[API internal-transfer-requests manager-approve] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
