import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * NEW API: Create sales invoice with recipe deduction
 * 
 * This API handles sales of recipe-based products and automatically:
 * 1. Creates sales invoice
 * 2. Deducts ALL ingredients from the recipes
 * 3. Updates warehouse_stock_realtime correctly
 * 
 * OLD PROBLEM: Only deducted finished product, NOT ingredients
 * NEW SOLUTION: Uses deduction-service to auto-deduct all recipe ingredients
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
            warehouseId,
            invoiceNumber,
            items, // Array of { recipeId, quantity, unitPrice }
            notes,
            discount,
            promotionId,
            voucherId
        } = body

        if (!warehouseId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid required fields" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Get user info
        const user = await prisma.users.findUnique({
            where: { id: payload.id },
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // CRITICAL: Check for IN_PROGRESS inventory check
        const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
        const lockCheck = await checkInventoryCheckLock(warehouseId)

        if (lockCheck.isLocked) {
            return NextResponse.json(
                { success: false, error: lockCheck.message } as ApiResponse<null>,
                { status: 423 } // 423 Locked
            )
        }

        // Transaction to create invoice + deduct ingredients
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create sales invoice
            const invoice = await tx.sales_invoices.create({
                data: {
                    invoice_number: invoiceNumber || `INV-${Date.now()}`,
                    warehouse_id: warehouseId,
                    total_amount: 0, // Will calculate
                    discount_amount: discount || 0,
                    promotion_id: promotionId,
                    voucher_id: voucherId,
                    notes: notes,
                    created_by: payload.id
                }
            })

            let totalAmount = 0
            const createdDeductions: string[] = []

            // 2. Process each item
            for (const item of items) {
                if (!item.recipeId || !item.quantity) {
                    throw new Error('Each item must have recipeId and quantity')
                }

                // Check if recipe exists
                const recipe = await tx.product_recipes.findUnique({
                    where: { id: item.recipeId },
                    include: {
                        recipe_ingredients: true
                    }
                })

                if (!recipe) {
                    throw new Error(`Recipe not found: ${item.recipeId}`)
                }

                // Create invoice item
                const invoiceItem = await tx.sales_invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        recipe_id: item.recipeId,
                        quantity: item.quantity,
                        unit_price: item.unitPrice || recipe.price,
                        line_total: item.quantity * (item.unitPrice || recipe.price || 0)
                    }
                })

                totalAmount += Number(invoiceItem.line_total || 0)

                // 3. CRITICAL: Use deduction service to deduct ingredients
                const { deductionService } = await import('@/lib/services')

                const deductionId = await deductionService.createRecipeDeduction({
                    invoiceId: invoice.id,
                    invoiceItemId: invoiceItem.id,
                    recipeId: item.recipeId,
                    warehouseId: warehouseId,
                    quantitySold: item.quantity,
                    tx: tx // Pass transaction to ensure atomicity
                })

                createdDeductions.push(deductionId)
            }

            // 4. Update invoice total
            await tx.sales_invoices.update({
                where: { id: invoice.id },
                data: {
                    total_amount: totalAmount - (discount || 0)
                }
            })

            return {
                invoice,
                totalAmount,
                deductionCount: createdDeductions.length
            }
        })

        // Get created invoice with details
        const invoiceWithDetails = await prisma.sales_invoices.findUnique({
            where: { id: result.invoice.id },
            include: {
                items: {
                    include: {
                        product_recipes: {
                            include: {
                                recipe_ingredients: {
                                    include: {
                                        ingredient: true
                                    }
                                }
                            }
                        }
                    }
                },
                warehouses: true
            }
        })

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: invoiceWithDetails?.id,
                    invoiceNumber: (invoiceWithDetails as any)?.invoice_number,
                    warehouse: (invoiceWithDetails as any)?.warehouses?.name,
                    totalAmount: (invoiceWithDetails as any)?.total_amount,
                    itemCount: (invoiceWithDetails as any)?.items?.length || 0,
                    deductionCount: result.deductionCount,
                    message: `Invoice created successfully. ${result.deductionCount} recipe deductions processed.`,
                    items: (invoiceWithDetails as any)?.items?.map((item: any) => ({
                        recipeName: item.product_recipes?.name,
                        quantity: item.quantity,
                        unitPrice: item.unit_price,
                        lineTotal: item.line_total,
                        ingredientsDeducted: item.product_recipes?.recipe_ingredients?.length || 0
                    }))
                },
            } as ApiResponse<any>,
            { status: 201 }
        )
    } catch (error: any) {
        console.error("Error creating sales with recipe deduction:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * GET: List sales invoices
 */
export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const page = parseInt(searchParams.get("page") || "1")
        const pageSize = parseInt(searchParams.get("pageSize") || "10")
        const warehouseId = searchParams.get("warehouseId")

        const token = getAuthToken(req)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const where: any = {}
        if (payload.warehouseId) {
            where.warehouse_id = payload.warehouseId
        } else if (warehouseId) {
            where.warehouse_id = warehouseId
        }

        const total = await prisma.sales_invoices.count({ where })

        const invoices = await prisma.sales_invoices.findMany({
            where,
            orderBy: { created_at: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                items: {
                    include: {
                        product_recipes: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                            },
                        },
                    },
                },
                warehouses: true,
                users: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                    },
                },
                recipe_deductions: {
                    include: {
                        ingredients: {
                            include: {
                                ingredient: true
                            }
                        }
                    }
                }
            },
        })

        return NextResponse.json({
            success: true,
            data: invoices,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        } as ApiResponse<any>)
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
