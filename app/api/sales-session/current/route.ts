import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"
import { getVietnamNow, getVietnamToday } from "@/lib/server-time"
import { addDays } from "date-fns"

/**
 * GET /api/sales-session/current
 * Get the current active sales session for the user
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await verifyAuth(request)
        if (!authUser) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const user = await prisma.users.findUnique({
            where: { id: authUser.id },
            select: { id: true, warehouse_id: true }
        })

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
        }

        const today = getVietnamToday()

        // Find current user's active session
        const currentSession = await prisma.sales_sessions.findFirst({
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
                warehouses: { select: { id: true, name: true, code: true } },
                users_sales_sessions_user_idTousers: { select: { full_name: true } }
            }
        })

        if (!currentSession) {
            return NextResponse.json({
                success: true,
                data: null,
                message: "Không có ca bán hàng đang mở"
            })
        }

        // Get real-time sales metrics for this session
        const salesMetrics = await prisma.sales_invoices.aggregate({
            where: {
                sales_session_id: currentSession.id
            },
            _sum: {
                total_amount: true,
                discount_amount: true,
                vat_amount: true
            },
            _count: { id: true }
        })

        // Get payment breakdown by analyzing invoice notes
        const invoices = await prisma.sales_invoices.findMany({
            where: {
                sales_session_id: currentSession.id
            },
            select: {
                notes: true,
                total_amount: true
            }
        })

        // Calculate payment breakdown
        let cashOrders = 0
        let ewalletOrders = 0
        let cashRevenue = 0
        let ewalletRevenue = 0

        for (const invoice of invoices) {
            const amount = invoice.total_amount ? Number(invoice.total_amount) : 0
            if (invoice.notes) {
                if (invoice.notes.includes('Tiền mặt') || invoice.notes.includes('CASH')) {
                    cashOrders++
                    cashRevenue += amount
                } else if (invoice.notes.includes('Ví Điện Tử') || invoice.notes.includes('EWALLET')) {
                    ewalletOrders++
                    ewalletRevenue += amount
                }
                // Note: Transfer/Chuyển khoản is not tracked here but could be added
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                ...currentSession,
                // Add payment breakdown fields that the UI expects
                total_orders: salesMetrics._count.id || 0,
                total_revenue: Number(salesMetrics._sum.total_amount) || 0,
                total_discount: Number(salesMetrics._sum.discount_amount) || 0,
                total_vat: Number(salesMetrics._sum.vat_amount) || 0,
                cash_orders: cashOrders,
                ewallet_orders: ewalletOrders,
                cash_revenue: cashRevenue,
                ewallet_revenue: ewalletRevenue,
                realtime_stats: {
                    total_orders: salesMetrics._count.id || 0,
                    total_revenue: Number(salesMetrics._sum.total_amount) || 0,
                    total_discount: Number(salesMetrics._sum.discount_amount) || 0
                }
            }
        })

    } catch (error) {
        console.error("Error getting current sales session:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}
