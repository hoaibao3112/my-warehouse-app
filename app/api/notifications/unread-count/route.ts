import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import { getUnreadCount } from "@/lib/notification-service"

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const count = await getUnreadCount(user.id)

    return NextResponse.json({ count })
  } catch (error) {
    console.error("Error fetching unread count:", error)
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 }
    )
  }
}
