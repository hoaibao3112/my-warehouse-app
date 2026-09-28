import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasPermission } from '@/lib/auth'
import { getAuthToken } from '@/lib/auth-server'
import { Prisma } from '@/lib/generated/prisma'

export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get('productId')
    const enriched = searchParams.get('enriched') === 'true'

    // Safe by default
    let where: Prisma.product_unitsWhereInput = { id: '___NO_ACCESS___' }

    // STRICT ISOLATION Logic based on Warehouse Type
    if (user && user.warehouseId) {
      // Fetch warehouse details to determine visibility
      const warehouse = await prisma.warehouses.findUnique({
        where: { id: user.warehouseId },
        select: { type: true }
      })

      if (warehouse) {
        if (warehouse.type === 'PARTNER') {
          // Partner sees: Own ONLY
          where = { warehouse_id: user.warehouseId }
        } else if (warehouse.type === 'STORE') {
          // Store sees: Own + Global + Main
          // Find MAIN warehouse
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
        } else if (warehouse.type === 'MAIN') {
          // Main seeing Global + Own
          where = {
            OR: [
              { warehouse_id: user.warehouseId },
              { warehouse_id: null }
            ]
          }
        } else {
          // Unknown type -> Strict
          where = { warehouse_id: user.warehouseId }
        }
      }
    } else if (user?.role === 'ADMIN' || user?.role === 'AdminKhoTong') {
      where = {} // Admin sees all
    }
    // If Admin/No ID, they might see all, or we could filter by query param later.

    // If productId provided, get units available for that product
    if (productId) {
      // Add timeout protection and better error handling
      const queryTimeout = 5000 // 5 second timeout

      let product
      try {
        // Get product's base unit (ALWAYS INCLUDED) with timeout
        product = await Promise.race([
          prisma.products.findUnique({
            where: { id: productId },
            include: {
              product_units: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true
                }
              }
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database query timeout')), queryTimeout)
          )
        ])
      } catch (dbError: any) {
        console.error(`[product-units] Database error for product ${productId}:`, dbError)
        return NextResponse.json({
          success: false,
          error: `Database connection error: ${dbError?.message || 'Unknown error'}`
        } as ApiResponse<null>, { status: 503 })
      }

      if (!product) {
        return NextResponse.json({ success: false, error: 'Product not found' } as ApiResponse<null>, { status: 404 })
      }

      const baseUnit = product.product_units
      const availableUnits: any[] = []

      // 1. ALWAYS include base unit first
      if (baseUnit) {
        availableUnits.push({
          id: baseUnit.id,
          code: baseUnit.code,
          name: baseUnit.name,
          description: baseUnit.description,
          isBaseUnit: true,
          multiplier: 1
        })
      }

      // 2. Add product-specific package units
      try {
        const packageUnits = await Promise.race([
          prisma.product_package_units.findMany({
            where: { product_id: productId },
            include: {
              product_units: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true
                }
              }
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Package units query timeout')), queryTimeout)
          )
        ])

        for (const pkg of packageUnits as any[]) {
          // Don't duplicate base unit
          if (pkg.product_units.id !== baseUnit?.id) {
            availableUnits.push({
              id: pkg.product_units.id,
              code: pkg.product_units.code,
              name: pkg.product_units.name,
              description: pkg.product_units.description,
              isBaseUnit: false,
              multiplier: Number(pkg.base_quantity),
              isProductSpecific: true
            })
          }
        }
      } catch (err: any) {
        // product_package_units table might not exist yet, skip gracefully
        if (!err?.message?.includes('does not exist') && !err?.message?.includes('timeout')) {
          console.error(`[product-units] Error fetching package units for ${productId}:`, err)
        }
        // Continue with just base unit if package units fail
      }

      return NextResponse.json({ success: true, data: availableUnits } as ApiResponse<any>)
    }

    // Otherwise, return all units (legacy behavior -> now scoped)
    const units = await prisma.product_units.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        warehouse_id: true // Include context
      }
    })

    // If enriched=true, add product and conversion counts
    if (enriched) {
      const enrichedUnits = await Promise.all(
        units.map(async (unit) => {
          // Count products using this unit as base unit
          const productCount = await prisma.products.count({
            where: { unit_id: unit.id }
          })

          // Count product packages using this unit (handle missing table gracefully)
          let packageCount = 0
          try {
            packageCount = await prisma.product_package_units.count({
              where: { package_unit_id: unit.id }
            })
          } catch (err: any) {
            // Table might not exist yet, safely ignore
            if (!err?.message?.includes('does not exist')) throw err
            packageCount = 0
          }

          // Count conversions involving this unit (as source or target)
          const conversionCount = await prisma.unit_relations.count({
            where: {
              OR: [
                { from_unit_id: unit.id },
                { to_unit_id: unit.id }
              ]
            }
          })

          return {
            ...unit,
            productCount,
            packageCount,
            conversionCount
          }
        })
      )

      return NextResponse.json({ success: true, data: enrichedUnits } as ApiResponse<any>)
    }

    return NextResponse.json({ success: true, data: units } as ApiResponse<any>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user - require unit_management permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, 'unit_management')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Unit management access required' } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { code, name, description } = body || {}
    if (!code || !name) {
      return NextResponse.json({ success: false, error: 'Missing fields' } as ApiResponse<null>, { status: 400 })
    }

    // Check if unit already exists, return it if so - SCOPED by warehouse_id
    // Note: With unique constraint (warehouse_id, code), we must findFirst with that scope.
    const existing = await prisma.product_units.findFirst({
      where: {
        code,
        warehouse_id: user.warehouseId || null
      }
    })

    if (existing) {
      return NextResponse.json({ success: true, data: existing } as ApiResponse<any>)
    }

    // Create new unit with context
    const unit = await prisma.product_units.create({
      data: {
        code,
        name,
        description: description || null,
        warehouse_id: user.warehouseId || null // Inject context
      }
    })

    return NextResponse.json({ success: true, data: unit } as ApiResponse<any>, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}

