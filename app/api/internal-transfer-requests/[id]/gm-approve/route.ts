import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isGeneralManager, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { sendNotificationWithFCM } from "@/lib/notification-helper"

/**
 * PUT /api/internal-transfer-requests/[id]/gm-approve
 * General Manager approves request (can see current stock) or rejects it
 * Body: { rejectionReason?: string, notes?: string }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || (!isGeneralManager(user) && !isAdmin(user))) {
      return NextResponse.json(
        { success: false, error: "Only GENERAL_MANAGER can approve at this stage" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { rejectionReason, notes, items: editedItems } = body || {}

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
    if (requestData.status !== 'CHO_TONG_QUAN_LY_DUYET') {
      return NextResponse.json(
        { success: false, error: `Request must be in CHO_TONG_QUAN_LY_DUYET status, current: ${requestData.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check warehouse access (GM should have access to the store warehouse)
    if (isGeneralManager(user)) {
      if (!user.warehouseIds || !user.warehouseIds.includes(requestData.to_warehouse_id)) {
        return NextResponse.json(
          { success: false, error: "Cannot approve requests for warehouses you don't manage" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

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

      // Send notification to manager and staff
      try {
        const recipients = [requestData.created_by]
        if (requestData.manager_approved_by) {
          recipients.push(requestData.manager_approved_by)
        }

        await sendNotificationWithFCM({
          userId: recipients,
          type: "TRANSFER_REJECTED",
          title: "Yêu cầu nhập hàng bị từ chối",
          message: `Yêu cầu nhập hàng bị TQL từ chối${rejectionReason ? `: ${rejectionReason}` : ""}`,
          redirectUrl: "/warehouse/internal-transfers",
          data: { requestId: id }
        })
      } catch (notifError) {
        console.error("[ITR GM Reject] Failed to send notification:", notifError)
      }

      return NextResponse.json({
        success: true,
        message: "Request rejected by General Manager",
        data: { status: 'TU_CHOI' }
      } as ApiResponse<any>)
    }

    // Update items with GM's edited quantities and current stock
    const items = (await query(
      `SELECT id, product_id FROM internal_transfer_request_items WHERE request_id = ?`,
      [id]
    )) as any[]

    for (const item of items) {
      // Get current stock at TO warehouse for record keeping
      const stock = (await query(
        `SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
        [requestData.to_warehouse_id, item.product_id]
      )) as any[]

      const currentStock = stock.length > 0 ? stock[0].quantity : 0

      // Find edited item data from GM
      const editedItem = editedItems?.find((ei: any) => ei.itemId === item.id)

      if (editedItem) {
        // GM adjusted the quantity/unit - UPDATE manager_quantity and manager_unit_id
        await query(
          `UPDATE internal_transfer_request_items
           SET manager_quantity = ?::numeric,
               manager_unit_id = ?,
               current_stock = ?::numeric,
               updated_at = ?::timestamp
           WHERE id = ?`,
          [editedItem.quantity, editedItem.unitId, currentStock, now, item.id]
        )
      } else {
        // No edit from GM, just update current_stock
        await query(
          `UPDATE internal_transfer_request_items
           SET current_stock = ?::numeric,
               updated_at = ?::timestamp
           WHERE id = ?`,
          [currentStock, now, item.id]
        )
      }
    }

    // Update request status to CHO_KHO_TONG_XUAT
    await query(
      `UPDATE internal_transfer_requests
       SET status = ?::internal_transfer_status,
           gm_approved_by = ?,
           gm_approved_at = ?::timestamp,
           gm_notes = ?,
           updated_at = ?::timestamp
       WHERE id = ?`,
      ['CHO_KHO_TONG_XUAT', user.id, now, notes || null, now, id]
    )

    // Get main warehouse users (Admin/Manager) for notification
    const mainWarehouseUsers = (await query(
      `SELECT id FROM users 
       WHERE (role = 'ADMIN' OR role = 'MANAGER' OR role = 'WAREHOUSE_STAFF') 
       AND is_active = true`,
      []
    )) as any[]

    // Send notification to main warehouse users
    if (mainWarehouseUsers.length > 0) {
      try {
        // Get warehouse name
        const warehouse = (await query(
          `SELECT name FROM warehouses WHERE id = ?`,
          [requestData.to_warehouse_id]
        )) as any[]

        const toWarehouseName = warehouse[0]?.name || "cửa hàng"

        await sendNotificationWithFCM({
          userId: mainWarehouseUsers.map(u => u.id),
          type: "TRANSFER_READY_EXPORT",
          title: "Yêu cầu nhập hàng cần xuất kho",
          message: `TQL đã duyệt yêu cầu nhập hàng cho ${toWarehouseName}. Cần xuất kho.`,
          redirectUrl: "/admin/internal-transfers",
          data: { requestId: id }
        })
      } catch (notifError) {
        console.error("[ITR GM Approve] Failed to send notification:", notifError)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Request approved by General Manager and forwarded to Main Warehouse",
      data: { status: 'CHO_KHO_TONG_XUAT' }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("[API internal-transfer-requests gm-approve] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
