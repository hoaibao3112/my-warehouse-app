import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { ApiResponse } from "@/lib/types"

/**
 * GET /api/warehouse-stock/total-value
 * 
 * Calculates total inventory value for a warehouse
 * Query params:
 * - warehouseId: warehouse ID (required)
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const warehouseId = searchParams.get("warehouseId")

        if (!warehouseId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "warehouseId is required"
                } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Query all stock records for the warehouse with product price
        // Use raw query for better performance
        const result = await prisma.$queryRaw<Array<{ total_value: number | null }>>`
      SELECT 
        SUM(wsr.quantity * p.price) as total_value
      FROM warehouse_stock_realtime wsr
      INNER JOIN products p ON p.id = wsr.product_id
      WHERE wsr.warehouse_id = ${warehouseId}::uuid
        AND p.price IS NOT NULL
        AND p.price > 0
    `

        const totalValue = result[0]?.total_value || 0

        return NextResponse.json({
            success: true,
            data: {
                warehouseId,
                totalValue: Number(totalValue) || 0
            }
        } as ApiResponse<{ warehouseId: string; totalValue: number }>)

    } catch (error: any) {
        console.error("Error calculating total inventory value:", error)
        return NextResponse.json(
            {
                success: false,
                error: error?.message || String(error)
            } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
