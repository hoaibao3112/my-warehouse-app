"use client"

import { useEffect } from "react"
import { useNotifications } from "@/hooks/use-notifications"
import { useAuthContext } from "@/components/auth-provider"

/**
 * NotificationProvider - Initializes FCM push notifications
 * Must be inside AuthProvider to access user context
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext()

  // Initialize notifications when user is authenticated
  const { isMobile } = useNotifications({
    userId: user?.id,
    autoNavigate: true
  })

  useEffect(() => {
    if (user && isMobile) {
      console.log('[NotificationProvider] FCM initialized for user:', user.email)
    }
  }, [user, isMobile])

  return <>{children}</>
}
