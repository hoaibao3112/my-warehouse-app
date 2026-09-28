import { prisma } from '@/lib/prisma'
import { unitConversionService } from './unit-conversion-service'
import { inventoryService, StockOperation } from './inventory-service'

/**
 * Adjustment item data
 */
export interface AdjustmentItemData {
    productId: string
    quantityBefore: number // Current quantity (for verification)
    quantityAfter: number // New quantity
    unitId: string // Unit for input/display
    notes?: string
}

/**
 * Adjustment data
 */
export interface AdjustmentData {
    adjustmentNumber: string
    warehouseId: string
    adjustmentType: 'LOSS' | 'DAMAGE' | 'FOUND' | 'MANUAL'
    reason: string
    adjustmentDate: Date
    items: AdjustmentItemData[]
    approvedBy?: string
    createdBy: string
}

/**
 * Adjustment Service
 * 
 * Handles inventory adjustments for:
 * - LOSS: Items lost or stolen
 * - DAMAGE: Items damaged and unusable
 * - FOUND: Items found during inventory check
 * - MANUAL: Manual adjustments for corrections
 * 
 * Important:
 * - All adjustments MUST have approval (except MANUAL by managers)
 * - All quantities must be validated and converted to base units
 * - Records before/after quantities for audit trail
 */
export class AdjustmentService {
    /**
     * Create inventory adjustment
     * 
     * @param data - Adjustment data with items
     * @returns Created adjustment ID
     * @throws Error if validation fails
     */
    async createAdjustment(data: AdjustmentData): Promise<string> {
        const {
            adjustmentNumber,
            warehouseId,
            adjustmentType,
            reason,
            adjustmentDate,
            items,
            approvedBy,
            createdBy
        } = data

        // Validate adjustment number is unique
        const existing = await prisma.inventory_adjustments.findUnique({
            where: { adjustment_number: adjustmentNumber }
        })

        if (existing) {
            throw new Error(`Adjustment number ${adjustmentNumber} already exists`)
        }

        // Validate and convert all items
        const convertedItems: Array<{
            productId: string
            quantityBefore: number
            quantityAfter: number
            quantityChange: number
            baseQuantityChange: number
            notes?: string
        }> = []

        for (const item of items) {
            // Validate unit
            const isValidUnit = await unitConversionService.validateUnitForProduct(
                item.productId,
                item.unitId
            )

            if (!isValidUnit) {
                const product = await prisma.products.findUnique({
                    where: { id: item.productId },
                    select: { code: true }
                })

                throw new Error(
                    `Invalid unit for product ${product?.code || item.productId}`
                )
            }

            // Get current stock to verify
            const currentStock = await inventoryService.getRealtimeStock(
                warehouseId,
                item.productId
            )

            // Convert before/after quantities to base unit
            const beforeConversion = await unitConversionService.convertToBaseUnit(
                item.productId,
                item.quantityBefore,
                item.unitId
            )

            const afterConversion = await unitConversionService.convertToBaseUnit(
                item.productId,
                item.quantityAfter,
                item.unitId
            )

            // Verify current stock matches quantityBefore
            if (currentStock && currentStock.quantity !== beforeConversion.baseQuantity) {
                const product = await prisma.products.findUnique({
                    where: { id: item.productId },
                    select: { code: true }
                })

                throw new Error(
                    `Stock mismatch for ${product?.code}: ` +
                    `Expected ${beforeConversion.baseQuantity}, ` +
                    `Actual ${currentStock.quantity}`
                )
            }

            const baseQuantityChange = afterConversion.baseQuantity - beforeConversion.baseQuantity

            convertedItems.push({
                productId: item.productId,
                quantityBefore: beforeConversion.baseQuantity,
                quantityAfter: afterConversion.baseQuantity,
                quantityChange: item.quantityAfter - item.quantityBefore,
                baseQuantityChange: baseQuantityChange,
                notes: item.notes
            })
        }

        // Create adjustment in transaction
        return await prisma.$transaction(async (tx) => {
            // 1. Create adjustment header
            const adjustment = await tx.inventory_adjustments.create({
                data: {
                    adjustment_number: adjustmentNumber,
                    warehouse_id: warehouseId,
                    adjustment_type: adjustmentType,
                    reason: reason,
                    adjustment_date: adjustmentDate,
                    approved_by: approvedBy,
                    created_by: createdBy
                }
            })

            // 2. Create adjustment items and update stock (In Parallel)
            const promises = convertedItems.map(async (item) => {
                // A. Create adjustment item record
                await tx.inventory_adjustment_items.create({
                    data: {
                        adjustment_id: adjustment.id,
                        product_id: item.productId,
                        quantity_before: item.quantityBefore,
                        quantity_after: item.quantityAfter,
                        quantity_change: item.baseQuantityChange,
                        notes: item.notes
                    }
                })

                // B. Update stock (using the transaction client)
                return inventoryService.updateStock({
                    warehouseId: warehouseId,
                    productId: item.productId,
                    quantityChange: item.baseQuantityChange,
                    operation: StockOperation.ADJUSTMENT,
                    tx // CRITICAL: Pass the transaction client
                })
            })

            await Promise.all(promises)

            return adjustment.id
        }, {
            timeout: 60000 // 60s timeout
        })
    }

    /**
     * Get adjustment by ID with items
     */
    async getAdjustmentById(adjustmentId: string) {
        return await prisma.inventory_adjustments.findUnique({
            where: { id: adjustmentId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                product_units: true
                            }
                        }
                    }
                },
                warehouse: true,
                approver: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true
                    }
                },
                creator: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true
                    }
                }
            }
        })
    }

    /**
     * List adjustments with pagination
     */
    async listAdjustments(params: {
        warehouseId?: string
        adjustmentType?: string
        skip?: number
        take?: number
    }) {
        const { warehouseId, adjustmentType, skip = 0, take = 50 } = params

        return await prisma.inventory_adjustments.findMany({
            where: {
                warehouse_id: warehouseId,
                adjustment_type: adjustmentType
            },
            include: {
                warehouse: true,
                creator: {
                    select: {
                        id: true,
                        full_name: true
                    }
                },
                approver: {
                    select: {
                        id: true,
                        full_name: true
                    }
                },
                _count: {
                    select: {
                        items: true
                    }
                }
            },
            orderBy: {
                adjustment_date: 'desc'
            },
            skip,
            take
        })
    }

    /**
     * Get adjustment summary for a period
     */
    async getAdjustmentSummary(params: {
        warehouseId: string
        adjustmentType?: string
        startDate: Date
        endDate: Date
    }) {
        const { warehouseId, adjustmentType, startDate, endDate } = params

        const adjustments = await prisma.inventory_adjustment_items.groupBy({
            by: ['product_id'],
            where: {
                adjustment: {
                    warehouse_id: warehouseId,
                    adjustment_type: adjustmentType,
                    adjustment_date: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            },
            _sum: {
                quantity_change: true
            },
            _count: {
                id: true
            }
        })

        // Get product details
        const summary = []
        for (const adj of adjustments) {
            const product = await prisma.products.findUnique({
                where: { id: adj.product_id },
                select: {
                    code: true,
                    name: true,
                    product_units: {
                        select: {
                            code: true,
                            name: true
                        }
                    }
                }
            })

            if (product) {
                summary.push({
                    productId: adj.product_id,
                    productCode: product.code,
                    productName: product.name,
                    totalChange: adj._sum.quantity_change || 0,
                    adjustmentCount: adj._count.id,
                    unit: product.product_units
                })
            }
        }

        return summary
    }
}

// Singleton instance
export const adjustmentService = new AdjustmentService()
