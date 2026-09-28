import { prisma } from '@/lib/prisma'
import { unitConversionService } from './unit-conversion-service'

/**
 * Stock update data
 */
export interface StockUpdateData {
    warehouseId: string
    productId: string
    quantityChange: number // In base unit (positive = increase, negative = decrease)
    operation: StockOperation
    tx?: any // Optional transaction client
    baseUnitId?: string // Optional base unit ID (to skip product lookup)
    skipLockCheck?: boolean // Optional flag to skip lock check (for internal use)
}

/**
 * Stock operation types
 */
export enum StockOperation {
    IMPORT = 'IMPORT',
    SALE = 'SALE',
    PRODUCTION_IN = 'PRODUCTION_IN',
    PRODUCTION_OUT = 'PRODUCTION_OUT',
    TRANSFER_IN = 'TRANSFER_IN',
    TRANSFER_OUT = 'TRANSFER_OUT',
    ADJUSTMENT = 'ADJUSTMENT'
}

/**
 * Stock query result
 */
export interface StockInfo {
    warehouseId: string
    productId: string
    quantity: number // Base unit quantity
    unitId: string // Base unit ID
    unit: {
        id: string
        code: string
        name: string
    }
    breakdown: {
        qtyImported: number
        qtyProduced: number
        qtySold: number
        qtyTransferredIn: number
        qtyTransferredOut: number
        qtyAdjusted: number
    }
    lastUpdated: Date
    version: number
}

/**
 * Core Inventory Service
 * 
 * Manages warehouse_stock_realtime - the SINGLE SOURCE OF TRUTH for inventory
 * 
 * Key Features:
 * - Atomic updates with optimistic locking (version column)
 * - All quantities in base unit
 * - Breakdown by operation type for analytics
 * - Automatic reconciliation checks
 */
export class InventoryService {
    /**
     * Get real-time stock for a product in a warehouse
     * 
     * @param warehouseId - Warehouse ID
     * @param productId - Product ID
     * @returns Stock info or null if not found
     */
    async getRealtimeStock(
        warehouseId: string,
        productId: string
    ): Promise<StockInfo | null> {
        const stock = await prisma.warehouse_stock_realtime.findUnique({
            where: {
                warehouse_id_product_id: {
                    warehouse_id: warehouseId,
                    product_id: productId
                }
            },
            include: {
                base_unit: true
            }
        })

        if (!stock) {
            return null
        }

        return {
            warehouseId: stock.warehouse_id,
            productId: stock.product_id,
            quantity: Number(stock.quantity || 0),
            unitId: stock.unit_id,
            unit: {
                id: stock.base_unit.id,
                code: stock.base_unit.code,
                name: stock.base_unit.name
            },
            breakdown: {
                qtyImported: Number(stock.qty_imported || 0),
                qtyProduced: Number(stock.qty_produced || 0),
                qtySold: Number(stock.qty_sold || 0),
                qtyTransferredIn: Number(stock.qty_transferred_in || 0),
                qtyTransferredOut: Number(stock.qty_transferred_out || 0),
                qtyAdjusted: Number(stock.qty_adjusted || 0)
            },
            lastUpdated: stock.last_updated,
            version: stock.version
        }
    }

