import { prisma } from '@/lib/prisma'
import { larkWebhookService } from './lark-webhook-service'

/**
 * Inventory Check Service
 * 
 * Handles physical inventory counting and comparison
 * 
 * Schema fields for inventory_checks:
 * - id, number (unique), warehouse_id, period, created_by, created_at, updated_at, status
 * 
 * Schema fields for inventory_check_items:
 * - id, check_id, product_id, opening_balance, imports, exports, 
 *   system_balance, actual_balance, difference, difference_percentage,
 *   created_at, input_unit_id, input_value
 */

export interface InventoryCheckData {
    warehouseId: string
    period?: string
    createdBy: string
}

export interface InventoryCheckItemData {
    productId: string
    actualBalance: number
    inputUnitId?: string
    inputValue?: number
}

export interface InventoryCheckCompletionData {
    checkId: string
    warehouseId?: string
    completedBy: string
    items?: {
        itemId: string
        actualQuantity: number
        actualUnitId: string
        inputValue?: number
    }[]
    autoAdjust?: boolean
}

export class InventoryCheckService {
    /**
     * Create inventory check
     * 
     * @param data - Check data
     * @returns Created check ID
     */
    async createInventoryCheck(data: InventoryCheckData): Promise<string> {
        const { warehouseId, period, createdBy } = data

        // Generate check number
        const checkNumber = `KC-${Date.now()}`

        // Validate check number is unique
        const existing = await prisma.inventory_checks.findUnique({
            where: { number: checkNumber }
        })

        if (existing) {
            throw new Error(`Check number ${checkNumber} already exists`)
        }

        // Create check
        const check = await prisma.inventory_checks.create({
            data: {
                number: checkNumber,
                warehouse_id: warehouseId,
                period: period || new Date().toISOString().slice(0, 7), // YYYY-MM
                status: 'IN_PROGRESS',
                created_by: createdBy
            }
        })

        return check.id
    }

