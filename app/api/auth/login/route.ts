import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, AuthSession } from "@/lib/types"
import { query, prisma } from "@/lib/prisma"
import { verifyPassword, generateToken } from "@/lib/auth"
import rateLimiter, { getClientIP, RateLimits } from "@/lib/rate-limit"

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User Login
 *     description: Authenticate user with email and password to receive a JWT token and cookie.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *                 description: User email address
 *               password:
 *                 type: string
 *                 format: password
 *                 example: your_password
 *                 description: User password (min 6 characters)
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     token:
 *                       type: string
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many requests
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required" } as ApiResponse<null>, {
        status: 200,
      })
    }

    // SECURITY: Rate limiting to prevent brute force attacks
    // Use email as identifier (more specific than IP for login attempts)
    const clientIP = getClientIP(request)
    const identifier = `login:${email}:${clientIP}`

    const rateLimit = rateLimiter.checkLimit(
      identifier,
      RateLimits.AUTH.maxRequests,
      RateLimits.AUTH.windowMs
    )

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: RateLimits.AUTH.message,
          retryAfter: rateLimit.retryAfter
        } as ApiResponse<null>,
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter || 900)
          }
        }
      )
    }

    // Query user from DB
    const userRow = await prisma.users.findFirst({
      where: { email }
    })

    if (!userRow) {
      return NextResponse.json({ success: false, error: "Tài khoản hoặc mật khẩu không chính xác" } as ApiResponse<null>, { status: 200 })
    }

    const match = await verifyPassword(String(password), String(userRow.password_hash || ""))
    if (!match) return NextResponse.json({ success: false, error: "Tài khoản hoặc mật khẩu không chính xác" } as ApiResponse<null>, { status: 200 })

    // Parse permissions from JSON string
    let permissions: string[] = []
    try {
      if (process.env.NODE_ENV !== 'production') console.log("[LOGIN] Raw permissions from DB:", userRow.permissions, "type:", typeof userRow.permissions)
      permissions = userRow.permissions ? JSON.parse(userRow.permissions) : []
      if (process.env.NODE_ENV !== 'production') console.log("[LOGIN] Parsed permissions:", permissions)
    } catch (e) {
      console.error("[LOGIN] Error parsing permissions:", e, userRow.permissions)
      permissions = []
    }

    // Load warehouse assignments for GENERAL_MANAGER and WAREHOUSE_MANAGER
    let warehouseIds: string[] = []
    if (userRow.role === 'GENERAL_MANAGER' || userRow.role === 'WAREHOUSE_MANAGER') {
      // Both GENERAL_MANAGER and WAREHOUSE_MANAGER get warehouses from user_warehouse_assignments
      // Admin must assign warehouses to these users explicitly
      const assignmentsRows = (await query(
        `SELECT warehouse_id FROM user_warehouse_assignments WHERE user_id = ?`,
        [userRow.id]
      )) as any[]
      warehouseIds = assignmentsRows.map((row: any) => row.warehouse_id)
      if (process.env.NODE_ENV !== 'production') console.log(`[LOGIN] ${userRow.role} warehouse assignments:`, warehouseIds)
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      role: userRow.role,
      warehouseId: userRow.warehouse_id,
      warehouseIds: warehouseIds.length > 0 ? warehouseIds : undefined,
      isActive: Boolean(userRow.is_active),
      permissions: permissions,
      createdAt: userRow.created_at instanceof Date ? userRow.created_at.toISOString() : userRow.created_at,
      updatedAt: userRow.updated_at instanceof Date ? userRow.updated_at.toISOString() : userRow.updated_at,
    }

    const token = generateToken(user as any)

    // SECURITY: Reset rate limit on successful login
    rateLimiter.reset(identifier)

    const session: AuthSession = {
      user: user as any,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days to match JWT expiry
    }

    // Return token and set cookie so server-side `GET /api/auth/me` can read it
    // Serialize expiresAt as ISO string for JSON response
    const responseData = {
      ...session,
      expiresAt: session.expiresAt.toISOString()
    }
    const response = NextResponse.json({ success: true, data: responseData } as ApiResponse<any>)
    // set cookie for 7 days to match JWT expiry
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days to match JWT expiry
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
