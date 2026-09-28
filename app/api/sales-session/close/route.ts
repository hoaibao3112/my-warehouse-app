import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"
import { getVietnamNow, getVietnamToday } from "@/lib/server-time"
import { addDays } from "date-fns"

/**
 * POST /api/sales-session/close
 * Closes an active sales session (bán hàng)
 * 
 * Required body:
 * - session_id: string (or will find current session)
 * - closing_cash: number
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await verifyAuth(request)
        if (!authUser) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const user = await prisma.users.findUnique({
            where: { id: authUser.id },
            select: { id: true, warehouse_id: true, full_name: true, role: true }
        })

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
        }

        const body = await request.json()
        const { session_id, closing_cash, notes } = body

        // Validate closing_cash
        if (closing_cash === undefined || closing_cash === null || closing_cash < 0) {
            return NextResponse.json(
                { success: false, error: "Tiền cuối ca phải lớn hơn hoặc bằng 0" },
                { status: 400 }
            )
        }

        const now = getVietnamNow()
        const today = getVietnamToday()

        // Find the session to close
        let salesSession
        if (session_id) {
            salesSession = await prisma.sales_sessions.findUnique({
                where: { id: session_id },
                include: {
                    work_shifts: true,
                    warehouses: { select: { name: true, code: true } }
                }
            })
        } else {
            // Find current user's active session
            salesSession = await prisma.sales_sessions.findFirst({
                where: {
                    user_id: user.id,
                    status: "IN_PROGRESS",
                    session_date: {
                        gte: today,
                        lt: addDays(today, 1)
                    }
                },
                include: {
                    work_shifts: true,
                    warehouses: { select: { name: true, code: true } }
                }
            })
        }

        if (!salesSession) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy ca bán hàng để đóng" },
                { status: 404 }
            )
        }

        if (salesSession.status !== "IN_PROGRESS") {
            return NextResponse.json(
                { success: false, error: "Ca bán hàng này đã được đóng" },
                { status: 400 }
            )
        }

        // Check permission (owner or manager)
        const isOwner = salesSession.user_id === user.id
        const isManager = user.role === "MANAGER" || user.role === "ADMIN"
        if (!isOwner && !isManager) {
            return NextResponse.json(
                { success: false, error: "Bạn không có quyền đóng ca bán hàng này" },
                { status: 403 }
            )
        }

        // Calculate expected cash = opening + cash revenue (exclude e-wallet/transfer)
        const invoices = await prisma.sales_invoices.findMany({
            where: { sales_session_id: salesSession.id },
            select: { total_amount: true, notes: true }
        })

        let cashRevenue = 0
        for (const invoice of invoices) {
            const amount = invoice.total_amount ? Number(invoice.total_amount) : 0
            if (invoice.notes) {
                if (invoice.notes.includes('Tiền mặt') || invoice.notes.includes('CASH')) {
                    cashRevenue += amount
                }
            }
        }

        const openingCash = Number(salesSession.opening_cash) || 0
        const expectedCash = openingCash + cashRevenue
        const cashDifference = parseFloat(closing_cash) - expectedCash

        // Update the session
        const closedSession = await prisma.sales_sessions.update({
            where: { id: salesSession.id },
            data: {
                status: "PENDING_APPROVAL",
                closing_cash: parseFloat(closing_cash),
                closing_cash_user_id: user.id,
                shift_closed_at: now,
                expected_cash: expectedCash,
                cash_difference: cashDifference,
                notes: notes || salesSession.notes,
                updated_at: now
            },
            include: {
                work_shifts: true,
                warehouses: { select: { name: true, code: true } }
            }
        })

        // Determine message based on cash difference
        let message = "Đóng ca bán hàng thành công"
        if (Math.abs(cashDifference) > 0.01) {
            if (cashDifference > 0) {
                message = `Đóng ca thành công. Tiền dư: ${cashDifference.toLocaleString('vi-VN')}đ`
            } else {
                message = `Đóng ca thành công. Tiền thiếu: ${Math.abs(cashDifference).toLocaleString('vi-VN')}đ`
            }
        }

        return NextResponse.json({
            success: true,
            message,
            data: {
                ...closedSession,
                expected_cash: expectedCash,
                cash_difference: cashDifference
            }
        })

    } catch (error) {
        console.error("Error closing sales session:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống khi đóng ca bán hàng" },
            { status: 500 }
        )
    }
}