    /**
     * Complete inventory check
     * Creates completion record and adjustment items if needed
     * 
     * @param data - Completion data
     */
    async completeInventoryCheck(data: InventoryCheckCompletionData): Promise<void> {
        const { checkId, warehouseId, completedBy, items, autoAdjust } = data

        await prisma.$transaction(async (tx) => {
            // 1. Update items with actual counts (Optimized)
            if (items && items.length > 0) {
                // Bulk fetch current items
                const itemIds = items.map(i => i.itemId)
                const currentItems = await tx.inventory_check_items.findMany({
                    where: { id: { in: itemIds } }
                })

                const itemMap = new Map(currentItems.map(i => [i.id, i]))

                await Promise.all(items.map(async (item) => {
                    const currentItem = itemMap.get(item.itemId)
                    if (currentItem) {
                        const systemBalance = Number(currentItem.system_balance || 0)
                        const actualBalance = item.actualQuantity

                        // Check if update is actually needed (Optimization)
                        // If values match existing DB values, skip the update
                        if (
                            currentItem.actual_balance !== null &&
                            Number(currentItem.actual_balance) === actualBalance &&
                            currentItem.input_unit_id === item.actualUnitId &&
                            currentItem.difference !== null
                        ) {
                            return // Skip update
                        }

                        const diff = actualBalance - systemBalance
                        const diffPercent = systemBalance !== 0 ? (diff / systemBalance) * 100 : 0

                        await tx.inventory_check_items.update({
                            where: { id: item.itemId },
                            data: {
                                actual_balance: actualBalance,
                                difference: diff,
                                difference_percentage: diffPercent,
                                input_unit_id: item.actualUnitId,
                                input_value: item.inputValue
                            }
                        })
                    }
                }))
            }

            // 2. Get updated check with items
            const check = await tx.inventory_checks.findUnique({
                where: { id: checkId },
                include: {
                    warehouses: true,
                    inventory_check_items: {
                        include: {
                            products: {
                                include: { product_units: true }
                            }
                        }
                    }
                }
            })

            if (!check) throw new Error(`Inventory check not found: ${checkId}`)
            if (check.status !== 'IN_PROGRESS') throw new Error(`Check must be IN_PROGRESS. Current: ${check.status}`)

            const finalWarehouseId = warehouseId || check.warehouse_id
            const itemsWithDiff = check.inventory_check_items.filter(i => Number(i.difference ?? 0) !== 0)

            // 3. Create completion record
            const completion = await tx.inventory_check_completions.create({
                data: {
                    check_id: checkId,
                    warehouse_id: finalWarehouseId!,
                    completed_at: new Date(),
                    completed_by: completedBy,
                    total_adjustments: itemsWithDiff.length
                }
            })

            // 4. Create adjustment items & update stock (Optimized)
            // Use createMany for adjustments
            if (itemsWithDiff.length > 0) {
                await tx.inventory_check_adjustment_items.createMany({
                    data: itemsWithDiff.map(item => ({
                        completion_id: completion.id,
                        check_item_id: item.id,
                        product_id: item.product_id,
                        system_quantity: item.system_balance || 0,
                        actual_quantity: item.actual_balance || 0,
                        difference: item.difference || 0
                    }))
                })

                // 4.1 Gửi thông báo chênh lệch đến Lark webhook (async, không block)
                // Lấy tên người hoàn thành
                const completedByUser = await tx.users.findUnique({
                    where: { id: completedBy },
                    select: { full_name: true }
                })

                const webhookPayload = larkWebhookService.createDiscrepancyPayload({
                    checkNumber: check.number,
                    warehouseName: check.warehouses?.name || 'N/A',
                    warehouseCode: check.warehouses?.code || 'N/A',
                    period: check.period || 'N/A',
                    completedByName: completedByUser?.full_name || completedBy,
                    completedAt: completion.completed_at,
                    items: itemsWithDiff.map(item => {
                        const product = (item as any).products
                        return {
                            productCode: product?.code,
                            productName: product?.name,
                            productUnit: product?.product_units?.code || product?.product_units?.name,
                            systemBalance: Number(item.system_balance) || 0,
                            actualBalance: Number(item.actual_balance) || 0,
                            difference: Number(item.difference) || 0,
                            differencePercentage: Number(item.difference_percentage) || 0
                        }
                    })
                })

                // Gọi async không await để không block transaction
                larkWebhookService.sendInventoryDiscrepancyAlert(webhookPayload).catch(() => {
                    // Lỗi đã được log trong service
                })
            }

            if (autoAdjust) {
                await Promise.all(itemsWithDiff.map(async (item) => {
                    try {
                        // Use updateMany to safely ignore if record missing (race condition safe-ish)
                        // But need unique constraint update which updateMany doesn't support well for returning
                        // Use update with catch
                        // Use upsert to handle missing stock records (e.g. new items found during check)
                        // This prevents key constraint fail errors or missing updates
                        // Need to cast item to any to access included products if TypeScript complains (it might not if types are inferred)
                        const product = (item as any).products
                        const unitId = product?.unit_id || item.input_unit_id // Fallback to input unit if weirdness happens

                        if (!unitId) {
                            console.error(`[Inventory Check] Cannot auto-adjust stock for ${item.product_id}: Missing unit_id`)
                            return
                        }

                        await tx.warehouse_stock_realtime.upsert({
                            where: {
                                warehouse_id_product_id: {
                                    warehouse_id: finalWarehouseId,
                                    product_id: item.product_id
                                }
                            },
                            update: {
                                quantity: item.actual_balance || 0,
                                qty_adjusted: { increment: item.difference || 0 },
                                last_updated: new Date()
                            },
                            create: {
                                warehouse_id: finalWarehouseId!,
                                product_id: item.product_id,
                                unit_id: unitId,
                                quantity: item.actual_balance || 0,
                                qty_imported: 0,
                                qty_produced: 0,
                                qty_sold: 0,
                                qty_transferred_in: 0,
                                qty_transferred_out: 0,
                                qty_adjusted: item.difference || 0,
                                version: 1,
                                last_updated: new Date()
                            }
                        })
                    } catch (err) {
                        console.error(`Failed to auto-adjust stock for product ${item.product_id}`, err)
                    }
                }))
            }

            // 5. Create CHECK_POINT snapshots (Optimized)
            const today = new Date()

            // Bulk fetch latest stock data (needed because we might have just updated it in autoAdjust)
            const checkProductIds = check.inventory_check_items.map(i => i.product_id)
            const latestStocks = await tx.warehouse_stock_realtime.findMany({
                where: {
                    warehouse_id: finalWarehouseId!,
                    product_id: { in: checkProductIds }
                }
            })

            const stockMap = new Map(latestStocks.map(s => [s.product_id, s]))

            // Use Promise.all with upserts (Prisma doesn't support bulk upsert efficiently yet)
            // But we removed the findUnique read inside the loop
            await Promise.all(check.inventory_check_items.map(async (item) => {
                const stock = stockMap.get(item.product_id)

                if (stock) {
                    const cumIn = Number(stock.qty_imported || 0) + Number(stock.qty_produced || 0) + Number(stock.qty_transferred_in || 0)
                    const cumOut = Math.abs(Number(stock.qty_sold || 0)) + Math.abs(Number(stock.qty_transferred_out || 0))

                    await tx.inventory_snapshots.upsert({
                        where: {
                            warehouse_id_product_id_snapshot_date_snapshot_type: {
                                warehouse_id: finalWarehouseId!,
                                product_id: item.product_id,
                                snapshot_date: today,
                                snapshot_type: 'CHECK_POINT'
                            }
                        },
                        create: {
                            warehouse_id: finalWarehouseId!,
                            product_id: item.product_id,
                            snapshot_date: today,
                            snapshot_type: 'CHECK_POINT',
                            opening_stock: 0,
                            closing_stock: item.actual_balance || 0,
                            total_in: cumIn,
                            total_out: cumOut
                        },
                        update: {
                            closing_stock: item.actual_balance || 0,
                            total_in: cumIn,
                            total_out: cumOut,
                            created_at: new Date()
                        }
                    })
                }
            }))

            // 6. Update check status
            await tx.inventory_checks.update({
                where: { id: checkId },
                data: { status: 'COMPLETED' }
            })
        }, {
            timeout: 120000 // Increase to 2 mins for heavy check completions
        })
    }

