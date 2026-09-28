import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isWarehouseManager, isStoreManager, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { TRANSFER_STATUS } from "@/lib/transfer-status"

/**
 * POST /api/stock-transfer-requests/[id]/manager-confirm
 * Quản lý duyệt yêu cầu từ nhân viên
 * Chỉ cho phép chuyển từ CHO_DUYET sang DA_DUYET
 * Body: { rejectionReason?: string } - Nếu có rejectionReason thì từ chối, không thì duyệt
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Only warehouse manager or admin can confirm
    if (!isWarehouseManager(user) && !isStoreManager(user) && !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản lý kho mới được duyệt yêu cầu" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { rejectionReason, items } = body || {}

    const transferData = (await query(
      `SELECT * FROM warehouse_transfers WHERE id = ?`,
      [id]
    )) as any[]

    if (!transferData || transferData.length === 0) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const transfer = transferData[0]

    // Check if user is manager of the warehouse making the request (admin can access any)
    if (!isAdmin(user) && user.warehouseId !== transfer.to_warehouse_id) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền duyệt yêu cầu của kho khác" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Only allow confirming CHO_DUYET requests
    if (transfer.status !== TRANSFER_STATUS.CHO_DUYET) {
      return NextResponse.json(
        { success: false, error: `Chỉ có thể duyệt yêu cầu ở trạng thái "Chờ duyệt", hiện tại: ${transfer.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const now = getVietnamTime()
    let newStatus = TRANSFER_STATUS.DA_DUYET
    let updateQuery = `UPDATE warehouse_transfers SET status = ?::transfer_status, updated_at = ?::timestamp WHERE id = ?`
    let queryParams: any[] = [newStatus, now, id]

    // If rejection reason provided, reject instead of approve
    if (rejectionReason && rejectionReason.trim().length > 0) {
      newStatus = TRANSFER_STATUS.TU_CHOI
      updateQuery = `UPDATE warehouse_transfers SET status = ?::transfer_status, rejection_reason = ?, updated_at = ?::timestamp WHERE id = ?`
      queryParams = [newStatus, rejectionReason.trim(), now, id]
    } else if (items && Array.isArray(items) && items.length > 0) {
      // Manager approved with possibly adjusted quantities, update items
      for (const item of items) {
        const { itemId, approvedQuantity, approvedUnitCode } = item
        const approvedQty = Number(approvedQuantity) || 0

        if (approvedQty < 0) {
          throw new Error(`Số lượng duyệt phải >= 0`)
        }

        // Get current unit_id to check if it needs to be updated
        const currentItem = (await query(
          `SELECT unit_id FROM warehouse_transfer_items WHERE id = ?`,
          [itemId]
        )) as any[]

        let updateUnitId = currentItem[0]?.unit_id
        if (approvedUnitCode) {
          // Fetch unit_id by code
          const unitData = (await query(
            `SELECT id FROM product_units WHERE code = ?`,
            [approvedUnitCode]
          )) as any[]

          if (unitData && unitData.length > 0) {
            updateUnitId = unitData[0].id
          }
        }

        // Update received_quantity with manager-approved quantity
        // IMPORTANT: Do NOT update unit_id - keep original unit unchanged
        // Store approved_unit_id only if unit was changed
        let updateItemQuery = `UPDATE warehouse_transfer_items SET received_quantity = ?`
        let updateItemParams: any[] = [approvedQty]

        if (updateUnitId !== currentItem[0]?.unit_id) {
          // Unit was changed during manager approval
          updateItemQuery += `, approved_unit_id = ?`
          updateItemParams.push(updateUnitId)
        }

        updateItemQuery += ` WHERE id = ?`
        updateItemParams.push(itemId)

        await query(updateItemQuery, updateItemParams)
      }
    }

    await query(updateQuery, queryParams)

    return NextResponse.json(
      {
        success: true,
        message: newStatus === TRANSFER_STATUS.DA_DUYET ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu",
        data: { status: newStatus },
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
