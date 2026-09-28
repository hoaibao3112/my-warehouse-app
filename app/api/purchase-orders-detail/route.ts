import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin, canAccessWarehouse } from "@/lib/auth"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/purchase-orders-detail
 * Lấy danh sách phiếu nhập hàng từ nhà cung cấp
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const token = getAuthToken(request)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Get current user info
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

    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get("page")) || 1
    const pageSize = Number(searchParams.get("pageSize")) || 10
    const status = searchParams.get("status")
    let warehouseId = searchParams.get("warehouseId")

    // For non-admin users, enforce their assigned warehouse
    if (user.role !== "ADMIN") {
      if (!user.warehouse_id) {
        return NextResponse.json(
          { success: false, error: "User not assigned to any warehouse" } as ApiResponse<null>,
          { status: 403 }
        )
      }

      // If warehouseId is provided but doesn't match user's warehouse, deny access
      if (warehouseId && warehouseId.trim() !== user.warehouse_id.trim()) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Cannot access other warehouse's data" } as ApiResponse<null>,
          { status: 403 }
        )
      }

      // Force warehouseId to user's assigned warehouse
      warehouseId = user.warehouse_id
    }

    let query_sql = `
      SELECT pod.*, s.name as supplier_name, w.name as warehouse_name
      FROM purchase_orders_detail pod
      LEFT JOIN suppliers s ON pod.supplier_id = s.id
      LEFT JOIN warehouses w ON pod.warehouse_id = w.id
    `
    const params: any[] = []
    const whereConditions: string[] = []

    if (status) {
      whereConditions.push(`pod.status = ?`)
      params.push(status)
    }

    if (warehouseId) {
      whereConditions.push(`pod.warehouse_id = ?`)
      params.push(warehouseId)
    }

    if (whereConditions.length > 0) {
      query_sql += ` WHERE ` + whereConditions.join(' AND ')
    }

    query_sql += ` ORDER BY pod.created_at DESC LIMIT ? OFFSET ?`
    params.push(pageSize, (page - 1) * pageSize)

    const orders = (await query(query_sql, params)) as any[]

    // Build count query with same WHERE conditions (use alias 'pod')
    let countSql = `SELECT COUNT(*) as total FROM purchase_orders_detail pod`
    const countParams: any[] = []

    if (whereConditions.length > 0) {
      countSql += ` WHERE ` + whereConditions.join(' AND ')
      // Add the same params used for whereConditions
      if (status) countParams.push(status)
      if (warehouseId) countParams.push(warehouseId)
    }

    const countResult = (await query(countSql, countParams)) as any[]
    const total = countResult[0]?.total || 0

    return NextResponse.json(
      {
        success: true,
        data: orders,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * POST /api/purchase-orders-detail
 * Tạo phiếu nhập hàng từ nhà cung cấp
 * Body: { supplierId, warehouseId, items: [{ productId, quantity }, ...] }
 */
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

    // Get current user info
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        role: true,
        warehouse_id: true,
        email: true,
        full_name: true,
        is_active: true,
        created_at: true,
        updated_at: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // For GENERAL_MANAGER, load warehouse assignments
    let warehouseIds: string[] = []
    if (user.role === 'GENERAL_MANAGER') {
      const assignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: user.id },
        select: { warehouse_id: true }
      })
      warehouseIds = assignments.map((a: any) => a.warehouse_id)
    }
    const userWithAssignments: any = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      warehouseId: user.warehouse_id || undefined, // handle null
      warehouseIds: warehouseIds,
      isActive: user.is_active || false,
      createdAt: user.created_at || new Date(),
      updatedAt: user.updated_at || new Date()
    }

    const body = await request.json()
    const { supplierId, warehouseId, items } = body

    // Check if user has permission to create purchase order for this warehouse
    // Admin, GENERAL_MANAGER, and Warehouse Manager with access can create
    if (!canAccessWarehouse(userWithAssignments, warehouseId)) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền tạo phiếu nhập cho kho này" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    console.log(`[PO Create] ===== NEW REQUEST =====`)
    console.log(`[PO Create] User:`, { id: user.id, email: user.email, role: user.role, warehouseId: user.warehouse_id })
    console.log(`[PO Create] Request body:`, { supplierId, warehouseId, itemsCount: items?.length })
    console.log(`[PO Create] Full items detail:`, JSON.stringify(items, null, 2))
    console.log(`[PO Create] Items count: ${items?.length || 0}`)

    if (!supplierId || !warehouseId || !items || !Array.isArray(items) || items.length === 0) {
      console.log(`[PO Create] ERROR: Missing required fields`)
      return NextResponse.json(
        { success: false, error: "Supplier ID, Warehouse ID, và Items là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !Number(item.quantity) || Number(item.quantity) <= 0) {
        return NextResponse.json(
          { success: false, error: `Sản phẩm ${item.productId || ''} có số lượng không hợp lệ (phải lớn hơn 0)` } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    const poId = randomUUID()
    const poNumber = `PO-${new Date().getFullYear()}-${Date.now()}`
    const now = getVietnamTime()

    console.log(`[PO Create] Generated PO ID: ${poId}, PO Number: ${poNumber}`)

    let totalAmount = 0

    // OPTIMIZED BATCH PROCESSING - Much faster for large purchase orders
    const startTime = Date.now()

    try {
      await runTransaction(async (tx) => {
        console.log(`[PO Create] Transaction started with batch processing`)

        // Create purchase order with RECEIVED status (auto-receive)
        await tx.query(
          `INSERT INTO purchase_orders_detail (id, po_number, warehouse_id, supplier_id, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?::purchase_order_status, ?, ?::timestamp, ?::timestamp)`,
          [poId, poNumber, warehouseId, supplierId, "RECEIVED", user.id, now, now]
        )

        // Filter valid items
        const validItems = items.filter((it: any) => Number(it.quantity) > 0)

        if (validItems.length === 0) {
          console.log(`[PO Create] No valid items to process`)
          return
        }

        const productIds = validItems.map((it: any) => it.productId)

        // STEP 1: Pre-fetch all products base units (1 query)
        const products = (await tx.query(
          `SELECT id, unit_id FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
          productIds
        )) as Array<{ id: string; unit_id: string | null }>

        const productMap = new Map(products.map(p => [p.id, p.unit_id]))

        // STEP 2: Pre-fetch product-specific package units (1 query)
        const packageUnits = (await tx.query(
          `SELECT product_id, package_unit_id, base_quantity 
           FROM product_package_units 
           WHERE product_id IN (${productIds.map(() => '?').join(',')})`,
          productIds
        )) as Array<{ product_id: string; package_unit_id: string; base_quantity: number }>

        const packageMap = new Map<string, Map<string, number>>()
        for (const pkg of packageUnits) {
          if (!packageMap.has(pkg.product_id)) {
            packageMap.set(pkg.product_id, new Map())
          }
          packageMap.get(pkg.product_id)!.set(pkg.package_unit_id, Number(pkg.base_quantity))
        }

        // STEP 3: Pre-fetch all unit relations (1 query)
        const unitRelations = (await tx.query(
          `SELECT from_unit_id, to_unit_id, multiplier FROM unit_relations`
        )) as Array<{ from_unit_id: string; to_unit_id: string; multiplier: number }>

        const relationGraph = new Map<string, Array<{ to: string; multiplier: number }>>()
        for (const rel of unitRelations) {
          if (!relationGraph.has(rel.from_unit_id)) {
            relationGraph.set(rel.from_unit_id, [])
          }
          relationGraph.get(rel.from_unit_id)!.push({
            to: rel.to_unit_id,
            multiplier: Number(rel.multiplier)
          })
        }

        // STEP 4: Pre-fetch supplier prices (1 query)
        const supplierPrices = (await tx.query(
          `SELECT product_id, unit_price 
           FROM supplier_products 
           WHERE supplier_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})`,
          [supplierId, ...productIds]
        )) as Array<{ product_id: string; unit_price: number }>

        const priceMap = new Map(supplierPrices.map(sp => [sp.product_id, Number(sp.unit_price)]))

        // Helper: Calculate multiplier
        const calculateMultiplier = (productId: string, fromUnitId: string, toUnitId: string): number => {
          if (fromUnitId === toUnitId) return 1

          // Priority 1: Product-specific packages
          const productPackages = packageMap.get(productId)
          if (productPackages && productPackages.has(fromUnitId)) {
            return productPackages.get(fromUnitId)!
          }

          // Priority 2: Direct relation
          const directRelations = relationGraph.get(fromUnitId)
          if (directRelations) {
            const direct = directRelations.find(r => r.to === toUnitId)
            if (direct) return direct.multiplier
          }

          // Priority 3: Reverse relation
          const reverseRelations = relationGraph.get(toUnitId)
          if (reverseRelations) {
            const reverse = reverseRelations.find(r => r.to === fromUnitId)
            if (reverse && reverse.multiplier !== 0) {
              return 1 / reverse.multiplier
            }
          }

          // Priority 4: BFS
          const bfs = (start: string, target: string): number | null => {
            if (start === target) return 1
            const queue: Array<{ node: string; mul: number }> = [{ node: start, mul: 1 }]
            const seen = new Set<string>([start])

            while (queue.length > 0) {
              const cur = queue.shift()!
              const edges = relationGraph.get(cur.node) || []

              for (const edge of edges) {
                if (seen.has(edge.to)) continue
                const nextMul = cur.mul * edge.multiplier
                if (edge.to === target) return nextMul
                seen.add(edge.to)
                queue.push({ node: edge.to, mul: nextMul })
              }
            }
            return null
          }

          const bfsResult = bfs(fromUnitId, toUnitId)
          if (bfsResult !== null) return bfsResult

          console.warn(`[PO Optimized] No conversion found from ${fromUnitId} to ${toUnitId}`)
          return 1
        }

        // STEP 5: Process all items in memory
        const orderItems: any[] = []
        const stockTransactions: any[] = []

        for (const item of validItems) {
          let { productId, quantity, unitId } = item
          const qty = Number(quantity)
          const productBaseUnit = productMap.get(productId)

          // If no unitId, use product base unit
          if (!unitId && productBaseUnit) {
            unitId = productBaseUnit
          }

          // Calculate multiplier
          let multiplier = 1
          let stockQuantityToAdd = qty

          if (unitId && productBaseUnit && unitId !== productBaseUnit) {
            multiplier = calculateMultiplier(productId, unitId, productBaseUnit)
            stockQuantityToAdd = qty * multiplier
          }

          // Get price
          const unitPrice = priceMap.get(productId) || 0
          // Price matches the INPUT unit (e.g. Price per Case), so simply Qty * Price
          const lineTotal = qty * unitPrice
          totalAmount += lineTotal

          // Prepare order item
          const itemId = randomUUID()
          orderItems.push({
            id: itemId,
            purchase_order_id: poId,
            product_id: productId,
            quantity: qty,
            unit_id: unitId || null,
            unit_price: unitPrice,
            line_total: lineTotal,
            received_quantity: stockQuantityToAdd, // Storage quantity (Base Unit)
            created_at: now
          })

          // Prepare stock transaction for warehouse_stock_realtime
          stockTransactions.push({
            warehouseId,
            productId,
            baseQuantity: stockQuantityToAdd,
            baseUnitId: productBaseUnit
          })
        }

        // STEP 6: Bulk INSERT order items (1-2 queries)
        const batchSize = 500
        for (let i = 0; i < orderItems.length; i += batchSize) {
          const batch = orderItems.slice(i, i + batchSize)
          const insertValues = batch.map(item =>
            `('${item.id}', '${item.purchase_order_id}', '${item.product_id}', ${item.quantity}, ${item.unit_id ? `'${item.unit_id}'::uuid` : 'NULL'}, ${item.unit_price}, ${item.line_total}, ${item.received_quantity}, '${item.created_at}'::timestamp)`
          ).join(',')

          await tx.query(
            `INSERT INTO purchase_orders_detail_items 
             (id, purchase_order_id, product_id, quantity, unit_id, unit_price, line_total, received_quantity, created_at)
             VALUES ${insertValues}`
          )
        }

        // STEP 7: Update Stock (warehouse_stock_realtime)
        console.log(`[PO Create] Updating stock for ${stockTransactions.length} items`)
        for (const txItem of stockTransactions) {
          await tx.query(`
                INSERT INTO warehouse_stock_realtime (
                    warehouse_id, product_id, unit_id, 
                    quantity, qty_imported, qty_produced, qty_sold, 
                    qty_transferred_in, qty_transferred_out, qty_adjusted, version, last_updated
                )
                VALUES (
                    $1::uuid, 
                    $2::uuid, 
                    $3::uuid,
                    $4, -- quantity (increase)
                    $4, -- qty_imported (increase)
                    0, 0, 0, 0, 0, 1, NOW()
                )
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET
                    quantity = warehouse_stock_realtime.quantity + $4,
                    qty_imported = warehouse_stock_realtime.qty_imported + $4,
                    version = warehouse_stock_realtime.version + 1,
                    last_updated = NOW()
            `, [
            txItem.warehouseId,
            txItem.productId,
            txItem.baseUnitId,
            txItem.baseQuantity
          ])
        }


        // Update total amount
        await tx.query(
          `UPDATE purchase_orders_detail SET total_amount = ? WHERE id = ?`,
          [totalAmount, poId]
        )

        console.log(`[PO Create] Transaction completed. Items: ${orderItems.length}, Total: ${totalAmount}`)
      }, { timeout: 60000 })

      console.log(`[PO Create] Fetching created order details`)
    } catch (txError: any) {
      console.log(`[PO Create] ERROR in transaction:`, txError)
      throw txError
    }

    const duration = Date.now() - startTime

    const newOrder = (await query(
      `SELECT pod.*, s.name as supplier_name, w.name as warehouse_name
       FROM purchase_orders_detail pod
       LEFT JOIN suppliers s ON pod.supplier_id = s.id
       LEFT JOIN warehouses w ON pod.warehouse_id = w.id
       WHERE pod.id = ?`,
      [poId]
    )) as any[]

    const items_data = (await query(
      `SELECT podi.id, podi.product_id, podi.quantity, podi.unit_id, podi.unit_price, podi.line_total,
              p.name as product_name, p.code as product_code,
              u.name as unit_name, u.code as unit_code
       FROM purchase_orders_detail_items podi
       LEFT JOIN products p ON podi.product_id = p.id
       LEFT JOIN product_units u ON podi.unit_id = u.id
       WHERE podi.purchase_order_id = ?`,
      [poId]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        message: "Phiếu nhập hàng đã được tạo",
        data: {
          ...newOrder[0],
          items: items_data,
          performance: {
            total_items: items.length,
            duration_ms: duration,
            throughput: items.length > 0 ? `${Math.round(items.length / (duration / 1000))} items/sec` : 'N/A'
          }
        },
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
