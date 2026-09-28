import { NextRequest } from "next/server"
import { prisma } from "./prisma"
import { verifyToken } from "./auth"

/**
 * Get auth token from request - supports both cookie and Authorization header
 * This is used by API routes that need to get the raw token
 */
export const getAuthToken = (request: NextRequest): string | null => {
  // Try Authorization header first (for mobile apps using Bearer token)
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "")
  }

  // Try cookies (for web apps)
  const cookieToken = request.cookies.get("auth-token")?.value
  if (cookieToken) {
    // Decode URL-encoded token if needed
    try {
      if (cookieToken.includes('%')) {
        return decodeURIComponent(cookieToken)
      }
    } catch (e) {
      // Token is not URL-encoded, use as-is
    }
    return cookieToken
  }

  // Fallback: Try parsing from raw cookie header (legacy support)
  const cookieHeader = request.headers.get("cookie") || ""
  const match = cookieHeader.match(/auth-token=([^;]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch (e) {
      return match[1]
    }
  }

  return null
}

// API authentication - verifies token from request and returns user data
export const verifyAuth = async (request: NextRequest): Promise<any | null> => {
  try {
    // Get token from cookies or Authorization header
    const token = getAuthToken(request)

    if (!token) {
      return null
    }

    // Verify and decode the token
    const payload = verifyToken(token)
    if (!payload || !payload.id) {
      return null
    }

    // Get full user data from database
    const user = await prisma.users.findUnique({
      where: { id: payload.id }
    })

    if (!user) {
      return null
    }

    // For GENERAL_MANAGER or WAREHOUSE_MANAGER, fetch their assigned warehouses
    let warehouseIds: string[] | undefined = undefined
    if (user.role === 'GENERAL_MANAGER' || user.role === 'WAREHOUSE_MANAGER') {
      const assignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: user.id },
        select: { warehouse_id: true }
      })
      warehouseIds = assignments.map(a => a.warehouse_id)
    }

    // Transform to match User type (camelCase)
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      warehouseId: user.warehouse_id,
      warehouseIds, // Include for GENERAL_MANAGER
      isActive: user.is_active,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }
  } catch (error) {
    return null
  }
}
