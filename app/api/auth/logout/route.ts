import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"


/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: User Logout
 *     description: Clear authentication cookie.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
export async function POST(request: NextRequest) {
  try {
    // Clear authentication cookie
    const response = NextResponse.json({ success: true, message: "Logged out successfully" } as ApiResponse<null>)
    response.cookies.delete("auth-token")
    return response
  } catch (error) {
    return NextResponse.json({ success: false, error: "Logout failed" } as ApiResponse<null>, { status: 500 })
  }
}
