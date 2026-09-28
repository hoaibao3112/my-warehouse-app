import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * POST /api/stock-transfer-requests/[id]/export
 * Kho Tổng xác nhận xuất kho
 * Chuyển trạng thái từ DA_DUYET → DA_XUAT_KHO
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ Kho Tổng mới được xuất kho" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const requestData = (await query(
      `SELECT * FROM stock_transfer_requests WHERE id = ?`,
      [id]
    )) as any[]

    if (!requestData || requestData.length === 0) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const req = requestData[0]

    if (req.status !== "DA_DUYET") {
      return NextResponse.json(
        { success: false, error: `Yêu cầu không ở trạng thái "Đã duyệt", hiện tại: ${req.status}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const now = getVietnamTime()

    // Update status to DA_XUAT_KHO and set exported_at
    await query(
      `UPDATE stock_transfer_requests
       SET status = ?::transfer_status, exported_at = ?::timestamp, updated_at = ?::timestamp
       WHERE id = ?`,
      ["DA_XUAT_KHO", now, now, id]
    )

    // Fetch updated request
    const updatedRequest = (await query(
      `SELECT * FROM stock_transfer_requests WHERE id = ?`,
      [id]
    )) as any[]

    const details = (await query(
      `SELECT * FROM stock_transfer_request_details WHERE request_id = ?`,
      [id]
    )) as any[]

    return NextResponse.json(
      {
        success: true,
        message: "Đã xác nhận xuất kho",
        data: { ...updatedRequest[0], details },
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
