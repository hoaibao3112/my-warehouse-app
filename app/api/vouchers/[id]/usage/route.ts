import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getAuthToken } from '@/lib/auth-server'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const { id } = params

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Voucher ID is required' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const voucher = await prisma.vouchers.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        is_used: true,
        used_at: true,
        created_at: true,
      }
    })

    if (!voucher) {
      return NextResponse.json(
        { success: false, error: 'Voucher not found' } as ApiResponse<null>,
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: voucher
      } as ApiResponse<typeof voucher>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error fetching voucher usage:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi lấy thông tin mã giảm giá' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