    /**
     * Update stock with atomic operation and optimistic locking
     * 
     * @param data - Stock update data
     * @throws Error if stock insufficient or concurrent modification detected
     */
    async updateStock(data: StockUpdateData): Promise<void> {
        const { warehouseId, productId, quantityChange, operation, baseUnitId: providedBaseUnitId, skipLockCheck } = data

        // CRITICAL: Check for IN_PROGRESS inventory check
        if (!skipLockCheck) {
            const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
            const lockCheck = await checkInventoryCheckLock(warehouseId)

            if (lockCheck.isLocked) {
                throw new Error(lockCheck.message || 'Warehouse is locked for inventory check')
            }
        }


        let baseUnitId = providedBaseUnitId

        if (!baseUnitId) {
            // Get product base unit
            const product = await prisma.products.findUnique({
                where: { id: productId },
                select: { unit_id: true }
            })

            if (!product) {
                throw new Error(`Product not found: ${productId}`)
            }
            baseUnitId = product.unit_id
        }

        // Helper function for the actual update logic
        const performUpdate = async (tx: any) => {
            // Get current stock with lock
            let currentStock = await tx.warehouse_stock_realtime.findUnique({
                where: {
                    warehouse_id_product_id: {
                        warehouse_id: warehouseId,
                        product_id: productId
                    }
                }
            })

            // If stock doesn't exist, create it
            if (!currentStock) {
                currentStock = await tx.warehouse_stock_realtime.create({
                    data: {
                        warehouse_id: warehouseId,
                        product_id: productId,
                        quantity: 0,
                        unit_id: baseUnitId,
                        qty_imported: 0,
                        qty_produced: 0,
                        qty_sold: 0,
                        qty_transferred_in: 0,
                        qty_transferred_out: 0,
                        qty_adjusted: 0,
                        version: 1
                    }
                })
            }

            // Calculate new quantity
            const newQuantity = Number(currentStock.quantity) + quantityChange

            // Prepare breakdown updates
            const breakdownUpdates: any = {}

            switch (operation) {
                case StockOperation.IMPORT:
                    breakdownUpdates.qty_imported = Number(currentStock.qty_imported) + quantityChange
                    break
                case StockOperation.SALE:
                    breakdownUpdates.qty_sold = Number(currentStock.qty_sold) + quantityChange // quantityChange is negative
                    break
                case StockOperation.PRODUCTION_IN:
                    breakdownUpdates.qty_produced = Number(currentStock.qty_produced) + quantityChange
                    break
                case StockOperation.PRODUCTION_OUT:
                    // Production uses ingredients, counts as negative
                    breakdownUpdates.qty_produced = Number(currentStock.qty_produced) + quantityChange
                    break
                case StockOperation.TRANSFER_IN:
                    breakdownUpdates.qty_transferred_in = Number(currentStock.qty_transferred_in) + quantityChange
                    break
                case StockOperation.TRANSFER_OUT:
                    breakdownUpdates.qty_transferred_out = Number(currentStock.qty_transferred_out) + quantityChange
                    break
                case StockOperation.ADJUSTMENT:
                    breakdownUpdates.qty_adjusted = Number(currentStock.qty_adjusted) + quantityChange
                    break
            }

            // Update stock with optimistic locking
            const updateResult = await tx.warehouse_stock_realtime.updateMany({
                where: {
                    warehouse_id: warehouseId,
                    product_id: productId,
                    version: currentStock.version // Optimistic lock
                },
                data: {
                    quantity: newQuantity,
                    ...breakdownUpdates,
                    version: currentStock.version + 1
                }
            })

            // Check if update was successful (optimistic lock check)
            if (updateResult.count === 0) {
                throw new Error(
                    `Concurrent modification detected. Please retry the operation.`
                )
            }
        }

        // If transaction client is provided, use it
        if (data.tx) {
            await performUpdate(data.tx)
        } else {
            // Otherwise create new transaction
            await prisma.$transaction(async (tx) => {
                await performUpdate(tx)
            })
        }
    }

