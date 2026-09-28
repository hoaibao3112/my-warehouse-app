import { prisma } from '@/lib/prisma'
import { inventoryService, StockOperation } from './inventory-service'
import { unitConversionService } from './unit-conversion-service'

/**
 * Recipe deduction data
 */
export interface RecipeDeductionData {
    invoiceId: string
    invoiceItemId: string
    recipeId: string
    warehouseId: string
    quantitySold: number // Number of dishes sold
    tx?: any // Optional transaction client
}

/**
 * Ingredient validation result
 */
export interface IngredientValidationResult {
    recipeId: string
    recipeName: string
    sufficient: boolean
    insufficient: Array<{
        productId: string
        productCode: string
        productName: string
        required: number
        available: number
        unit: string
    }>
}

/**
 * Deduction Service
 * 
 * Handles ingredient deductions when selling recipe-based products
 * 
 * Key Logic:
 * - When selling a dish (e.g., 1 coffee), deduct all ingredients from recipe
 * - ALL quantities stored in BASE UNIT
 * - Recipe ingredients are already defined in base units
 * - Creates detailed deduction records for audit trail
 * 
 * Example:
 * - Sell 2 coffees
 * - Recipe: 1 coffee = 20g coffee beans + 200ml milk
 * - Deduct: 40g coffee beans + 400ml milk from warehouse
 */
export class DeductionService {
    /**
     * Validate if there are enough ingredients for a recipe
     * CRITICAL: Call this BEFORE creating invoice to prevent failed sales
     * 
     * @param recipeId - Recipe ID
     * @param warehouseId - Warehouse ID
     * @param quantitySold - Quantity to be sold
     * @returns Validation result with insufficient ingredients (if any)
     */
    async validateRecipeIngredients(
        recipeId: string,
        recipeName: string,
        warehouseId: string,
        quantitySold: number
    ): Promise<IngredientValidationResult> {
        // Get recipe with ingredients
        const recipe = await prisma.product_recipes.findUnique({
            where: { id: recipeId },
            include: {
                recipe_ingredients: {
                    include: {
                        products: true,
                        product_units: true
                    }
                }
            }
        })

        if (!recipe) {
            throw new Error(`Recipe not found: ${recipeId}`)
        }

        const insufficient: IngredientValidationResult['insufficient'] = []

        // Check each ingredient
        for (const ingredient of recipe.recipe_ingredients) {
            try {
                // Calculate quantity needed (in ingredient's stored unit)
                const quantityNeeded = Number(ingredient.quantity_required) * quantitySold

                // Convert to base unit for stock checking
                const conversion = await unitConversionService.convertToBaseUnit(
                    ingredient.ingredient_id,
                    quantityNeeded,
                    ingredient.unit_id
                )

                const quantityToDeduct = conversion.baseQuantity

                // Get current stock
                const currentStock = await inventoryService.getRealtimeStock(
                    warehouseId,
                    ingredient.ingredient_id
                )

                const availableQuantity = currentStock?.quantity || 0

                // Check if sufficient
                // MODIFIED: Allow negative stock (User request: bán hàng tồn kho có thể âm)
                /* 
                if (availableQuantity < quantityToDeduct) {
                    insufficient.push({
                        productId: ingredient.ingredient_id,
                        productCode: ingredient.products.code,
                        productName: ingredient.products.name,
                        required: quantityToDeduct,
                        available: availableQuantity,
                        unit: conversion.baseUnitCode
                    })
                }
                */
            } catch (conversionError: any) {
                // If conversion fails, treat as insufficient with error details
                insufficient.push({
                    productId: ingredient.ingredient_id,
                    productCode: ingredient.products.code,
                    productName: ingredient.products.name,
                    required: -1, // Indicate conversion error
                    available: -1,
                    unit: conversionError.message || 'CONVERSION_ERROR'
                })
            }
        }

        return {
            recipeId,
            recipeName: recipeName,
            sufficient: insufficient.length === 0,
            insufficient
        }
    }

    /**
     * Batch validate multiple recipes
     * CRITICAL: Call this BEFORE creating invoice to prevent failed sales
     * 
     * @param items - Array of items to validate
     * @returns Array of validation results
     */
    async batchValidateRecipeIngredients(items: Array<{
        recipeId: string
        recipeName: string
        warehouseId: string
        quantitySold: number
    }>): Promise<IngredientValidationResult[]> {
        const results: IngredientValidationResult[] = []

        for (const item of items) {
            const result = await this.validateRecipeIngredients(
                item.recipeId,
                item.recipeName,
                item.warehouseId,
                item.quantitySold
            )
            results.push(result)
        }

        return results
    }

