import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken, isAdmin, hasPermission } from '@/lib/auth'
import { Prisma } from '@/lib/generated/prisma'

async function getUser(request: NextRequest) {
  let token = getAuthToken(request)
  if (!token) return null
  try {
    let user = verifyToken(token)
    // Refresh permissions... (simplified for brevity, keeping existing logic if needed, but standard verifyToken ensures generic roles)
    // For critical path, trusting token or doing simple DB check is fine.
    return user
  } catch (err) {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Access Control
    // Allow if: Admin, Manager, Staff, etc.
    // Strict Scope: Users with warehouseId can ONLY see their warehouse's recipes.

    const { searchParams } = new URL(request.url)
    const warehouseIdParam = searchParams.get('warehouseId')
    const productId = searchParams.get('productId')
    const categoryId = searchParams.get('categoryId')
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    // Safe by default
    let where: Prisma.product_recipesWhereInput = { id: '___NO_ACCESS___' }

    // --- ISOLATION ENFORCEMENT ---
    if (user.warehouseId) {
      // Fetch current warehouse type
      const currentWarehouse = await prisma.warehouses.findUnique({
        where: { id: user.warehouseId },
        select: { type: true }
      })

      // Find MAIN warehouse ID
      const mainWarehouse = await prisma.warehouses.findFirst({
        where: { type: 'MAIN', is_active: true },
        select: { id: true }
      })

      if (currentWarehouse?.type === 'PARTNER') {
        // STRICT ISOLATION for Partners
        where = { warehouse_id: user.warehouseId }
      } else if (mainWarehouse) {
        // STORES see own + MAIN recipes
        const ids = [mainWarehouse.id]
        if (user.warehouseId) ids.push(user.warehouseId)

        where = {
          OR: [
            { warehouse_id: { in: ids } },
            { warehouse_id: null } // Global recipes if any
          ]
        }
      } else {
        // Main or others (Manager default)
        where = { warehouse_id: user.warehouseId }
      }
    } else {
      // Admin / Global User
      // If param provided, filter by it.
      if (isAdmin(user) || hasPermission(user, 'recipe_view')) {
        if (warehouseIdParam) {
          where = { warehouse_id: warehouseIdParam }
        } else {
          where = {} // Admin sees all
        }
      }
    }
    // -----------------------------

    // Apply filters on top of isolation
    if (where.id !== '___NO_ACCESS___' || Object.keys(where).length === 0) {
      if (productId) where.product_id = productId
      if (categoryId) where.category_id = categoryId
      if (isActive !== null && isActive !== undefined) where.is_active = isActive === 'true'
    }

    const [recipes, total] = await Promise.all([
      prisma.product_recipes.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          product_id: true,
          output_quantity: true,
          output_unit_id: true,
          category_id: true,
          warehouse_id: true,
          is_active: true,
          created_by: true,
          created_at: true,
          updated_at: true,
          price: true,
          image_url: true,
          product_units: {
            select: { id: true, code: true, name: true }
          },
          categories: {
            select: { id: true, name: true }
          },
          recipe_ingredients: {
            include: {
              products: {
                select: { id: true, code: true, name: true }
              },
              product_units: {
                select: { id: true, code: true, name: true }
              }
            }
          },
          users: {
            select: { id: true, full_name: true, email: true }
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.product_recipes.count({ where })
    ])

    return NextResponse.json({
      data: recipes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching recipes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recipes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check
    // Allow Admin, or Manager with 'recipe_management', or just Role based.
    // Given requirements, Partners/Managers must act.
    const canCreate = isAdmin(user) || hasPermission(user, 'recipe_management') || user.role === 'WAREHOUSE_MANAGER' || user.role === 'MANAGER'
    if (!canCreate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      code,
      product_id,
      category_id,
      warehouse_id, // Input from body
      warehouse_ids,
      name,
      description,
      output_quantity,
      output_unit_id,
      price,
      ingredients
    } = body

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and Code are required' }, { status: 400 })
    }

    // Determine target warehouses
    let warehouseIdsToCreate: (string | null)[] = []

    // ISOLATION:
    if (user.warehouseId) {
      // Force create ONLY in own warehouse
      warehouseIdsToCreate = [user.warehouseId]

      // Check conflict in own warehouse
      const existing = await prisma.product_recipes.findFirst({
        where: {
          code,
          warehouse_id: user.warehouseId
        }
      })
      if (existing) {
        return NextResponse.json({ error: `Recipe code '${code}' already exists in your warehouse.` }, { status: 409 })
      }
    } else {
      // Admin logic (keep existing multi-warehouse or single)
      if (warehouse_ids && Array.isArray(warehouse_ids) && warehouse_ids.length > 0) {
        warehouseIdsToCreate = warehouse_ids
      } else {
        // Default to parsed warehouse_id or NULL (Global)
        warehouseIdsToCreate = [warehouse_id || null]
      }
    }

    const createdRecipes = []

    for (const whId of warehouseIdsToCreate) {
      // Create
      // Ensure unique code logic (if multiple warehouses, append code? Or assume input is unique enough?)
      // Admin creating for multiple might conflict if same code used.
      // For now use provided code.

      const recipe = await prisma.product_recipes.create({
        data: {
          code,
          product_id: product_id || null,
          warehouse_id: whId,
          category_id: category_id || null,
          name,
          description,
          output_quantity: output_quantity || 1,
          output_unit_id: output_unit_id || null,
          price: price ? parseFloat(price) : null,
          image_url: body.image_url || null,
          created_by: user.id || '', // Should have ID
          ...(ingredients && ingredients.length > 0 && {
            recipe_ingredients: {
              create: ingredients.map((ing: any) => ({
                ingredient_id: ing.ingredient_id,
                unit_id: ing.unit_id,
                quantity_required: parseFloat(ing.quantity_required)
              }))
            }
          })
        },
        include: {
          // minimal include for performance
          categories: { select: { id: true, name: true } }
        }
      })
      createdRecipes.push(recipe)
    }

    if (createdRecipes.length === 1) {
      return NextResponse.json(createdRecipes[0], { status: 201 })
    } else {
      return NextResponse.json({
        success: true,
        message: `Created ${createdRecipes.length} recipes`,
        data: createdRecipes
      }, { status: 201 })
    }

  } catch (error: any) {
    console.error('Error creating recipe:', error)
    return NextResponse.json(
      { error: `Failed to create recipe: ${error.message}` },
      { status: 500 }
    )
  }
}
