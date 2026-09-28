import { prisma } from '@/lib/prisma'
import { unitConversionService } from './unit-conversion-service'
import { inventoryService, StockOperation } from './inventory-service'

/**
 * Transfer Service
 * 
 * Handles internal warehouse transfers with CRITICAL unit conversion
 * 
 * PROBLEM EXAMPLE:
 * - Kho tổng XUẤT: 1 gói (gói = 100ML)
 * - Kho con NHẬN: Should receive 100ML base unit
 * - OLD: Shows discrepancy because units don't match
 * - NEW: Both stored as 100ML base unit ✓
 * 
 * Flow:
 * 1. Create transfer request (PENDING)
 * 2. Export from source warehouse (TRANSFER_OUT) - Convert to base unit
 * 3. Receive at destination warehouse (TRANSFER_IN) - Same base unit quantity
 * 4. Handle discrepancy if received quantity differs
 */

export interface TransferRequestData {
    transferNumber: string
    fromWarehouseId: string
    toWarehouseId: string
    requestDate: Date
    items: TransferItemData[]
    notes?: string
    requestedBy: string
}

export interface TransferItemData {
    productId: string
    requestedQuantity: number
    requestedUnitId: string // REQUIRED! Unit user wants to transfer
}

export interface TransferExportData {
    transferId: string
    exportDate: Date
    items: Array<{
        itemId: string
        exportedQuantity: number
        exportedUnitId: string // REQUIRED!
    }>
    exportedBy: string
}

export interface TransferReceiveData {
    transferId: string
    receiveDate: Date
    items: Array<{
        itemId: string
        receivedQuantity: number
        receivedUnitId: string // REQUIRED!
    }>
    receivedBy: string
}

export class TransferService {
    /**
     * Create transfer request
     * 
     * @param data - Transfer request data
     * @returns Created transfer ID
     */
    async createTransferRequest(data: TransferRequestData): Promise<string> {
        const {
            transferNumber,
            fromWarehouseId,
            toWarehouseId,
            requestDate,
            items,
            notes,
            requestedBy
        } = data

        // Validate warehouses are different
        if (fromWarehouseId === toWarehouseId) {
            throw new Error('Source and destination warehouses must be different')
        }

        // Validate transfer number is unique
        const existing = await prisma.internal_transfer_requests.findUnique({
            where: { request_number: transferNumber }
        })

        if (existing) {
            throw new Error(`Transfer number ${transferNumber} already exists`)
        }

        // Create transfer in transaction
        return await prisma.$transaction(async (tx) => {
            // Create transfer header
            const transfer = await tx.internal_transfer_requests.create({
                data: {
                    request_number: transferNumber,
                    warehouses_from: { connect: { id: fromWarehouseId } },
                    warehouses_to: { connect: { id: toWarehouseId } },
                    status: 'CHO_QUAN_LY_DUYET',
                    created_at: requestDate,
                    users_created: { connect: { id: requestedBy } }
                }
            })

            // Create transfer items with unit conversion
            for (const item of items) {
                // Validate unit
                const isValidUnit = await unitConversionService.validateUnitForProduct(
                    item.productId,
                    item.requestedUnitId
                )

                if (!isValidUnit) {
                    const product = await tx.products.findUnique({
                        where: { id: item.productId },
                        select: { code: true }
                    })

                    throw new Error(
                        `Invalid unit for product ${product?.code || item.productId}`
                    )
                }

                // Convert requested quantity to base unit
                const conversion = await unitConversionService.convertToBaseUnit(
                    item.productId,
                    item.requestedQuantity,
                    item.requestedUnitId
                )

                await tx.internal_transfer_request_items.create({
                    data: {
                        request: { connect: { id: transfer.id } },
                        product: { connect: { id: item.productId } },
                        requested_quantity: item.requestedQuantity,
                        requested_unit: { connect: { id: item.requestedUnitId } }
                    }
                })
            }

            return transfer.id
        })
    }

