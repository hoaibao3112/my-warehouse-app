import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

/**
 * Shift History API - For Managers/Admins
 * View all shifts across all users and warehouses
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

        // Only managers and admins can view all shifts
        if (!['MANAGER', 'GENERAL_MANAGER', 'ADMIN'].includes(user.role)) {
            return NextResponse.json(
                { success: false, error: "Forbidden - Manager access required" },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const warehouseId = searchParams.get('warehouseId')
        const userId = searchParams.get('userId')
        const status = searchParams.get('status')
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '50')

        const where: any = {}

        if (warehouseId) {
            where.warehouse_id = warehouseId
        }

        if (userId) {
            where.user_id = userId
        }

        if (status) {
            where.status = status
        }

        const [shifts, total] = await Promise.all([
            prisma.sales_sessions.findMany({
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
                            name: true,
                            code: true
                        }
                    },
                    work_shifts: {
                        select: {
                            id: true,
                            shift_name: true,
                            shift_code: true
                        }
                    }
                },
                orderBy: {
                    session_date: 'desc'
                },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.sales_sessions.count({ where })
        ])

        return NextResponse.json({
            success: true,
            data: shifts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        })
    } catch (error) {
        console.error("Get shift history error:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống" },
            { status: 500 }
        )
    }
}
