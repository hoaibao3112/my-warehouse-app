import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"
import { randomUUID } from "crypto"

/**
 * @swagger
 * /api/vouchers:
 *   get:
 *     summary: List Vouchers
 *     tags: [Vouchers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of vouchers
 *   post:
 *     summary: Create Voucher
 *     tags: [Vouchers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, discountType, discountValue]
 *             properties:
 *               code:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FIXED_AMOUNT, GIFT, PRODUCT_DISCOUNT]
 *               discountValue:
 *                 type: number
 *               minAmount:
 *                 type: number
 *               maxUses:
 *                 type: integer
 *               startDate:
 *                 type: string
 *               endDate:
 *                 type: string
 *     responses:
 *       201:
 *         description: Voucher created
 *       400:
 *         description: Invalid input
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get("page")) || 1
    const pageSize = Number(searchParams.get("pageSize")) || 20
    const search = searchParams.get("search") || ""
    const isActive = searchParams.get("isActive")

    let sql = `SELECT * FROM vouchers WHERE 1=1`
    const params: any[] = []

    if (search) {
      sql += ` AND (code LIKE ? OR description LIKE ?)`
      params.push(`%${search}%`, `%${search}%`)
    }

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      sql += ` AND is_active = ?`
      params.push(isActive === "true")
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
    params.push(pageSize, (page - 1) * pageSize)

    const vouchers = (await query(sql, params)) as any[]

    // Count total
    let countSql = `SELECT COUNT(*) as total FROM vouchers WHERE 1=1`
    const countParams: any[] = []
    if (search) {
      countSql += ` AND (code LIKE ? OR description LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`)
    }
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      countSql += ` AND is_active = ?`
      countParams.push(isActive === "true")
    }

    const countResult = (await query(countSql, countParams)) as any[]
    const total = countResult[0]?.total || 0

    return NextResponse.json({
      success: true,
      data: vouchers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được tạo voucher" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      code,
      description,
      discountType,
      discountValue,
      minAmount,
      maxUses,
      startDate,
      endDate,
    } = body

    if (!code || !discountType || !discountValue) {
      return NextResponse.json(
        { success: false, error: "Code, discount type và discount value là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check if code already exists
    const existing = (await query(
      `SELECT id FROM vouchers WHERE code = ?`,
      [code]
    )) as any[]

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: "Mã voucher đã tồn tại" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const voucherId = randomUUID()
    const now = getVietnamTime()

    await query(
      `INSERT INTO vouchers (
        id, code, description, discount_type, discount_value, min_amount, max_uses, 
        current_uses, is_active, start_date, end_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherId,
        code,
        description || null,
        discountType,
        discountValue,
        minAmount || null,
        maxUses || null,
        0,
        true,
        startDate || null,
        endDate || null,
        now,
        now,
      ]
    )

    const newVoucher = (await query(
      `SELECT * FROM vouchers WHERE id = ?`,
      [voucherId]
    )) as any[]

    return NextResponse.json({
      success: true,
      message: "Voucher đã được tạo",
      data: newVoucher[0],
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
