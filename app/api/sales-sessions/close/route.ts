import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { getVietnamNow } from "@/lib/server-time"

/**
 * Close Sales Session (Đóng Ca Bán Hàng)
 */
export async function POST(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { session_id, closing_cash, notes } = body

        // Validate closing_cash
        if (closing_cash === undefined || closing_cash === null || closing_cash < 0) {
            return NextResponse.json(
                { success: false, error: "Vui lòng nhập số tiền mặt cuối ca" },
                { status: 400 }
            )
        }

        // Get session
        const session = await prisma.sales_sessions.findUnique({
            where: { id: session_id },
            include: {
                warehouses: true,
                work_shifts: true
            }
        })

        if (!session) {
            return NextResponse.json(
                { success: false, error: "Phiên bán hàng không tồn tại" },
                { status: 404 }
            )
        }

        // Verify ownership
        if (session.user_id !== user.id) {
            return NextResponse.json(
                { success: false, error: "Bạn không có quyền đóng ca này" },
                { status: 403 }
            )
        }

        // Check if already closed
        if (session.status !== "IN_PROGRESS") {
            return NextResponse.json(
                { success: false, error: "Ca bán hàng đã được đóng" },
                { status: 400 }
            )
        }

        // Calculate expected cash
        const cashRevenue = session.cash_revenue || 0
        const expectedCash = Number(session.opening_cash || 0) + Number(cashRevenue)
        const cashDifference = Number(closing_cash) - expectedCash

        // Update session
        const closedSession = await prisma.sales_sessions.update({
            where: { id: session_id },
            data: {
                shift_closed_at: getVietnamNow(),
                closing_cash: parseFloat(closing_cash),
                closing_cash_user_id: user.id,
                expected_cash: expectedCash,
                cash_difference: cashDifference,
                status: "PENDING_APPROVAL",
                notes: notes || session.notes
            }
        })

        return NextResponse.json({
            success: true,
            message: "Đóng ca bán hàng thành công",
            data: closedSession
        })
    } catch (error) {
        console.error("Close sales session error:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống" },
            { status: 500 }
        )
    }
}
