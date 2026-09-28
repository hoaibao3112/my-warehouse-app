import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isAdmin, isWarehouseManager, isGeneralManager, isHR } from "@/lib/auth"

/**
 * @swagger
 * /api/sales-sessions:
 *   get:
 *     summary: List Sales Sessions (Shift History)
 *     tags: [Sales Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of sales sessions
 */
export async function GET(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            )
        }

        // Only WAREHOUSE_MANAGER, GENERAL_MANAGER, HR, and ADMIN can view all history
        if (!isWarehouseManager(user) && !isGeneralManager(user) && !isHR(user) && !isAdmin(user)) {
            return NextResponse.json(
                { success: false, error: "Insufficient permissions" },
                { status: 403 }
            )
        }

        // Parse query parameters
        const searchParams = request.nextUrl.searchParams
        const status = searchParams.get("status")
        const userId = searchParams.get("userId")
        const warehouseId = searchParams.get("warehouseId")
        const fromDate = searchParams.get("fromDate")
        const toDate = searchParams.get("toDate")
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "20")

        // Build where clause
        const where: any = {}

        if (status && status !== "ALL") {
            where.status = status
        }

        if (userId && userId !== "ALL") {
            where.user_id = userId
        }

        // Warehouse filtering
        if (isHR(user) || isAdmin(user)) {
            // HR/Admin can filter by any warehouse
            if (warehouseId && warehouseId !== "ALL") {
                where.warehouse_id = warehouseId
            }
        } else if (isGeneralManager(user)) {
            // GM can see assigned warehouses
            const assignedIds = user.warehouseIds || []

            if (warehouseId && warehouseId !== "ALL") {
                if (!assignedIds.includes(warehouseId)) {
                    return NextResponse.json({ success: false, error: "Access denied to warehouse" }, { status: 403 })
                }
                where.warehouse_id = warehouseId
            } else {
                where.warehouse_id = { in: assignedIds }
            }
        } else if (isWarehouseManager(user)) {
            // Manage can only see their warehouse
            where.warehouse_id = user.warehouseId
        }

        // Date filtering
        if (fromDate || toDate) {
            where.session_date = {}
            if (fromDate) {
                where.session_date.gte = new Date(fromDate)
            }
            if (toDate) {
                const toDateObj = new Date(toDate)
                toDateObj.setHours(23, 59, 59, 999)
                where.session_date.lte = toDateObj
            }
        }

        const total = await prisma.sales_sessions.count({ where })

        const rawSessions = await prisma.sales_sessions.findMany({
            where,
            include: {
                users_sales_sessions_user_idTousers: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true
                    }
                },
                warehouses: {
                    select: {
                        id: true,
                        code: true,
                        name: true
                    }
                },
                work_shifts: true,
                sales_invoices_new: {
                    select: {
                        total_amount: true,
                        notes: true
                    }
                }
            },
            orderBy: {
                session_date: "desc"
            },
            skip: (page - 1) * limit,
            take: limit
        })

        const sessions = rawSessions.map((session: any) => {
            let cashRevenue = 0
            let ewalletRevenue = 0

            if (session.sales_invoices_new && Array.isArray(session.sales_invoices_new)) {
                for (const invoice of session.sales_invoices_new) {
                    const amount = invoice.total_amount ? Number(invoice.total_amount) : 0
                    if (invoice.notes) {
                        if (invoice.notes.includes('Tiền mặt') || invoice.notes.includes('CASH')) {
                            cashRevenue += amount
                        } else if (invoice.notes.includes('Ví Điện Tử') || invoice.notes.includes('EWALLET')) {
                            ewalletRevenue += amount
                        }
                    }
                }
            }

            // Recalculate difference to ensure it matches "Cash Only" logic
            let calculatedDifference = session.cash_difference
            if (session.closing_cash !== null) {
                const openingCash = session.opening_cash ? Number(session.opening_cash) : 0
                const closingCash = Number(session.closing_cash)
                const expectedCash = openingCash + cashRevenue
                calculatedDifference = closingCash - expectedCash
            }

            const { sales_invoices_new, ...rest } = session
            return {
                ...rest,
                cash_revenue: cashRevenue,
                ewallet_revenue: ewalletRevenue,
                cash_difference: calculatedDifference
            }
        })

        return NextResponse.json({
            success: true,
            data: sessions,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        })

    } catch (error) {
        console.error("Get sales sessions error:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}
