import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { getVietnamNow, getVietnamToday, addDays } from "@/lib/server-time"

/**
 * Open Sales Session (Mở Ca Bán Hàng)
 * 
 * Creates a new sales session for selling products
 * Completely separate from attendance check-in
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
        const { opening_cash, notes, warehouse_id, work_shift_id } = body

        // Validate opening_cash is required
        if (opening_cash === undefined || opening_cash === null || opening_cash < 0) {
            return NextResponse.json(
                { success: false, error: "Vui lòng nhập số tiền mặt đầu ca" },
                { status: 400 }
            )
        }

        // Get user's warehouse
        const userWithWarehouse = await prisma.users.findUnique({
            where: { id: user.id },
            select: {
                warehouse_id: true,
                role: true,
                warehouses_users_warehouse_idTowarehouses: {
                    select: { id: true, name: true }
                }
            }
        })

        if (!userWithWarehouse?.warehouse_id) {
            return NextResponse.json(
                { success: false, error: "Người dùng chưa được gán kho" },
                { status: 400 }
            )
        }

        const userWarehouseId = userWithWarehouse.warehouse_id
        const warehouseId = warehouse_id || userWarehouseId

        // Validate warehouse access
        // REMOVED: Strict check preventing users from working at other warehouses.
        // We rely on Attendance Check-in (GPS validated) or Manager assignment.
        // if (warehouse_id && warehouse_id !== userWarehouseId) { ... }

        const today = getVietnamToday()

        // Check if this user already has an active sales session today
        const existingSession = await prisma.sales_sessions.findFirst({
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

        if (existingSession) {
            const shiftInfo = existingSession.work_shifts
                ? `ca ${existingSession.work_shifts.shift_code} (${existingSession.work_shifts.shift_name})`
                : 'ca bán hàng'
            return NextResponse.json(
                { success: false, error: `Bạn đang mở ${shiftInfo}. Vui lòng đóng ca trước khi mở ca mới.` },
                { status: 400 }
            )
        }

        // Check if any OTHER user has an active session in this warehouse today
        const otherUserSession = await prisma.sales_sessions.findFirst({
            where: {
                warehouse_id: warehouseId,
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
                    error: `⚠️ ${otherUserName} đang mở ${shiftInfo} tại ${warehouseName}. Vui lòng đợi họ đóng ca.`
                },
                { status: 400 }
            )
        }

        // Validate Work Shift ID if provided
        let verifiedWorkShiftId = null
        if (work_shift_id) {
            const wShift = await prisma.work_shifts.findUnique({
                where: { id: work_shift_id }
            })
            if (wShift && wShift.warehouse_id === warehouseId) {
                verifiedWorkShiftId = wShift.id
            }
        }

        // Create sales session
        const salesSession = await prisma.sales_sessions.create({
            data: {
                warehouse_id: warehouseId,
                user_id: user.id,
                session_date: today,
                shift_opened_at: getVietnamNow(),
                opening_cash: parseFloat(opening_cash),
                opening_cash_user_id: user.id,
                status: "IN_PROGRESS",
                work_shift_id: verifiedWorkShiftId,
                notes: notes || null,
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
                users_sales_sessions_user_idTousers: true,
                warehouses: true,
                work_shifts: true
            }
        })

        return NextResponse.json({
            success: true,
            message: "Mở ca bán hàng thành công",
            data: salesSession
        })
    } catch (error) {
        console.error("Open sales session error:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống" },
            { status: 500 }
        )
    }
}
