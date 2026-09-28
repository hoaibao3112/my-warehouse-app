import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth-server"
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "@/lib/notification-service"

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 * Query params: limit, offset, unreadOnly
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = parseInt(searchParams.get("offset") || "0")
    const unreadOnly = searchParams.get("unreadOnly") === "true"

    const notifications = await getNotifications(user.id, {
      limit,
      offset,
      unreadOnly,
    })

    console.log(`[GET /api/notifications] Fetched ${notifications.length} notifications for user ${user.id} (offset=${offset}, limit=${limit})`)

    return NextResponse.json({
      notifications,
      hasMore: notifications.length === limit,
    })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notifications
 * Mark notification(s) as read
 * Body: { notificationId?: string, markAll?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { notificationId, markAll } = body

    if (markAll) {
      await markAllAsRead(user.id)
      return NextResponse.json({ success: true, message: "All notifications marked as read" })
    }

    if (notificationId) {
      await markAsRead(notificationId, user.id)
      return NextResponse.json({ success: true, message: "Notification marked as read" })
    }

    return NextResponse.json(
      { error: "Either notificationId or markAll must be provided" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Error marking notifications as read:", error)
    return NextResponse.json(
      { error: "Failed to mark notifications as read" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/notifications
 * Delete notification(s)
 * Body: { notificationId?: string, deleteAll?: boolean }
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { notificationId, deleteAll } = body

    if (deleteAll) {
      await deleteAllNotifications(user.id)
      return NextResponse.json({ success: true, message: "All notifications deleted" })
    }

    if (notificationId) {
      await deleteNotification(notificationId, user.id)
      return NextResponse.json({ success: true, message: "Notification deleted" })
    }

    return NextResponse.json(
      { error: "Either notificationId or deleteAll must be provided" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Error deleting notifications:", error)
    return NextResponse.json(
      { error: "Failed to delete notifications" },
      { status: 500 }
    )
  }
}
