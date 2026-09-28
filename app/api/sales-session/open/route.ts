import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"
import { getVietnamNow, getVietnamToday } from "@/lib/server-time"
import { addDays } from "date-fns"

/**
 * POST /api/sales-session/open
 * Opens a new sales session (bán hàng) for the current user
 * 
 * This is SEPARATE from attendance check-in.
 * A sales session tracks cash management and revenue for a work shift.
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await verifyAuth(request)
        if (!authUser) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const user = await prisma.users.findUnique({
            where: { id: authUser.id },
            select: { id: true, warehouse_id: true, full_name: true }
        })

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
        }

        const body = await request.json()
        const { opening_cash, work_shift_id, warehouse_id } = body

        // Use provided warehouse_id or fallback to user's assigned warehouse
        const targetWarehouseId = warehouse_id || user.warehouse_id
        if (!targetWarehouseId) {
            return NextResponse.json(
                { success: false, error: "Không xác định được kho. Vui lòng chọn kho." },
                { status: 400 }
            )
        }

        // Validate opening_cash
        if (opening_cash === undefined || opening_cash === null || opening_cash < 0) {
            return NextResponse.json(
                { success: false, error: "Tiền đầu ca phải lớn hơn hoặc bằng 0" },
                { status: 400 }
            )
        }

        const now = getVietnamNow()
        const today = getVietnamToday()

        // Check if user already has any IN_PROGRESS sales session today
        const userExistingSession = await prisma.sales_sessions.findFirst({
            where: {
                user_id: user.id,
                session_date: {
                    gte: today,
                    lt: addDays(today, 1)
                },
                status: "IN_PROGRESS"
            },
            include: {
                work_shifts: { select: { shift_code: true, shift_name: true } }
            }
        })

        if (userExistingSession) {
            const shiftInfo = userExistingSession.work_shifts
                ? `ca ${userExistingSession.work_shifts.shift_code} (${userExistingSession.work_shifts.shift_name})`
                : 'ca bán hàng'
            return NextResponse.json(
                { success: false, error: `Bạn đang mở ${shiftInfo}. Vui lòng đóng ca trước khi mở ca mới.` },
                { status: 400 }
            )
        }

        // Check if another user has ANY IN_PROGRESS session in this warehouse today
        // This prevents multiple people selling at the same time in the same warehouse
        const otherUserSession = await prisma.sales_sessions.findFirst({
            where: {
                warehouse_id: targetWarehouseId,
                status: "IN_PROGRESS",
                session_date: {
                    gte: today,
                    lt: addDays(today, 1)
                },
                user_id: { not: user.id }
            },
            include: {
                users_sales_sessions_user_idTousers: { select: { full_name: true } },
                work_shifts: { select: { shift_code: true, shift_name: true } },
                warehouses: { select: { name: true } }
            }
        })

        if (otherUserSession) {
            const otherUserName = otherUserSession.users_sales_sessions_user_idTousers?.full_name || 'Nhân viên khác'
            const shiftInfo = otherUserSession.work_shifts
                ? `ca ${otherUserSession.work_shifts.shift_code} (${otherUserSession.work_shifts.shift_name})`
                : 'ca bán hàng'
            const warehouseName = otherUserSession.warehouses?.name || 'kho này'

            return NextResponse.json(
                {
                    success: false,
                    error: `⚠️ ${otherUserName} đang mở ${shiftInfo} tại ${warehouseName}. Vui lòng đợi họ đóng ca.`,
                    conflictInfo: {
                        user_name: otherUserName,
                        shift_code: otherUserSession.work_shifts?.shift_code,
                        shift_name: otherUserSession.work_shifts?.shift_name,
                        warehouse_name: warehouseName,
                        opened_at: otherUserSession.shift_opened_at
                    }
                },
                { status: 400 }
            )
        }

        // Create new sales session
        const salesSession = await prisma.sales_sessions.create({
            data: {
                user_id: user.id,
                warehouse_id: targetWarehouseId,
                session_date: today,
                work_shift_id: work_shift_id || null,
                shift_opened_at: now,
                opening_cash: parseFloat(opening_cash),
                opening_cash_user_id: user.id,
                status: "IN_PROGRESS",
                total_orders: 0,
                total_revenue: 0,
                total_discount: 0,
                cash_orders: 0,
                transfer_orders: 0,
                ewallet_orders: 0,
                transfer_total: 0,
                ewallet_total: 0,
                vouchers_used: 0,
            },
            include: {
                work_shifts: true,
                warehouses: { select: { name: true, code: true } }
            }
        })

        return NextResponse.json({
            success: true,
            message: "Mở ca bán hàng thành công",
            data: salesSession
        })

    } catch (error) {
        console.error("Error opening sales session:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống khi mở ca bán hàng" },
            { status: 500 }
        )
    }
}

/**
 * GET /api/sales-session/open
 * Get available work shifts for opening a sales session
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await verifyAuth(request)
        if (!authUser) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const user = await prisma.users.findUnique({
            where: { id: authUser.id },
            select: { warehouse_id: true }
        })

        if (!user?.warehouse_id) {
            return NextResponse.json({ success: false, error: "User not assigned to warehouse" }, { status: 400 })
        }

        // Get active work shifts for the user's warehouse
        const workShifts = await prisma.work_shifts.findMany({
            where: {
                warehouse_id: user.warehouse_id,
                is_active: true
            },
            orderBy: { start_time: 'asc' }
        })

        return NextResponse.json({
            success: true,
            data: workShifts
        })

    } catch (error) {
        console.error("Error getting work shifts:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}
