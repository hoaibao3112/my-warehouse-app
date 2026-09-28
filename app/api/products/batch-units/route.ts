import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ApiResponse } from '@/lib/types'

/**
 * Batch API to fetch units for multiple products in a single request
 * This optimizes performance when loading many products at once (e.g., editing intake forms)
 *
 * POST /api/products/batch-units
 * Body: { productIds: string[] }
 * Returns: { success: true, data: { [productId: string]: { units: Unit[], defaultUnitId?: string } } }
 */
/**
 * @swagger
 * /api/products/batch-units:
 *   post:
 *     summary: Get Batch Product Units
 *     description: Fetch units for multiple products in a single request.
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productIds]
 *             properties:
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Map of products to units
 *       400:
 *         description: Invalid input
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productIds } = body

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'productIds array is required' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Limit to prevent abuse
    if (productIds.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Maximum 200 products per request' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Fetch all products with their package units
    const products = await prisma.products.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        unit_id: true,
        product_package_units: {
          include: {
            product_units: {
              select: { id: true, code: true, name: true }
            }
          },
          orderBy: { is_default: 'desc' }
        }
      }
    })

    // Collect all unique base unit IDs from products
    const baseUnitIds = new Set<string>()
    products.forEach(p => {
      if (p.unit_id) baseUnitIds.add(p.unit_id)
    })

    // Only load base units that are actually used by these products
    const baseUnits = await prisma.product_units.findMany({
      where: { id: { in: Array.from(baseUnitIds) } },
      select: { id: true, code: true, name: true }
    })
    const baseUnitsMap = new Map(baseUnits.map(u => [u.id, u]))

    // Only load unit relations relevant to these base units (direct conversions)
    const relRows = await prisma.unit_relations.findMany({
      where: {
        OR: [
          { from_unit_id: { in: Array.from(baseUnitIds) } },
          { to_unit_id: { in: Array.from(baseUnitIds) } }
        ]
      },
      select: {
        from_unit_id: true,
        to_unit_id: true,
        multiplier: true,
        product_units_unit_relations_from_unit_idToproduct_units: {
          select: { id: true, code: true, name: true }
        },
        product_units_unit_relations_to_unit_idToproduct_units: {
          select: { id: true, code: true, name: true }
        }
      }
    })

    // Build adjacency map for direct conversions only
    const directConversions: Record<string, Array<{ unitId: string; unit: any; multiplier: number; direction: 'forward' | 'reverse' }>> = {}

    for (const rel of relRows) {
      const fromId = rel.from_unit_id
      const toId = rel.to_unit_id
      const multiplier = Number(rel.multiplier)
      const fromUnit = rel.product_units_unit_relations_from_unit_idToproduct_units
      const toUnit = rel.product_units_unit_relations_to_unit_idToproduct_units

      // Store forward direction (from -> to)
      if (!directConversions[toId]) directConversions[toId] = []
      directConversions[toId].push({
        unitId: fromId,
        unit: fromUnit,
        multiplier: multiplier,
        direction: 'forward'
      })

      // Store reverse direction (to -> from)
      if (!directConversions[fromId]) directConversions[fromId] = []
      directConversions[fromId].push({
        unitId: toId,
        unit: toUnit,
        multiplier: 1 / multiplier,
        direction: 'reverse'
      })
    }

    // Build result map: productId -> { units: [], defaultUnitId?: string }
    const result: Record<string, { units: any[], defaultUnitId?: string }> = {}

    for (const product of products) {
      const units = [] as any[]
      const baseUnitId = product.unit_id
      const productPackages = product.product_package_units || []
      const seenUnitIds = new Set<string>()

      // 1. Add product-specific packages
      for (const pkg of productPackages) {
        seenUnitIds.add(pkg.product_units.id)
        units.push({
          id: pkg.product_units.id,
          code: pkg.product_units.code,
          name: pkg.product_units.name,
          multiplier: Number(pkg.base_quantity),
          isBase: false,
          isDefault: pkg.is_default,
          isPackage: true,
          source: 'product'
        })
      }

      // 2. Add base unit if not already in packages
      if (baseUnitId && !seenUnitIds.has(baseUnitId)) {
        const baseUnitObj = baseUnitsMap.get(baseUnitId)
        if (baseUnitObj) {
          seenUnitIds.add(baseUnitId)
          units.push({
            id: baseUnitObj.id,
            code: baseUnitObj.code,
            name: baseUnitObj.name,
            multiplier: 1,
            isBase: true,
            isDefault: true,
            source: 'base'
          })
        }
      }

      // 3. Add ONLY direct conversions to/from base unit (not all units in system)
      if (baseUnitId && directConversions[baseUnitId]) {
        for (const conv of directConversions[baseUnitId]) {
          // Skip if already added (either as package or base)
          if (seenUnitIds.has(conv.unitId)) continue

          seenUnitIds.add(conv.unitId)
          units.push({
            id: conv.unit.id,
            code: conv.unit.code,
            name: conv.unit.name,
            multiplier: conv.multiplier,
            isBase: false,
            isDefault: false,
            source: 'global'
          })
        }
      }

      // Sort by default first
      units.sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1))

      result[product.id] = {
        units,
        defaultUnitId: baseUnitId || undefined
      }
    }

    return NextResponse.json({
      success: true,
      data: result
    } as ApiResponse<typeof result>)
  } catch (error: any) {
    console.error('[batch-units] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
