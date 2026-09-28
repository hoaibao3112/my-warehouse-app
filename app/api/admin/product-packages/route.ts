import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin, hasPermission } from "@/lib/auth"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

/**
 * @swagger
 * /api/admin/product-packages:
 *   get:
 *     summary: List Product Packages
 *     description: Get product-specific package units with optional filtering.
 *     tags: [Admin - Product Packages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: Filter by product ID
 *       - in: query
 *         name: packageUnitId
 *         schema:
 *           type: string
 *         description: Filter by package unit ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of packages
 *       403:
 *         description: Forbidden
 *   post:
 *     summary: Create Product Package
 *     description: Create a new product-specific package unit.
 *     tags: [Admin - Product Packages]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - packageUnitId
 *               - baseQuantity
 *               - packageName
 *             properties:
 *               productId:
 *                 type: string
 *               packageUnitId:
 *                 type: string
 *               baseQuantity:
 *                 type: number
 *               packageName:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               isSellable:
 *                 type: boolean
 *               isPurchasable:
 *                 type: boolean
 *               isTransferable:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Package created
 *       400:
 *         description: Invalid input or duplicate
 *       403:
 *         description: Forbidden
 */
export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Product management access required" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get("productId")
    const packageUnitId = searchParams.get("packageUnitId")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "20")

    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize)

    // Build where clause
    const where: any = {}
    if (productId) where.product_id = productId
    if (packageUnitId) where.package_unit_id = packageUnitId

    // Handle missing table gracefully
    let packages: any[] = []
    let total = 0

    try {
      packages = await prisma.product_package_units.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          products: {
            select: {
              id: true,
              name: true,
              code: true,
              unit_id: true,
              product_units: {
                select: { id: true, name: true, code: true }
              }
            }
          },
          product_units: {
            select: { id: true, name: true, code: true }
          }
        },
        orderBy: [
          { products: { code: 'asc' } },
          { is_default: 'desc' },
          { created_at: 'desc' }
        ],
        skip: offset,
        take: pageSize
      })

      total = await prisma.product_package_units.count({
        where: Object.keys(where).length > 0 ? where : undefined
      })
    } catch (err: any) {
      // If table doesn't exist, return empty data
      if (err?.message?.includes('does not exist')) {
        console.log('[Product Packages] Table does not exist yet, returning empty data')
        packages = []
        total = 0
      } else {
        throw err
      }
    }

    const data = packages.map((pkg) => ({
      id: pkg.id,
      productId: pkg.product_id,
      productName: pkg.products.name,
      productCode: pkg.products.code,
      baseUnitId: pkg.products.unit_id,
      baseUnitName: pkg.products.product_units?.name || 'N/A',
      packageUnitId: pkg.package_unit_id,
      packageUnitName: pkg.product_units.name,
      packageUnitCode: pkg.product_units.code,
      baseQuantity: Number(pkg.base_quantity),
      packageName: pkg.package_name,
      isDefault: pkg.is_default,
      isSellable: pkg.is_sellable,
      isPurchasable: pkg.is_purchasable,
      isTransferable: pkg.is_transferable,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at
    }))

    return NextResponse.json(
      {
        success: true,
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[Product Packages] GET error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/product-packages
 * Create a new product-specific package unit
 * Body: { productId, packageUnitId, baseQuantity, packageName, isDefault, isSellable, isPurchasable, isTransferable }
 */
export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Product management access required" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      productId,
      packageUnitId,
      baseQuantity,
      packageName,
      isDefault,
      isSellable,
      isPurchasable,
      isTransferable
    } = body

    // Validate required fields
    if (!productId || !packageUnitId || !baseQuantity || !packageName) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: productId, packageUnitId, baseQuantity, packageName" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const baseQty = Number(baseQuantity)
    if (baseQty <= 0) {
      return NextResponse.json(
        { success: false, error: "baseQuantity must be greater than 0" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Verify product exists
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { id: true, unit_id: true }
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Verify package unit exists
    const packageUnit = await prisma.product_units.findUnique({
      where: { id: packageUnitId },
      select: { id: true }
    })

    if (!packageUnit) {
      return NextResponse.json(
        { success: false, error: "Package unit not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Check for duplicate (handle missing table)
    let existing = null
    try {
      existing = await prisma.product_package_units.findFirst({
        where: {
          product_id: productId,
          package_unit_id: packageUnitId
        }
      })
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        return NextResponse.json(
          { success: false, error: "Table product_package_units does not exist. Please run migration first: psql $env:DATABASE_URL -f scripts/15-product-package-units.sql" } as ApiResponse<null>,
          { status: 500 }
        )
      }
      throw err
    }

    if (existing) {
      return NextResponse.json(
        { success: false, error: "This package unit already exists for this product" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // If marking as default, unset other defaults for this product
    let finalIsDefault = isDefault === true
    if (finalIsDefault) {
      await prisma.product_package_units.updateMany({
        where: { product_id: productId },
        data: { is_default: false }
      })
    }

    // Create the package
    const newPackage = await prisma.product_package_units.create({
      data: {
        id: randomUUID(),
        product_id: productId,
        package_unit_id: packageUnitId,
        base_quantity: baseQty.toString(),
        package_name: packageName.trim(),
        is_default: finalIsDefault,
        is_sellable: isSellable !== false,
        is_purchasable: isPurchasable !== false,
        is_transferable: isTransferable !== false,
        created_at: getVietnamTime(),
        updated_at: getVietnamTime()
      },
      include: {
        products: { select: { id: true, name: true, code: true } },
        product_units: { select: { id: true, name: true, code: true } }
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: "Package created successfully",
        data: {
          id: newPackage.id,
          productId: newPackage.product_id,
          productName: newPackage.products.name,
          packageUnitId: newPackage.package_unit_id,
          packageUnitName: newPackage.product_units.name,
          baseQuantity: Number(newPackage.base_quantity),
          packageName: newPackage.package_name,
          isDefault: newPackage.is_default,
          isSellable: newPackage.is_sellable,
          isPurchasable: newPackage.is_purchasable,
          isTransferable: newPackage.is_transferable
        }
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    console.error("[Product Packages] POST error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