    /**
     * Calculate stock from history (for reconciliation)
     * Useful for verifying real-time stock accuracy
     * 
     * @param warehouseId - Warehouse ID
     * @param productId - Product ID  
     * @param fromDate - Calculate from this date (optional, defaults to beginning of time)
     * @returns Calculated stock quantity
     */
    async calculateStockFromHistory(
        warehouseId: string,
        productId: string,
        fromDate?: Date
    ): Promise<{
        calculatedQuantity: number
        realtimeQuantity: number
        discrepancy: number
    }> {
        // This would sum up all transactions from specialized tables
        // For now, we'll implement a basic version

        let calculatedQty = 0

        // 1. Sum imports
        const imports = await prisma.inventory_import_items.aggregate({
            where: {
                product_id: productId,
                import: {
                    warehouse_id: warehouseId,
                    created_at: fromDate ? { gte: fromDate } : undefined
                }
            },
            _sum: {
                base_quantity: true
            }
        })
        calculatedQty += imports._sum.base_quantity || 0

        // 2. Subtract sales (recipe deductions)
        const sales = await prisma.recipe_deduction_items.aggregate({
            where: {
                ingredient_id: productId,
                deduction: {
                    warehouse_id: warehouseId,
                    created_at: fromDate ? { gte: fromDate } : undefined
                }
            },
            _sum: {
                quantity_deducted: true
            }
        })
        calculatedQty -= sales._sum.quantity_deducted || 0

        // 3. Add production output
        // TODO: Add when production is implemented

        // 4. Subtract production input (ingredients)
        const productionUsage = await prisma.production_ingredient_usages.aggregate({
            where: {
                ingredient_id: productId,
                production: {
                    warehouse_id: warehouseId,
                    created_at: fromDate ? { gte: fromDate } : undefined
                }
            },
            _sum: {
                quantity_used: true
            }
        })
        calculatedQty -= productionUsage._sum.quantity_used || 0

        // 5. Get realtime stock
        const realtimeStock = await this.getRealtimeStock(warehouseId, productId)
        const realtimeQty = realtimeStock?.quantity || 0

        return {
            calculatedQuantity: calculatedQty,
            realtimeQuantity: realtimeQty,
            discrepancy: calculatedQty - realtimeQty
        }
    }

    /**
     * Reconcile stock for entire warehouse
     * Checks for discrepancies between calculated and real-time stock
     * 
     * @param warehouseId - Warehouse ID
     * @returns Array of products with discrepancies
     */
    async reconcileStock(warehouseId: string): Promise<Array<{
        productId: string
        productCode: string
        calculatedQuantity: number
        realtimeQuantity: number
        discrepancy: number
    }>> {
        const discrepancies: any[] = []

        // Get all products in this warehouse
        const stocks = await prisma.warehouse_stock_realtime.findMany({
            where: {
                warehouse_id: warehouseId
            },
            include: {
                product: true
            }
        })

        for (const stock of stocks) {
            const result = await this.calculateStockFromHistory(
                warehouseId,
                stock.product_id
            )

            if (result.discrepancy !== 0) {
                discrepancies.push({
                    productId: stock.product_id,
                    productCode: stock.product.code,
                    calculatedQuantity: result.calculatedQuantity,
                    realtimeQuantity: result.realtimeQuantity,
                    discrepancy: result.discrepancy
                })
            }
        }

        return discrepancies
    }

    /**
     * Initialize stock for a new product in warehouse
     * Sets initial quantity to 0
     * 
     * @param warehouseId - Warehouse ID
     * @param productId - Product ID
     */
    async initializeStock(
        warehouseId: string,
        productId: string
    ): Promise<void> {
        const product = await prisma.products.findUnique({
            where: { id: productId },
            select: { unit_id: true }
        })

        if (!product) {
            throw new Error(`Product not found: ${productId}`)
        }

        await prisma.warehouse_stock_realtime.create({
            data: {
                warehouse_id: warehouseId,
                product_id: productId,
                quantity: 0,
                unit_id: product.unit_id,
                qty_imported: 0,
                qty_produced: 0,
                qty_sold: 0,
                qty_transferred_in: 0,
                qty_transferred_out: 0,
                qty_adjusted: 0,
                version: 1
            }
        })
    }

    /**
     * Batch update stocks (useful for migrations or bulk operations)
     * 
     * @param updates - Array of stock updates
     */
    async batchUpdateStock(updates: StockUpdateData[]): Promise<void> {
        await Promise.all(updates.map(update => this.updateStock(update)))
    }
}

// Singleton instance
export const inventoryService = new InventoryService()
