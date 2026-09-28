import { prisma } from '@/lib/prisma'
import { unitConversionService } from './unit-conversion-service'

/**
 * Recipe Service
 * 
 * Handles product recipe creation and management with UNIT VALIDATION
 * 
 * CRITICAL: Recipe ingredient quantities MUST have units and be stored in base units
 * 
 * PROBLEM if not handled:
 * - Recipe says "20 coffee beans" without unit
 * - Is it 20g or 20 beans? → Ambiguous!
 * - When deducting for sale → Wrong quantity!
 */

export interface RecipeData {
    name: string
    code: string
    description?: string
    price?: number
    servingSize?: number
    outputQuantity: number // How many finished products this recipe makes
    outputUnitId: string  // Unit of finished product
    ingredients: RecipeIngredientData[]
    createdBy: string
}

export interface RecipeIngredientData {
    ingredientId: string
    quantity: number
    unitId: string // REQUIRED! Unit của ingredient
    notes?: string
}

export class RecipeService {
    /**
     * Create product recipe with unit validation
     * 
     * @param data - Recipe data with ingredients
     * @returns Created recipe ID
     */
    async createRecipe(data: RecipeData): Promise<string> {
        const {
            name,
            code,
            description,
            price,
            servingSize,
            outputQuantity,
            outputUnitId,
            ingredients,
            createdBy
        } = data

        // Validate recipe code is unique
        const existing = await prisma.product_recipes.findUnique({
            where: { code: code }
        })

        if (existing) {
            throw new Error(`Recipe code ${code} already exists`)
        }

        // Validate ingredients
        if (!ingredients || ingredients.length === 0) {
            throw new Error('Recipe must have at least one ingredient')
        }

        // Create recipe in transaction
        return await prisma.$transaction(async (tx) => {
            // Create recipe header
            const recipe = await tx.product_recipes.create({
                data: {
                    name: name,
                    code: code,
                    description: description,
                    price: price,
                    serving_size: servingSize,
                    output_quantity: outputQuantity,
                    output_unit_id: outputUnitId,
                    created_by: createdBy
                }
            })

            // Create ingredients with unit validation and conversion
            for (const ingredient of ingredients) {
                // Validate unit for this ingredient
                const isValidUnit = await unitConversionService.validateUnitForProduct(
                    ingredient.ingredientId,
                    ingredient.unitId
                )

                if (!isValidUnit) {
                    const product = await tx.products.findUnique({
                        where: { id: ingredient.ingredientId },
                        select: { code: true }
                    })

                    throw new Error(
                        `Invalid unit for ingredient ${product?.code || ingredient.ingredientId}`
                    )
                }

                // Store in the unit selected by admin (display unit)
                // Conversion to base unit happens during deduction (in deduction-service.ts)
                await tx.recipe_ingredients.create({
                    data: {
                        recipe_id: recipe.id,
                        ingredient_id: ingredient.ingredientId,
                        quantity_required: ingredient.quantity, // Store in display unit
                        unit_id: ingredient.unitId,             // Display unit ID
                        notes: ingredient.notes
                    }
                })
            }

            return recipe.id
        })
    }

    /**
     * Update recipe ingredients
     * Re-validates all units and conversions
     */
    async updateRecipeIngredients(
        recipeId: string,
        ingredients: RecipeIngredientData[]
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            // Delete existing ingredients
            await tx.recipe_ingredients.deleteMany({
                where: { recipe_id: recipeId }
            })

            // Add new ingredients with validation
            for (const ingredient of ingredients) {
                const isValidUnit = await unitConversionService.validateUnitForProduct(
                    ingredient.ingredientId,
                    ingredient.unitId
                )

                if (!isValidUnit) {
                    throw new Error(
                        `Invalid unit for ingredient ${ingredient.ingredientId}`
                    )
                }

                // Store in the unit selected by admin (display unit)
                // Conversion to base unit happens during deduction
                await tx.recipe_ingredients.create({
                    data: {
                        recipe_id: recipeId,
                        ingredient_id: ingredient.ingredientId,
                        quantity_required: ingredient.quantity, // Store in display unit
                        unit_id: ingredient.unitId,             // Display unit ID
                        notes: ingredient.notes
                    }
                })
            }
        })
    }

    /**
     * Get recipe with ingredients (with display unit options)
     */
    async getRecipeById(recipeId: string) {
        const recipe = await prisma.product_recipes.findUnique({
            where: { id: recipeId },
            include: {
                recipe_ingredients: {
                    include: {
                        ingredient: {
                            include: {
                                product_units: true
                            }
                        },
                        product_units: true
                    }
                },
                output_unit: true
            }
        })

        if (!recipe) {
            return null
        }

        // Enhance with display options for each ingredient
        const ingredientsWithDisplay = await Promise.all(
            recipe.recipe_ingredients.map(async (ing) => {
                const displayOptions = await unitConversionService.getDisplayUnitOptions(
                    ing.ingredient_id,
                    ing.quantity // Already in base unit
                )

                return {
                    ...ing,
                    displayOptions
                }
            })
        )

        return {
            ...recipe,
            recipe_ingredients: ingredientsWithDisplay
        }
    }

    /**
     * List recipes
     */
    async listRecipes(params: {
        skip?: number
        take?: number
    } = {}) {
        const { skip = 0, take = 50 } = params

        return await prisma.product_recipes.findMany({
            include: {
                output_unit: true,
                _count: {
                    select: {
                        recipe_ingredients: true
                    }
                }
            },
            orderBy: {
                created_at: 'desc'
            },
            skip,
            take
        })
    }

    /**
     * Calculate recipe cost (sum of ingredient costs)
     */
    async calculateRecipeCost(recipeId: string): Promise<number> {
        const recipe = await this.getRecipeById(recipeId)

        if (!recipe) {
            throw new Error(`Recipe not found: ${recipeId}`)
        }

        let totalCost = 0

        for (const ingredient of recipe.recipe_ingredients) {
            // Get latest import price for this ingredient
            const latestImport = await prisma.inventory_import_items.findFirst({
                where: {
                    product_id: ingredient.ingredient_id,
                    unit_price: { not: null }
                },
                orderBy: {
                    import: {
                        import_date: 'desc'
                    }
                },
                select: {
                    unit_price: true,
                    input_unit_id: true,
                    quantity: true
                }
            })

            if (latestImport && latestImport.unit_price) {
                // Calculate cost per base unit
                const costPerInputUnit = latestImport.unit_price
                const costPerBaseUnit = costPerInputUnit / latestImport.quantity

                // Cost for this ingredient = base_quantity × cost_per_base_unit
                const ingredientCost = ingredient.quantity * costPerBaseUnit
                totalCost += ingredientCost
            }
        }

        return totalCost
    }
}

// Singleton instance
export const recipeService = new RecipeService()
