import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Inventory Movement Report
 * 
 * UPDATED: Now includes unit display information from warehouse_stock_realtime
 */

export async function GET(req: NextRequest) {
  try {
    const token = getAuthToken(req)
    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    // Get stock movements from realtime table with unit info
    const movements = await prisma.warehouse_stock_realtime.findMany({
      where: warehouseId ? { warehouse_id: warehouseId } : {},
      include: {
        product: {
          include: {
            product_units: true
          }
        },
        warehouse: true
      }
    })

    return NextResponse.json({
      success: true,
      data: movements.map(m => ({
        productName: m.product.name,
        productCode: m.product.code,
        warehouse: m.warehouse.name,
        quantity: m.quantity,
        unit: m.product.product_units?.code || 'N/A',
        lastUpdated: m.updated_at
      }))
    } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
