import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query } from "@/lib/prisma"

/**
 * GET /api/products/all-for-promotion
 * Lấy tất cả sản phẩm (từ kho + sản phẩm chế biến) để dùng cho promotion
 */
/**
 * @swagger
 * /api/products/all-for-promotion:
 *   get:
 *     summary: Get All Products for Promotion
 *     description: Returns both stock products and recipe products for promotion use.
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of products
 */
export async function GET(request: NextRequest) {
  try {
    // Lấy sản phẩm từ kho (products table)
    const productsFromStock = (await query(
      `SELECT 
        p.id,
        p.code as sku,
        p.name,
        'STOCK' as source,
        pu.name as unit_name
       FROM products p
       LEFT JOIN product_units pu ON p.unit_id = pu.id
       ORDER BY p.name ASC`
    )) as any[]

    // Lấy sản phẩm chế biến (product_recipes table)
    const productsFromRecipes = (await query(
      `SELECT 
        pr.id,
        pr.code as sku,
        pr.name,
        'RECIPE' as source,
        pu.name as unit_name
       FROM product_recipes pr
       LEFT JOIN product_units pu ON pr.output_unit_id = pu.id
       WHERE pr.is_active = true AND pr.code IS NOT NULL
       ORDER BY pr.name ASC`
    )) as any[]

    // Gộp 2 danh sách
    const allProducts = [
      ...productsFromStock.map(p => ({
        id: p.id,
        sku: p.sku,
        name: `${p.name} (Kho - ${p.unit_name || 'N/A'})`,
        source: p.source,
        unit_name: p.unit_name,
      })),
      ...productsFromRecipes.map(p => ({
        id: p.id,
        sku: p.sku,
        name: `${p.name} (Chế biến)`, // No unit for recipes
        source: p.source,
        unit_name: null, // Recipes don't use unit from picker
      }))
    ]

    return NextResponse.json({
      success: true,
      products: allProducts,
      total: allProducts.length,
    } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || String(error)
      } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
