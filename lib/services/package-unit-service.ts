import { prisma } from '@/lib/prisma'

/**
 * Package Unit Service
 * 
 * Manages product package units (conversion ratios)
 * 
 * Schema for product_package_units:
 * - id, product_id, package_unit_id, base_quantity, package_name
 * - is_default, is_sellable, is_purchasable, is_transferable
 * - created_at, updated_at
 * 
 * EXAMPLE: 1 Thùng = 24 Chai
 * - package_unit_id: THUNG
 * - base_quantity: 24 (meaning 1 THUNG contains 24 base units)
 */

export interface PackageUnitData {
    productId: string
    packageUnitId: string
    baseQuantity: number // How many base units in one package unit
    packageName?: string
}

export class PackageUnitService {
    /**
     * Add package unit to product
     * Validates conversion ratio is logical
     * 
     * @param data - Package unit data
     * @returns Created package unit ID
     */
    async addPackageUnit(data: PackageUnitData): Promise<string> {
        const { productId, packageUnitId, baseQuantity, packageName } = data

        // Validate base quantity is positive
        if (baseQuantity <= 0) {
            throw new Error('Base quantity must be greater than 0')
        }

        // Get product to check base unit
        const product = await prisma.products.findUnique({
            where: { id: productId },
            select: {
                id: true,
                code: true,
                unit_id: true
            }
        })

        if (!product) {
            throw new Error(`Product not found: ${productId}`)
        }

        // Get package unit info
        const packageUnit = await prisma.product_units.findUnique({
            where: { id: packageUnitId },
            select: {
                id: true,
                code: true,
                name: true
            }
        })

        if (!packageUnit) {
            throw new Error(`Package unit not found: ${packageUnitId}`)
        }

        // Validate package unit is not the same as base unit
        if (packageUnitId === product.unit_id) {
            throw new Error(`Package unit cannot be the same as base unit`)
        }

        // Check if this package unit already exists for this product
        const existing = await prisma.product_package_units.findFirst({
            where: {
                product_id: productId,
                package_unit_id: packageUnitId
            }
        })

        if (existing) {
            throw new Error(
                `Package unit ${packageUnit.code} already exists for product ${product.code}`
            )
        }

        // Create package unit
        const created = await prisma.product_package_units.create({
            data: {
                product_id: productId,
                package_unit_id: packageUnitId,
                base_quantity: baseQuantity,
                package_name: packageName || packageUnit.name || packageUnit.code
            }
        })

        console.log(
            `[PackageUnit] Created: 1 ${packageUnit.code} = ${baseQuantity} base units for product ${product.code}`
        )

        return created.id
    }

    /**
     * Update package unit base quantity
     */
    async updatePackageUnit(
        packageUnitId: string,
        baseQuantity: number
    ): Promise<void> {
        if (baseQuantity <= 0) {
            throw new Error('Base quantity must be greater than 0')
        }

        const packageUnit = await prisma.product_package_units.findUnique({
            where: { id: packageUnitId }
        })

        if (!packageUnit) {
            throw new Error(`Package unit not found: ${packageUnitId}`)
        }

        await prisma.product_package_units.update({
            where: { id: packageUnitId },
            data: {
                base_quantity: baseQuantity
            }
        })
    }

    /**
     * Delete package unit
     */
    async deletePackageUnit(packageUnitId: string): Promise<void> {
        await prisma.product_package_units.delete({
            where: { id: packageUnitId }
        })
    }

    /**
     * Get all package units for a product
     */
    async getPackageUnitsForProduct(productId: string) {
        return await prisma.product_package_units.findMany({
            where: { product_id: productId },
            include: {
                product_units: true,
                products: {
                    select: {
                        id: true,
                        code: true,
                        name: true
                    }
                }
            }
        })
    }

    /**
     * Validate conversion between units for a product
     * Checks if conversion path exists
     */
    async validateConversion(
        productId: string,
        fromUnitId: string,
        toUnitId: string
    ): Promise<{
        isValid: boolean
        multiplier?: number
        errorMessage?: string
    }> {
        try {
            // Get product base unit
            const product = await prisma.products.findUnique({
                where: { id: productId },
                select: { unit_id: true }
            })

            if (!product) {
                return {
                    isValid: false,
                    errorMessage: 'Product not found'
                }
            }

            // If both units are the same, valid with multiplier 1
            if (fromUnitId === toUnitId) {
                return {
                    isValid: true,
                    multiplier: 1
                }
            }

            // Find conversion from one of the package units
            const packageUnits = await prisma.product_package_units.findMany({
                where: { product_id: productId }
            })

            // Check if fromUnit is a package unit
            const fromPackage = packageUnits.find(p => p.package_unit_id === fromUnitId)
            const toPackage = packageUnits.find(p => p.package_unit_id === toUnitId)

            if (fromPackage && fromUnitId !== product.unit_id) {
                // Convert from package to base
                return {
                    isValid: true,
                    multiplier: Number(fromPackage.base_quantity)
                }
            }

            if (toPackage && toUnitId !== product.unit_id) {
                // Convert from base to package
                return {
                    isValid: true,
                    multiplier: 1 / Number(toPackage.base_quantity)
                }
            }

            return {
                isValid: false,
                errorMessage: 'No conversion path found'
            }
        } catch (error: any) {
            return {
                isValid: false,
                errorMessage: error.message
            }
        }
    }

    /**
     * Get conversion info for display
     */
    async getConversionInfo(productId: string) {
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

        const conversions = product.product_package_units.map((pkg: any) => ({
            packageUnit: pkg.product_units.code,
            packageUnitName: pkg.product_units.name,
            baseUnit: product.product_units.code,
            baseUnitName: product.product_units.name,
            ratio: Number(pkg.base_quantity),
            formula: `1 ${pkg.product_units.code} = ${pkg.base_quantity} ${product.product_units.code}`
        }))

        return {
            productCode: product.code,
            productName: product.name,
            baseUnit: {
                id: product.product_units.id,
                code: product.product_units.code,
                name: product.product_units.name
            },
            conversions: conversions
        }
    }
}

// Singleton instance
export const packageUnitService = new PackageUnitService()
