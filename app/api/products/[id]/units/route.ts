import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import { Prisma } from '@/lib/generated/prisma'

export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    // Expect path like /api/products/:id/units -> find the segment after 'products'
    let id: string | undefined = undefined
    const prodIndex = segments.findIndex((s) => s === 'products')
    if (prodIndex >= 0 && segments.length > prodIndex + 1) id = segments[prodIndex + 1]
    // fallback: use second-to-last segment if pattern matches
    if (!id && segments.length >= 2) id = segments[segments.length - 2]
    if (!id) return NextResponse.json({ success: false, error: 'Missing product id in path' } as ApiResponse<null>, { status: 400 })

    // base unit for product and get product-specific packages
    const product = await prisma.products.findUnique({
      where: { id },
      select: {
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

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' } as ApiResponse<null>, { status: 404 })
    }

    let baseUnitId = product.unit_id

    // load units with ISOLATION logic
    const where: Prisma.product_unitsWhereInput = {}

    if (user && user.warehouseId) {
      const warehouse = await prisma.warehouses.findUnique({
        where: { id: user.warehouseId },
        select: { type: true }
      })

      if (warehouse?.type === 'PARTNER') {
        // Partner: Own ONLY
        where.warehouse_id = user.warehouseId
      } else if (warehouse?.type === 'STORE') {
        // Store: Own + Global + Main
        const mainWarehouse = await prisma.warehouses.findFirst({
          where: { type: 'MAIN', is_active: true },
          select: { id: true }
        })
        const visibleIds = [user.warehouseId]
        if (mainWarehouse?.id && mainWarehouse.id !== user.warehouseId) visibleIds.push(mainWarehouse.id)

        where.OR = [
          { warehouse_id: { in: visibleIds } },
          { warehouse_id: null }
        ]
      } else {
        // Main/Manager: Own + Global
        where.OR = [
          { warehouse_id: user.warehouseId },
          { warehouse_id: null }
        ]
      }
    }

    const unitRows = await prisma.product_units.findMany({
      where,
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' }
    })

    // load all relations (global) and build adjacency map for BFS multiplier calculation
    const relRows = await prisma.unit_relations.findMany({
      select: {
        from_unit_id: true,
        to_unit_id: true,
        multiplier: true
      }
    })

    console.log('[API /products/[id]/units] Total unit relations in database:', relRows.length)
    if (relRows.length > 0) {
      console.log('[API /products/[id]/units] Sample unit relations:', relRows.slice(0, 3).map(r => ({
        from: r.from_unit_id,
        to: r.to_unit_id,
        multiplier: Number(r.multiplier)
      })))
    }

    const adj: Record<string, Array<{ to: string; m: number }>> = {}
    for (const r of relRows) {
      adj[r.from_unit_id] = adj[r.from_unit_id] || []
      adj[r.from_unit_id].push({ to: r.to_unit_id, m: Number(r.multiplier) })
    }

    console.log('[API /products/[id]/units] Built adjacency map with', Object.keys(adj).length, 'source units')

    // helper: find multiplier to convert from unit 'start' to 'target' using BFS (multiplicative)
    const findMultiplier = (start: string, target: string): number | null => {
      if (start === target) return 1
      const q: Array<{ node: string; mul: number }> = [{ node: start, mul: 1 }]
      const seen = new Set<string>([start])
      while (q.length) {
        const cur = q.shift()!
        const edges = adj[cur.node] || []
        for (const e of edges) {
          if (seen.has(e.to)) continue
          const nextMul = cur.mul * e.m
          if (e.to === target) return nextMul
          seen.add(e.to)
          q.push({ node: e.to, mul: nextMul })
        }
      }
      return null
    }

    // If product has no unit_id set, find the best default base unit
    // Choose the unit that can convert to/from the most other units
    if (!baseUnitId && unitRows.length > 0) {
      console.log('[API /products/[id]/units] Product has no unit_id, analyzing conversions for:', unitRows.map(u => ({ id: u.id, code: u.code })))

      // Count how many other units each unit can convert to/from
      const unitsWithConversions = unitRows.map(u => {
        let convertibleCount = 0
        for (const other of unitRows) {
          if (u.id === other.id) continue
          // Check if there's a path FROM other TO u or FROM u TO other
          const m = findMultiplier(other.id, u.id)
          const mr = m !== null ? null : findMultiplier(u.id, other.id)
          if (m !== null || mr !== null) {
            convertibleCount++
          }
        }
        return { unit: u, convertibleCount }
      })

      console.log('[API /products/[id]/units] Units with conversion counts:', unitsWithConversions.map(u => ({ code: u.unit.code, convertibleCount: u.convertibleCount })))

      // Pick the unit with most conversions
      const best = unitsWithConversions.reduce((a, b) =>
        b.convertibleCount > a.convertibleCount ? b : a
      )

      // If no unit has conversions, just pick the first one
      const selectedUnit = best.convertibleCount > 0 ? best : { unit: unitRows[0], convertibleCount: 0 }
      console.log('[API /products/[id]/units] Selected best base unit:', { code: selectedUnit.unit.code, id: selectedUnit.unit.id, convertibleCount: selectedUnit.convertibleCount })
      baseUnitId = selectedUnit.unit.id
    }

    // Build units list and explicitly mark which unit is the product's default
    const units = [] as any[]
    const hasAnyRelations = relRows.length > 0

    console.log('[API /products/[id]/units] Base unit ID:', baseUnitId)

    // Priority 1: Add product-specific package units (NEW SYSTEM)
    const productPackages = product.product_package_units || []
    for (const pkg of productPackages) {
      const isDefault = pkg.is_default
      units.push({
        id: pkg.product_units.id,
        code: pkg.product_units.code,
        name: pkg.product_units.name,
        multiplier: Number(pkg.base_quantity),
        isBase: false,
        isDefault: isDefault,
        isPackage: true,
        packageId: pkg.id,
        packageName: pkg.package_name,
        isSellable: pkg.is_sellable,
        isPurchasable: pkg.is_purchasable,
        isTransferable: pkg.is_transferable,
        source: 'product'
      })
    }

    console.log(`[API /products/[id]/units] Found ${productPackages.length} product-specific packages`)

    // Priority 2: ALWAYS add base unit (CRITICAL - must always be available)
    const baseUnitObj = unitRows.find(u => u.id === baseUnitId)
    if (baseUnitObj) {
      // Check if base unit is already in product packages
      const alreadyInPackages = productPackages.some(pkg => pkg.package_unit_id === baseUnitId)
      if (!alreadyInPackages) {
        units.push({
          id: baseUnitObj.id,
          code: baseUnitObj.code,
          name: baseUnitObj.name,
          multiplier: 1,
          isBase: true,
          isDefault: true,
          source: 'base'
        })
        console.log(`[API /products/[id]/units] Added base unit: ${baseUnitObj.code}`)
      }
    }

    // Priority 3: Add other convertible units from global unit_relations
    for (const u of unitRows) {
      // Skip base unit (already added)
      if (u.id === baseUnitId) {
        continue
      }

      // Skip units that are already in product packages
      if (productPackages.some(pkg => pkg.package_unit_id === u.id)) {
        console.log(`[API /products/[id]/units] Skipping unit ${u.code} - already in product packages`)
        continue
      }

      // Only try to find multipliers if there are relations defined
      if (hasAnyRelations) {
        // Check for DIRECT conversions only (single hop in the adjacency graph)
        // This prevents transitive relations like GR->Gói->ML from appearing as direct conversions

        // Check if there's a direct edge FROM unit TO base unit
        const directForward = (adj[u.id] || []).find(e => e.to === baseUnitId)
        if (directForward) {
          console.log(`[API /products/[id]/units] ${u.code} -> ${unitRows.find(r => r.id === baseUnitId)?.code} (direct): multiplier = ${directForward.m}`)
          units.push({ id: u.id, code: u.code, name: u.name, multiplier: directForward.m, isBase: false, isDefault: false, source: 'global' })
          continue
        }

        // Check if there's a direct edge FROM base unit TO unit (then invert)
        const directReverse = (adj[baseUnitId] || []).find(e => e.to === u.id)
        if (directReverse) {
          const inverted = 1 / directReverse.m
          console.log(`[API /products/[id]/units] ${u.code} <- ${unitRows.find(r => r.id === baseUnitId)?.code} (direct reverse): multiplier = ${directReverse.m}, inverted = ${inverted}`)
          units.push({ id: u.id, code: u.code, name: u.name, multiplier: inverted, isBase: false, isDefault: false, source: 'global' })
          continue
        }

        // No direct conversion path found - mark as non-convertible
        console.log(`[API /products/[id]/units] ${u.code}: NO DIRECT PATH to base unit`)
        units.push({ id: u.id, code: u.code, name: u.name, multiplier: null, isBase: false, isDefault: false, source: 'global' })
      } else {
        // No relations defined in system - still mark as non-convertible
        // Don't set multiplier to 1, as that would include units without conversion paths
        units.push({ id: u.id, code: u.code, name: u.name, multiplier: null, isBase: false, isDefault: false, source: 'global' })
      }
    }

    // Ensure the default unit is presented first to simplify frontend default selection
    units.sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1))

    console.log('API /products/[id]/units:', { id, baseUnitId, unitsCount: units.length, defaultUnitId: baseUnitId })
    console.log('API /products/[id]/units - Final units list:', units.map(u => ({ code: u.code, multiplier: u.multiplier, isDefault: u.isDefault })))

    return NextResponse.json({ success: true, data: { units, defaultUnitId: baseUnitId } } as ApiResponse<any>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}
