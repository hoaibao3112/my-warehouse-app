import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/inventory-intake/[id] - Get import detail
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    const { id } = await context.params

    // Get import with full details
    const importRecord = await prisma.inventory_imports.findUnique({
      where: { id },
      include: {
        warehouse: {
          select: { id: true, name: true }
        },
        user: {
          select: { id: true, full_name: true }
        },
        items: {
          include: {
            product: {
              select: { id: true, code: true, name: true }
            },
            input_unit: {
              select: { id: true, code: true, name: true }
            }
          }
        }
      }
    })

    if (!importRecord) {
      return NextResponse.json(
        { success: false, error: "Phiếu nhập không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Format items with historical stock snapshot
    const itemsWithStock = importRecord.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productCode: item.product?.code,
      productName: item.product?.name,
      quantity: item.quantity,
      unitId: item.input_unit_id,
      unitCode: item.input_unit?.code,
      unitName: item.input_unit?.name,
      baseQuantity: item.base_quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
      currentStock: item.stock_after_transaction || 0 // Historical snapshot!
    }))

    // Format response
    const data = {
      id: importRecord.id,
      intakeId: importRecord.id, // Alias for frontend
      importNumber: importRecord.import_number,
      intakeNumber: importRecord.import_number, // Alias for frontend
      warehouseId: importRecord.warehouse_id,
      warehouseName: importRecord.warehouse?.name,
      supplierName: importRecord.supplier_name,
      importDate: importRecord.import_date?.toISOString(),
      totalAmount: importRecord.total_amount,
      notes: importRecord.notes,
      createdBy: importRecord.user?.full_name,
      createdAt: importRecord.created_at?.toISOString(),
      items: itemsWithStock
    }

    return NextResponse.json({
      success: true,
      data
    } as ApiResponse<any>)

  } catch (error: any) {
    console.error("Error fetching import detail:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/inventory-intake/[id] - Delete import (reverse stock)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    const { id } = await context.params

    // Get import with items
    const importRecord = await prisma.inventory_imports.findUnique({
      where: { id },
      include: {
        items: true
      }
    })

    if (!importRecord) {
      return NextResponse.json(
        { success: false, error: "Phiếu nhập không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Reverse stock changes
    for (const item of importRecord.items) {
      await prisma.warehouse_stock_realtime.update({
        where: {
          warehouse_id_product_id: {
            warehouse_id: importRecord.warehouse_id,
            product_id: item.product_id
          }
        },
        data: {
          quantity: { decrement: item.base_quantity },
          qty_imported: { decrement: item.base_quantity },
          version: { increment: 1 }
        }
      })
    }

    // Delete import (cascade will delete items)
    await prisma.inventory_imports.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      data: { message: "Đã xóa phiếu nhập và hoàn tồn kho" }
    } as ApiResponse<any>)

  } catch (error: any) {
    console.error("Error deleting import:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
