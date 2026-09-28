import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, runTransaction } from "@/lib/prisma"
import { verifyToken, isAdmin, hasPermission } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get Product Details
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update Product
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               unitId:
 *                 type: string
 *               categoryId:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Product updated
 *   delete:
 *     summary: Delete Product
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rows = (await query(`
      SELECT
        p.id, p.code, p.name, p.unit_id, p.category_id, p.price,
        p.created_at, p.updated_at,
        pu.name as unit_name,
        c.name as category_name
      FROM products p
      LEFT JOIN product_units pu ON p.unit_id = pu.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [id])) as any[]
    if (!rows || rows.length === 0) return NextResponse.json({ success: false, error: "Not found" } as ApiResponse<null>, { status: 404 })
    return NextResponse.json({ success: true, data: rows[0] } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, {
      status: 500,
    })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // auth - require product_management permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const body = await request.json()
    const fields: any[] = []
    const paramsList: any[] = []
    if (body.code !== undefined) { fields.push("code = ?"); paramsList.push(body.code) }
    if (body.name !== undefined) { fields.push("name = ?"); paramsList.push(body.name) }
    if (body.unitId !== undefined) { fields.push("unit_id = ?"); paramsList.push(body.unitId) }
    if (body.categoryId !== undefined) { fields.push("category_id = ?"); paramsList.push(body.categoryId) }
    if (body.price !== undefined) { fields.push("price = ?"); paramsList.push(body.price) }

    if (fields.length === 0) return NextResponse.json({ success: false, error: "No fields to update" } as ApiResponse<null>, { status: 400 })

    await runTransaction(async () => {
      paramsList.push(id)
      const sql = `UPDATE products SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`
      await query(sql, paramsList)

      // Update related records
      if (body.name !== undefined) {
        // Update recipe names if they are linked to this product
        await query(`UPDATE product_recipes SET name = ? WHERE product_id = ?`, [body.name, id])
      }
      if (body.code !== undefined) {
        // Optional: Update recipe codes if linked (or check by code as requested)
        // The user said "update related names OR check by code". 
        // Safest is to try updating code if it's a 1:1 mapping, but codes might need to be distinct.
        // For now, let's update the name as explicitly requested "update related names".
        // If "check by code" implies ensuring the code matches, we might want to update it too.
        await query(`UPDATE product_recipes SET code = ? WHERE product_id = ?`, [body.code, id])
      }
    })

    const rows = (await query(`
      SELECT
        p.id, p.code, p.name, p.unit_id, p.category_id, p.price,
        p.created_at, p.updated_at,
        pu.name as unit_name,
        c.name as category_name
      FROM products p
      LEFT JOIN product_units pu ON p.unit_id = pu.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [id])) as any[]
    return NextResponse.json({ success: true, data: (rows && rows[0]) || null } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, {
      status: 500,
    })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // auth - require product_management permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    // Check stock for info only
    const stockRows = await query(`SELECT COUNT(*) as count FROM warehouse_stock WHERE product_id = ?`, [id])
    const stockCount = stockRows && stockRows[0] ? Number(stockRows[0].count) : 0

    await runTransaction(async () => {
      // Cascade delete all related records
      // User requested to delete EVERYTHING related to the product

      // Delete from Purchase Orders and Transfer Requests
      await query(`DELETE FROM purchase_order_items WHERE product_id = ?`, [id])
      await query(`DELETE FROM internal_transfer_request_items WHERE product_id = ?`, [id])

      if (stockCount > 0) {
        await query(`DELETE FROM warehouse_stock WHERE product_id = ?`, [id])
      }

      // REMOVED: stock_transactions queries as the table does not exist

      await query(`DELETE FROM warehouse_transfer_items WHERE product_id = ?`, [id])

      // Delete items from reports/checks
      await query(`DELETE FROM inventory_check_items WHERE product_id = ?`, [id])
      await query(`DELETE FROM inventory_loss_report_items WHERE product_id = ?`, [id])
      await query(`DELETE FROM supplier_products WHERE product_id = ?`, [id])

      // Delete reports where the product is the main subject
      await query(`DELETE FROM inventory_loss_reports WHERE product_id = ?`, [id])

      // Finally delete the product
      await query(`DELETE FROM products WHERE id = ?`, [id])
    })

    return NextResponse.json({ success: true, data: null } as ApiResponse<null>)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete product"
    return NextResponse.json({ success: false, error: message } as ApiResponse<null>, { status: 500 })
  }
}
