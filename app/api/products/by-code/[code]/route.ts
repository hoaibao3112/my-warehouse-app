import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/products/by-code/[code]
 * Fetch a product by its barcode/product code
 * Used by barcode scanner to quickly look up products
 */
/**
 * @swagger
 * /api/products/by-code/{code}:
 *   get:
 *     summary: Get Product By Code
 *     description: Fetch a product by its barcode/product code (case-insensitive).
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Product code is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Find product by code (exact match, case-insensitive)
    const product = await prisma.products.findFirst({
      where: {
        code: {
          equals: code,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        code: true,
        name: true,
        unit_id: true,
        category_id: true,
        price: true,
        created_at: true,
        updated_at: true,
        product_units: {
          select: { name: true }
        },
        categories: {
          select: { name: true }
        }
      }
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Transform to match expected format
    const result = {
      id: product.id,
      code: product.code,
      name: product.name,
      unit_id: product.unit_id,
      category_id: product.category_id,
      price: product.price,
      created_at: product.created_at,
      updated_at: product.updated_at,
      unit_name: product.product_units?.name || null,
      category_name: product.categories?.name || null
    }

    return NextResponse.json({ success: true, data: result } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching product by code:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