    /**
     * Export items from source warehouse
     * CRITICAL: This deducts stock from source warehouse
     * 
     * @param data - Export data with quantities
     */
    /**
     * Export items from source warehouse
     * CRITICAL: This deducts stock from source warehouse
     * 
     * @param data - Export data with quantities
     */
    async exportTransfer(data: TransferExportData): Promise<void> {
        const { transferId, exportDate, items, exportedBy } = data

        // 1. Pre-validation and Batch Fetching (Outside Transaction)
        // Fetch transfer to get details for validation
        const transferPreCheck = await prisma.internal_transfer_requests.findUnique({
            where: { id: transferId },
            include: { items: { include: { product: true } } }
        })

        if (!transferPreCheck) {
            throw new Error(`Transfer not found: ${transferId}`)
        }

        if (transferPreCheck.status !== 'CHO_KHO_TONG_XUAT') {
            throw new Error(`Transfer must be in CHO_KHO_TONG_XUAT status. Current: ${transferPreCheck.status}`)
        }

        // Check if source warehouse is locked
        const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
        const sourceCheck = await checkInventoryCheckLock(transferPreCheck.from_warehouse_id)
        if (sourceCheck.isLocked) {
            throw new Error(`Kho nguồn đang có phiếu kiểm kê (${sourceCheck.checkNumber}). Không thể xuất hàng.`)
        }

        // ✅ BATCH OPTIMIZATION: Fetch all units and relations upfront
        const productIds = Array.from(new Set(items.map(i => {
            const match = transferPreCheck.items.find(t => t.id === i.itemId)
            return match?.product_id
        }).filter(Boolean) as string[]))

        const [products, allUnitRelations] = await Promise.all([
            prisma.products.findMany({
                where: { id: { in: productIds } },
                include: {
                    product_units: true,
                    product_package_units: true
                }
            }),
            prisma.unit_relations.findMany()
        ])

        const productMap = new Map(products.map(p => [p.id, p]))

        // Helper for efficient conversion (In-Memory)
        const validateAndConvert = (pId: string, qty: number, uId: string) => {
            const prod = productMap.get(pId)
            if (!prod) throw new Error(`Product not found: ${pId}`)

            const baseUnitId = prod.unit_id

            // Base unit match
            if (uId === baseUnitId) return true

            // Check package units
            const pkgUnit = prod.product_package_units.find(pu => pu.package_unit_id === uId)
            if (pkgUnit) return true

            // Check global relations
            const rel = allUnitRelations.find(r => r.from_unit_id === uId && r.to_unit_id === baseUnitId)
            if (rel) return true

            throw new Error(`Invalid unit ${uId} for product ${prod.code}`)
        }

        // Validate all items mostly in-memory now
        for (const exportItem of items) {
            const transferItem = transferPreCheck.items.find(i => i.id === exportItem.itemId)
            if (!transferItem) {
                throw new Error(`Transfer item not found: ${exportItem.itemId}`)
            }

            // Conversion validation
            validateAndConvert(
                transferItem.product_id,
                exportItem.exportedQuantity,
                exportItem.exportedUnitId
            )
        }

        // 2. Transaction (Writes Only)
        await prisma.$transaction(async (tx) => {
            // Re-check status inside lock to ensure concurrency safety
            const transfer = await tx.internal_transfer_requests.findUnique({
                where: { id: transferId },
                select: { status: true }
            })

            if (!transfer || transfer.status !== 'CHO_KHO_TONG_XUAT') {
                throw new Error(`Transfer status changed or not found`)
            }

            // ✅ BULK UPDATE: Using Raw SQL for updates
            // Fixes N+1 issue where sequential awaits caused transaction timeout
            for (const item of items) {
                // Ensure numeric type for PostgreSQL
                const exportedQty = Number(item.exportedQuantity) || 0
                await tx.$executeRaw`
                    UPDATE internal_transfer_request_items
                    SET 
                        exported_quantity = ${exportedQty}::numeric,
                        exported_unit_id = ${item.exportedUnitId}::uuid
                    WHERE id = ${item.itemId}::uuid
                `
            }
            // Note: Update via raw SQL in loop is still N queries but faster than Prisma update.
            // Ideally we use a single UPDATE ... FROM VALUES, but Prisma support for that is tricky with type safety.
            // The previous code was `Promise.all` which is parallel, but might overload connection pool.
            // A simple for loop with simple SQL is robust. 
            // Better: Use `CASE` statement for valid single query update if truly needed, but parallel raw SQL is usually fine for <1000 items.
            // Actually, let's stick to Promise.all with simple raw SQL for parallelism without overhead of Prisma Model layer.

            /* 
            // Parallel Raw Updates
            await Promise.all(items.map(item => 
                tx.$executeRaw`
                    UPDATE internal_transfer_request_items
                    SET 
                        exported_quantity = ${item.exportedQuantity},
                        exported_unit_id = ${item.exportedUnitId}::uuid
                    WHERE id = ${item.itemId}::uuid
                `
            ))
            */
            // Since we want to be safe with connections, let's structure `updateMany` doesn't work for different values.
            // Let's keep sequential raw SQL which is very fast (ms range).

            // ✅ DEDUCT STOCK FROM SOURCE WAREHOUSE IMMEDIATELY
            // This ensures qty_transferred_out is recorded correctly for inventory checks
            // If there's a discrepancy later, confirm-discrepancy will adjust (add back)
            console.log(`[Transfer Export] Deducting stock from source warehouse immediately`)

            // Calculate base quantities for each item
            for (const exportItem of items) {
                const transferItem = transferPreCheck.items.find(i => i.id === exportItem.itemId)
                if (!transferItem) continue

                const product = productMap.get(transferItem.product_id)
                if (!product) continue

                // Convert exported quantity to base unit
                let exportedBaseQty = Number(exportItem.exportedQuantity)
                if (exportItem.exportedUnitId !== product.unit_id) {
                    const pkgUnit = product.product_package_units.find(
                        pu => pu.package_unit_id === exportItem.exportedUnitId
                    )
                    if (pkgUnit) {
                        exportedBaseQty = Number(exportItem.exportedQuantity) * Number(pkgUnit.base_quantity)
                    }
                }

                // Ensure it is a valid number
                // ALLOW 0 quantity (it means no stock deducted, but valid export record)
                if (isNaN(exportedBaseQty) || exportedBaseQty < 0) {
                    console.error(`[Transfer Export] Invalid exported quantity for item ${exportItem.itemId}: ${exportedBaseQty}`)
                    continue
                }

                if (exportedBaseQty === 0) {
                    console.log(`[Transfer Export] Item ${exportItem.itemId} exported 0 quantity. Skipping stock deduction.`)
                    continue
                }

                console.log(`[Transfer Export] Deducting: Item ${transferItem.product_id}, Base Qty: ${exportedBaseQty}`)

                // Deduct from source warehouse - use ::numeric cast for Decimal columns
                const deductQty = Number(exportedBaseQty) || 0
                await tx.$executeRaw`
                    INSERT INTO warehouse_stock_realtime (
                        warehouse_id, product_id, unit_id,
                        quantity, qty_imported, qty_produced, qty_sold,
                        qty_transferred_in, qty_transferred_out, qty_adjusted, version,
                        last_updated
                    )
                    VALUES (
                        ${transferPreCheck.from_warehouse_id}::uuid,
                        ${transferItem.product_id}::uuid,
                        ${product.unit_id}::uuid,
                        ${-deductQty}::numeric, 0, 0, 0,
                        0, ${deductQty}::numeric, 0, 1,
                        NOW()
                    )
                    ON CONFLICT (warehouse_id, product_id)
                    DO UPDATE SET
                        quantity = warehouse_stock_realtime.quantity - ${deductQty}::numeric,
                        qty_transferred_out = warehouse_stock_realtime.qty_transferred_out + ${deductQty}::numeric,
                        version = warehouse_stock_realtime.version + 1,
                        last_updated = NOW()
                `
                console.log(`[Transfer Export] Deducted ${deductQty} of product ${transferItem.product_id} from source`)
            }

            // Update transfer status
            await tx.internal_transfer_requests.update({
                where: { id: transferId },
                data: {
                    status: 'DA_XUAT_KHO',
                    exported_at: exportDate,
                    users_exported: {
                        connect: { id: exportedBy }
                    }
                }
            })

            console.log(`[Transfer Export] Transfer ${transferId} exported. Stock deducted from source warehouse.`)
        }, {
            timeout: 30000 // Increase timeout to 30s
        })
    }

