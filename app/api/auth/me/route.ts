import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, User } from "@/lib/types"
import { verifyToken } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get Current User
 *     description: Retrieve details of the currently authenticated user.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User details
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
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: NextRequest) {
  try {
    let token = getAuthToken(request)

    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 200 })
    }

    // Decode URL-encoded token if needed (cookies can be URL-encoded)
    try {
      if (token.includes('%')) {
        token = decodeURIComponent(token)
      }
    } catch (e) {
      // Token is not URL-encoded, use as-is
    }

    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 200 })

    // Use Prisma ORM instead of raw query to avoid UUID type issues
    const userData = await prisma.users.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        warehouse_id: true,
        is_active: true,
        permissions: true,
        created_at: true,
        updated_at: true,
      }
    })

    if (!userData) return NextResponse.json({ success: false, error: "User not found" } as ApiResponse<null>, { status: 200 })

    // Map snake_case to camelCase and parse permissions
    console.log("[GET /api/auth/me] Raw user data from DB:", userData)
    let permissions: string[] = []
    try {
      console.log("[GET /api/auth/me] Raw permissions from DB:", userData.permissions, "type:", typeof userData.permissions)
      permissions = userData.permissions ? JSON.parse(userData.permissions) : []
      console.log("[GET /api/auth/me] Parsed permissions:", permissions)
    } catch (e) {
      console.error("[GET /api/auth/me] Error parsing permissions:", e, userData.permissions)
      permissions = []
    }

    // For GENERAL_MANAGER, load warehouse assignments
    let warehouseIds: string[] = []
    if (userData.role === 'GENERAL_MANAGER') {
      const assignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: userData.id },
        select: { warehouse_id: true }
      })
      warehouseIds = assignments.map((a: any) => a.warehouse_id)
      console.log("[GET /api/auth/me] GENERAL_MANAGER warehouse assignments:", warehouseIds)
    }

    const mappedUser = {
      id: userData.id,
      email: userData.email,
      fullName: userData.full_name,
      role: userData.role,
      warehouseId: userData.warehouse_id,
      warehouseIds: warehouseIds.length > 0 ? warehouseIds : undefined,
      isActive: userData.is_active,
      permissions: permissions,
      createdAt: userData.created_at instanceof Date ? userData.created_at.toISOString() : userData.created_at,
      updatedAt: userData.updated_at instanceof Date ? userData.updated_at.toISOString() : userData.updated_at,
    }

    console.log("[GET /api/auth/me] Returning mapped user:", mappedUser)
    return NextResponse.json({ success: true, data: mappedUser } as ApiResponse<User>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
