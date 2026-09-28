import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { verifyToken, canAccessWarehouse } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * Inventory Check Detail API - NEW ARCHITECTURE
 * 
 * Uses inventoryCheckService for completion with unit conversion
 * 
 * CRITICAL FIXES:
 * - No warehouse_stock rebuilding
 * - Unit conversion for actual balance inputs
 * - Service handles adjustments automatically
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Use inventory check service
    const { inventoryCheckService } = await import('@/lib/services')

    const check = await inventoryCheckService.getCheckById(id)

    if (!check) {
      return NextResponse.json(
        { success: false, error: "Inventory check not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: check
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching inventory check detail:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { items, autoAdjust } = body || {}

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "items array is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate items have required fields (support both formats)
    for (const item of items) {
      const actualQty = item.actualQuantity ?? item.actual_balance
      const actualUnit = item.actualUnitId ?? item.input_unit_id

      if (!item.id || actualQty === undefined || !actualUnit) {
        return NextResponse.json(
          { success: false, error: "Each item must have id, actualQuantity/actual_balance, and actualUnitId/input_unit_id" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // Use inventory check service to complete check
    const { inventoryCheckService } = await import('@/lib/services')

    await inventoryCheckService.completeInventoryCheck({
      checkId: id,
      items: items.map((item: any) => ({
        itemId: item.id,
        actualQuantity: item.actualQuantity ?? item.actual_balance,
        actualUnitId: item.actualUnitId ?? item.input_unit_id,
        inputValue: item.inputValue ?? item.input_value
      })),
      autoAdjust: autoAdjust !== false, // Default true
      completedBy: payload.id
    })

    return NextResponse.json({
      success: true,
      message: "Inventory check completed successfully with unit conversion",
      data: { message: "Items updated and stock adjusted in base units" }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error updating inventory check:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get check to verify existence
    const check = await prisma.inventory_checks.findUnique({
      where: { id },
    })

    if (!check) {
      return NextResponse.json(
        { success: false, error: "Inventory check not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Validation: Check for newer checks
    if (check.status === "COMPLETED") {
      const newerCheck = await prisma.inventory_checks.findFirst({
        where: {
          warehouse_id: check.warehouse_id,
          status: "COMPLETED",
          created_at: { gt: check.created_at || new Date(0) },
        },
      })

      if (newerCheck) {
        return NextResponse.json(
          {
            success: false,
            error: `Không thể xóa. Có phiếu mới hơn (${newerCheck.number}).`,
          } as ApiResponse<null>,
          { status: 403 }
        )
      }

      // Check for transactions after completion (CRITICAL SAFETY CHECK)
      const dateLimit = check.created_at || new Date(0)

      const [
        salesCount,
        importsCount,
        productionCount,
        adjustmentsCount,
        transfersFromCount,
        transfersToCount,
        lossReportsCount
      ] = await Promise.all([
        prisma.sales_invoices.count({
          where: {
            warehouse_id: check.warehouse_id,
            created_at: { gt: dateLimit }
          }
        }),
        prisma.inventory_imports.count({
          where: {
            warehouse_id: check.warehouse_id,
            created_at: { gt: dateLimit }
          }
        }),
        prisma.production_transactions.count({
          where: {
            warehouse_id: check.warehouse_id,
            created_at: { gt: dateLimit }
          }
        }),
        prisma.inventory_adjustments.count({
          where: {
            warehouse_id: check.warehouse_id,
            created_at: { gt: dateLimit }
          }
        }),
        // Check for outgoing transfers (exported from this warehouse)
        prisma.internal_transfer_requests.count({
          where: {
            from_warehouse_id: check.warehouse_id,
            exported_at: { gt: dateLimit }
          }
        }),
        // Check for incoming transfers (received at this warehouse)
        prisma.internal_transfer_requests.count({
          where: {
            to_warehouse_id: check.warehouse_id,
            received_at: { gt: dateLimit }
          }
        }),
        // Check for loss reports
        prisma.inventory_loss_reports.count({
          where: {
            warehouse_id: check.warehouse_id,
            created_at: { gt: dateLimit }
          }
        })
      ])

      const hasTransactions = salesCount > 0 || importsCount > 0 || productionCount > 0 || adjustmentsCount > 0 || transfersFromCount > 0 || transfersToCount > 0 || lossReportsCount > 0

      if (hasTransactions) {
        const details = []
        if (salesCount > 0) details.push(`${salesCount} bán hàng`)
        if (importsCount > 0) details.push(`${importsCount} nhập hàng`)
        if (productionCount > 0) details.push(`${productionCount} sản xuất`)
        if (adjustmentsCount > 0) details.push(`${adjustmentsCount} điều chỉnh`)
        if (transfersFromCount > 0) details.push(`${transfersFromCount} xuất chuyển hàng`)
        if (transfersToCount > 0) details.push(`${transfersToCount} nhập chuyển hàng`)
        if (lossReportsCount > 0) details.push(`${lossReportsCount} báo cáo mất hàng`)

        return NextResponse.json(
          {
            success: false,
            error: `Không thể xóa phiếu kiểm kê đã hoàn thành vì đã phát sinh giao dịch sau đó: ${details.join(', ')}. Việc xóa sẽ làm sai lệch tồn kho.`,
          } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

    // Delete check using service to handle cleanup and rollback
    const { inventoryCheckService } = await import('@/lib/services')
    await inventoryCheckService.deleteInventoryCheck(id)

    return NextResponse.json({
      success: true,
      data: { message: "Inventory check deleted successfully" },
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error deleting inventory check:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
