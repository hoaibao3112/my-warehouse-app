import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken, canAccessWarehouse } from '@/lib/auth'

async function getUser(request: NextRequest) {
  let token = getAuthToken(request)

  if (!token) {
    return null
  }

  try {
    let user = verifyToken(token)

    // Refresh permissions from DB to ensure they're current (token may be stale)
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
          user = { ...user, permissions: dbPermissions as any }
        }
      } catch (err) {
        console.error('[/api/product-recipes/[id]] Failed to refresh permissions from DB:', err)
      }
    }

    return user as any
  } catch (err) {
    console.error('[GET /api/product-recipes/[id]] Token verification failed:', err)
    return null
  }
}

// GET /api/product-recipes/[id] - Chi tiết công thức
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const recipe = await prisma.product_recipes.findUnique({
      where: { id },
      include: {
        product_units: true,
        categories: {
          select: { id: true, name: true }
        },
        recipe_ingredients: {
          include: {
            products: true,
            product_units: true
          }
        },
        warehouses: {
          select: { id: true, code: true, name: true }
        },
        users: {
          select: { id: true, full_name: true, email: true }
        },
        production_records: {
          orderBy: { created_at: 'desc' },
          take: 10
        }
      }
    })

    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    // Check access - admins, warehouse managers, GENERAL_MANAGER, MANAGER (with permission), and staff with permission can view
    const userWarehouseId = (user as any).warehouse_id || (user as any).warehouseId
    const isAdmin = user.role === 'AdminKhoTong' || user.role === 'ADMIN'
    const isWarehouseOwner = ((user.role === 'QuanLyKhoCon' || user.role === 'WAREHOUSE_MANAGER') &&
      recipe.warehouse_id === userWarehouseId) ||
      (user.role === 'GENERAL_MANAGER' && canAccessWarehouse(user, recipe.warehouse_id))

    // Check if MANAGER has recipe_management permission
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

    const isStaffWithPermission = user.role === 'STAFF' &&
      Array.isArray(user.permissions) &&
      user.permissions.includes('inventory_check')

    if (!isAdmin && !isWarehouseOwner && !isManagerWithPermission && !isStaffWithPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(recipe)
  } catch (error) {
    console.error('Error fetching recipe:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recipe' },
      { status: 500 }
    )
  }
}

// PATCH /api/product-recipes/[id] - Cập nhật công thức
export async function PATCH(
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

    // Check recipe exists and access
    const recipe = await prisma.product_recipes.findUnique({ where: { id } })
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    // Check access - Admins or Warehouse Owners
    const userWarehouseId = (user as any).warehouse_id || (user as any).warehouseId
    const isAdmin = user.role === 'AdminKhoTong' || user.role === 'ADMIN'
    const isWarehouseOwner = ((user.role === 'QuanLyKhoCon' || user.role === 'WAREHOUSE_MANAGER') &&
      recipe.warehouse_id === userWarehouseId) ||
      (user.role === 'GENERAL_MANAGER' && canAccessWarehouse(user, recipe.warehouse_id))

    if (!isAdmin && !isWarehouseOwner) {
      return NextResponse.json({ error: 'Chỉ Admin hoặc Quản lý kho mới có quyền cập nhật công thức này' }, { status: 403 })
    }

    const {
      code, // Recipe code/SKU
      name,
      description,
      output_quantity,
      output_unit_id,
      category_id,
      price,
      image_url,
      is_active,
      ingredients // If provided, update ingredients
    } = body

    // Validate code if being updated - cannot be empty
    if (code !== undefined && (!code || code.trim() === '')) {
      return NextResponse.json(
        { error: 'Mã công thức không được để trống (Recipe code cannot be empty)' },
        { status: 400 }
      )
    }

    // Validate price if being updated
    if (price !== undefined && (!price || parseFloat(price) <= 0)) {
      return NextResponse.json(
        { error: 'Giá tiền phải lớn hơn 0 (Price must be greater than 0)' },
        { status: 400 }
      )
    }

    // Validate category if being updated
    if (category_id !== undefined && !category_id) {
      return NextResponse.json(
        { error: 'Nhóm hàng là bắt buộc (Category is required)' },
        { status: 400 }
      )
    }

    // Update recipe
    const updated = await prisma.product_recipes.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: code.trim() }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(output_quantity && { output_quantity }),
        ...(output_unit_id && { output_unit_id }),
        ...(category_id !== undefined && { category_id: category_id || null }),
        ...(price !== undefined && { price: price ? parseFloat(price) : null }),
        ...(image_url !== undefined && { image_url: image_url || null }),
        ...(is_active !== undefined && { is_active })
      },
      include: {
        product_units: true,
        categories: {
          select: { id: true, name: true }
        },
        recipe_ingredients: {
          include: {
            products: true,
            product_units: true
          }
        }
      }
    })

    // If ingredients provided (even if empty array), update them
    if (Array.isArray(ingredients)) {
      // Always delete old ingredients first
      await prisma.recipe_ingredients.deleteMany({ where: { recipe_id: id } })

      // Only create new ingredients if array is not empty
      if (ingredients.length > 0) {
        await prisma.recipe_ingredients.createMany({
          data: ingredients.map((ing: any) => ({
            recipe_id: id,
            ingredient_id: ing.ingredient_id,
            unit_id: ing.unit_id,
            quantity_required: parseFloat(ing.quantity_required)
          }))
        })
      }

      // Refetch with updated ingredients
      const refetched = await prisma.product_recipes.findUnique({
        where: { id },
        include: {
          product_units: true,
          categories: {
            select: { id: true, name: true }
          },
          recipe_ingredients: {
            include: {
              products: true,
              product_units: true
            }
          }
        }
      })
      return NextResponse.json(refetched)
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating recipe:', error)
    return NextResponse.json(
      { error: 'Failed to update recipe' },
      { status: 500 }
    )
  }
}

// DELETE /api/product-recipes/[id] - Xóa công thức
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check recipe exists
    const recipe = await prisma.product_recipes.findUnique({ where: { id } })
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    // Check access - Admins or Warehouse Owners
    const userWarehouseId = (user as any).warehouse_id || (user as any).warehouseId
    const isAdmin = user.role === 'AdminKhoTong' || user.role === 'ADMIN'
    const isWarehouseOwner = ((user.role === 'QuanLyKhoCon' || user.role === 'WAREHOUSE_MANAGER') &&
      recipe.warehouse_id === userWarehouseId) ||
      (user.role === 'GENERAL_MANAGER' && canAccessWarehouse(user, recipe.warehouse_id))

    if (!isAdmin && !isWarehouseOwner) {
      return NextResponse.json({ error: 'Chỉ Admin hoặc Quản lý kho mới có quyền xóa công thức này' }, { status: 403 })
    }

    // Delete recipe (ingredients will cascade delete)
    await prisma.product_recipes.delete({ where: { id } })

    return NextResponse.json({ message: 'Recipe deleted successfully' })
  } catch (error) {
    console.error('Error deleting recipe:', error)
    return NextResponse.json(
      { error: 'Failed to delete recipe' },
      { status: 500 }
    )
  }
}