    /**
     * Create recipe deduction when selling a dish
     * 
     * @param data - Deduction data
     * @returns Created deduction ID
     * @throws Error if insufficient stock or recipe not found
     */
    async createRecipeDeduction(data: RecipeDeductionData): Promise<string> {
        const { invoiceId, invoiceItemId, recipeId, warehouseId, quantitySold, tx: clientTx } = data

        const performDeduction = async (tx: any) => {
            // Get recipe with ingredients
            const recipe = await tx.product_recipes.findUnique({
                where: { id: recipeId },
                include: {
                    recipe_ingredients: {
                        include: {
                            products: true,  // The ingredient (relation name is 'products')
                            product_units: true
                        }
                    }
                }
            })

            if (!recipe) {
                throw new Error(`Recipe not found: ${recipeId}`)
            }

            if (recipe.recipe_ingredients.length === 0) {
                throw new Error(`Recipe ${recipe.name} has no ingredients defined`)
            }

            // 1. Create deduction header
            const deduction = await tx.recipe_deductions.create({
                data: {
                    invoice_id: invoiceId,
                    invoice_item_id: invoiceItemId,
                    recipe_id: recipeId,
                    warehouse_id: warehouseId,
                    quantity_sold: quantitySold,
                    deduction_date: new Date()
                }
            })

            // 2. Deduct each ingredient
            for (const ingredient of recipe.recipe_ingredients) {
                // CRITICAL: ingredient.quantity_required might be in ANY unit (kg, l, etc.)
                // We MUST convert to base unit before deducting from warehouse_stock_realtime

                // Calculate quantity needed for this sale (in ingredient's stored unit)
                const quantityNeeded = Number(ingredient.quantity_required) * quantitySold

                // Convert to base unit for stock deduction
                const conversion = await unitConversionService.convertToBaseUnit(
                    ingredient.ingredient_id,
                    quantityNeeded,
                    ingredient.unit_id
                )

                const quantityToDeduct = conversion.baseQuantity

                // Create deduction item record (store actual deducted amount in base unit)
                await tx.recipe_deduction_items.create({
                    data: {
                        deduction_id: deduction.id,
                        ingredient_id: ingredient.ingredient_id,
                        quantity_deducted: quantityToDeduct
                    }
                })

                // Update stock (negative quantity for deduction, ALWAYS in base unit)
                // PASS TRANSACTION CLIENT TO PARTICIPATE IN ATOMICITY
                // Update stock (negative quantity for deduction, ALWAYS in base unit)
                // PASS TRANSACTION CLIENT TO PARTICIPATE IN ATOMICITY
                await inventoryService.updateStock({
                    warehouseId: warehouseId,
                    productId: ingredient.ingredient_id,
                    quantityChange: -quantityToDeduct, // Negative for deduction, in BASE UNIT
                    operation: StockOperation.SALE,
                    tx: tx,
                    baseUnitId: conversion.baseUnitId, // Optimization
                    skipLockCheck: true // Optimization
                })
            }

            return deduction.id
        }

        if (clientTx) {
            return await performDeduction(clientTx)
        } else {
            return await prisma.$transaction(async (tx) => await performDeduction(tx))
        }
    }

