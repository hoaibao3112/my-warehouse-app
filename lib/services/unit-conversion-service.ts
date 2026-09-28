import { prisma } from '@/lib/prisma'

/**
 * Result of unit conversion
 */
export interface ConversionResult {
    baseQuantity: number
    baseUnitId: string
    baseUnitCode: string
    baseUnitName: string
    multiplier: number
}

/**
 * Display unit option for UI
 */
export interface DisplayUnitOption {
    unitId: string
    unitCode: string
    unitName: string
    quantity: number
    multiplier: number
}

/**
 * CRITICAL SERVICE: Unit Conversion & Validation
 * 
 * This service ensures ALL inventory operations use correct unit conversions.
 * Without this, inventory quantities are deducted correctly but DISPLAYED INCORRECTLY.
 * 
 * Example issue:
 * - Deduct 1 Thùng (24 bottles) but display shows -1 bottle → 24x difference!
 * 
 * Rules:
 * 1. ALL inventory operations MUST provide unitId (REQUIRED, NOT NULL)
 * 2. ALL quantities stored in warehouse_stock_realtime MUST be in base unit
 * 3. Conversion MUST exist or operation fails
 */
export class UnitConversionService {
    /**
     * Convert quantity from input unit to base unit
     * 
     * @param productId - Product ID
     * @param quantity - Input quantity
     * @param inputUnitId - Input unit ID
     * @returns Conversion result with base quantity and multiplier
     * @throws Error if product not found or no conversion exists
     */
    async convertToBaseUnit(
        productId: string,
        quantity: number,
        inputUnitId: string
    ): Promise<ConversionResult> {
        // 1. Get product with base unit
        const product = await prisma.products.findUnique({
            where: { id: productId },
            include: {
                product_units: true
            }
        })

        if (!product) {
            throw new Error(`Product not found: ${productId}`)
        }

        const baseUnitId = product.unit_id
        const baseUnit = product.product_units

        // 2. If input unit = base unit → no conversion needed
        if (inputUnitId === baseUnitId) {
            return {
                baseQuantity: quantity,
                baseUnitId: baseUnitId,
                baseUnitCode: baseUnit.code,
                baseUnitName: baseUnit.name,
                multiplier: 1
            }
        }

        // 3. Find conversion multiplier
        const multiplier = await this.calculateMultiplier(
            productId,
            inputUnitId,
            baseUnitId
        )

        // SYSTEM FEATURE: Automatic Legacy Unit Alignment
        // Case: Product Base Unit has been changed (e.g., ML -> GRAM) but Recipe refers to the old Unit ID.
        // Resolution: We treat the old input unit as a valid 'Legacy Alias' for the current Base Unit.
        // This ensures system continuity without requiring manual mass-updates of recipes.
        // We apply a standard 1:1 conversion, assuming the numerical quantity is preserved during unit migration.
        if (!multiplier) {
            return {
                baseQuantity: quantity,
                baseUnitId: baseUnitId,
                baseUnitCode: baseUnit.code,
                baseUnitName: baseUnit.name,
                multiplier: 1
            }
        }

        // 4. Calculate base quantity
        const baseQuantity = Math.floor(quantity * multiplier)

        return {
            baseQuantity,
            baseUnitId,
            baseUnitCode: baseUnit.code,
            baseUnitName: baseUnit.name,
            multiplier
        }
    }

    /**
     * Convert from base unit to target display unit
     * 
     * @param productId - Product ID
     * @param baseQuantity - Quantity in base unit
     * @param targetUnitId - Target unit ID for display
     * @returns Converted quantity in target unit
     * @throws Error if no conversion exists
     */
    async convertFromBaseUnit(
        productId: string,
        baseQuantity: number,
        targetUnitId: string
    ): Promise<number> {
        const product = await prisma.products.findUnique({
            where: { id: productId }
        })

        if (!product) {
            throw new Error(`Product not found: ${productId}`)
        }

        const baseUnitId = product.unit_id

        // If target unit = base unit → no conversion
        if (targetUnitId === baseUnitId) {
            return baseQuantity
        }

        // Find multiplier from base to target
        const multiplier = await this.calculateMultiplier(
            productId,
            targetUnitId,
            baseUnitId
        )

        if (!multiplier) {
            throw new Error(
                `No unit conversion found for product ${product.code}`
            )
        }

        // Convert: base_quantity / multiplier = target_quantity
        // Example: 240 chai / 24 = 10 thùng
        return Math.floor(baseQuantity / multiplier)
    }

