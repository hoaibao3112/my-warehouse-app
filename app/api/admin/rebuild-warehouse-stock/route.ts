import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { runTransaction, query } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"

/**
 * @swagger
 * /api/admin/rebuild-warehouse-stock:
 *   post:
 *     summary: Rebuild Warehouse Stock
 *     description: Protected admin endpoint to rebuild warehouse_stock from stock_transactions.
 *     tags: [Admin - Maintenance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Rebuild successful
 *   get:
 *     summary: Rebuild Stock Info
 *     description: Information about the rebuild endpoint.
 *     tags: [Admin - Maintenance]
 *     responses:
 *       200:
 *         description: Info message
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: "This endpoint is disabled. 'stock_transactions' table has been removed. Use the new inventory architecture."
  } as ApiResponse<null>, { status: 410 })
}

export async function GET() {
  return NextResponse.json({ success: true, data: 'POST to this endpoint to rebuild warehouse_stock (admin only)' })
}
