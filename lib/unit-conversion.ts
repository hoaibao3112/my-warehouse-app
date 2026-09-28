/**
 * Unit Conversion Utilities
 *
 * This module provides conversion functions that support both:
 * 1. Product-specific package units (new system)
 * 2. Global unit relations (backward compatible)
 *
 * Priority:
 * 1. Try product-specific package conversion
 * 2. Fall back to global unit relations (BFS)
 */

import { prisma, query } from './prisma'

/**
 * Find conversion multiplier for a product and unit
 *
 * @param productId - The product ID
 * @param fromUnitId - The unit to convert from
 * @param toUnitId - The unit to convert to (usually product's base unit)
 * @returns Multiplier to convert fromUnit to toUnit, or null if no conversion exists
 *
 * Example:
 * - Product: Coca-Cola (base unit: ML)
 * - Call: findProductMultiplier('coca-id', 'CHAI-id', 'ML-id')
 * - Returns: 330 (because 1 CHAI = 330 ML for Coca-Cola)
 */
export async function findProductMultiplier(
  productId: string,
  fromUnitId: string,
  toUnitId: string
): Promise<number | null> {
  // If converting to same unit, multiplier is 1
  if (fromUnitId === toUnitId) {
    return 1
  }

  try {
    // Get product's base unit
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { unit_id: true }
    })

    if (!product) {
      return null
    }

    const baseUnitId = product.unit_id

    // Priority 1: Try product-specific package
    // Check if fromUnit is a package unit for this product
    const productPackage = await prisma.product_package_units.findFirst({
      where: {
        product_id: productId,
        package_unit_id: fromUnitId
      },
      select: { base_quantity: true }
    })

    // If fromUnit is a product package and toUnit is base unit
    if (productPackage && toUnitId === baseUnitId) {
      return Number(productPackage.base_quantity)
    }

    // If both units are product packages, calculate ratio
    if (productPackage && toUnitId !== baseUnitId) {
      const toPackage = await prisma.product_package_units.findFirst({
        where: {
          product_id: productId,
          package_unit_id: toUnitId
        },
        select: { base_quantity: true }
      })

      if (toPackage) {
        const ratio = Number(productPackage.base_quantity) / Number(toPackage.base_quantity)
        return ratio
      }
    }

    // Priority 2: Fall back to global unit relations (backward compatible)
    return await findGlobalMultiplier(fromUnitId, toUnitId)
  } catch (error) {
    console.error('Error in findProductMultiplier:', error)
    return null
  }
}

/**
 * Find conversion multiplier using global unit relations (BFS)
 * This is the original system - used as fallback
 *
 * @param fromUnitId - The unit to convert from
 * @param toUnitId - The unit to convert to
 * @returns Multiplier or null if no conversion path exists
 */
export async function findGlobalMultiplier(
  fromUnitId: string,
  toUnitId: string
): Promise<number | null> {
  if (fromUnitId === toUnitId) {
    return 1
  }

  try {
    // Get all unit relations
    const relations = await prisma.unit_relations.findMany({
      select: {
        from_unit_id: true,
        to_unit_id: true,
        multiplier: true
      }
    })

    // Build adjacency list
    const adj: Record<string, Array<{ to: string; m: Decimal }>> = {}
    for (const rel of relations) {
      if (!adj[rel.from_unit_id]) {
        adj[rel.from_unit_id] = []
      }
      adj[rel.from_unit_id].push({
        to: rel.to_unit_id,
        m: rel.multiplier
      })
    }

    // BFS to find conversion path
    const queue: Array<{ node: string; mul: number }> = [{ node: fromUnitId, mul: 1 }]
    const visited = new Set<string>([fromUnitId])

    while (queue.length > 0) {
      const current = queue.shift()!
      const edges = adj[current.node] || []

      for (const edge of edges) {
        if (visited.has(edge.to)) {
          continue
        }

        const nextMul = current.mul * Number(edge.m)

        // Found the target!
        if (edge.to === toUnitId) {
          return nextMul
        }

        visited.add(edge.to)
        queue.push({ node: edge.to, mul: nextMul })
      }
    }

    // No conversion path found
    return null
  } catch (error) {
    console.error('Error in findGlobalMultiplier:', error)
    return null
  }
}

/**
 * Convert quantity from one unit to another for a specific product
 *
 * @param productId - The product ID
 * @param quantity - The quantity to convert
 * @param fromUnitId - The unit to convert from
 * @param toUnitId - The unit to convert to
 * @returns Converted quantity, or null if conversion is not possible
 *
 * Example:
 * - Convert 10 CHAI of Coca-Cola to ML
 * - convertProductQuantity('coca-id', 10, 'CHAI-id', 'ML-id')
 * - Returns: 3300 (10 * 330)
 */
export async function convertProductQuantity(
  productId: string,
  quantity: number,
  fromUnitId: string,
  toUnitId: string
): Promise<number | null> {
  const multiplier = await findProductMultiplier(productId, fromUnitId, toUnitId)
  if (multiplier === null) {
    return null
  }
  return quantity * multiplier
}

/**
 * Get all available packages for a product
 * Combines product-specific packages with global units
 *
 * @param productId - The product ID
 * @returns List of available units/packages for this product
 */
export async function getProductAvailableUnits(productId: string) {
  try {
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: {
        unit_id: true,
        product_package_units: {
          select: {
            id: true,
            package_unit_id: true,
            package_name: true,
            base_quantity: true,
            is_default: true,
            is_sellable: true,
            is_purchasable: true,
            is_transferable: true,
            product_units: {
              select: {
                id: true,
                code: true,
                name: true
              }
            }
          },
          orderBy: { is_default: 'desc' }
        }
      }
    })

    if (!product) {
      return []
    }

    // Get base unit
    const baseUnit = await prisma.product_units.findUnique({
      where: { id: product.unit_id },
      select: { id: true, code: true, name: true }
    })

    const units = []

    // Add base unit
    if (baseUnit) {
      units.push({
        id: baseUnit.id,
        code: baseUnit.code,
        name: baseUnit.name,
        multiplier: 1,
        source: 'base',
        isSellable: true,
        isPurchasable: true,
        isTransferable: true,
        isDefault: false,
        packageName: `${baseUnit.name} (Base Unit)`
      })
    }

    // Add product-specific packages
    for (const pkg of product.product_package_units) {
      units.push({
        id: pkg.product_units.id,
        code: pkg.product_units.code,
        name: pkg.product_units.name,
        multiplier: Number(pkg.base_quantity),
        source: 'product',
        isSellable: pkg.is_sellable,
        isPurchasable: pkg.is_purchasable,
        isTransferable: pkg.is_transferable,
        isDefault: pkg.is_default,
        packageName: pkg.package_name,
        packageId: pkg.id
      })
    }

    return units
  } catch (error) {
    console.error('Error in getProductAvailableUnits:', error)
    return []
  }
}

/**
 * Type for unit info returned from conversion functions
 */
export type UnitInfo = {
  id: string
  code: string
  name: string
  multiplier: number | null
  source: 'base' | 'product' | 'global'
  isSellable?: boolean
  isPurchasable?: boolean
  isTransferable?: boolean
  isDefault?: boolean
  packageName?: string
  packageId?: string
}

/**
 * Type for Decimal from Prisma (used in database)
 */
import type { Decimal } from '@prisma/client/runtime/library'
