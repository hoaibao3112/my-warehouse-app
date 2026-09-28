import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * NEW API: Warehouse Stock with new architecture
 * 
 * Reads from warehouse_stock_realtime (Single Source of Truth)
 * Provides display unit options for frontend
 */

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const warehouseId = searchParams.get("warehouseId")
        const

            productId = searchParams.get("productId")
        const page = parseInt(searchParams.get("page") || "1")
        const pageSize = parseInt(searchParams.get("pageSize") || "50")

        const token = getAuthToken(req)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        // Import services
        const { inventoryService, unitConversionService } = await import('@/lib/services')

        // If specific product requested
        if (warehouseId && productId) {
            const stock = await inventoryService.getRealtimeStock(warehouseId, productId)

            if (!stock) {
                return NextResponse.json({
                    success: true,
                    data: {
                        productId,
                        warehouseId,
                        quantity: 0,
                        message: "No stock record found"
                    }
                } as ApiResponse<any>)
            }

            // Get display unit options
            const displayOptions = await unitConversionService.getDisplayUnitOptions(
                productId,
                stock.quantity
            )

            return NextResponse.json({
                success: true,
                data: {
                    productId: stock.productId,
                    warehouseId: stock.warehouseId,

                    // Base unit (source of truth)
                    baseQuantity: stock.quantity,
                    baseUnit: stock.unit,

                    // Display options for UI
                    displayOptions: displayOptions,

                    // Breakdown for analytics
                    breakdown: stock.breakdown,

                    // Metadata
                    lastUpdated: stock.lastUpdated,
                    version: stock.version
                }
            } as ApiResponse<any>)
        }

        // Otherwise, list all stock in warehouse
        const { prisma } = await import('@/lib/prisma')

        const where: any = {}
        if (warehouseId) {
            where.warehouse_id = warehouseId
        }

        const total = await prisma.warehouse_stock_realtime.count({ where })

        const stocks = await prisma.warehouse_stock_realtime.findMany({
            where,
            include: {
                product: {
                    select: {
                        id: true,
                        code: true,
                        name: true
                    }
                },
                base_unit: {
                    select: {
                        id: true,
                        code: true,
                        name: true
                    }
                },
                warehouse: {
                    select: {
                        id: true,
                        name: true,
                        type: true
                    }
                }
            },
            orderBy: {
                last_updated: 'desc'
            },
            skip: (page - 1) * pageSize,
            take: pageSize
        })

        // For each stock, get display options
        const stocksWithDisplayOptions = await Promise.all(
            stocks.map(async (stock) => {
                const displayOptions = await unitConversionService.getDisplayUnitOptions(
                    stock.product_id,
                    stock.quantity
                )

                return {
                    productId: stock.product_id,
                    productCode: stock.product.code,
                    productName: stock.product.name,
                    warehouseId: stock.warehouse_id,
                    warehouseName: stock.warehouse.name,

                    baseQuantity: stock.quantity,
                    baseUnit: stock.base_unit,

                    displayOptions: displayOptions,

                    breakdown: {
                        qtyImported: stock.qty_imported,
                        qtyProduced: stock.qty_produced,
                        qtySold: stock.qty_sold,
                        qtyTransferredIn: stock.qty_transferred_in,
                        qtyTransferredOut: stock.qty_transferred_out,
                        qtyAdjusted: stock.qty_adjusted
                    },

                    lastUpdated: stock.last_updated,
                    version: stock.version
                }
            })
        )

        return NextResponse.json({
            success: true,
            data: stocksWithDisplayOptions,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error fetching warehouse stock:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
