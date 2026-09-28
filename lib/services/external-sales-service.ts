import { prisma } from '@/lib/prisma'
import { unitConversionService } from './unit-conversion-service'
import { inventoryService, StockOperation } from './inventory-service'

/**
 * External Sales Export Service
 * 
 * Handles sales exports (selling to external customers, not through invoice)
 * CRITICAL: Must validate units and convert to base units
 */

export interface ExternalSaleData {
    warehouseId: string
    customerId: string
    exportDate: Date
    items: ExternalSaleItemData[]
    notes?: string
    createdBy: string
}

export interface ExternalSaleItemData {
    productId: string
    quantity: number
    unitId: string // REQUIRED!
    unitPrice?: number
}

export class ExternalSalesService {
    /**
     * Create external sales export
     * Deducts stock from warehouse
     */
    async createExternalSale(data: ExternalSaleData): Promise<string> {
        const {
            warehouseId,
            customerId,
            exportDate,
            items,
            notes,
            createdBy
        } = data

        // Generate export number
        const dateStr = exportDate.toISOString().slice(0, 10).replace(/-/g, '')
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        const exportNumber = `ESE-${dateStr}-${random}`

        // 1. Check Lock (Outside TX)
        const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
        const lockCheck = await checkInventoryCheckLock(warehouseId)
        if (lockCheck.isLocked) {
            throw new Error(lockCheck.message || 'Warehouse is locked for inventory check')
        }

        // 2. Batch Pre-calculation
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

        const convertedItems: any[] = []
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
            const conversion = getConversion(item.productId, item.quantity, item.unitId)

            const lineTotal = item.unitPrice ? item.quantity * item.unitPrice : 0
            totalAmount += lineTotal

            convertedItems.push({
                ...item,
                baseQuantity: conversion.baseQuantity,
                baseUnitId: conversion.baseUnitId,
                lineTotal
            })

            // Aggregation (Negative for sale)
            const key = `${warehouseId}-${item.productId}`
            const existing = stockUpdates.get(key)
            if (existing) {
                existing.quantityChange -= conversion.baseQuantity
            } else {
                stockUpdates.set(key, {
                    warehouseId,
                    productId: item.productId,
                    quantityChange: -conversion.baseQuantity,
                    operation: StockOperation.SALE,
                    baseUnitId: conversion.baseUnitId
                })
            }
        }

        // 3. Transaction
        return await prisma.$transaction(async (tx) => {
            // Create Header
            const exportRecord = await tx.external_sales_exports.create({
                data: {
                    export_number: exportNumber,
                    warehouse_id: warehouseId,
                    customer_id: customerId,
                    created_by: createdBy,
                    status: 'ACTIVE',
                    total_amount: totalAmount,
                    notes: notes
                }
            })

            // Parallel create items
            await Promise.all(convertedItems.map(item =>
                tx.external_sales_export_items.create({
                    data: {
                        export_id: exportRecord.id,
                        product_id: item.productId,
                        quantity: item.quantity,
                        unit_id: item.unitId,
                        unit_price: item.unitPrice,
                        line_total: item.lineTotal || undefined
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
                    tx,
                    baseUnitId: update.baseUnitId,
                    skipLockCheck: true
                })
            ))

            return exportRecord.id
        }, {
            timeout: 60000
        })
    }

    /**
     * Hard delete external sale export
     * Restores stock back to warehouse and completely removes from database
     */
    async deleteExternalSale(exportId: string): Promise<void> {
        await prisma.$transaction(async (tx) => {
            // Get export with items
            const exportRecord = await tx.external_sales_exports.findUnique({
                where: { id: exportId },
                include: {
                    items: true
                }
            })

            if (!exportRecord) {
                throw new Error(`Export not found: ${exportId}`)
            }

            if (exportRecord.deleted_at) {
                throw new Error('Export already deleted')
            }

            // CRITICAL: Check if this export is covered by any COMPLETED inventory check
            // This prevents deletion of historical data that was included in finalized inventory audits
            if (exportRecord.created_at) {
                const completedInventoryChecks = await tx.inventory_checks.findMany({
                    where: {
                        warehouse_id: exportRecord.warehouse_id,
                        status: 'COMPLETED',
                        // Check if export was created before the inventory check was updated (completed)
                        // This means the export was part of the inventory snapshot
                        updated_at: {
                            gte: exportRecord.created_at
                        }
                    },
                    select: {
                        id: true,
                        number: true,
                        updated_at: true
                    }
                })

                if (completedInventoryChecks.length > 0) {
                    const checkNumbers = completedInventoryChecks.map(c => c.number).join(', ')
                    throw new Error(
                        `Không thể xóa phiếu xuất này vì đã được bao gồm trong phiếu kiểm kê đã hoàn thành: ${checkNumbers}. ` +
                        `Việc xóa sẽ làm sai lệch dữ liệu kiểm kê lịch sử.`
                    )
                }
            }

            // Restore stock for each item
            // Note: Without base_quantity field, we need to recalculate
            for (const item of exportRecord.items) {
                // Recalculate base quantity from stored quantity and unit
                const conversion = await unitConversionService.convertToBaseUnit(
                    item.product_id,
                    item.quantity,
                    item.unit_id
                )

                // Restore stock (positive quantity)
                await inventoryService.updateStock({
                    warehouseId: exportRecord.warehouse_id,
                    productId: item.product_id,
                    quantityChange: conversion.baseQuantity, // Positive to restore
                    operation: StockOperation.ADJUSTMENT,
                    tx,
                    skipLockCheck: true
                })
            }

            // Hard delete: Delete items first (foreign key constraint)
            await tx.external_sales_export_items.deleteMany({
                where: { export_id: exportId }
            })

            // Then delete export header
            await tx.external_sales_exports.delete({
                where: { id: exportId }
            })
        })
    }

    /**
     * Get export by ID with items
     */
    async getExportById(exportId: string) {
        return await prisma.external_sales_exports.findUnique({
            where: { id: exportId },
            include: {
                items: {
                    include: {
                        product: true,
                        unit: true
                    }
                },
                warehouse: true,
                customer: true, // ✅ Add customer data
                created_by_user: {
                    select: {
                        id: true,
                        email: true,
                        full_name: true
                    }
                },
                approved_by_user: { // ✅ Add approved_by_user for PDF signature
                    select: {
                        id: true,
                        full_name: true
                    }
                }
            }
        })
    }

    /**
     * List exports with pagination
     */
    async listExports(params: {
        warehouseId?: string
        customerId?: string
        status?: string
        search?: string
        skip?: number
        take?: number
    }) {
        const { warehouseId, customerId, status, search, skip = 0, take = 50 } = params

        const where: any = {
            deleted_at: null // Only non-deleted
        }

        if (warehouseId) {
            where.warehouse_id = warehouseId
        }

        if (customerId) {
            where.customer_id = customerId
        }

        if (status) {
            where.status = status as any
        }

        if (search) {
            where.OR = [
                { export_number: { contains: search, mode: 'insensitive' } },
                { customer: { name: { contains: search, mode: 'insensitive' } } }
            ]
        }

        return await prisma.external_sales_exports.findMany({
            where,
            include: {
                warehouse: true,
                customer: true,
                created_by_user: {
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
                created_at: 'desc'
            },
            skip,
            take
        })
    }
}

// Singleton instance
export const externalSalesService = new ExternalSalesService()
