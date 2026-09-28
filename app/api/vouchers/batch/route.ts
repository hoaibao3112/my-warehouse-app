import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { randomUUID } from "crypto"
import { verifyToken, isAdmin } from "@/lib/auth"

function generateRandomVoucherCode(programName: string): string {
  // Convert program name to uppercase alphanumeric code
  const prefix = programName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 4) || 'VCHR'

  // Generate random alphanumeric string (8 characters)
  // Using uppercase letters and numbers only, excluding easily confused characters (0, O, I, 1)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let randomPart = ''
  for (let i = 0; i < 8; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return `${prefix}-${randomPart}`
}

async function isCodeUnique(code: string): Promise<boolean> {
  const existing = await query('SELECT id FROM vouchers WHERE code = ?', [code])
  return (existing as any[]).length === 0
}

/**
 * @swagger
 * /api/vouchers/batch:
 *   post:
 *     summary: Create Batch Vouchers
 *     tags: [Vouchers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, quantity, discountType, discountValue]
 *             properties:
 *               name:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               discountType:
 *                 type: string
 *               discountValue:
 *                 type: number
 *               minAmount:
 *                 type: number
 *               startDate:
 *                 type: string
 *               endDate:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vouchers created
 *       400:
 *         description: Invalid input
 */
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
      name,
      quantity,
      discountType,
      discountValue,
      minAmount,
      maxUses,
      startDate,
      endDate,
    } = body

    if (!name || !quantity || quantity <= 0 || quantity > 1000) {
      return NextResponse.json(
        { success: false, error: "Tên chương trình và số lượng (1-1000) là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (!discountType || !discountValue) {
      return NextResponse.json(
        { success: false, error: "Loại giảm giá và giá trị giảm là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const now = getVietnamTime()
    const createdVouchers: string[] = []

    await runTransaction(async () => {
      for (let i = 1; i <= quantity; i++) {
        const voucherId = randomUUID()

        // Generate unique random code (retry if duplicate)
        let voucherCode = ''
        let attempts = 0
        const maxAttempts = 10

        do {
          voucherCode = generateRandomVoucherCode(name)
          attempts++

          if (attempts >= maxAttempts) {
            throw new Error('Không thể tạo mã voucher unique sau nhiều lần thử')
          }
        } while (!(await isCodeUnique(voucherCode)))

        await query(
          `INSERT INTO vouchers (
            id, code, discount_type, discount_value,
            min_amount, max_uses, current_uses, is_active,
            start_date, end_date, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, true, ?, ?, ?, ?)`,
          [
            voucherId,
            voucherCode,
            discountType,
            discountValue,
            minAmount || null,
            1, // maxUses hardcoded to 1
            startDate || null,
            endDate || null,
            now,
            now,
          ]
        )

        createdVouchers.push(voucherCode)
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: `Đã tạo ${quantity} mã voucher cho chương trình "${name}"`,
        data: {
          programName: name,
          quantity,
          codes: createdVouchers,
        },
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error creating batch vouchers:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Lỗi tạo voucher" } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
