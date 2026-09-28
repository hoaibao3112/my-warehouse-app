import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { sendNotificationWithFCM } from "@/lib/notification-helper"
import { prisma } from "@/lib/prisma"

/**
 * PUT /api/internal-transfer-requests/[id]/export
 * 
 * NEW ARCHITECTURE:
 * Uses transferService.exportTransfer() with proper unit conversion
 * 
 * FIXES:
 * - Unit validation
 * - Conversion to base units
 * - Atomic stock deduction
 * - Optimistic locking
 */

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Only Admin or Manager (MAIN warehouse role) can export
    if (!user || (!isAdmin(user) && user.role !== 'MANAGER')) {
      return NextResponse.json(
        { success: false, error: "Only MAIN warehouse staff can export goods" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { items, notes } = body || {}

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate items format
    for (const item of items) {
      if (!item.itemId || item.exportedQuantity === undefined || item.exportedQuantity === null || !item.exportedUnitId) {
        return NextResponse.json(
          { success: false, error: "Each item must have itemId, exportedQuantity, and exportedUnitId" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // Fetch transfer request
    const transferRequest = await prisma.internal_transfer_requests.findUnique({
      where: { id },
      include: {
        warehouses_from: true,
        warehouses_to: true
      }
    })

    if (!transferRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Check status
    if (transferRequest.status !== 'CHO_KHO_TONG_XUAT') {
      return NextResponse.json(
        { success: false, error: `Request must be in CHO_KHO_TONG_XUAT status, current: ${transferRequest.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // ✅ CRITICAL: Check if source warehouse is locked for inventory check
    // Cannot export items while inventory check is in progress at source warehouse
    const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
    const sourceCheck = await checkInventoryCheckLock(transferRequest.from_warehouse_id)
    if (sourceCheck.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Kho nguồn đang có phiếu kiểm kê (${sourceCheck.checkNumber}). Vui lòng hoàn thành hoặc hủy phiếu kiểm kê trước khi xuất hàng.`
        } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Use NEW transfer service
    const { transferService } = await import('@/lib/services')

    await transferService.exportTransfer({
      transferId: id,
      exportDate: new Date(),
      items: items.map((item: any) => ({
        itemId: item.itemId,
        exportedQuantity: item.exportedQuantity,
        exportedUnitId: item.exportedUnitId
      })),
      exportedBy: user.id
    })

    // Update request status to DA_XUAT_KHO
    await prisma.internal_transfer_requests.update({
      where: { id },
      data: {
        status: 'DA_XUAT_KHO',
        exported_by: user.id,
        exported_at: new Date(),
        export_notes: notes || null
      }
    })

    // Send notification to store users
    const storeUsers = await prisma.users.findMany({
      where: {
        warehouse_id: transferRequest.to_warehouse_id,
        role: { in: ['STAFF', 'WAREHOUSE_MANAGER', 'GENERAL_MANAGER'] },
        is_active: true
      },
      select: { id: true }
    })

    if (storeUsers.length > 0) {
      try {
        await sendNotificationWithFCM({
          userId: storeUsers.map(u => u.id),
          type: "TRANSFER_READY_EXPORT",
          title: "Hàng đã được xuất kho",
          message: `Kho tổng đã xuất hàng cho ${transferRequest.warehouses_to.name}. Vui lòng xác nhận khi nhận.`,
          redirectUrl: "/warehouse/internal-transfers",
          data: { requestId: id }
        })
      } catch (notifError) {
        console.error("[ITR Export] Failed to send notification:", notifError)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Goods exported from Main Warehouse with unit conversion. Stock deducted in BASE UNITS.",
      data: {
        status: 'DA_XUAT_KHO',
        itemsExported: items.length
      }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("[API internal-transfer-requests export] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
