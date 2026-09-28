import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * GET /api/suppliers/[id]
 * Lấy thông tin nhà cung cấp và sản phẩm của họ
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const supplier = (await query(
      `SELECT id, name, contact_person, email, phone, address, is_active, created_at, updated_at
       FROM suppliers WHERE id = ?`,
      [id]
    )) as any[]

    if (!supplier || supplier.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nhà cung cấp không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const products = (await query(
      `SELECT sp.id, sp.product_id, p.code, p.name, sp.unit_price, sp.unit_id, pu.name as unit_name
       FROM supplier_products sp
       LEFT JOIN products p ON sp.product_id = p.id
       LEFT JOIN product_units pu ON sp.unit_id = pu.id
       WHERE sp.supplier_id = ?
       ORDER BY p.name ASC`,
      [id]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        data: {
          ...supplier[0],
          products,
        },
      } as ApiResponse<any>,
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
 * PUT /api/suppliers/[id]
 * Cập nhật thông tin nhà cung cấp
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được cập nhật nhà cung cấp" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { name, contact_person, email, phone, address, is_active } = body

    const now = getVietnamTime()

    await query(
      `UPDATE suppliers
       SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, is_active = ?, updated_at = ?::timestamp
       WHERE id = ?`,
      [
        name || null,
        contact_person || null,
        email || null,
        phone || null,
        address || null,
        is_active !== undefined ? is_active : true,
        now,
        id,
      ]
    )

    const updatedSupplier = (await query(
      `SELECT id, name, contact_person, email, phone, address, is_active, created_at, updated_at
       FROM suppliers WHERE id = ?`,
      [id]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        message: "Nhà cung cấp đã được cập nhật",
        data: updatedSupplier[0],
      } as ApiResponse<any>,
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
 * DELETE /api/suppliers/[id]
 * Xóa nhà cung cấp
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được xóa nhà cung cấp" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params

    await query(`DELETE FROM suppliers WHERE id = ?`, [id])

    return NextResponse.json(
      {
        success: true,
        message: "Nhà cung cấp đã được xóa",
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
