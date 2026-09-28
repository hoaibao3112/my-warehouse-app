"use client"

import { useState, useEffect, useCallback } from "react"
import { notification_type } from "@/lib/generated/prisma"
import { mobileFetch } from "@/lib/mobile/api-client"

export interface Notification {
  id: string
  user_id: string
  type: notification_type
  title: string
  message: string
  data: any
  redirect_url: string | null
  is_read: boolean
  created_at: Date
  read_at: Date | null
}

interface UseNotificationsListResult {
  notifications: Notification[]
  isLoading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (notificationId: string) => Promise<void>
  deleteAll: () => Promise<void>
  refresh: () => Promise<void>
}

export function useNotificationsList(): UseNotificationsListResult {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)

  const fetchNotifications = async (currentOffset: number = 0, append: boolean = false) => {
    try {
      setIsLoading(true)
      const response = await mobileFetch(
        `/api/notifications?limit=20&offset=${currentOffset}`
      )

      if (!response.ok) {
        throw new Error("Failed to fetch notifications")
      }

      const data = await response.json()

      if (append) {
        setNotifications((prev) => [...prev, ...(data.notifications || [])])
      } else {
        setNotifications(data.notifications || [])
      }

      setHasMore(data.hasMore || false)
    } catch (error) {
      console.error("Error fetching notifications:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMore = async () => {
    if (!hasMore || isLoading) return

    const newOffset = offset + 20
    setOffset(newOffset)
    await fetchNotifications(newOffset, true)
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await mobileFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      })

      if (!response.ok) {
        throw new Error("Failed to mark notification as read")
      }

      // Update local state
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === notificationId
            ? { ...notif, is_read: true, read_at: new Date() }
            : notif
        )
      )
    } catch (error) {
      console.error("Error marking notification as read:", error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await mobileFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      })

      if (!response.ok) {
        throw new Error("Failed to mark all notifications as read")
      }

      // Update local state
      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, is_read: true, read_at: new Date() }))
      )
    } catch (error) {
      console.error("Error marking all notifications as read:", error)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    try {
      const response = await mobileFetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      })

      if (!response.ok) {
        throw new Error("Failed to delete notification")
      }

      // Remove from local state
      setNotifications((prev) => prev.filter((notif) => notif.id !== notificationId))
    } catch (error) {
      console.error("Error deleting notification:", error)
    }
  }

  const deleteAll = async () => {
    try {
      const response = await mobileFetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      })

      if (!response.ok) {
        throw new Error("Failed to delete all notifications")
      }

      // Clear local state
      setNotifications([])
    } catch (error) {
      console.error("Error deleting all notifications:", error)
    }
  }

  const refresh = useCallback(async () => {
    setOffset(0)
    await fetchNotifications(0, false)
  }, [])

  // Initial load
  useEffect(() => {
    fetchNotifications(0, false)
  }, [])

  return {
    notifications,
    isLoading,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll,
    refresh,
  }
}

