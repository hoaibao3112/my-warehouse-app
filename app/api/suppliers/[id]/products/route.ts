import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin, isWarehouseManager } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { randomUUID } from "crypto"

/**
 * POST /api/suppliers/[id]/products
 * Thêm sản phẩm vào nhà cung cấp
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Allow Admin and Warehouse Manager
    if (!user || (!isAdmin(user) && !isWarehouseManager(user))) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền thêm sản phẩm" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id: supplierId } = await params
    const body = await request.json()
    const { productId, unitPrice, menuTypeId, categoryId, unitId } = body

    // Validate unitPrice is non-negative number
    if (!productId || unitPrice === undefined || unitPrice === null || Number(unitPrice) < 0) {
      return NextResponse.json(
        { success: false, error: "Product ID và Unit Price là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const supplierProductId = randomUUID()
    const now = getVietnamTime()

    await query(
      `INSERT INTO supplier_products (id, supplier_id, product_id, menu_type_id, category_id, unit_price, unit_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::timestamp, ?::timestamp)`,
      [supplierProductId, supplierId, productId, menuTypeId || null, categoryId || null, Number(unitPrice), unitId || null, now, now]
    )

    const newProduct = (await query(
      `SELECT sp.id, sp.product_id, p.code, p.name, sp.unit_price
       FROM supplier_products sp
       LEFT JOIN products p ON sp.product_id = p.id
       WHERE sp.id = ?`,
      [supplierProductId]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        message: "Sản phẩm đã được thêm vào nhà cung cấp",
        data: newProduct[0],
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * PUT /api/suppliers/[id]/products
 * Cập nhật giá sản phẩm
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || (!isAdmin(user) && !isWarehouseManager(user))) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền cập nhật giá" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { productId, unitPrice, menuTypeId, categoryId, unitId } = body
    const { id: supplierId } = await params

    if (!productId || !unitPrice || Number(unitPrice) < 0) {
      return NextResponse.json(
        { success: false, error: "Product ID và Unit Price là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const now = getVietnamTime()

    await query(
      `UPDATE supplier_products
       SET unit_price = ?, menu_type_id = ?, category_id = ?, unit_id = ?, updated_at = ?::timestamp
       WHERE supplier_id = ? AND product_id = ?`,
      [Number(unitPrice), menuTypeId || null, categoryId || null, unitId || null, now, supplierId, productId]
    )

    return NextResponse.json(
      {
        success: true,
        message: "Giá sản phẩm đã được cập nhật",
      } as ApiResponse<null>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/suppliers/[id]/products
 * Xóa sản phẩm khỏi nhà cung cấp
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || (!isAdmin(user) && !isWarehouseManager(user))) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền xóa sản phẩm" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { productId } = body
    const { id: supplierId } = await params

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "Product ID là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    await query(
      `DELETE FROM supplier_products
       WHERE supplier_id = ? AND product_id = ?`,
      [supplierId, productId]
    )

    return NextResponse.json(
      {
        success: true,
        message: "Sản phẩm đã được xóa khỏi nhà cung cấp",
      } as ApiResponse<null>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
