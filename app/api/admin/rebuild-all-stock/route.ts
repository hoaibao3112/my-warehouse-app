import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * POST /api/admin/rebuild-all-stock
 * 
 * Rebuild warehouse_stock for ALL warehouses from stock_transactions
 * This is the critical fix for the dual-update bug
 * 
 * ADMIN ONLY - This is a destructive operation
 */
export async function POST(request: NextRequest) {
    return NextResponse.json({
        success: false,
        error: "This endpoint is disabled. 'stock_transactions' table has been removed. Use the new inventory architecture."
    } as ApiResponse<null>, { status: 410 })
}
