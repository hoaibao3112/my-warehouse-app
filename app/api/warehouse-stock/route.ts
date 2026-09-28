import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { ApiResponse } from "@/lib/types"

/**
 * LEGACY ENDPOINT - Backward Compatibility Proxy
 * 
 * This endpoint proxies to warehouse_stock_realtime for backward compatibility.
 * Frontend should migrate to /api/warehouse-stock-new for new features.
 * 
 * Deprecated since: 2026-01-15
 */

export async function GET(request: NextRequest) {
  try {
    console.warn('⚠️ DEPRECATED: /api/warehouse-stock. Use /api/warehouse-stock-new')

    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const limit = parseInt(searchParams.get("pageSize") || searchParams.get("limit") || "1000")

    // Query from warehouse_stock_realtime
    const where: any = {}
    if (warehouseId) {
      where.warehouse_id = warehouseId
    }

    const stocks = await prisma.warehouse_stock_realtime.findMany({
      where,
      include: {
        product: {
          include: {
            product_units: true  // Get base unit
          }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      },
      take: limit
    })

    // Format response to match old API structure
    const data = stocks.map(stock => ({
      id: stock.id,
      warehouse_id: stock.warehouse_id,
      warehouse_name: stock.warehouse.name,
      product_id: stock.product_id,
      product_code: stock.product.code,
      product_name: stock.product.name,
      quantity: stock.quantity,
      unit_id: stock.product.unit_id,
      unit_code: stock.product.product_units?.code || '',
      unit_name: stock.product.product_units?.name || '',
      breakdown: {
        qty_imported: stock.qty_imported || 0,
        qty_produced: stock.qty_produced || 0,
        qty_sold: stock.qty_sold || 0,
        qty_transferred_in: stock.qty_transferred_in || 0,
        qty_transferred_out: stock.qty_transferred_out || 0,
        qty_adjusted: stock.qty_adjusted || 0
      },
      updated_at: stock.updated_at,
      last_reconciled_at: stock.last_reconciled_at
    }))

    return NextResponse.json({
      success: true,
      data,
      _deprecated: true,
      _warning: 'This endpoint is deprecated. Please use /api/warehouse-stock-new',
      _newEndpoint: '/api/warehouse-stock-new'
    } as ApiResponse<any>, {
      headers: {
        'X-Deprecated': 'true',
        'X-Replacement-Endpoint': '/api/warehouse-stock-new'
      }
    })

  } catch (error: any) {
    console.error("Error in legacy warehouse-stock:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
