"use client"

import { useState, useEffect, useCallback, useSyncExternalStore } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"

interface UseNotificationCountResult {
  unreadCount: number
  refresh: () => Promise<void>
  increment: () => void
  decrement: () => void
  isLoading: boolean
}

// Custom event names for notification count updates
const NOTIFICATION_COUNT_INCREMENT = "notification-count-increment"
const NOTIFICATION_COUNT_DECREMENT = "notification-count-decrement"
const NOTIFICATION_COUNT_REFRESH = "notification-count-refresh"
const NOTIFICATION_COUNT_UPDATED = "notification-count-updated"

// Global singleton state to avoid multiple API calls
let globalCount = 0
let globalIsLoading = false
let hasFetched = false
let isFetching = false

// Subscribers for state updates
const subscribers = new Set<() => void>()

function subscribe(callback: () => void) {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

function notifySubscribers() {
  subscribers.forEach((callback) => callback())
}

function getSnapshot() {
  return { count: globalCount, isLoading: globalIsLoading }
}

function getServerSnapshot() {
  return { count: 0, isLoading: false }
}

async function fetchUnreadCountGlobal() {
  // Prevent concurrent requests
  if (isFetching) return

  try {
    isFetching = true
    globalIsLoading = true
    notifySubscribers()

    const response = await mobileFetch("/api/notifications/unread-count")

    if (!response.ok) {
      throw new Error("Failed to fetch unread count")
    }

    const data = await response.json()
    globalCount = data.count || 0
    hasFetched = true
  } catch (error) {
    console.error("Error fetching unread count:", error)
  } finally {
    globalIsLoading = false
    isFetching = false
    notifySubscribers()
  }
}

/**
 * Increment notification count globally (call when FCM received)
 */
export function incrementNotificationCount() {
  globalCount = globalCount + 1
  notifySubscribers()
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_INCREMENT))
  }
}

/**
 * Decrement notification count globally (call when notification read)
 */
export function decrementNotificationCount() {
  globalCount = Math.max(0, globalCount - 1)
  notifySubscribers()
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_DECREMENT))
  }
}

/**
 * Refresh notification count from server (call when needed)
 */
export function refreshNotificationCount() {
  fetchUnreadCountGlobal()
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_REFRESH))
  }
}

export function useNotificationCount(): UseNotificationCountResult {
  // Use state that syncs with global singleton
  const [state, setState] = useState(() => getSnapshot())

  // Sync with global state
  useEffect(() => {
    const handleUpdate = () => {
      setState(getSnapshot())
    }
    subscribers.add(handleUpdate)
    return () => {
      subscribers.delete(handleUpdate)
    }
  }, [])

  // Initial fetch - only once globally
  useEffect(() => {
    if (!hasFetched && !isFetching) {
      fetchUnreadCountGlobal()
    }

    // Fetch when app becomes visible (after being in background) - with debounce
    let lastVisibilityFetch = 0
    const handleVisibilityChange = () => {
      const now = Date.now()
      // Only fetch if visible and last fetch was more than 30 seconds ago
      if (document.visibilityState === "visible" && now - lastVisibilityFetch > 30000) {
        lastVisibilityFetch = now
        fetchUnreadCountGlobal()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  const refresh = useCallback(async () => {
    await fetchUnreadCountGlobal()
  }, [])

  const increment = useCallback(() => {
    incrementNotificationCount()
  }, [])

  const decrement = useCallback(() => {
    decrementNotificationCount()
  }, [])

  return {
    unreadCount: state.count,
    refresh,
    increment,
    decrement,
    isLoading: state.isLoading,
  }
}
