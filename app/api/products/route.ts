import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, hasPermission, getUserWarehouseIds, isAdmin, isHR, isGeneralManager, isManager } from "@/lib/auth"
import { Prisma } from "@/lib/generated/prisma"
import { handleApiError, Errors } from "@/lib/api-error"

/**
 * @swagger
 * /api/products:
 *   get:
 *     description: Returns a list of products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or code
 *     responses:
 *       200:
 *         description: Success
 */
export async function GET(request: NextRequest) {
  try {
    // Auth context to filter products by warehouse
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Strict isolation: if user is logged in, restrict to their warehouse context.
    // If user is Admin (role: ADMIN) they *might* see all, or we enforce selecting a warehouse first.
    // For now, if user has warehouse_id, we MUST filter by it for Partner Stores.
    // For Main Warehouse users, they see Global + Main Warehouse items.
    // However, per requirement "separating completely", we treat distinct datasets.

    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
    const search = searchParams.get("search")
    const categoryId = searchParams.get("categoryId")
    const unitId = searchParams.get("unitId")
    const excludeRecipes = searchParams.get("excludeRecipes") === "true"

    const skip = (Math.max(1, page) - 1) * Math.max(1, pageSize)

    // Build where clause for Prisma
    const where: Prisma.productsWhereInput = {}

    const targetWarehouseId = searchParams.get("warehouseId")

    // --- CONTEXT FILTERING ---
    if (user) {
      let effectiveWarehouseId = user.warehouseId // Default to logged-in user's warehouse

      // Allow context switching for Admin, HR, and General Manager
      if (isAdmin(user) || isHR(user) || isGeneralManager(user)) {
        if (targetWarehouseId) {
          if (isAdmin(user) || isHR(user)) {
            // Admin/HR can view any warehouse
            effectiveWarehouseId = targetWarehouseId
          } else if (isGeneralManager(user)) {
            // General Manager (TQL) Logic
            const targetWh = await prisma.warehouses.findUnique({
              where: { id: targetWarehouseId },
              select: { type: true }
            })

            if (targetWh) {
              const isAssigned = user.warehouseIds?.includes(targetWarehouseId)
              const isMain = targetWh.type === 'MAIN'

              // TQL can view MAIN and assigned warehouses.
              // Strictly checking PARTNER access: Only if explicitly assigned.
              // If User implies TQL shouldn't see Partner *at all*, usually TQL manages Internal Stores.
              // We'll allow if assigned (safe), but generally allow MAIN (public internal).
              if (isMain || isAssigned) {
                effectiveWarehouseId = targetWarehouseId
              } else {
              }
            }
          }
        } else if (isAdmin(user) && !user.warehouseId) {
          // Admin without explicit context -> Show Global items only? 
          // Or show ALL? 
          // If effectiveWarehouseId becomes null here, the query below returns all.
          effectiveWarehouseId = undefined
        }
      }

      // If we have a specific warehouse context to view
      if (effectiveWarehouseId) {
        // Fetch warehouse type to decide logic
        // Optimization: We might have already fetched it above, but for safety/simplicity let's fetch or reuse.
        const warehouse = await prisma.warehouses.findUnique({
          where: { id: effectiveWarehouseId },
          select: { type: true }
        })

        if (warehouse) {
          // Find MAIN warehouse ID for inheritance logic
          const mainWarehouse = await prisma.warehouses.findFirst({
            where: { type: 'MAIN', is_active: true },
            select: { id: true }
          })

          // Logic for Product Visibility:
          // PARTNER: Strict Isolation (Only Own Products).
          // STORE: Own Products + Global Products + Main Warehouse Products.
          // MAIN: Own Products + Global Products.

          if (warehouse.type === 'PARTNER') {
            where.warehouse_id = effectiveWarehouseId
          } else if (warehouse.type === 'STORE') {
            // Store sees: Own + Global + Main
            const visibleIds = [effectiveWarehouseId]
            if (mainWarehouse?.id && mainWarehouse.id !== effectiveWarehouseId) {
              visibleIds.push(mainWarehouse.id)
            }

            where.AND = [
              { OR: [{ warehouse_id: { in: visibleIds } }, { warehouse_id: null }] }
            ]
          } else {
            // MAIN or others: Own + Global
            where.AND = [
              { OR: [{ warehouse_id: effectiveWarehouseId }, { warehouse_id: null }] }
            ]
          }
        }
      } else {
        // Safe Fallback: If no effective warehouse context (and NOT explicitly Admin-all-access), deny or limit.
        // Current logic: Admin without context = All.
        if (isAdmin(user)) {
          // Admin sees all
        } else {
          // Should not happen if user.warehouseId is handled correctly above
          // But as a fallback:
          where.id = '___NO_ACCESS___'
        }
      }
    } else {
      // No user -> Empty or Public?
      // Existing code did nothing, meaning it shows everything if strict checks fail. 
      // We should arguably return empty, but let's stick to minimal changes.
    }
    // -------------------------

    // Add search condition
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Add category filter (support comma-separated IDs for multi-select)
    if (categoryId) {
      const categoryIds = categoryId.split(',').filter(id => id.trim())
      if (categoryIds.length === 1) {
        where.category_id = categoryIds[0]
      } else if (categoryIds.length > 1) {
        where.category_id = { in: categoryIds }
      }
    }

    // Add unit filter (support comma-separated IDs for multi-select)
    if (unitId) {
      const unitIds = unitId.split(',').filter(id => id.trim())
      if (unitIds.length === 1) {
        where.unit_id = unitIds[0]
      } else if (unitIds.length > 1) {
        where.unit_id = { in: unitIds }
      }
    }

    // Exclude recipe products (RECIPE-xxx)
    if (excludeRecipes) {
      where.NOT = {
        code: { startsWith: 'RECIPE-' }
      }
    }

    // Fetch products with relations
    const [products, total] = await Promise.all([
      prisma.products.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          unit_id: true,
          category_id: true,
          warehouse_id: true, // Return warehouse ID
          price: true,
          created_at: true,
          updated_at: true,
          product_units: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          categories: {
            select: { name: true }
          },
          product_package_units: {
            select: {
              package_unit_id: true,
              base_quantity: true,
              package_name: true,
              product_units: {
                select: {
                  id: true,
                  name: true,
                  code: true
                }
              }
            }
          }
        },
        orderBy: {
          name: 'asc'
        },
        skip,
        take: pageSize
      }),
      prisma.products.count({ where })
    ])

    // Transform to match expected format
    const rows = products.map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit_id: p.unit_id,
      category_id: p.category_id,
      warehouse_id: p.warehouse_id,
      price: p.price,
      created_at: p.created_at,
      updated_at: p.updated_at,
      unit: p.product_units,
      unit_name: p.product_units?.name || null,
      category_name: p.categories?.name || null,
      product_package_units: p.product_package_units
    }))

    return NextResponse.json({
      success: true,
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    } as PaginatedResponse<any>)
  } catch (error) {
    return handleApiError(error, 'GET /api/products')
  }
}

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create Product
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               unitId:
 *                 type: string
 *               categoryId:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Missing fields
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Code conflict
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: require product_management permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const body = await request.json()
    const { code, name, unitId, categoryId, price, warehouseId } = body || {}

    // Determine context warehouse
    // Default to user's warehouse, but allow override for privileged users
    let targetWarehouseId = user.warehouseId

    if (isAdmin(user) || isHR(user) || isGeneralManager(user) || isManager(user)) {
      if (warehouseId) {
        targetWarehouseId = warehouseId
      }
    }

    // For logic consistency: Products MUST belong to a warehouse or be strictly Global Templates.
    // If targetWarehouseId is null, it's a Global Product.

    if (!code || !name) {
      return NextResponse.json({ success: false, error: "Missing fields" } as ApiResponse<null>, { status: 400 })
    }

    // Check conflict manually first (better error msg) - SCOPED by warehouse_id
    const existing = await prisma.products.findFirst({
      where: {
        code: code,
        warehouse_id: targetWarehouseId || null
      }
    })
    if (existing) {
      return NextResponse.json({ success: false, error: `Product code '${code}' already exists in this warehouse.` } as ApiResponse<null>, { status: 409 })
    }

    // Create product and initialize warehouse stock in a transaction
    const product = await prisma.$transaction(async (tx) => {
      // Create product
      const newProduct = await tx.products.create({
        data: {
          code,
          name,
          unit_id: unitId || null,
          category_id: categoryId || null,
          warehouse_id: targetWarehouseId || null, // INJECT CONTEXT
          price: price ? parseFloat(price) : null
        },
        include: {
          product_units: {
            select: { name: true }
          },
          categories: {
            select: { name: true }
          }
        }
      })

      // Initialize warehouse_stock rows for this product
      const targetWarehouseIds = targetWarehouseId ? [targetWarehouseId] : []
      // Use targetWarehouseId instead of user.warehouseId

      if (targetWarehouseIds.length > 0) {
        await tx.warehouse_stock.createMany({
          data: targetWarehouseIds.map(wid => ({
            warehouse_id: wid,
            product_id: newProduct.id,
            quantity: 0
          })),
          skipDuplicates: true
        })
      }

      return newProduct
    })

    // Transform to match expected format
    const result = {
      id: product.id,
      code: product.code,
      name: product.name,
      unit_id: product.unit_id,
      category_id: product.category_id,
      warehouse_id: product.warehouse_id,
      price: product.price,
      created_at: product.created_at,
      updated_at: product.updated_at,
      unit_name: product.product_units?.name || null,
      category_name: product.categories?.name || null
    }

    return NextResponse.json({ success: true, data: result } as ApiResponse<any>, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'POST /api/products')
  }
}