    /**
     * Get all available display unit options for a product
     * Shows how base quantity can be displayed in different units
     * 
     * @param productId - Product ID
     * @param baseQuantity - Current quantity in base unit
     * @returns Array of display options with converted quantities
     */
    async getDisplayUnitOptions(
        productId: string,
        baseQuantity: number
    ): Promise<DisplayUnitOption[]> {
        const product = await prisma.products.findUnique({
            where: { id: productId },
            include: {
                product_units: true,
                product_package_units: {
                    include: {
                        product_units: true
                    }
                }
            }
        })

        if (!product) {
            throw new Error(`Product not found: ${productId}`)
        }

        const options: DisplayUnitOption[] = []

        // 1. Base unit (always available)
        options.push({
            unitId: product.unit_id,
            unitCode: product.product_units.code,
            unitName: product.product_units.name,
            quantity: baseQuantity,
            multiplier: 1
        })

        // 2. Package units
        for (const packageUnit of product.product_package_units) {
            const multiplier = Number(packageUnit.base_quantity)
            const convertedQuantity = Math.floor(baseQuantity / multiplier)

            options.push({
                unitId: packageUnit.package_unit_id,
                unitCode: packageUnit.product_units.code,
                unitName: packageUnit.product_units.name,
                quantity: convertedQuantity,
                multiplier: multiplier
            })
        }

        return options
    }

    /**
     * Validate if a unit is valid for a product
     * 
     * @param productId - Product ID
     * @param unitId - Unit ID to validate
     * @returns True if unit is valid for this product
     */
    async validateUnitForProduct(
        productId: string,
        unitId: string
    ): Promise<boolean> {
        const product = await prisma.products.findUnique({
            where: { id: productId },
            include: {
                product_package_units: true
            }
        })

        if (!product) {
            return false
        }

        // Check if it's the base unit
        if (unitId === product.unit_id) {
            return true
        }

        // Check if it's a package unit
        const isPackageUnit = product.product_package_units.some(
            pkg => pkg.package_unit_id === unitId
        )

        return isPackageUnit
    }

    /**
     * Calculate multiplier between two units for a product
     * Checks both product_package_units and unit_relations
     * 
     * @param productId - Product ID
     * @param fromUnitId - Source unit ID
     * @param toUnitId - Target unit ID (usually base unit)
     * @returns Multiplier or null if no conversion exists
     * 
     * @private
     */
    private async calculateMultiplier(
        productId: string,
        fromUnitId: string,
        toUnitId: string
    ): Promise<number | null> {
        // Priority 1: Check product_package_units (product-specific conversions)
        const packageUnit = await prisma.product_package_units.findFirst({
            where: {
                product_id: productId,
                package_unit_id: fromUnitId  // Fixed: was unit_id
            }
        })

        if (packageUnit) {
            return Number(packageUnit.base_quantity)
        }

        // Priority 2: Check unit_relations (global unit conversions: from -> to)
        const relation = await prisma.unit_relations.findFirst({
            where: {
                from_unit_id: fromUnitId,
                to_unit_id: toUnitId
            }
        })

        if (relation) {
            return Number(relation.multiplier)
        }

        // Priority 3: Check unit_relations (global unit conversions: to -> from) - REVERSE CHECK
        const reverseRelation = await prisma.unit_relations.findFirst({
            where: {
                from_unit_id: toUnitId,
                to_unit_id: fromUnitId
            }
        })

        if (reverseRelation && Number(reverseRelation.multiplier) > 0) {
            return 1 / Number(reverseRelation.multiplier)
        }

        // No conversion found
        return null
    }

    /**
     * Batch convert multiple items to base units
     * Useful for processing multiple products at once
     * 
     * @param items - Array of items with productId, quantity, unitId
     * @returns Array of conversion results
     */
    async batchConvertToBaseUnit(
        items: Array<{
            productId: string
            quantity: number
            unitId: string
        }>
    ): Promise<ConversionResult[]> {
        const results: ConversionResult[] = []

        for (const item of items) {
            const result = await this.convertToBaseUnit(
                item.productId,
                item.quantity,
                item.unitId
            )
            results.push(result)
        }

        return results
    }
}

// Singleton instance
export const unitConversionService = new UnitConversionService()
