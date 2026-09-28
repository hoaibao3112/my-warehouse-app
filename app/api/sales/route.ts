import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * @swagger
 * /api/sales:
 *   get:
 *     summary: List Sales Invoices
 *     tags: [Sales]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices
 *   post:
 *     summary: Create Simple Sale
 *     tags: [Sales]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseId, productId, quantity]
 *             properties:
 *               warehouseId:
 *                 type: string
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Sale created
 *       400:
 *         description: Invalid input
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "10")
    const warehouseId = searchParams.get("warehouseId")

    // Verify user is authenticated
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Build where clause
    const where: any = {}
    if (warehouseId) {
      where.warehouse_id = warehouseId
    }

    // Get total count
    const total = await prisma.sales_invoices.count({ where })

    // Fetch sales invoices
    const invoices = await prisma.sales_invoices.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: {
          include: {
            product_recipes: {
              select: {
                id: true,
                name: true,
                price: true,
                product_units: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    // Transform invoices to match frontend format
    const data = invoices.map((invoice: any) => ({
      id: invoice.id,
      createdAt: invoice.created_at?.toISOString(),
      items: invoice.items.map((item: any) => ({
        id: item.id,
        product: {
          id: item.product_recipes.id,
          code: item.product_recipes.id.slice(0, 8),
          name: item.product_recipes.name,
          unit: item.product_recipes.product_units || { code: '', name: '', id: '' },
        },
        quantity: item.quantity,
        price: item.unit_price ? parseFloat(item.unit_price.toString()) : null,
        createdAt: item.created_at?.toISOString(),
      })),
      totalPrice: invoice.total_amount ? parseFloat(invoice.total_amount.toString()) : 0,
      createdBy: "User",
    }))

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching sales:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * POST /api/sales - Create Simple Sale
 * 
 * NEW ARCHITECTURE:
 * - Requires unitId for all sales
 * - For recipe products: Uses deductionService
 * - For simple products: Uses inventoryService with unit conversion
 */
export async function POST(req: NextRequest) {
  try {
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await req.json()
    const { warehouseId, productId, quantity, unitId, notes } = body

    // Validate required fields
    if (!warehouseId || !productId || !quantity || !unitId) {
      return NextResponse.json(
        { success: false, error: "warehouseId, productId, quantity, and unitId are required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { success: false, error: "Quantity must be greater than 0" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Get product to check if it's a recipe
    const product = await prisma.products.findUnique({
      where: { id: productId },
      include: {
        product_recipes: {
          include: {
            recipe_ingredients: true
          }
        },
        product_units: true
      }
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // If this product has a recipe, use deductionService
    if (product.product_recipes && product.product_recipes.length > 0) {
      console.warn(`⚠️ Product ${productId} has recipe. Using deductionService.`)

      const { deductionService } = await import('@/lib/services')
      const recipe = product.product_recipes[0]

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

      // Create sales invoice
      const invoice = await prisma.sales_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          warehouse_id: warehouseId,
          total_amount: recipe.price ? parseFloat(recipe.price.toString()) * quantity : 0,
          notes: notes || null,
          created_by: payload.id
        }
      })

      // Deduct ingredients via service
      await deductionService.createRecipeDeduction({
        warehouseId: warehouseId,
        invoiceId: invoice.id,
        recipeId: recipe.id,
        quantitySold: quantity,
        deductionDate: new Date(),
        notes: notes,
        createdBy: payload.id
      })

      return NextResponse.json({
        success: true,
        message: "Recipe-based sale created with ingredient deduction",
        data: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          recipe_used: recipe.name,
          ingredients_deducted: recipe.recipe_ingredients.length
        }
      } as ApiResponse<any>, { status: 201 })
    }

    // Simple product sale (no recipe)
    const { unitConversionService, inventoryService, StockOperation } = await import('@/lib/services')

    // Validate unit
    const isValidUnit = await unitConversionService.validateUnitForProduct(productId, unitId)
    if (!isValidUnit) {
      return NextResponse.json(
        { success: false, error: `Invalid unit for product ${product.code}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Convert to base unit
    const conversion = await unitConversionService.convertToBaseUnit(productId, quantity, unitId)

    // Check stock from realtime
    const currentStock = await inventoryService.getRealtimeStock(warehouseId, productId)
    const availableQuantity = currentStock?.quantity || 0

    if (availableQuantity < conversion.baseQuantity) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient stock",
          details: {
            requested: conversion.baseQuantity,
            available: availableQuantity,
            unit: conversion.baseUnitCode
          }
        } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Deduct stock using service
    await inventoryService.updateStock({
      warehouseId: warehouseId,
      productId: productId,
      quantityChange: -conversion.baseQuantity,
      operation: StockOperation.SALE
    })

    return NextResponse.json({
      success: true,
      message: "Sale created successfully with unit conversion",
      data: {
        productName: product.name,
        productCode: product.code,
        quantitySold: quantity,
        unit: unitId,
        baseQuantityDeducted: conversion.baseQuantity,
        baseUnit: product.product_units?.code || conversion.baseUnitCode
      }
    } as ApiResponse<any>, { status: 201 })
  } catch (error: any) {
    console.error("Error creating sale:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
