import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * GET /api/vouchers/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const vouchers = (await query(
      `SELECT * FROM vouchers WHERE id = ?`,
      [id]
    )) as any[]

    if (vouchers.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy voucher" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: vouchers[0],
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được cập nhật voucher" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const {
      discountType,
      discountValue,
      minAmount,
      isActive,
      startDate,
      endDate,
    } = body

    const now = getVietnamTime()

    await query(
      `UPDATE vouchers SET
        discount_type = ?, discount_value = ?,
        min_amount = ?, max_uses = ?, is_active = ?,
        start_date = ?::timestamp, end_date = ?::timestamp, updated_at = ?::timestamp
       WHERE id = ?`,
      [
        discountType,
        discountValue,
        minAmount || null,
        1, // maxUses hardcoded to 1
        isActive,
        startDate || null,
        endDate || null,
        now,
        id,
      ]
    )

    const updated = (await query(
      `SELECT * FROM vouchers WHERE id = ?`,
      [id]
    )) as any[]

    return NextResponse.json({
      success: true,
      message: "Voucher đã được cập nhật",
      data: updated[0],
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/vouchers/{id}:
 *   get:
 *     summary: Get Voucher Details
 *     tags: [Vouchers]
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
 *         description: Voucher details
 *   put:
 *     summary: Update Voucher
 *     tags: [Vouchers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               discountType:
 *                 type: string
 *               discountValue:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Voucher updated
 *   delete:
 *     summary: Delete Voucher
 *     tags: [Vouchers]
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
 *         description: Voucher deleted
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được xóa voucher" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params

    await query(`DELETE FROM vouchers WHERE id = ?`, [id])

    return NextResponse.json({
      success: true,
      message: "Voucher đã được xóa",
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
