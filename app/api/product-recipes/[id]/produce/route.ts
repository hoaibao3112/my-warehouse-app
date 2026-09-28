import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken, canAccessWarehouse } from '@/lib/auth'

/**
 * Production API - NEW ARCHITECTURE
 * 
 * Uses productionService with unit conversion
 * 
 * FIXES:
 * - Reads from warehouse_stock_realtime instead of warehouse_stock
 * - Uses service layer for atomic operations
 * - Proper ingredient deduction in base units
 */

async function getUser(request: NextRequest) {
  let token = getAuthToken(request)

  if (!token) {
    return null
  }

  try {
    let user = verifyToken(token)

    if (user?.id) {
      try {
        const dbUser = await prisma.users.findUnique({
          where: { id: user.id },
          select: { permissions: true }
        })
        if (dbUser?.permissions) {
          let dbPermissions = dbUser.permissions
          if (typeof dbPermissions === 'string') {
            dbPermissions = JSON.parse(dbPermissions)
          }
          user = { ...user, permissions: dbPermissions }
        }
      } catch (err) {
        console.error('[/api/product-recipes/[id]/produce] Failed to refresh permissions:', err)
      }
    }

    return user as any
  } catch (err) {
    console.error('[POST /api/product-recipes/[id]/produce] Token verification failed:', err)
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { quantity_to_produce, productionDate, notes } = body

    if (!quantity_to_produce || quantity_to_produce <= 0) {
      return NextResponse.json(
        { error: 'Invalid quantity' },
        { status: 400 }
      )
    }

    // Get recipe
    const recipe = await prisma.product_recipes.findUnique({
      where: { id },
      include: {
        recipe_ingredients: true,
        products: true,
        warehouses: true
      }
    })

    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    // Check access - only ADMIN, WAREHOUSE_MANAGER, GENERAL_MANAGER, and MANAGER (with permission) can produce
    const userWarehouseId = (user as any).warehouse_id || (user as any).warehouseId
    const isAdmin = user.role === 'AdminKhoTong' || user.role === 'ADMIN'
    const isWarehouseOwner = ((user.role === 'QuanLyKhoCon' || user.role === 'WAREHOUSE_MANAGER') &&
      recipe.warehouse_id === userWarehouseId) ||
      (user.role === 'GENERAL_MANAGER' && canAccessWarehouse(user, recipe.warehouse_id))

    // MANAGER can produce if they have recipe_management permission
    let isManagerWithPermission = false
    if (user.role === 'MANAGER' && recipe.warehouse_id === userWarehouseId) {
      let perms = user.permissions
      if (perms) {
        if (typeof perms === 'string') {
          try {
            perms = JSON.parse(perms)
          } catch {
            perms = []
          }
        }
        isManagerWithPermission = Array.isArray(perms) && perms.includes('recipe_management')
      }
    }

    if (!isAdmin && !isWarehouseOwner && !isManagerWithPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if recipe is active
    if (!recipe.is_active) {
      return NextResponse.json(
        { error: 'Recipe is not active' },
        { status: 400 }
      )
    }

    // Use NEW production service
    const { productionService, inventoryService } = await import('@/lib/services')

    // Check stock for all ingredients using NEW architecture
    const insufficientStock: any[] = []

    for (const ingredient of recipe.recipe_ingredients) {
      const quantityNeeded = ingredient.quantity_required * quantity_to_produce

      // Get current stock from warehouse_stock_realtime
      const stock = await inventoryService.getRealtimeStock(
        recipe.warehouse_id,
        ingredient.ingredient_id
      )

      const currentStock = stock?.quantity || 0

      if (currentStock < quantityNeeded) {
        const product = await prisma.products.findUnique({
          where: { id: ingredient.ingredient_id },
          select: { name: true, code: true }
        })

        insufficientStock.push({
          ingredient_id: ingredient.ingredient_id,
          ingredient_name: product?.name,
          ingredient_code: product?.code,
          needed: quantityNeeded,
          available: currentStock
        })
      }
    }

    const hasWarnings = insufficientStock.length > 0

    // Generate production number
    const productionNumber = `PRD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`

    // Create production using service
    const productionId = await productionService.createProduction({
      productionNumber: productionNumber,
      warehouseId: recipe.warehouse_id,
      recipeId: id,
      quantityProduced: quantity_to_produce,
      productionDate: productionDate ? new Date(productionDate) : new Date(),
      notes: notes,
      createdBy: user.id
    })

    // Create production record for legacy compatibility
    await prisma.production_records.create({
      data: {
        recipe_id: id,
        warehouse_id: recipe.warehouse_id,
        quantity_produced: quantity_to_produce,
        produced_by: user.id
      }
    })

    const production = await productionService.getProductionById(productionId)

    return NextResponse.json({
      success: true,
      message: 'Production completed successfully with BASE UNIT conversion',
      data: {
        productionId,
        productionNumber: production?.production_number,
        recipeName: production?.recipe?.name,
        quantityProduced: production?.quantity_produced,
        ingredientsDeducted: production?.ingredients?.map(ing => ({
          name: ing.ingredient?.name,
          code: ing.ingredient?.code,
          quantityUsed: ing.quantity_used,
          unit: ing.ingredient?.product_units?.code
        })),
        warnings: hasWarnings ? insufficientStock : null
      }
    })
  } catch (error: any) {
    console.error('Error producing recipe:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to produce recipe' },
      { status: 500 }
    )
  }
}