    /**
     * Receive items at destination warehouse
     * CRITICAL: This adds stock to destination warehouse
     * Handles discrepancy if received quantity differs from exported
     * 
     * @param data - Receive data with quantities
     */
    async receiveTransfer(data: TransferReceiveData): Promise<void> {
        const { transferId, receiveDate, items, receivedBy } = data

        // 1. Pre-fetch transfer for validation and conversion (Outside Transaction)
        const transferPreCheck = await prisma.internal_transfer_requests.findUnique({
            where: { id: transferId },
            include: { items: { include: { product: true } } }
        })

        if (!transferPreCheck) {
            throw new Error(`Transfer not found: ${transferId}`)
        }

        if (transferPreCheck.status !== 'DA_XUAT_KHO') {
            throw new Error(`Transfer must be in DA_XUAT_KHO status. Current: ${transferPreCheck.status}`)
        }

        // NOTE: Inventory lock check moved to AFTER discrepancy determination
        // Only check lock when we actually need to update stock (no discrepancy)

        // 2. Pre-calculate conversions & prepare aggregations
        const preparedItems: any[] = []
        // Aggregate stock changes: Key = `${warehouseId}-${productId}`
        const stockUpdates = new Map<string, {
            warehouseId: string,
            productId: string,
            quantityChange: number,
            operation: StockOperation,
            baseUnitId: string
        }>()

        // BATCH OPTIMIZATION START
        const productIds = Array.from(new Set(items.map(i => {
            const match = transferPreCheck.items.find(t => t.id === i.itemId)
            return match?.product_id
        }).filter(Boolean) as string[]))

        const [products, allUnitRelations] = await Promise.all([
            prisma.products.findMany({
                where: { id: { in: productIds } },
                include: {
                    product_units: true,
                    product_package_units: true
                }
            }),
            prisma.unit_relations.findMany()
        ])

        const productMap = new Map(products.map(p => [p.id, p]))

        // Helper for efficient conversion
        const getConversion = (pId: string, qty: number, uId: string) => {
            const prod = productMap.get(pId)
            if (!prod) throw new Error(`Product not found: ${pId}`)

            const baseUnitId = prod.unit_id

            // Base unit match
            if (uId === baseUnitId) return { baseQuantity: qty, baseUnitId }

            // Check package units
            const pkgUnit = prod.product_package_units.find(pu => pu.package_unit_id === uId)
            let multiplier = pkgUnit ? Number(pkgUnit.base_quantity) : null

            // Check global relations if no package unit
            if (!multiplier) {
                const rel = allUnitRelations.find(r => r.from_unit_id === uId && r.to_unit_id === baseUnitId)
                if (rel) multiplier = Number(rel.multiplier)
            }

            // Fallback (Legacy Alignment)
            if (!multiplier) multiplier = 1

            return {
                baseQuantity: Math.floor(qty * multiplier),
                baseUnitId
            }
        }
        // BATCH OPTIMIZATION END

        for (const receiveItem of items) {
            const transferItem = transferPreCheck.items.find(i => i.id === receiveItem.itemId)
            if (!transferItem) {
                throw new Error(`Transfer item not found: ${receiveItem.itemId}`)
            }

            if (transferItem.exported_quantity === undefined || transferItem.exported_quantity === null || !transferItem.exported_unit_id) {
                throw new Error(`Item ${receiveItem.itemId} has not been exported yet`)
            }

            // Calculate exported base quantity from exported quantity and unit
            const exportedConversion = getConversion(
                transferItem.product_id,
                transferItem.exported_quantity,
                transferItem.exported_unit_id
            )

            // CRITICAL: Convert received quantity to base unit
            const receivedConversion = getConversion(
                transferItem.product_id,
                receiveItem.receivedQuantity,
                receiveItem.receivedUnitId
            )

            // Calculate discrepancy (in base units!)
            const exportedBaseQty = exportedConversion.baseQuantity
            const receivedBaseQty = receivedConversion.baseQuantity
            const discrepancy = receivedBaseQty - exportedBaseQty

            preparedItems.push({
                itemId: receiveItem.itemId,
                receivedQuantity: receiveItem.receivedQuantity,
                receivedUnitId: receiveItem.receivedUnitId,
                discrepancy,
                exportedBaseQty,
                receivedBaseQty,
                productId: transferItem.product_id,
                baseUnitId: transferItem.product.unit_id
            })

            // ALWAYS prepare Destination Stock Update (IN)
            // Fixes "Ghost Inventory" - stock must exist in system as soon as physically received
            const destKey = `${transferPreCheck.to_warehouse_id}-${transferItem.product_id}`
            const existingDest = stockUpdates.get(destKey)
            if (existingDest) {
                existingDest.quantityChange += receivedBaseQty
            } else {
                stockUpdates.set(destKey, {
                    warehouseId: transferPreCheck.to_warehouse_id,
                    productId: transferItem.product_id,
                    quantityChange: receivedBaseQty,
                    operation: StockOperation.TRANSFER_IN,
                    baseUnitId: transferItem.product.unit_id
                })
            }

            // Prepare Source Stock Update (OUT) - will be filtered by legacy check later
            const sourceKey = `${transferPreCheck.from_warehouse_id}-${transferItem.product_id}`
            const existingSource = stockUpdates.get(sourceKey)
            if (existingSource) {
                existingSource.quantityChange -= exportedBaseQty
            } else {
                stockUpdates.set(sourceKey, {
                    warehouseId: transferPreCheck.from_warehouse_id,
                    productId: transferItem.product_id,
                    quantityChange: -exportedBaseQty,
                    operation: StockOperation.TRANSFER_OUT,
                    baseUnitId: transferItem.product.unit_id
                })
            }
        }

        // 3. Transaction
        await prisma.$transaction(async (tx) => {
            // Re-check status inside lock
            const transfer = await tx.internal_transfer_requests.findUnique({
                where: { id: transferId },
                select: { status: true }
            })

            if (!transfer || transfer.status !== 'DA_XUAT_KHO') {
                throw new Error(`Transfer status changed or not found`)
            }

            // A. Update Transfer Items (Optimized Batch)
            // Use Raw SQL for speed. Sequential loop is fine for raw SQL simple updates, 
            // but Promise.all is faster for <1000 items. Let's use Promise.all.
            await Promise.all(preparedItems.map(item => {
                // Ensure numeric types for PostgreSQL - fix "column is of type integer but expression is of type text"
                const receivedQty = Number(item.receivedQuantity) || 0
                const discrepancyQty = Number(item.discrepancy) || 0
                return tx.$executeRaw`
                    UPDATE internal_transfer_request_items
                    SET 
                        received_quantity = ${receivedQty}::numeric,
                        received_unit_id = ${item.receivedUnitId}::uuid,
                        discrepancy_quantity = ${discrepancyQty}::numeric
                    WHERE id = ${item.itemId}::uuid
                `
            }))

            // B. Determine if there's discrepancy FIRST before updating stock
            const hasDiscrepancy = preparedItems.some(i => i.discrepancy !== 0)
            // Note: finalStatus will be determined later after checking inventory locks

            // Log discrepancies for record
            preparedItems.forEach(item => {
                if (item.discrepancy !== 0) {
                    console.log(
                        `[Transfer] Discrepancy detected: Product ${item.productId}, ` +
                        `Exported: ${item.exportedBaseQty}, Received: ${item.receivedBaseQty}, ` +
                        `Discrepancy: ${item.discrepancy}`
                    )
                }
            })

            // C. Handle stock updates based on discrepancy and lock status
            const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')

            // Check destination warehouse lock first
            const destCheck = await checkInventoryCheckLock(transferPreCheck.to_warehouse_id)
            if (destCheck.isLocked) {
                throw new Error(destCheck.message || `Kho của bạn đang có phiếu kiểm kê. Vui lòng hoàn thành kiểm kê trước khi nhận hàng.`)
            }

            // Check source warehouse lock
            const sourceCheck = await checkInventoryCheckLock(transferPreCheck.from_warehouse_id)
            const isSourceLocked = sourceCheck.isLocked

            if (isSourceLocked) {
                console.log(`[Transfer] Source warehouse is locked (inventory check in progress). Will defer stock update.`)
            }

            // Determine final status logic:
            // - If has REAL discrepancy -> CHO_XAC_NHAN_CHENH_LECH (need confirmation, destination NOT updated yet)
            // - Otherwise -> HOAN_THANH (complete immediately, add to destination)
            // NOTE: Source was already deducted when exporting
            let finalStatus: string
            if (hasDiscrepancy) {
                finalStatus = 'CHO_XAC_NHAN_CHENH_LECH'
            } else {
                finalStatus = 'HOAN_THANH'
            }

            // NOTE: Source stock was already deducted during export
            // We only need to update destination stock here
            const inUpdates = Array.from(stockUpdates.values())
                .filter(u => u.operation === StockOperation.TRANSFER_IN)

            if (!hasDiscrepancy) {
                // No discrepancy: Add to destination immediately
                console.log(`[Transfer] No discrepancy. Adding ${inUpdates.length} products to destination warehouse.`)

                if (inUpdates.length > 0) {
                    await Promise.all(inUpdates.map(update => {
                        // Ensure numeric type for PostgreSQL - Decimal columns
                        const qty = Number(update.quantityChange) || 0
                        return tx.$executeRaw`
                            INSERT INTO warehouse_stock_realtime (
                                warehouse_id, product_id, unit_id,
                                quantity, qty_imported, qty_produced, qty_sold,
                                qty_transferred_in, qty_transferred_out, qty_adjusted, version,
                                last_updated
                            )
                            VALUES (
                                ${update.warehouseId}::uuid,
                                ${update.productId}::uuid,
                                ${update.baseUnitId}::uuid,
                                ${qty}::numeric, 0, 0, 0,
                                ${qty}::numeric, 0, 0, 1,
                                NOW()
                            )
                            ON CONFLICT (warehouse_id, product_id)
                            DO UPDATE SET
                                quantity = warehouse_stock_realtime.quantity + ${qty}::numeric,
                                qty_transferred_in = warehouse_stock_realtime.qty_transferred_in + ${qty}::numeric,
                                version = warehouse_stock_realtime.version + 1,
                                last_updated = NOW()
                        `
                    }))
                }
                console.log(`[Transfer] Destination stock updated. Transfer complete.`)
            } else {
                // Has discrepancy: DON'T add to destination yet
                // Confirm-discrepancy will add the confirmed amount and adjust source if needed
                console.log(`[Transfer] Discrepancy found. Destination NOT updated. Waiting for confirm-discrepancy.`)
                console.log(`[Transfer] Note: Source already deducted ${inUpdates.length} products during export.`)
            }

            // D. Update Transfer Status
            await tx.internal_transfer_requests.update({
                where: { id: transferId },
                data: {
                    status: finalStatus as any, // Cast to any to avoid enum type mismatch
                    received_at: receiveDate,
                    users_received: {
                        connect: { id: receivedBy }
                    },
                    has_discrepancy: hasDiscrepancy
                }
            })
        }, {
            timeout: 60000 // Increase timeout to 60s
        })
    }

