import { PrismaClient } from "./generated/prisma"
import { notification_type } from "./generated/prisma"

const prisma = new PrismaClient()

export interface CreateNotificationParams {
  userId: string | string[]
  type: notification_type
  title: string
  message: string
  redirectUrl?: string
  data?: Record<string, any>
}

export interface GetNotificationsParams {
  limit?: number
  offset?: number
  unreadOnly?: boolean
}

/**
 * Create one or more notifications for users
 */
export async function createNotification(params: CreateNotificationParams) {
  const { userId, type, title, message, redirectUrl, data } = params

  // Support both single user and multiple users
  const userIds = Array.isArray(userId) ? userId : [userId]

  // Create notifications for all users
  const notifications = await prisma.notifications.createMany({
    data: userIds.map((uid) => ({
      user_id: uid,
      type,
      title,
      message,
      redirect_url: redirectUrl,
      data: data ? JSON.parse(JSON.stringify(data)) : undefined,
    })),
  })

  return notifications
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId: string) {
  return prisma.notifications.findMany({
    where: {
      user_id: userId,
      is_read: false,
    },
    orderBy: {
      created_at: "desc",
    },
  })
}

/**
 * Get notifications for a user with pagination
 */
export async function getNotifications(
  userId: string,
  params: GetNotificationsParams = {}
) {
  const { limit = 20, offset = 0, unreadOnly = false } = params

  return prisma.notifications.findMany({
    where: {
      user_id: userId,
      ...(unreadOnly ? { is_read: false } : {}),
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
    skip: offset,
  })
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notifications.updateMany({
    where: {
      id: notificationId,
      user_id: userId, // Security: ensure user owns the notification
    },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  })
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string) {
  return prisma.notifications.updateMany({
    where: {
      user_id: userId,
      is_read: false,
    },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  })
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, userId: string) {
  return prisma.notifications.deleteMany({
    where: {
      id: notificationId,
      user_id: userId, // Security: ensure user owns the notification
    },
  })
}

/**
 * Delete all notifications for a user
 */
export async function deleteAllNotifications(userId: string) {
  return prisma.notifications.deleteMany({
    where: {
      user_id: userId,
    },
  })
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notifications.count({
    where: {
      user_id: userId,
      is_read: false,
    },
  })
}