    /**
     * Get check by ID or Number with all details
     */
    async getCheckById(checkId: string) {
        // Try to find by UUID first, then by Number
        const isUuid = checkId.includes('-') && checkId.length > 20
        
        const check = await prisma.inventory_checks.findFirst({
            where: {
                OR: [
                    isUuid ? { id: checkId } : { id: undefined },
                    { number: checkId }
                ]
            },
            include: {
                warehouses: true,
                inventory_check_items: {
                    include: {
                        products: {
                            include: {
                                product_units: true
                            }
                        },
                        input_unit: true
                    }
                },
                inventory_check_completions: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                full_name: true
                            }
                        },
                        adjustments: true
                    }
                }
            }
        })

        if (!check) return null

        // Get creator name if created_by is a UUID
        let creatorName = check.created_by
        if (check.created_by && check.created_by.includes('-')) {
            const creator = await prisma.users.findUnique({
                where: { id: check.created_by },
                select: { full_name: true }
            })
            if (creator) creatorName = creator.full_name
        }

        // Create a map of check_item_id -> adjustment_reason from completion adjustments
        const adjustmentMap = new Map()
        if (check.inventory_check_completions?.adjustments) {
            for (const adj of check.inventory_check_completions.adjustments) {
                adjustmentMap.set(adj.check_item_id, adj.adjustment_reason)
            }
        }

        // Map to frontend format
        return {
            id: check.id,
            number: check.number,
            warehouse: check.warehouses?.name || 'Unknown',
            warehouseId: check.warehouse_id,
            period: check.period,
            status: check.status,
            createdBy: creatorName,
            createdAt: check.created_at,
            updatedAt: check.updated_at,
            items: (check.inventory_check_items || []).map((item: any) => ({
                id: item.id,
                productId: item.product_id,
                productCode: item.products?.code,
                productName: item.products?.name,
                productUnit: item.products?.product_units?.code || item.products?.product_units?.name,
                productUnitId: item.products?.unit_id,
                openingBalance: Number(item.opening_balance),
                imports: Number(item.imports),
                exports: Number(item.exports),
                systemBalance: Number(item.system_balance),
                actualBalance: Number(item.actual_balance),
                difference: Number(item.difference),
                differencePercentage: Number(item.difference_percentage),
                inputUnitId: item.input_unit_id,
                inputUnitCode: item.input_unit?.code || item.input_unit?.name,
                inputValue: item.input_value !== null ? Number(item.input_value) : null,
                inputUnit: item.input_unit,
                note: adjustmentMap.get(item.id) || null // Map adjustment reason
            })),
            completion: check.inventory_check_completions || null
        }
    }

    /**
     * List inventory checks with pagination + filters
     */
    async listChecks(params: {
        warehouseId?: string
        status?: string
        search?: string
        fromDate?: string
        toDate?: string
        page?: number
        pageSize?: number
    }) {
        const { warehouseId, status, search, fromDate, toDate, page = 1, pageSize = 20 } = params

        const where: any = {}
        if (warehouseId) where.warehouse_id = warehouseId
        if (status) where.status = status

        // Lọc theo ngày tạo
        if (fromDate || toDate) {
            where.created_at = {}
            if (fromDate) where.created_at.gte = new Date(fromDate)
            if (toDate) {
                const end = new Date(toDate)
                end.setHours(23, 59, 59, 999)
                where.created_at.lte = end
            }
        }

        // Tìm kiếm theo số phiếu
        if (search) {
            where.number = { contains: search, mode: 'insensitive' }
        }

        const skip = (page - 1) * pageSize

        // Tối ưu: chạy song song count + findMany
        const [total, results] = await Promise.all([
            prisma.inventory_checks.count({ where }),
            prisma.inventory_checks.findMany({
                where,
                include: {
                    warehouses: {
                        select: {
                            id: true,
                            name: true,
                            code: true
                        }
                    },
                    inventory_check_completions: {
                        select: {
                            completed_at: true
                        }
                    },
                    inventory_check_items: {
                        include: {
                            products: {
                                include: {
                                    product_units: true
                                }
                            },
                            input_unit: true
                        }
                    },
                    _count: {
                        select: {
                            inventory_check_items: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                },
                skip,
                take: pageSize
            })
        ])

        const totalPages = Math.ceil(total / pageSize)

        // Get all unique creator IDs
        const creatorIds = [...new Set(results.map(c => c.created_by).filter((id): id is string => !!id && id.includes('-')))]

        // Fetch all creators at once
        const creators = await prisma.users.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, full_name: true }
        })

        const creatorMap = new Map(creators.map(u => [u.id, u.full_name]))

        // Tối ưu N+1: batch check cho newerChecks cùng lúc
        // Lấy tất cả warehouse_ids + created_at của completed checks
        const completedChecks = results.filter(c => c.status === 'COMPLETED')
        const newerCheckMap = new Map<string, { number: string; status: string } | null>()

        if (completedChecks.length > 0) {
            // Batch check: cho mỗi completed check, tìm xem có check nào newer trong cùng warehouse không
            const newerCheckPromises = completedChecks.map(async (check) => {
                const newer = await prisma.inventory_checks.findFirst({
                    where: {
                        warehouse_id: check.warehouse_id,
                        created_at: { gt: check.created_at || new Date(0) }
                    },
                    select: { id: true, number: true, status: true }
                })
                return { checkId: check.id, newer }
            })

            const newerResults = await Promise.all(newerCheckPromises)
            for (const result of newerResults) {
                newerCheckMap.set(result.checkId, result.newer)
            }
        }

        // Map to frontend-expected format
        const mappedResults = await Promise.all(results.map(async check => {
            const creatorName = check.created_by ? (creatorMap.get(check.created_by) || check.created_by) : 'Unknown'
            const completedAt = check.inventory_check_completions?.completed_at || null

            let canDelete = true
            let deleteBlockedReason = null

            // Logic for COMPLETED checks
            if (check.status === 'COMPLETED') {
                const newerCheck = newerCheckMap.get(check.id)

                if (newerCheck) {
                    canDelete = false
                    const statusText = newerCheck.status === 'IN_PROGRESS' ? 'đang tiến hành' : 'đã hoàn thành'
                    deleteBlockedReason = `Đã có phiếu kiểm kê mới hơn (${newerCheck.number} - ${statusText})`
                } else {
                    // Check for subsequent transactions
                    const dateLimit = check.created_at || new Date(0)
                    const [sales, imports, production, adjustments, transfersFrom, transfersTo, lossReports] = await Promise.all([
                        prisma.sales_invoices.count({ where: { warehouse_id: check.warehouse_id, created_at: { gt: dateLimit } } }),
                        prisma.inventory_imports.count({ where: { warehouse_id: check.warehouse_id, created_at: { gt: dateLimit } } }),
                        prisma.production_transactions.count({ where: { warehouse_id: check.warehouse_id, created_at: { gt: dateLimit } } }),
                        prisma.inventory_adjustments.count({ where: { warehouse_id: check.warehouse_id, created_at: { gt: dateLimit } } }),
                        prisma.internal_transfer_requests.count({ where: { from_warehouse_id: check.warehouse_id, exported_at: { gt: dateLimit } } }),
                        prisma.internal_transfer_requests.count({ where: { to_warehouse_id: check.warehouse_id, received_at: { gt: dateLimit } } }),
                        prisma.inventory_loss_reports.count({ where: { warehouse_id: check.warehouse_id, created_at: { gt: dateLimit } } })
                    ])

                    if (sales > 0 || imports > 0 || production > 0 || adjustments > 0 || transfersFrom > 0 || transfersTo > 0 || lossReports > 0) {
                        canDelete = false
                        deleteBlockedReason = `Đã phát sinh giao dịch sau kiểm kê: ${[
                            sales > 0 ? `${sales} bán` : null,
                            imports > 0 ? `${imports} nhập` : null,
                            transfersFrom > 0 ? `${transfersFrom} xuất chuyển` : null,
                            transfersTo > 0 ? `${transfersTo} nhập chuyển` : null,
                            lossReports > 0 ? `${lossReports} báo cáo mất hàng` : null
                        ].filter(Boolean).join(', ')}`
                    }
                }
            }

            return {
                id: check.id,
                number: check.number,
                warehouse: check.warehouses?.name || `Kho ${check.warehouse_id.substring(0, 8)}`,
                warehouseCode: check.warehouses?.code || '',
                warehouseId: check.warehouse_id,
                period: check.period,
                status: check.status,
                createdBy: creatorName,
                createdByRaw: check.created_by || '',
                createdAt: check.created_at,
                updatedAt: check.updated_at,
                completed_at: completedAt,
                canDelete,
                deleteBlockedReason,
                itemCount: (check as any)._count?.inventory_check_items || 0,
                // Optimized re-inclusion of items for frontend ReportsPage
                items: (check.inventory_check_items || []).map((item: any) => ({
                    id: item.id,
                    productId: item.product_id,
                    productCode: item.products?.code,
                    productName: item.products?.name,
                    productUnit: item.products?.product_units?.code || item.products?.product_units?.name,
                    productUnitId: item.products?.unit_id,
                    openingBalance: Number(item.opening_balance),
                    imports: Number(item.imports),
                    exports: Number(item.exports),
                    systemBalance: Number(item.system_balance),
                    actualBalance: Number(item.actual_balance),
                    difference: Number(item.difference),
                    differencePercentage: Number(item.difference_percentage),
                    inputUnitId: item.input_unit_id,
                    inputUnitCode: item.input_unit?.code || item.input_unit?.name,
                    inputValue: item.input_value !== null ? Number(item.input_value) : null,
                    inputUnit: item.input_unit
                }))
            }
        }))

        return {
            data: mappedResults,
            total,
            totalPages,
            page,
            pageSize
        }
    }

    /**
     * Get check summary (discrepancy statistics)
     */
    async getCheckSummary(checkId: string) {
        const items = await prisma.inventory_check_items.findMany({
            where: { check_id: checkId }
        })

        const totalItems = items.length
        const matchedItems = items.filter(i => Number(i.difference || 0) === 0).length
        const discrepancyItems = items.filter(i => Number(i.difference || 0) !== 0).length
        const totalDiscrepancyValue = items.reduce((sum, i) => sum + Math.abs(Number(i.difference || 0)), 0)

        return {
            totalItems,
            matchedItems,
            discrepancyItems,
            matchRate: totalItems > 0 ? (matchedItems / totalItems) * 100 : 0,
            totalDiscrepancyValue
        }
    }

    /**
     * Update check item with actual balance
     */
    async updateCheckItem(itemId: string, actualBalance: number, inputUnitId?: string, inputValue?: number) {
        const item = await prisma.inventory_check_items.findUnique({
            where: { id: itemId }
        })

        if (!item) {
            throw new Error(`Check item not found: ${itemId}`)
        }

        const systemBalance = Number(item.system_balance || 0)
        const difference = actualBalance - systemBalance
        const differencePercentage = systemBalance > 0 ? (difference / systemBalance) * 100 : 0

        return await prisma.inventory_check_items.update({
            where: { id: itemId },
            data: {
                actual_balance: actualBalance,
                difference: difference,
                difference_percentage: differencePercentage,
                input_unit_id: inputUnitId,
                input_value: inputValue
            }
        })
    }

    /**
     * Delete inventory check and rollback if completed
     */
    async deleteInventoryCheck(checkId: string): Promise<void> {
        await prisma.$transaction(async (tx) => {
            // Get check info with ALL dependencies
            const check = await tx.inventory_checks.findUnique({
                where: { id: checkId },
                include: {
                    inventory_check_completions: { // This is now a one-to-one relation
                        include: { adjustments: true }
                    },
                    inventory_check_items: {
                        include: { products: true }
                    }
                }
            })

            if (!check) return

            // CRITICAL VALIDATION: Check for newer inventory checks (IN_PROGRESS or COMPLETED)
            // Rolling back an old check while a newer one exists creates data inconsistencies.
            const newerCheck = await tx.inventory_checks.findFirst({
                where: {
                    warehouse_id: check.warehouse_id,
                    created_at: { gt: check.created_at || new Date(0) }
                },
                select: { number: true, status: true }
            })

            if (newerCheck) {
                const statusText = newerCheck.status === 'IN_PROGRESS' ? 'đang tiến hành' : 'đã hoàn thành'
                throw new Error(`Không thể xóa phiếu kiểm kê này vì đã có phiếu kiểm kê mới hơn (${newerCheck.number} - ${statusText})`)
            }

            // Rollback Stock if Completed
            if (check.status === 'COMPLETED' && check.inventory_check_completions) {
                const completion = check.inventory_check_completions
                for (const adj of completion.adjustments) {
                    // Rollback logic: Restore system quantity and revert adjustment counter
                    // Use upsert to handle cases where the stock record might be missing (failed creation)

                    const checkItem = check.inventory_check_items.find(i => i.id === adj.check_item_id)
                    // Cast to any to access products if Typescript doesn't see it (due to dynamic include)
                    const product = (checkItem as any)?.products
                    const unitId = product?.unit_id

                    if (unitId) {
                        await tx.warehouse_stock_realtime.upsert({
                            where: {
                                warehouse_id_product_id: {
                                    warehouse_id: check.warehouse_id,
                                    product_id: adj.product_id
                                }
                            },
                            update: {
                                quantity: adj.system_quantity, // Restore to system quantity before check
                                qty_adjusted: { decrement: adj.difference || 0 }, // Revert adjustment counter
                                last_updated: new Date()
                            },
                            create: {
                                warehouse_id: check.warehouse_id,
                                product_id: adj.product_id,
                                unit_id: unitId,
                                quantity: Number(adj.system_quantity),
                                qty_imported: 0,
                                qty_produced: 0,
                                qty_sold: 0,
                                qty_transferred_in: 0,
                                qty_transferred_out: 0,
                                qty_adjusted: 0 - Number(adj.difference || 0), // Revert adjustment (0 - diff)
                                version: 1,
                                last_updated: new Date()
                            }
                        })
                    } else {
                        // Fallback if unitId not found (shouldn't happen) - try update, ignore error
                        try {
                            await tx.warehouse_stock_realtime.update({
                                where: {
                                    warehouse_id_product_id: {
                                        warehouse_id: check.warehouse_id,
                                        product_id: adj.product_id
                                    }
                                },
                                data: {
                                    quantity: adj.system_quantity,
                                    qty_adjusted: { decrement: adj.difference || 0 },
                                    last_updated: new Date()
                                }
                            })
                        } catch (e) {
                            console.warn(`[Delete Check] Failed to rollback stock for product ${adj.product_id}`, e)
                        }
                    }
                }


                // Delete Snapshots (CHECK_POINT)
                // We find snapshots associated with this check's products created around completion time
                const productIds = check.inventory_check_items.map(i => i.product_id)

                // Since we used 'new Date()' at completion, we try to match that.
                // Note: This is an approximation. Ideally snapshot should link to check_id.
                // But schema doesn't have it.
                // We delete CHECK_POINT snapshots for these products.
                // If there are multiple check points, this might delete wrong one?
                // But usually 1 check point per day.

                // Use completion date to find snapshot date
                // We use deleteMany with Date filter if possible.
                // But Prisma Date filter on composite key is tricky.
                // Let's rely on cleaning up by product and type.
                // WARNING: This deletes ALL check points for these products? No.
                // We should try to limit scope.

                // Safe approach: Don't delete snapshots blindly.
                // If we leave snapshots, next check uses them (Closing Stock of deleted check).
                // This Closing Stock is 'Actual Balance' of deleted check.
                // Since we delete check because it's wrong -> preserving snapshot is BAD.

                // We MUST delete.
                // Let's delete snapshots created on the same day as completion.
                /*
                await tx.inventory_snapshots.deleteMany({
                    where: {
                        warehouse_id: check.warehouse_id,
                        product_id: { in: productIds },
                        snapshot_type: 'CHECK_POINT',
                        // snapshot_date: completedAt // Need date part match
                    }
                })
                */
                // Due to complexity of Date matching in deleteMany, we have optimized to delete in one go using 'in' operator
                // We delete snapshots created around the completion time to ensure clean rollback
                console.log(`[Delete Check] Removing snapshots for rolled-back check`)

                const completionTime = completion.completed_at.getTime()
                await tx.inventory_snapshots.deleteMany({
                    where: {
                        warehouse_id: check.warehouse_id,
                        product_id: { in: productIds },
                        snapshot_type: 'CHECK_POINT',
                        created_at: {
                            gte: new Date(completionTime - 60000),
                            lte: new Date(completionTime + 60000)
                        }
                    }
                })
            }

            // Cleanup Records

            // 1. Delete Adjustments
            if (check.inventory_check_completions) {
                await tx.inventory_check_adjustment_items.deleteMany({
                    where: { completion_id: check.inventory_check_completions.id }
                })

                // 2. Delete Completion
                await tx.inventory_check_completions.delete({
                    where: { id: check.inventory_check_completions.id }
                })
            }

            // 3. Delete Check Items
            await tx.inventory_check_items.deleteMany({
                where: { check_id: checkId }
            })

            // 4. Delete Check
            await tx.inventory_checks.delete({
                where: { id: checkId }
            })
        }, {
            maxWait: 5000, // Wait max 5s for transaction to start
            timeout: 120000 // Increase to 2 mins for heavy check deletions
        })
    }
    /**
     * Calculate item data with unit conversion
     * Exposed for testing
     */
    calculateCheckItemData(
        checkId: string,
        product: any,
        warehouseType: string,
        stock: any,
        snapshot: any
    ) {
        // 0. Determine Context
        const isMainWarehouse = warehouseType === 'MAIN'

        // 1. Determine Unit (Auto-select largest unit)
        // Default to base unit
        let selectedUnitId = product.unit_id
        let conversionFactor = 1

        // Only switch to package unit if it is MAIN warehouse
        if (isMainWarehouse && product.product_package_units && product.product_package_units.length > 0) {
            // Find package with largest base_quantity
            // Sort desc by quantity
            const sortedPackages = [...product.product_package_units].sort((a, b) =>
                Number(b.base_quantity) - Number(a.base_quantity)
            )

            const largestPackage = sortedPackages[0]

            // Only switch if package provides a conversion > 1
            if (largestPackage && Number(largestPackage.base_quantity) > 1) {
                selectedUnitId = largestPackage.product_units.id // Use the unit ID of the package
                conversionFactor = Number(largestPackage.base_quantity)
            }
        }

        // 2. Calculate Stock Values
        // Fallback: If stock record is missing but we have a snapshot > 0, use snapshot values.
        let safeStock = stock
        if (!stock && snapshot && Number(snapshot.closing_stock) > 0) {
            safeStock = {
                quantity: snapshot.closing_stock,
                qty_imported: snapshot.total_in,
                qty_produced: 0,
                qty_transferred_in: 0,
                qty_sold: snapshot.total_out,
                qty_transferred_out: 0,
                qty_adjusted: 0
            }
        }

        const cumIn = safeStock ? (Number(safeStock.qty_imported || 0) + Number(safeStock.qty_produced || 0) + Number(safeStock.qty_transferred_in || 0)) : 0
        const cumOut = safeStock ? (Math.abs(Number(safeStock.qty_sold || 0)) + Math.abs(Number(safeStock.qty_transferred_out || 0))) : 0

        let openingBalance = 0
        let imports = cumIn
        let exports = cumOut

        if (snapshot) {
            openingBalance = Number(snapshot.closing_stock || 0)
            imports = Math.max(0, cumIn - Math.abs(Number(snapshot.total_in || 0)))
            exports = Math.max(0, cumOut - Math.abs(Number(snapshot.total_out || 0)))
        }

        const systemBalance = safeStock ? Number(safeStock.quantity) : 0

        // Calculate converted input value
        // If systemBalance = 24, and convert factor = 24 (1 Thùng), result = 1.
        // If systemBalance = 25, result = 1.041...
        // We do strictly formatted calculation in frontend, here we store raw number.
        const inputValue = isMainWarehouse ? (systemBalance / conversionFactor) : 0

        return {
            check_id: checkId,
            product_id: product.id,
            opening_balance: openingBalance,
            imports: imports,
            exports: exports,
            system_balance: systemBalance,
            actual_balance: isMainWarehouse ? systemBalance : 0,
            difference: isMainWarehouse ? 0 : -systemBalance, // If Store, actual is 0 so diff is -system
            difference_percentage: isMainWarehouse ? 0 : -100,
            input_unit_id: selectedUnitId,
            input_value: inputValue
        }
    }

    /**
     * Generate check items for a new inventory check
     * Optimized to handle unit conversion and missing goods
     */
    async generateCheckItems(checkId: string, warehouseId: string, warehouseType: string): Promise<number> {
        const isMainWarehouse = warehouseType === 'MAIN'

        // 1. Fetch Stocks for mapping later (needed for calculateCheckItemData)
        const stocks = await prisma.warehouse_stock_realtime.findMany({
            where: { warehouse_id: warehouseId }
        })

        // 2. Fetch only REQUIRED products (Optimized)
        // MAIN: Global + Assigned to MAIN
        // STORE/PARTNER: Assigned to them + Global/Others that have stock records
        const stockProductIds = stocks.map(s => s.product_id)

        const productsToCheck = await prisma.products.findMany({
            where: {
                OR: [
                    { warehouse_id: warehouseId }, // Products assigned to this warehouse
                    { id: { in: stockProductIds } }, // Products that have stock records here
                    ...(isMainWarehouse ? [{ warehouse_id: null }] : []) // All global products only for MAIN
                ]
            },
            select: {
                id: true,
                code: true,
                name: true,
                unit_id: true,
                warehouse_id: true,
                product_package_units: {
                    include: {
                        product_units: {
                            select: { id: true, name: true, code: true }
                        }
                    }
                }
            }
        })

        console.log(`[Inventory Check] Generating items for ${productsToCheck.length} products (Warehouse Type: ${warehouseType})`)

        // 3. Fetch Snapshots (Batched/Optimized)
        // Only select necessary columns
        const snapshots: any[] = await prisma.$queryRaw`
            SELECT DISTINCT ON (product_id) product_id, closing_stock, total_in, total_out
            FROM inventory_snapshots
            WHERE warehouse_id = CAST(${warehouseId} AS uuid)
              AND snapshot_type = 'CHECK_POINT'
            ORDER BY product_id, snapshot_date DESC, created_at DESC
        `
        const snapshotMap = new Map(snapshots.map((s: any) => [s.product_id, s]))
        const stockMap = new Map((stocks as any[]).map(s => [s.product_id, s]))

        // 4. Calculate Data
        const checkItemsData = productsToCheck.map(product => {
            const stock = stockMap.get(product.id)
            const snap = snapshotMap.get(product.id)
            return this.calculateCheckItemData(checkId, product, warehouseType, stock, snap)
        })

        // 5. Bulk Insert in smaller chunks to be safe with session memory
        const CHUNK_SIZE = 500
        let totalInserted = 0

        for (let i = 0; i < checkItemsData.length; i += CHUNK_SIZE) {
            const chunk = checkItemsData.slice(i, i + CHUNK_SIZE)
            await prisma.inventory_check_items.createMany({
                data: chunk,
                skipDuplicates: true
            })
            totalInserted += chunk.length
        }

        return totalInserted
    }
}

// Singleton instance
export const inventoryCheckService = new InventoryCheckService()