    /**
     * Batch create recipe deductions for multiple items (OPTIMIZED)
     * 
     * Processes all items in a SINGLE transaction for maximum performance
     * 
     * @param items - Array of deduction data with pre-fetched recipes
     * @returns Array of created deduction IDs
     * @throws Error if insufficient stock or recipe validation fails
     */
    /**
     * Batch create recipe deductions for multiple items (OPTIMIZED)
     * 
     * Processes all items in a SINGLE transaction for maximum performance
     * 
     * @param items - Array of deduction data with pre-fetched recipes
     * @param tx - Optional transaction client
     * @returns Array of created deduction IDs
     * @throws Error if insufficient stock or recipe validation fails
     */
    async batchCreateRecipeDeductions(items: Array<{
        invoiceId: string
        invoiceItemId: string
        recipeId: string
        recipe: any // Pre-fetched recipe with ingredients
        warehouseId: string
        quantitySold: number
    }>, tx?: any): Promise<string[]> {
        // Validate all recipes first
        for (const item of items) {
            if (!item.recipe) {
                throw new Error(`Recipe not found: ${item.recipeId}`)
            }
            if (item.recipe.recipe_ingredients.length === 0) {
                throw new Error(`Recipe ${item.recipe.name} has no ingredients defined`)
            }
        }

        // Pre-calculate conversions in parallel to save transaction time
        // We do this BEFORE the write operations loop to minimize transaction lock time vs processing time

        // Simpler approach: Map items to promise of prepared data
        const preparationPromises = items.map(async (item) => {
            const ingredientPromises = item.recipe.recipe_ingredients.map(async (ingredient: any) => {
                const quantityNeeded = Number(ingredient.quantity_required) * item.quantitySold
                const conversion = await unitConversionService.convertToBaseUnit(
                    ingredient.ingredient_id,
                    quantityNeeded,
                    ingredient.unit_id
                )
                return {
                    ingredient,
                    quantityNeeded,
                    conversion
                }
            })

            const ingredients = await Promise.all(ingredientPromises)
            return {
                item,
                ingredients
            }
        })

        // Wait for ALL conversions to finish (Read operations - mostly outside tx lock if global prisma used, 
        // but here we are inside route.ts transaction. Still, parallel is faster).
        const fullyPreparedItems = await Promise.all(preparationPromises)

        const performBatchDeduction = async (transaction: any) => {
            const deductionIds: string[] = []

            const stockUpdates: Array<{
                warehouseId: string
                productId: string
                quantityChange: number
                baseUnitId: string
            }> = []

            // execute Writes sequentially (required for tx)
            for (const prepared of fullyPreparedItems) {
                const { item, ingredients } = prepared

                // 1. Create deduction header
                const deduction = await transaction.recipe_deductions.create({
                    data: {
                        invoice_id: item.invoiceId,
                        invoice_item_id: item.invoiceItemId,
                        recipe_id: item.recipeId,
                        warehouse_id: item.warehouseId,
                        quantity_sold: item.quantitySold,
                        deduction_date: new Date()
                    }
                })

                deductionIds.push(deduction.id)

                // 2. Create deduction items using prepared conversions
                for (const prep of ingredients) {
                    const { ingredient, quantityNeeded, conversion } = prep
                    const quantityToDeduct = conversion.baseQuantity
                    const baseUnitId = conversion.baseUnitId

                    // Create deduction item
                    await transaction.recipe_deduction_items.create({
                        data: {
                            deduction_id: deduction.id,
                            ingredient_id: ingredient.ingredient_id,
                            quantity_deducted: quantityToDeduct
                        }
                    })

                    // Collect stock update
                    stockUpdates.push({
                        warehouseId: item.warehouseId,
                        productId: ingredient.ingredient_id,
                        quantityChange: -quantityToDeduct,
                        baseUnitId: baseUnitId
                    })
                }
            }

            // 3. Batch update all stocks
            for (const update of stockUpdates) {
                await inventoryService.updateStock({
                    warehouseId: update.warehouseId,
                    productId: update.productId,
                    quantityChange: update.quantityChange,
                    operation: StockOperation.SALE,
                    tx: transaction, // Use the transaction!
                    baseUnitId: update.baseUnitId, // Optimization: skip product lookup
                    skipLockCheck: true // Optimization: skip lock check (already checked at controller level)
                })
            }

            return deductionIds
        }

        if (tx) {
            return await performBatchDeduction(tx)
        } else {
            return await prisma.$transaction(async (t) => await performBatchDeduction(t))
        }
    }

    /**
     * Get deduction by ID with items
     */
    async getDeductionById(deductionId: string) {
        return await prisma.recipe_deductions.findUnique({
            where: { id: deductionId },
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
                recipe: true,
                invoice: true,
                warehouse: true
            }
        })
    }

    /**
     * List deductions for an invoice
     */
    async listDeductionsByInvoice(invoiceId: string) {
        return await prisma.recipe_deductions.findMany({
            where: { invoice_id: invoiceId },
            include: {
                ingredients: {
                    include: {
                        ingredient: true
                    }
                },
                recipe: true
            }
        })
    }

    /**
     * Get total ingredient usage for a warehouse in date range
     * Useful for reporting
     */
    async getIngredientUsage(params: {
        warehouseId: string
        ingredientId?: string
        startDate: Date
        endDate: Date
    }) {
        const { warehouseId, ingredientId, startDate, endDate } = params

        const usage = await prisma.recipe_deduction_items.aggregate({
            where: {
                ingredient_id: ingredientId,
                deduction: {
                    warehouse_id: warehouseId,
                    deduction_date: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            },
            _sum: {
                quantity_deducted: true
            },
            _count: {
                id: true
            }
        })

        return {
            ingredientId: ingredientId,
            totalQuantityDeducted: usage._sum.quantity_deducted || 0,
            transactionCount: usage._count.id
        }
    }
}

// Singleton instance
export const deductionService = new DeductionService()
