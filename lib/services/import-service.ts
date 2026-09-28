import { prisma } from '@/lib/prisma'
import { unitConversionService } from './unit-conversion-service'
import { inventoryService, StockOperation } from './inventory-service'

/**
 * Import item data
 */
export interface ImportItemData {
    productId: string
    quantity: number
    unitId: string // Input unit ID
    unitPrice?: number
    batchNumber?: string
    expiryDate?: Date
}

/**
 * Import data
 */
export interface ImportData {
    warehouseId: string
    importNumber: string
    supplierName?: string
    importDate: Date
    items: ImportItemData[]
    notes?: string
    createdBy: string
}

/**
 * Import Service
 * 
 * Handles inventory imports with proper unit conversion and validation
 * 
 * Flow:
 * 1. Validate all units for all products
 * 2. Convert all quantities to base units
 * 3. Create import record and items
 * 4. Update warehouse_stock_realtime atomically
 */
export class ImportService {
    /**
     * Create import and update stock
     * 
     * @param data - Import data with items
     * @returns Created import ID
     * @throws Error if validation fails or stock update fails
     */
    async createImport(data: ImportData): Promise<string> {
        const { warehouseId, importNumber, supplierName, importDate, items, notes, createdBy } = data

        // 1. Validate import number (Outside TX)
        const existing = await prisma.inventory_imports.findUnique({
            where: { import_number: importNumber }
        })

        if (existing) {
            throw new Error(`Import number ${importNumber} already exists`)
        }

        // 2. Check Lock (Outside TX)
        const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
        const lockCheck = await checkInventoryCheckLock(warehouseId)
        if (lockCheck.isLocked) {
            throw new Error(lockCheck.message || 'Warehouse is locked for inventory check')
        }

        // 3. Batch Pre-calculation (Validation & Conversion)
        const uniqueProductIds = Array.from(new Set(items.map(i => i.productId)))
        const [products, allUnitRelations] = await Promise.all([
            prisma.products.findMany({
                where: { id: { in: uniqueProductIds } },
                include: {
                    product_units: true,
                    product_package_units: true
                }
            }),
            prisma.unit_relations.findMany()
        ])

        const productMap = new Map(products.map(p => [p.id, p]))

        // Helper matching TransferService logic
        const getConversion = (pId: string, qty: number, uId: string) => {
            const prod = productMap.get(pId)
            if (!prod) throw new Error(`Product not found: ${pId}`)

            const baseUnitId = prod.unit_id

            if (uId === baseUnitId) return { baseQuantity: qty, baseUnitId }

            const pkgUnit = prod.product_package_units.find(pu => pu.package_unit_id === uId)
            let multiplier = pkgUnit ? Number(pkgUnit.base_quantity) : null

            if (!multiplier) {
                const rel = allUnitRelations.find(r => r.from_unit_id === uId && r.to_unit_id === baseUnitId)
                if (rel) multiplier = Number(rel.multiplier)
            }

            if (!multiplier) multiplier = 1

            return {
                baseQuantity: Math.floor(qty * multiplier),
                baseUnitId
            }
        }

        const preparedItems: any[] = []
        let totalAmount = 0

        // Aggregate stock updates
        const stockUpdates = new Map<string, {
            warehouseId: string,
            productId: string,
            quantityChange: number,
            operation: StockOperation,
            baseUnitId: string
        }>()

        for (const item of items) {
            // Validate and convert
            const conversion = getConversion(item.productId, item.quantity, item.unitId)

            const lineTotal = item.unitPrice ? item.quantity * item.unitPrice : 0
            totalAmount += lineTotal

            preparedItems.push({
                ...item,
                baseQuantity: conversion.baseQuantity,
                baseUnitId: conversion.baseUnitId,
                lineTotal
            })

            // Aggregation
            const key = `${warehouseId}-${item.productId}`
            const existing = stockUpdates.get(key)
            if (existing) {
                existing.quantityChange += conversion.baseQuantity
            } else {
                stockUpdates.set(key, {
                    warehouseId,
                    productId: item.productId,
                    quantityChange: conversion.baseQuantity,
                    operation: StockOperation.IMPORT,
                    baseUnitId: conversion.baseUnitId
                })
            }
        }

        // 4. Transaction execution
        return await prisma.$transaction(async (tx) => {
            // Create Header
            const importRecord = await tx.inventory_imports.create({
                data: {
                    import_number: importNumber,
                    warehouse_id: warehouseId,
                    supplier_name: supplierName,
                    import_date: importDate,
                    total_amount: totalAmount,
                    notes: notes,
                    created_by: createdBy
                }
            })

            // Parallel create items
            await Promise.all(preparedItems.map(item =>
                tx.inventory_import_items.create({
                    data: {
                        import_id: importRecord.id,
                        product_id: item.productId,
                        quantity: item.quantity,
                        input_unit_id: item.unitId,
                        base_quantity: item.baseQuantity,
                        unit_price: item.unitPrice,
                        line_total: item.lineTotal || undefined,
                        batch_number: item.batchNumber,
                        expiry_date: item.expiryDate
                    }
                })
            ))

            // Parallel stock updates
            await Promise.all(Array.from(stockUpdates.values()).map(update =>
                inventoryService.updateStock({
                    warehouseId: update.warehouseId,
                    productId: update.productId,
                    quantityChange: update.quantityChange,
                    operation: update.operation,
                    tx, // Pass transaction
                    baseUnitId: update.baseUnitId, // Skip lookup
                    skipLockCheck: true // Checked upfront
                })
            ))

            return importRecord.id
        }, {
            timeout: 60000 // 60s timeout
        })
    }

    /**
     * Get import by ID with items
     */
    async getImportById(importId: string) {
        return await prisma.inventory_imports.findUnique({
            where: { id: importId },
            include: {
                items: {
                    include: {
                        product: true,
                        input_unit: true
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
     * List imports with pagination
     */
    async listImports(params: {
        warehouseId?: string
        skip?: number
        take?: number
    }) {
        const { warehouseId, skip = 0, take = 50 } = params

        return await prisma.inventory_imports.findMany({
            where: {
                warehouse_id: warehouseId
            },
            include: {
                warehouse: true,
                user: {
                    select: {
                        id: true,
                        email: true,
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
                import_date: 'desc'
            },
            skip,
            take
        })
    }
}

// Singleton instance
export const importService = new ImportService()