    /**
     * Get transfer by ID with details
     */
    async getTransferById(transferId: string) {
        return await prisma.internal_transfer_requests.findUnique({
            where: { id: transferId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                product_units: true
                            }
                        },
                        requested_unit: true,
                        exported_unit: true,
                        received_unit: true
                    }
                },
                warehouses_from: true,
                warehouses_to: true,
                users_created: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true
                    }
                },
                users_exported: {
                    select: {
                        id: true,
                        full_name: true
                    }
                },
                users_received: {
                    select: {
                        id: true,
                        full_name: true
                    }
                }
            }
        })
    }

    /**
     * List transfers with pagination
     */
    async listTransfers(params: {
        fromWarehouseId?: string
        toWarehouseId?: string
        status?: string
        skip?: number
        take?: number
    }) {
        const { fromWarehouseId, toWarehouseId, status, skip = 0, take = 50 } = params

        const where: any = {}
        if (fromWarehouseId) where.from_warehouse_id = fromWarehouseId
        if (toWarehouseId) where.to_warehouse_id = toWarehouseId
        if (status) where.status = status

        return await prisma.internal_transfer_requests.findMany({
            where,
            include: {
                warehouses_from: true,
                warehouses_to: true,
                users_created: {
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
export const transferService = new TransferService()
