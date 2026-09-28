import { NextRequest, NextResponse } from "next/server"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import type { ApiResponse } from "@/lib/types"

/**
 * GET /api/inventory-checks/lock-status
 * Check if warehouse is locked by inventory check
 */
export async function GET(req: NextRequest) {
    try {
        const token = getAuthToken(req)
        if (!token || !verifyToken(token)) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { searchParams } = new URL(req.url)
        const warehouseId = searchParams.get("warehouseId")

        if (!warehouseId) {
            return NextResponse.json(
                { success: false, error: "warehouseId is required" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        const { checkInventoryCheckLock } = await import("@/lib/inventory-check-lock")
        const lockStatus = await checkInventoryCheckLock(warehouseId)

        return NextResponse.json({
            success: true,
            ...lockStatus
        })
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
