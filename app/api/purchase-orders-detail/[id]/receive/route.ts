import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Purchase Order Receiving API - NEW ARCHITECTURE
 * 
 * Uses importService with unit conversion
 * 
 * FIXES:
 * - Unit validation for received quantities
 * - Conversion to base units
 * - Atomic stock updates
 * - No manual warehouse_stock rebuilding
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { receivedQuantity, unitId, notes } = body

    if (!receivedQuantity || !unitId) {
      return NextResponse.json(
        { success: false, error: "receivedQuantity and unitId are required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Get purchase order detail
    const detail = await prisma.purchase_order_details.findUnique({
      where: { id },
      include: {
        purchase_orders: true,
        products: true
      }
    })

    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Purchase order detail not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Use import service
    const { importService } = await import('@/lib/services')

    // Generate import number
    const importNumber = `PO-RCV-${Date.now()}`

    await importService.createImport({
      importNumber: importNumber,
      warehouseId: detail.purchase_orders.warehouse_id,
      supplierId: detail.purchase_orders.supplier_id,
      importDate: new Date(),
      items: [{
        productId: detail.product_id,
        quantity: Number(receivedQuantity),
        unitId: unitId,
        unitPrice: detail.unit_price ? Number(detail.unit_price) : undefined
      }],
      notes: notes || `Received for PO: ${detail.purchase_orders.order_number}`,
      createdBy: user.id
    })

    // Update PO detail status
    await prisma.purchase_order_details.update({
      where: { id },
      data: {
        received_quantity: Number(receivedQuantity),
        status: 'RECEIVED'
      }
    })

    return NextResponse.json({
      success: true,
      message: "Purchase order received successfully with unit conversion",
      data: {
        productName: detail.products.name,
        receivedQuantity,
        unit: unitId
      }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error receiving purchase order:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
