import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { getVietnamToday, addDays } from "@/lib/server-time"

export const dynamic = 'force-dynamic'

/**
 * @swagger
 * /api/shifts/current:
 *   get:
 *     summary: Get Current Shift Session
 *     tags: [Shifts]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current session details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     isVirtualShift:
 *                       type: boolean
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

        // Get current shift session using Vietnam timezone
        const today = getVietnamToday()

        // REFRESH: Fetch latest user data from DB to ensure warehouse_id is current
        // This solves issue where JWT token has stale warehouse_id
        const freshUser = await prisma.users.findUnique({
            where: { id: user.id },
            select: { warehouse_id: true, role: true }
        })

        if (freshUser) {
            user.warehouseId = freshUser.warehouse_id
            user.role = freshUser.role as any
        }

        // Get warehouseId from query param (for multi-warehouse users/context switching)
        const { searchParams } = new URL(request.url)
        const queryWarehouseId = searchParams.get('warehouseId')

        // Priority: Query Param > User Assigned Warehouse
        const targetWarehouseId = queryWarehouseId || user.warehouseId

        console.log("[SHIFT_CURRENT] User ID:", user.id, "| Today:", today.toISOString(), "| Target Warehouse:", targetWarehouseId)

        // STRICT SAFETY CHECK: If no warehouse context is available, DO NOT return any data.
        // This prevents users (like unassigned Admins/Managers) from seeing "random" sessions from other warehouses.
        if (!targetWarehouseId) {
            console.log("[SHIFT_CURRENT] No warehouse context provided. Returning empty.")
            return NextResponse.json({
                success: true,
                data: null,
                sessions: [],
                hasMultipleSessions: false
            })
        }

        // Find ALL active SALES sessions for user today
        // STRICTLY FILTER BY WAREHOUSE if available
        const currentSessions = await prisma.sales_sessions.findMany({
            where: {
                user_id: user.id,
                session_date: today,
                status: "IN_PROGRESS",
                warehouse_id: targetWarehouseId
            },
            include: {
                users_sales_sessions_user_idTousers: true,
                warehouses: true,
                work_shifts: true
            },
            orderBy: {
                shift_opened_at: 'asc'
            }
        })

        console.log("[SHIFT_CURRENT] Active sales sessions found:", currentSessions.length)

        // DEBUG: Check ALL sessions for this user (regardless of date/status/warehouse)
        const allUserSessions = await prisma.sales_sessions.findMany({
            where: { user_id: user.id },
            orderBy: { created_at: 'desc' },
            take: 5
        })
        console.log("[SHIFT_CURRENT] DEBUG - Latest 5 sessions for user:", allUserSessions.map(s => ({
            id: s.id,
            warehouse_id: s.warehouse_id,
            session_date: s.session_date,
            status: s.status,
            shift_opened_at: s.shift_opened_at,
            created_at: s.created_at
        })))

        // Calculate stats for each session
        const sessionsWithStats = await Promise.all(
            currentSessions.map(async (session) => {
                const invoices = await prisma.sales_invoices.findMany({
                    where: {
                        sales_session_id: session.id
                    },
                    include: {
                        voucher: {
                            include: {
                                program: true
                            }
                        }
                    }
                })

                const cashInvoices = invoices.filter(inv => inv.notes?.includes("Tiền mặt") || inv.notes?.includes("CASH"))
                const transferInvoices = invoices.filter(inv => inv.notes?.includes("Chuyển khoản") || inv.notes?.includes("TRANSFER"))
                const ewalletInvoices = invoices.filter(inv => inv.notes?.includes("Ví Điện Tử") || inv.notes?.includes("EWALLET"))

                // Voucher statistics
                const vouchersUsed = invoices.filter(inv => inv.voucher_id).length
                const voucherPrograms = [...new Set(
                    invoices
                        .filter(inv => inv.voucher?.program)
                        .map(inv => inv.voucher!.program.name)
                )]

                // Promotion statistics
                const promotionsUsed = invoices.filter(inv => inv.promotion_id || inv.gift_promotion_id).length
                const promotionIds = [...new Set(
                    invoices
                        .filter(inv => inv.promotion_id || inv.gift_promotion_id)
                        .map(inv => inv.promotion_id || inv.gift_promotion_id)
                        .filter(Boolean) as string[]
                )]

                // Fetch promotion names
                const promotionNames: string[] = []
                if (promotionIds.length > 0) {
                    const promotions = await prisma.promotions.findMany({
                        where: {
                            id: { in: promotionIds }
                        },
                        select: { name: true }
                    })
                    promotionNames.push(...promotions.map(p => p.name))
                }

                const stats = {
                    total_orders: invoices.length,
                    cash_orders: cashInvoices.length,
                    transfer_orders: transferInvoices.length,
                    ewallet_orders: ewalletInvoices.length,
                    cash_revenue: cashInvoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    ewallet_revenue: ewalletInvoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    total_revenue: invoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    total_discount: invoices.reduce((sum, inv) => sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0),
                    vouchers_used: vouchersUsed,
                    voucher_programs: voucherPrograms,
                    promotions_used: promotionsUsed,
                    promotion_names: promotionNames
                }

                return {
                    ...session,
                    ...stats,
                    type: 'sales_session'
                }
            })
        )

        // Return multiple sessions (backward compatible: first session as 'data')
        if (sessionsWithStats.length > 0) {
            return NextResponse.json({
                success: true,
                data: sessionsWithStats[0], // Backward compatible
                sessions: sessionsWithStats, // NEW: All sessions
                hasMultipleSessions: sessionsWithStats.length > 1
            })
        }

        // CRITICAL: Check if user already has a CLOSED sales session today
        const closedSessionToday = await prisma.sales_sessions.findFirst({
            where: {
                user_id: user.id,
                session_date: today,
                status: { in: ["PENDING_APPROVAL", "COMPLETED", "REJECTED"] },
                ...(targetWarehouseId ? { warehouse_id: targetWarehouseId } : {})
            },
            include: {
                users_sales_sessions_user_idTousers: true,
                warehouses: true,
                work_shifts: true
            },
            orderBy: {
                shift_closed_at: 'desc' // Most recent closed session
            }
        })

        if (closedSessionToday) {
            // User already has a closed session today - return it so frontend shows "Closed" status
            console.log("[SHIFT_CURRENT] User has closed sales session today:", closedSessionToday.id)

            // Get stats for the closed session
            const invoices = await prisma.sales_invoices.findMany({
                where: {
                    sales_session_id: closedSessionToday.id
                }
            })

            const stats = {
                total_orders: invoices.length,
                cash_orders: invoices.filter(inv => inv.notes?.includes("Tiền mặt") || inv.notes?.includes("CASH")).length,
                transfer_orders: invoices.filter(inv => inv.notes?.includes("Chuyển khoản") || inv.notes?.includes("TRANSFER")).length,
                ewallet_orders: invoices.filter(inv => inv.notes?.includes("Ví Điện Tử") || inv.notes?.includes("EWALLET")).length,
                total_revenue: invoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                total_discount: invoices.reduce((sum, inv) => sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0)
            }

            return NextResponse.json({
                success: true,
                data: {
                    ...closedSessionToday,
                    ...stats,
                    isClosedSession: true, // Flag that this session is already closed
                    type: 'sales_session'
                }
            })
        }

        // Check if user is manager/admin/general_manager - they don't need a shift session to sell
        const isManager = user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon"
        const isAdmin = user.role === "ADMIN" || user.role === "AdminKhoTong"
        const isGeneralManager = user.role === "GENERAL_MANAGER"

        if (isManager || isAdmin || isGeneralManager) {
            // For GENERAL_MANAGER, get warehouse from query or session storage (handled by client)
            let warehouseId = user.warehouseId

            if (isGeneralManager) {
                // Get warehouse from query parameter
                const { searchParams } = new URL(request.url)
                const queryWarehouseId = searchParams.get('warehouseId')
                if (queryWarehouseId) {
                    warehouseId = queryWarehouseId
                }
            }

            // Check if warehouse is assigned
            if (!warehouseId) {
                return NextResponse.json({
                    success: false,
                    error: isGeneralManager
                        ? "Vui lòng chọn kho trước khi bán hàng."
                        : "Tài khoản quản lý chưa được gán kho. Vui lòng liên hệ Admin để cấu hình kho trong Quản Lý Người Dùng.",
                    data: null
                })
            }

            // Manager/admin/general_manager can sell without a shift session
            return NextResponse.json({
                success: true,
                data: {
                    id: "virtual-shift",
                    warehouse_id: warehouseId,
                    user_id: user.id,
                    isVirtualShift: true, // Flag to indicate this is a virtual shift (no actual shift session)
                    status: "IN_PROGRESS"
                }
            })
        }

        // For STAFF users, check if warehouse has another active session
        // BUT we should allow if the user has an assignment for today's shift
        const warehouseId = user.warehouseId // Fix: use camelCase

        // First check if user has any assignment today
        const userTodayAssignment = await prisma.shift_assignments.findFirst({
            where: {
                user_id: user.id,
                assigned_date: today
            },
            include: {
                work_shifts: {
                    select: {
                        id: true,
                        shift_name: true,
                        end_time: true
                    }
                }
            }
        })

        const warehouseActiveSession = await prisma.sales_sessions.findFirst({
            where: {
                warehouse_id: warehouseId,
                status: "IN_PROGRESS",
                user_id: { not: user.id } // Another user's session
            },
            include: {
                users_sales_sessions_user_idTousers: true,
                warehouses: true
            }
        })

        // If another staff member has active shift
        if (warehouseActiveSession) {
            // Check if this session is for the same shift as user's assignment
            // If so, user should be able to use this session
            if (userTodayAssignment &&
                warehouseActiveSession.work_shift_id === userTodayAssignment.work_shifts?.id) {
                // User is assigned to the same shift, return the active session
                const invoices = await prisma.sales_invoices.findMany({
                    where: {
                        sales_session_id: warehouseActiveSession.id
                    }
                })

                const stats = {
                    total_orders: invoices.length,
                    cash_orders: invoices.filter(inv => inv.notes?.includes("Tiền mặt") || inv.notes?.includes("CASH")).length,
                    transfer_orders: invoices.filter(inv => inv.notes?.includes("Chuyển khoản") || inv.notes?.includes("TRANSFER")).length,
                    ewallet_orders: invoices.filter(inv => inv.notes?.includes("Ví Điện Tử") || inv.notes?.includes("EWALLET")).length,
                    total_revenue: invoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    total_discount: invoices.reduce((sum, inv) => sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0)
                }

                return NextResponse.json({
                    success: true,
                    data: {
                        ...warehouseActiveSession,
                        ...stats,
                        isSharedSession: true // Flag that this is a shared session opened by another staff
                    }
                })
            }

            // For other staff not assigned to this shift, only show generic message
            return NextResponse.json({
                success: false,
                error: "Ca trước chưa kết thúc. Vui lòng chờ nhân viên kia đóng ca.",
                data: null,
                hasActiveShiftInWarehouse: true
            })
        }

        // No active session exists - check if user has assignment and sales permission
        // If so, allow them to sell (virtual shift) - session will be created on first sale
        if (userTodayAssignment) {
            // Check if user already checked out today (has PENDING_APPROVAL or COMPLETED session)
            const checkedOutSession = await prisma.sales_sessions.findFirst({
                where: {
                    user_id: user.id,
                    session_date: today,
                    status: { in: ["PENDING_APPROVAL", "COMPLETED", "REJECTED"] }
                }
            })

            if (checkedOutSession) {
                // User already checked out today, don't allow virtual shift
                return NextResponse.json({
                    success: false,
                    error: "Bạn đã đóng ca hôm nay. Không thể bán hàng sau khi đóng ca.",
                    data: null
                })
            }

            // Get user's permissions to check if they have sales permission
            const userWithPermissions = await prisma.users.findUnique({
                where: { id: user.id },
                select: {
                    role: true,
                    permissions: true
                }
            })

            let permissions: string[] = []
            try {
                if (typeof userWithPermissions?.permissions === 'string') {
                    permissions = JSON.parse(userWithPermissions.permissions)
                } else if (Array.isArray(userWithPermissions?.permissions)) {
                    permissions = userWithPermissions.permissions as string[]
                }
            } catch {
                permissions = []
            }

            const hasSalesPermission = permissions.includes("sales")

            // console.log("[SHIFT_CURRENT] User has assignment but no session. Sales permission:", hasSalesPermission)

            if (hasSalesPermission) {
                // Check if shift has ended - virtual shift should auto-close at shift end time
                if (userTodayAssignment.work_shifts?.end_time) {
                    // Get current Vietnam time
                    const vietnamNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }))

                    // Get shift end time for today
                    const shiftEndTime = userTodayAssignment.work_shifts.end_time
                    let endHour = 0, endMinute = 0

                    if (typeof shiftEndTime === 'string') {
                        // Parse HH:MM:SS or HH:MM format
                        const timeParts = shiftEndTime.split(':')
                        endHour = parseInt(timeParts[0], 10)
                        endMinute = parseInt(timeParts[1] || '0', 10)
                    } else if (shiftEndTime instanceof Date) {
                        // CRITICAL: Database stores time as UTC, but represents Vietnam time
                        // Use getUTCHours() to get the actual hour value
                        endHour = shiftEndTime.getUTCHours()
                        endMinute = shiftEndTime.getUTCMinutes()
                    }

                    // Create shift end datetime for today in Vietnam timezone
                    const shiftEndDateTime = new Date(vietnamNow)
                    shiftEndDateTime.setHours(endHour, endMinute, 0, 0)

                    console.log("[SHIFT_CURRENT] Shift end time check:", {
                        currentTime: vietnamNow.toISOString(),
                        currentTimeLocal: vietnamNow.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
                        shiftEndTime: shiftEndDateTime.toISOString(),
                        shiftEndTimeLocal: shiftEndDateTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
                        endHour,
                        endMinute,
                        hasEnded: vietnamNow > shiftEndDateTime
                    })

                    if (vietnamNow > shiftEndDateTime) {
                        // Shift has ended, don't allow virtual shift
                        return NextResponse.json({
                            success: false,
                            error: "Ca làm việc đã kết thúc. Không thể bán hàng sau giờ kết thúc ca.",
                            data: null
                        })
                    }
                }

                // User has assignment and sales permission - create virtual shift to allow selling
                // Calculate stats from invoices without sales_session_id (virtual shift orders)
                const tomorrow = addDays(today, 1)
                const virtualShiftInvoices = await prisma.sales_invoices.findMany({
                    where: {
                        created_by: user.id,
                        created_at: {
                            gte: today,
                            lt: tomorrow
                        },
                        sales_session_id: null // Orders from virtual shift
                    },
                    include: {
                        voucher: {
                            include: {
                                program: true
                            }
                        }
                    }
                })

                const cashInvoices = virtualShiftInvoices.filter(inv => inv.notes?.includes("Tiền mặt") || inv.notes?.includes("CASH"))
                const transferInvoices = virtualShiftInvoices.filter(inv => inv.notes?.includes("Chuyển khoản") || inv.notes?.includes("TRANSFER"))
                const ewalletInvoices = virtualShiftInvoices.filter(inv => inv.notes?.includes("Ví Điện Tử") || inv.notes?.includes("EWALLET"))

                // Voucher statistics
                const vouchersUsed = virtualShiftInvoices.filter(inv => inv.voucher_id).length
                const voucherPrograms = [...new Set(
                    virtualShiftInvoices
                        .filter(inv => inv.voucher?.program)
                        .map(inv => inv.voucher!.program.name)
                )]

                // Promotion statistics
                const promotionsUsed = virtualShiftInvoices.filter(inv => inv.promotion_id || inv.gift_promotion_id).length
                const promotionIds = [...new Set(
                    virtualShiftInvoices
                        .filter(inv => inv.promotion_id || inv.gift_promotion_id)
                        .map(inv => inv.promotion_id || inv.gift_promotion_id)
                        .filter(Boolean) as string[]
                )]

                // Fetch promotion names
                const promotionNames: string[] = []
                if (promotionIds.length > 0) {
                    const promotions = await prisma.promotions.findMany({
                        where: {
                            id: { in: promotionIds }
                        },
                        select: { name: true }
                    })
                    promotionNames.push(...promotions.map(p => p.name))
                }

                const virtualStats = {
                    total_orders: virtualShiftInvoices.length,
                    cash_orders: cashInvoices.length,
                    transfer_orders: transferInvoices.length,
                    ewallet_orders: ewalletInvoices.length,
                    cash_revenue: cashInvoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    ewallet_revenue: ewalletInvoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    total_revenue: virtualShiftInvoices.reduce((sum, inv) => sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0),
                    total_discount: virtualShiftInvoices.reduce((sum, inv) => sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0),
                    vouchers_used: vouchersUsed,
                    voucher_programs: voucherPrograms,
                    promotions_used: promotionsUsed,
                    promotion_names: promotionNames
                }

                console.log("[SHIFT_CURRENT] Virtual shift stats:", virtualStats)

                return NextResponse.json({
                    success: true,
                    data: {
                        id: "pending-checkin",
                        warehouse_id: userTodayAssignment.warehouse_id || warehouseId,
                        user_id: user.id,
                        work_shift_id: userTodayAssignment.work_shifts?.id,
                        session_date: today.toISOString(),
                        isVirtualShift: true,
                        isPendingCheckIn: true, // Flag to indicate user should check-in
                        status: "IN_PROGRESS",
                        ...virtualStats
                    }
                })
            }
        }

        // No active session and no valid assignment with sales permission
        return NextResponse.json({
            success: true,
            data: null
        })
    } catch (error) {
        console.error("Get current shift error:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}
