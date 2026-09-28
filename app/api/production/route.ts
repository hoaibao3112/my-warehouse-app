import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Production API
 * 
 * Handles manufacturing of finished products from ingredients
 * Uses production-service to:
 * 1. Deduct ingredients (PRODUCTION_OUT)
 * 2. Add finished products (PRODUCTION_IN)
 * 3. Update warehouse_stock_realtime atomically
 */

export async function POST(req: NextRequest) {
    try {
        const token = getAuthToken(req)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const body = await req.json()
        const {
            productionNumber,
            warehouseId,
            recipeId,
            quantityProduced,
            productionDate,
            notes
        } = body

        if (!warehouseId || !recipeId || !quantityProduced || quantityProduced <= 0) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid required fields" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Get user info
        const { prisma } = await import('@/lib/prisma')

        const user = await prisma.users.findUnique({
            where: { id: payload.id },
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // Generate production number if not provided
        const finalProductionNumber = productionNumber ||
            `PRD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`

        // Use production service
        const { productionService } = await import('@/lib/services')

        const productionId = await productionService.createProduction({
            productionNumber: finalProductionNumber,
            warehouseId: warehouseId,
            recipeId: recipeId,
            quantityProduced: quantityProduced,
            productionDate: productionDate ? new Date(productionDate) : new Date(),
            notes: notes,
            createdBy: payload.id
        })

        // Get created production with details
        const production = await productionService.getProductionById(productionId)

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: production?.id,
                    productionNumber: production?.production_number,
                    warehouseId: production?.warehouse_id,
                    warehouseName: production?.warehouse?.name,
                    recipeName: production?.recipe?.name,
                    productName: production?.recipe?.products?.name,
                    quantityProduced: production?.quantity_produced,
                    ingredientsUsed: production?.ingredients?.length || 0,
                    productionDate: production?.production_date,
                    message: `Sản xuất thành công: ${quantityProduced} ${production?.recipe?.products?.name || 'sản phẩm'}. Đã trừ ${production?.ingredients?.length || 0} nguyên liệu.`,
                    ingredients: production?.ingredients?.map(ing => ({
                        name: ing.ingredient?.name,
                        code: ing.ingredient?.code,
                        quantityUsed: ing.quantity_used,
                        unit: ing.ingredient?.product_units?.code
                    }))
                },
            } as ApiResponse<any>,
            { status: 201 }
        )
    } catch (error: any) {
        console.error("Error creating production:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * GET: List productions
 */
export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const warehouseId = searchParams.get("warehouseId")
        const recipeId = searchParams.get("recipeId")
        const page = parseInt(searchParams.get("page") || "1")
        const pageSize = parseInt(searchParams.get("pageSize") || "20")

        const token = getAuthToken(req)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { productionService } = await import('@/lib/services')

        const productions = await productionService.listProductions({
            warehouseId: warehouseId || undefined,
            recipeId: recipeId || undefined,
            skip: (page - 1) * pageSize,
            take: pageSize
        })

        const { prisma } = await import('@/lib/prisma')

        const where: any = {}
        if (warehouseId) where.warehouse_id = warehouseId
        if (recipeId) where.recipe_id = recipeId

        const total = await prisma.production_transactions.count({ where })

        return NextResponse.json({
            success: true,
            data: productions,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error fetching productions:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
