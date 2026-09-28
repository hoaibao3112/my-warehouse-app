import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse, User } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Inventory Intake API - SIMPLIFIED
 * 
 * GET - List import records
 * POST - Create new import (directly updates stock)
 * 
 * No workflow, no approval needed. Direct import + stock update.
 */

export async function GET(request: NextRequest) {
    try {
        const token = getAuthToken(request)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const user = await prisma.users.findUnique({
            where: { id: payload.id },
            select: { id: true, role: true, warehouse_id: true }
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        const searchParams = request.nextUrl.searchParams
        const page = parseInt(searchParams.get("page") || "1")
        const pageSize = parseInt(searchParams.get("pageSize") || "20")
        let warehouseId = searchParams.get("warehouseId")

        // Enforce warehouse access for non-admin
        if (!isAdmin(user as unknown as User)) {
            if (user.warehouse_id) {
                warehouseId = user.warehouse_id
            }
        }

        // Build where clause
        const where: any = {}
        if (warehouseId) {
            where.warehouse_id = warehouseId
        }

        // Count total
        const total = await prisma.inventory_imports.count({ where })

        // Fetch imports with items
        const imports = await prisma.inventory_imports.findMany({
            where,
            include: {
                warehouse: {
                    select: { id: true, name: true }
                },
                user: {
                    select: { id: true, full_name: true }
                },
                items: {
                    include: {
                        product: {
                            select: { id: true, code: true, name: true }
                        },
                        input_unit: {
                            select: { id: true, code: true, name: true }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' },
            skip: (Math.max(1, page) - 1) * Math.max(1, pageSize),
            take: pageSize
        })

        // Format response
        const data = imports.map(imp => ({
            id: imp.id,
            intakeId: imp.id,  // Alias for frontend
            importNumber: imp.import_number,
            intakeNumber: imp.import_number,  // Alias for frontend
            warehouseId: imp.warehouse_id,
            warehouseName: imp.warehouse?.name,
            supplierName: imp.supplier_name,
            importDate: imp.import_date,
            totalAmount: imp.total_amount,
            totalQuantity: imp.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
            notes: imp.notes,
            createdBy: imp.user?.full_name,
            createdAt: imp.created_at,
            items: imp.items.map(item => ({
                id: item.id,
                productId: item.product_id,
                productCode: item.product?.code,
                productName: item.product?.name,
                quantity: item.quantity,
                unitId: item.input_unit_id,
                unitCode: item.input_unit?.code,
                unitName: item.input_unit?.name,
                baseQuantity: item.base_quantity,
                currentStock: item.stock_after_transaction, // Historical snapshot!
                unitPrice: item.unit_price,
                lineTotal: item.line_total
            }))
        }))

        return NextResponse.json({
            success: true,
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        } as PaginatedResponse<any>)

    } catch (error: any) {
        console.error("Error fetching imports:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const token = getAuthToken(request)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        // Get user info to auto-detect warehouse
        const user = await prisma.users.findUnique({
            where: { id: payload.id },
            select: { id: true, role: true, warehouse_id: true }
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy người dùng" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        const body = await request.json()
        let { warehouseId, items, notes, supplierName } = body

        // Auto-detect warehouseId from user if not provided
        if (!warehouseId) {
            if (user.warehouse_id) {
                warehouseId = user.warehouse_id
                console.log(`Auto-detected warehouseId: ${warehouseId} from user ${user.id}`)
            } else {
                return NextResponse.json(
                    { success: false, error: "Vui lòng chọn kho hoặc được gán kho trước" } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Vui lòng thêm ít nhất một sản phẩm" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Validate items have required fields
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (!item.productId || !item.quantity || !item.unitId) {
                const missing = []
                if (!item.productId) missing.push('mã sản phẩm')
                if (!item.quantity) missing.push('số lượng')
                if (!item.unitId) missing.push('đơn vị')

                return NextResponse.json(
                    {
                        success: false,
                        error: `Sản phẩm thứ ${i + 1} (ID: ${item.productId || 'Unknown'}) thiếu thông tin: ${missing.join(', ')}`
                    } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        // Create import record with Vietnam timezone
        const importNumber = `IMP-${Date.now()}`

        // Use raw SQL to insert with explicit timezone
        const importRecord = await prisma.$queryRaw<any[]>`
            INSERT INTO inventory_imports (
                id, import_number, warehouse_id, supplier_name, 
                import_date, notes, created_by, created_at
            ) VALUES (
                gen_random_uuid(),
                ${importNumber},
                ${warehouseId}::uuid,
                ${supplierName || null},
                NOW(),
                ${notes || null},
                ${payload.id}::uuid,
                CURRENT_TIMESTAMP
            )
            RETURNING *
        `

        const createdImport = importRecord[0] as { id: string; import_number: string }

        // CRITICAL: Check inventory lock BEFORE processing items
        const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
        const lockCheck = await checkInventoryCheckLock(warehouseId)

        if (lockCheck.isLocked) {
            // Delete the just-created import record
            await prisma.inventory_imports.delete({ where: { id: createdImport.id } })

            return NextResponse.json(
                { success: false, error: lockCheck.message } as ApiResponse<null>,
                { status: 423 } // 423 Locked
            )
        }

        let totalAmount = 0

        // ✅ CRITICAL OPTIMIZATION: Batch fetch all products and package units FIRST
        // This eliminates N+1 query problem
        const productIds = Array.from(new Set(items.map(i => i.productId)))
        const products = await prisma.products.findMany({
            where: { id: { in: productIds } },
            select: { id: true, code: true, unit_id: true }
        })
        const productMap = new Map(products.map(p => [p.id, p]))

        // Batch fetch all package units for conversion
        const uniqueUnitPairs = items
            .map(item => ({ productId: item.productId, unitId: item.unitId }))
            .filter(pair => {
                const product = productMap.get(pair.productId)
                return product && pair.unitId !== product.unit_id
            })

        const packageUnitIds = Array.from(new Set(uniqueUnitPairs.map(p => p.unitId)))

        // 1. Fetch Product Package Units (Priority 1)
        const packageUnits = await prisma.product_package_units.findMany({
            where: {
                product_id: { in: productIds },
                package_unit_id: { in: packageUnitIds }
            }
        })

        // 2. Fetch Unit Relations (Priority 2) - Global conversions
        const unitIds = Array.from(new Set([...packageUnitIds, ...products.map(p => p.unit_id).filter(id => id)])) as string[]

        const unitRelations = await prisma.unit_relations.findMany({
            where: {
                OR: [
                    { from_unit_id: { in: unitIds } },
                    { to_unit_id: { in: unitIds } }
                ]
            }
        })

        console.log(`[Import Optimization] Loaded ${products.length} products, ${packageUnits.length} package units, ${unitRelations.length} relations`)

        // ✅ Prepare all stock updates and import items data
        const stockUpdates: any[] = []
        const importItemsData: any[] = []

        // Helper to find relation multiplier
        const findGlobalMultiplier = (fromUnitId: string, toUnitId: string): number | null => {
            if (fromUnitId === toUnitId) return 1

            // Direct
            const direct = unitRelations.find(r => r.from_unit_id === fromUnitId && r.to_unit_id === toUnitId)
            if (direct) return Number(direct.multiplier)

            // Reverse
            const reverse = unitRelations.find(r => r.from_unit_id === toUnitId && r.to_unit_id === fromUnitId)
            if (reverse && Number(reverse.multiplier) !== 0) return 1 / Number(reverse.multiplier)

            return null
        }

        for (const item of items) {
            const product = productMap.get(item.productId)

            if (!product) {
                console.warn(`Product not found: ${item.productId}`)
                continue
            }

            // Calculate base quantity
            let baseQuantity = item.quantity
            let conversionFound = false

            // Check if unit needs conversion
            if (item.unitId !== product.unit_id) {
                // 1. Try Product Package Unit
                const packageUnit = packageUnits.find(pu =>
                    pu.product_id === item.productId &&
                    pu.package_unit_id === item.unitId
                )

                if (packageUnit) {
                    baseQuantity = item.quantity * Number(packageUnit.base_quantity)
                    conversionFound = true
                }
                // 2. Try Global Unit Relations (if product.unit_id exists)
                else if (product.unit_id) {
                    const multiplier = findGlobalMultiplier(item.unitId, product.unit_id)
                    if (multiplier !== null) {
                        baseQuantity = item.quantity * multiplier
                        conversionFound = true
                    }
                }

                if (!conversionFound && item.unitId !== product.unit_id) {
                    console.warn(`[Import] No conversion found for Product ${product.code}: ${item.unitId} -> ${product.unit_id}. Assuming 1:1.`)
                }
            }

            // Prepare stock update
            stockUpdates.push({
                warehouseId,
                productId: item.productId,
                baseQuantity,
                baseUnitId: product.unit_id
            })

            // Prepare import item data (stock_after_transaction will be calculated after update)
            const lineTotal = (item.unitPrice || 0) * item.quantity
            totalAmount += lineTotal

            importItemsData.push({
                productId: item.productId,
                quantity: item.quantity,
                unitId: item.unitId,
                baseQuantity,
                unitPrice: item.unitPrice,
                lineTotal,
                productCode: product.code
            })
        }

        console.log(`[Import] Processing ${stockUpdates.length} stock updates with batch upsert`)

        // ✅ CRITICAL: Batch update all stocks using raw SQL for maximum performance
        // This is much faster than individual upserts
        for (const update of stockUpdates) {
            // Ensure numeric type for PostgreSQL Decimal columns
            const qty = Number(update.baseQuantity) || 0
            await prisma.$executeRaw`
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
                    ${qty}::numeric, 
                    ${qty}::numeric, 
                    0, 0, 0, 0, 0, 1,
                    NOW()
                )
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET
                    quantity = warehouse_stock_realtime.quantity + ${qty}::numeric,
                    qty_imported = warehouse_stock_realtime.qty_imported + ${qty}::numeric,
                    version = warehouse_stock_realtime.version + 1,
                    last_updated = NOW()
            `
        }

        console.log(`[Import] Batch updated ${stockUpdates.length} stocks in parallel`)

        // ✅ Fetch updated stocks to get current quantities
        const updatedStocks = await prisma.warehouse_stock_realtime.findMany({
            where: {
                warehouse_id: warehouseId,
                product_id: { in: productIds }
            },
            select: { product_id: true, quantity: true }
        })
        const stockQuantityMap = new Map(updatedStocks.map(s => [s.product_id, s.quantity]))

        // ✅ BULK INSERT: Create all import items at once
        const importItemsToCreate = importItemsData.map(item => ({
            import_id: createdImport.id,
            product_id: item.productId,
            quantity: item.quantity,
            input_unit_id: item.unitId,
            base_quantity: item.baseQuantity,
            stock_after_transaction: stockQuantityMap.get(item.productId) || 0,
            unit_price: item.unitPrice || null,
            line_total: item.lineTotal || null
        }))

        if (importItemsToCreate.length > 0) {
            await prisma.inventory_import_items.createMany({
                data: importItemsToCreate
            })
            console.log(`[Import] Bulk created ${importItemsToCreate.length} import items`)
        }

        // Update total amount
        if (totalAmount > 0) {
            await prisma.inventory_imports.update({
                where: { id: createdImport.id },
                data: { total_amount: totalAmount }
            })
        }

        return NextResponse.json({
            success: true,
            data: {
                id: createdImport.id,
                importNumber: createdImport.import_number,
                message: 'Nhập hàng thành công! Tồn kho đã được cập nhật.'
            }
        } as ApiResponse<any>, { status: 201 })

    } catch (error: any) {
        console.error("Error creating import:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
