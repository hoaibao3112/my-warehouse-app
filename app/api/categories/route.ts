import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken, hasPermission } from '@/lib/auth'
import { handleApiError } from '@/lib/api-error'
import { Prisma } from '@/lib/generated/prisma'

export async function GET(request: NextRequest) {
  try {
    // Auth context filtering
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Require Authentication
    if (!user) {
      console.log('[API Categories] Unauthorized request')
      return NextResponse.json({ success: false, error: 'Unauthorized' } as ApiResponse<null>, { status: 401 })
    }

    // Default to NO ACCESS (Safe by Default)
    // If no valid logic matches, this ensures we return nothing instead of everything.
    let where: Prisma.categoriesWhereInput = { id: '___NO_ACCESS___' }

    // Strict isolation: if user is logged in, restrict to their warehouse context.
    if (user.warehouseId) {
      // Fetch current warehouse type
      const currentWarehouse = await prisma.warehouses.findUnique({
        where: { id: user.warehouseId },
        select: { type: true, name: true }
      })

      console.log(`[API Categories] User: ${user.id} | Warehouse: ${user.warehouseId} (${currentWarehouse?.name}) | Type: ${currentWarehouse?.type}`)

      if (currentWarehouse) {
        if (currentWarehouse.type === 'PARTNER') {
          // STRICT ISOLATION for Partners (Own Only)
          where = { warehouse_id: user.warehouseId }
          console.log('[API Categories] Applied strict PARTNER isolation')
        }
        else if (currentWarehouse.type === 'STORE') {
          // STORE sees: Own + Main + Global
          const mainWarehouse = await prisma.warehouses.findFirst({
            where: { type: 'MAIN', is_active: true },
            select: { id: true }
          })

          const visibleIds = [user.warehouseId]
          if (mainWarehouse?.id && mainWarehouse.id !== user.warehouseId) {
            visibleIds.push(mainWarehouse.id)
          }

          where = {
            OR: [
              { warehouse_id: { in: visibleIds } },
              { warehouse_id: null }
            ]
          }
        }
        else if (currentWarehouse.type === 'MAIN') {
          // MAIN warehouse sees own + MAIN categories + Global
          const ids = [user.warehouseId]
          where = {
            OR: [
              { warehouse_id: { in: ids } },
              { warehouse_id: null }
            ]
          }
        }
        else {
          // Unknown type -> Default to Strict (Own Only)
          where = { warehouse_id: user.warehouseId }
          console.log('[API Categories] Unknown type, applied default strict isolation')
        }
      } else {
        console.error('[API Categories] Warehouse not found for user, denying access')
        // Fallback: deny
      }
    } else {
      // Admin or User without specific warehouse context.
      // Rule: Show ONLY Global Categories to avoid cluttering Admin with 100s of Franchise categories.
      // If Admin wants to see specific warehouse categories, they should switch context (future feature).
      // For now: Global (System) Categories only.
      where = { warehouse_id: null }

      console.log('[API Categories] No warehouse context (Admin/Manager): Showing GLOBAL categories only.')
    }
    // If no user.warehouseId (Admin), we might return all or filtering logic.
    // For now, let Admin see all, or better: Admin usually sees nothing until they select a warehouse context (future).
    // But backward compat: existing valid categories have NULL warehouse_id? No, we plan to migrate them to Main.
    // So Filter by warehouse_id OR null (if we allow global templates).

    // For Partner Stores: MUST only see their own.

    const categories = await prisma.categories.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            products: true,
            product_recipes: true
          }
        }
      }
    })

    // Map response to include menu_type_id and total count (products + recipes)
    const data = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      menu_type_id: cat.menu_type_id,
      warehouse_id: cat.warehouse_id, // Return context
      created_at: cat.created_at,
      _count: {
        // Total products = regular products + recipe products
        products: (cat._count?.products ?? 0) + (cat._count?.product_recipes ?? 0)
      }
    }))

    return NextResponse.json({ success: true, data } as ApiResponse<any>, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    return handleApiError(error, 'GET /api/categories')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user - require category_management permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, 'category_management')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Category management access required' } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, menu_type_id } = body || {}
    if (!name) {
      return NextResponse.json({ success: false, error: 'Missing name' } as ApiResponse<null>, { status: 400 })
    }

    if (!menu_type_id) {
      return NextResponse.json({ success: false, error: 'Missing menu_type_id' } as ApiResponse<null>, { status: 400 })
    }

    // Verify menu_type_id exists
    const menuType = await prisma.menu_types.findUnique({
      where: { id: menu_type_id }
    })

    if (!menuType) {
      return NextResponse.json({ success: false, error: 'Menu type not found' } as ApiResponse<null>, { status: 404 })
    }

    // Create new category with menu_type_id AND warehouse_id context
    const category = await prisma.categories.create({
      data: {
        name,
        menu_type_id,
        warehouse_id: user.warehouseId || null // Inject context
      }
    })

    return NextResponse.json({ success: true, data: category } as ApiResponse<any>, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'POST /api/categories')
  }
}
