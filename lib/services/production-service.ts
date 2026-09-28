import { prisma } from '@/lib/prisma'
import { inventoryService, StockOperation } from './inventory-service'

/**
 * Production data
 */
export interface ProductionData {
    productionNumber: string
    warehouseId: string
    recipeId: string
    quantityProduced: number // Number of finished products to produce
    productionDate: Date
    notes?: string
    createdBy: string
}

/**
 * Production Service
 * 
 * Handles production of finished products from ingredients
 * 
 * Flow:
 * 1. Get recipe with ingredients
 * 2. Deduct ingredients from stock (PRODUCTION_OUT)
 * 3. Add finished products to stock (PRODUCTION_IN)
 * 4. Record production transaction with ingredient usage
 * 
 * Example:
 * - Produce 10 coffees
 * - Recipe: 1 coffee = 20g beans + 200ml milk
 * - Action: Deduct 200g beans + 2000ml milk, Add 10 coffees
 */
export class ProductionService {
    /**
     * Create production transaction
     * 
     * @param data - Production data
     * @returns Created production ID
     * @throws Error if insufficient ingredients
     */
    async createProduction(data: ProductionData): Promise<string> {
        const { productionNumber, warehouseId, recipeId, quantityProduced, productionDate, notes, createdBy } = data

        // Validate production number is unique
        const existing = await prisma.production_transactions.findUnique({
            where: { production_number: productionNumber }
        })

        if (existing) {
            throw new Error(`Production number ${productionNumber} already exists`)
        }

        // Get recipe with ingredients and product info
        const recipe = await prisma.product_recipes.findUnique({
            where: { id: recipeId },
            include: {
                recipe_ingredients: {
                    include: {
                        ingredient: {
                            include: {
                                product_units: true
                            }
                        }
                    }
                },
                products: {
                    select: {
                        id: true,
                        code: true,
                        unit_id: true
                    }
                }
            }
        })

        if (!recipe) {
            throw new Error(`Recipe not found: ${recipeId}`)
        }

        if (!recipe.products) {
            throw new Error(`Recipe ${recipe.name} is not linked to a product`)
        }

        if (recipe.recipe_ingredients.length === 0) {
            throw new Error(`Recipe ${recipe.name} has no ingredients defined`)
        }

        // Create production in transaction
        return await prisma.$transaction(async (tx) => {
            // 1. Create production header
            const production = await tx.production_transactions.create({
                data: {
                    production_number: productionNumber,
                    warehouse_id: warehouseId,
                    recipe_id: recipeId,
                    quantity_produced: quantityProduced,
                    production_date: productionDate,
                    notes: notes,
                    created_by: createdBy
                }
            })

            // 2. Deduct ingredients and record usage (In Parallel)
            const ingredientPromises = recipe.recipe_ingredients.map(async (ingredient) => {
                const quantityToDeduct = ingredient.quantity * quantityProduced

                // Record ingredient usage
                await tx.production_ingredient_usages.create({
                    data: {
                        production_id: production.id,
                        ingredient_id: ingredient.ingredient_id,
                        quantity_used: quantityToDeduct
                    }
                })

                // Deduct from stock
                return inventoryService.updateStock({
                    warehouseId: warehouseId,
                    productId: ingredient.ingredient_id,
                    quantityChange: -quantityToDeduct,
                    operation: StockOperation.PRODUCTION_OUT,
                    tx // Pass transaction
                })
            })

            await Promise.all(ingredientPromises)

            // 3. Add finished products to stock
            const finishedProductQuantity = recipe.output_quantity * quantityProduced

            await inventoryService.updateStock({
                warehouseId: warehouseId,
                productId: recipe.products.id,
                quantityChange: finishedProductQuantity,
                operation: StockOperation.PRODUCTION_IN,
                tx // Pass transaction
            })

            return production.id
        }, {
            timeout: 60000 // 60s timeout
        })
    }

    /**
     * Get production by ID with details
     */
    async getProductionById(productionId: string) {
        return await prisma.production_transactions.findUnique({
            where: { id: productionId },
            include: {
                ingredients: {
                    include: {
                        ingredient: {
                            include: {
                                product_units: true
                            }
                        }
                    }
                },
                recipe: {
                    include: {
                        products: true
                    }
                },
                warehouse: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        full_name: true
                    }
                }
            }
        })
    }

    /**
     * List productions with pagination
     */
    async listProductions(params: {
        warehouseId?: string
        recipeId?: string
        skip?: number
        take?: number
    }) {
        const { warehouseId, recipeId, skip = 0, take = 50 } = params

        return await prisma.production_transactions.findMany({
            where: {
                warehouse_id: warehouseId,
                recipe_id: recipeId
            },
            include: {
                recipe: {
                    include: {
                        products: true
                    }
                },
                warehouse: true,
                user: {
                    select: {
                        id: true,
                        full_name: true
                    }
                },
                _count: {
                    select: {
                        ingredients: true
                    }
                }
            },
            orderBy: {
                production_date: 'desc'
            },
            skip,
            take
        })
    }

    /**
     * Get production summary for a period
     */
    async getProductionSummary(params: {
        warehouseId: string
        startDate: Date
        endDate: Date
    }) {
        const { warehouseId, startDate, endDate } = params

        const productions = await prisma.production_transactions.findMany({
            where: {
                warehouse_id: warehouseId,
                production_date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            include: {
                recipe: {
                    include: {
                        products: true
                    }
                }
            }
        })

        // Group by product
        const summary = new Map<string, {
            productId: string
            productCode: string
            productName: string
            totalProduced: number
        }>()

        for (const prod of productions) {
            const productId = prod.recipe.products?.id
            if (!productId) continue

            const existing = summary.get(productId)
            if (existing) {
                existing.totalProduced += prod.quantity_produced
            } else {
                summary.set(productId, {
                    productId: productId,
                    productCode: prod.recipe.products!.code,
                    productName: prod.recipe.name,
                    totalProduced: prod.quantity_produced
                })
            }
        }

        return Array.from(summary.values())
    }
}

// Singleton instance
export const productionService = new ProductionService()
