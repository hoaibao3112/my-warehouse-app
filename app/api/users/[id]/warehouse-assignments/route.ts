//app/api/users/[id]/warehouse-assignments/route.ts
import { NextRequest, NextResponse } from "next/server"
import { query, runTransaction } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"
import type { ApiResponse } from "@/lib/types"

/**
 * GET /api/users/[id]/warehouse-assignments
 * Returns warehouse assignments for a user
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = getAuthToken(request)
        const authUser = token ? verifyToken(token) : null

        if (!authUser) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { id } = await params

        // Allow: Admin can view anyone's assignments, users can view their own
        if (!isAdmin(authUser) && authUser.id !== id) {
            return NextResponse.json(
                { success: false, error: "Forbidden" } as ApiResponse<null>,
                { status: 403 }
            )
        }

        const rows = (await query(
            `SELECT uwa.warehouse_id as "warehouseId", w.name as "warehouseName", w.code as "warehouseCode"
             FROM user_warehouse_assignments uwa
             JOIN warehouses w ON uwa.warehouse_id = w.id
             WHERE uwa.user_id = ?::uuid`,
            [id]
        )) as any[]

        return NextResponse.json({
            success: true,
            data: rows
        } as ApiResponse<any>)
    } catch (error: any) {
        console.error("Error fetching warehouse assignments:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * PUT /api/users/[id]/warehouse-assignments
 * Updates warehouse assignments for a user
 * Body: { warehouseIds: string[] }
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user || !isAdmin(user)) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 403 }
            )
        }

        const { id } = await params
        const body = await request.json()
        const { warehouseIds } = body

        if (!Array.isArray(warehouseIds)) {
            return NextResponse.json(
                { success: false, error: "warehouseIds must be an array" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Transaction: delete all old assignments, insert new ones
        await runTransaction(async () => {
            // Delete existing assignments
            await query(
                `DELETE FROM user_warehouse_assignments WHERE user_id = ?::uuid`,
                [id]
            )

            // Insert new assignments
            for (const warehouseId of warehouseIds) {
                await query(
                    `INSERT INTO user_warehouse_assignments (user_id, warehouse_id, assigned_at)
                     VALUES (?::uuid, ?::uuid, NOW())`,
                    [id, warehouseId]
                )
            }

            // Update user's primary warehouse_id to first in list (or null if empty)
            const primaryWarehouseId = warehouseIds.length > 0 ? warehouseIds[0] : null
            await query(
                `UPDATE users SET warehouse_id = ?::uuid, updated_at = NOW() WHERE id = ?::uuid`,
                [primaryWarehouseId, id]
            )
        })

        return NextResponse.json({
            success: true,
            message: `Đã cập nhật ${warehouseIds.length} kho cho user`
        } as ApiResponse<any>)
    } catch (error: any) {
        console.error("Error updating warehouse assignments:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
