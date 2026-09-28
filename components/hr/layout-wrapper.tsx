"use client"

import React from "react"
import { useAuthContext } from "@/components/auth-provider"
import { usePageLoading } from "@/hooks/use-page-loading"
import { HRSidebar } from "@/components/hr/sidebar"
import { HRHeader } from "@/components/hr/header"
import { HRSwipeableSidebar } from "@/components/hr/swipeable-sidebar"
import { useAutoApproveShifts } from "@/hooks/useAutoApproveShifts"

const REDIRECT_KEY = 'hr_redirect_count'
const MAX_REDIRECTS = 3

export function HRLayoutWrapper({ children }: { children: React.ReactNode }) {
  const auth = useAuthContext()
  useAutoApproveShifts()
  const isNavigating = usePageLoading()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)
  const [redirectBlocked, setRedirectBlocked] = React.useState(false)

  // Ensure hydration by only showing loading on client after mount
  React.useEffect(() => {
    setIsMounted(true)
    // Clear redirect count on successful mount with user
    if (auth.user) {
      try { sessionStorage.removeItem(REDIRECT_KEY) } catch { }
    }
  }, [auth.user])

  // Client-side auth check - redirect to login if no user after loading completes
  React.useEffect(() => {
    if (isMounted && !auth.loading && !auth.user && !redirectBlocked) {
      // Rate limit redirects to prevent infinite loop
      let redirectCount = 0
      try {
        redirectCount = parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0', 10)
      } catch { }

      if (redirectCount >= MAX_REDIRECTS) {
        console.warn('[HRLayoutWrapper] Too many redirects, blocking further redirects')
        setRedirectBlocked(true)
        // Clear any stuck auth state
        try {
          sessionStorage.removeItem(REDIRECT_KEY)
          document.cookie = 'auth-token=; Max-Age=0; path=/;'
        } catch { }
        return
      }

      try {
        sessionStorage.setItem(REDIRECT_KEY, String(redirectCount + 1))
      } catch { }

      console.log('[HRLayoutWrapper] No user after auth loaded, redirecting to login (attempt:', redirectCount + 1, ')')
      window.location.href = '/login'
    }
  }, [isMounted, auth.loading, auth.user, redirectBlocked])

  // Show loading screen while auth is being loaded or during navigation
  if (!isMounted || auth.loading || isNavigating) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Đang tải...</h2>
          <p className="text-sm text-muted-foreground">Vui lòng chờ trong giây lát</p>
        </div>
      </div>
    )
  }

  // Show error if redirect was blocked due to too many attempts
  if (redirectBlocked) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4 max-w-md p-6">
          <h2 className="text-xl font-semibold text-destructive">Lỗi đăng nhập</h2>
          <p className="text-muted-foreground">Có vấn đề với phiên đăng nhập. Vui lòng đăng nhập lại.</p>
          <button
            onClick={() => {
              try { sessionStorage.removeItem(REDIRECT_KEY) } catch { }
              window.location.href = '/login'
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Đăng nhập lại
          </button>
        </div>
      </div>
    )
  }

  // Show loading while waiting for redirect (no user case)
  if (!auth.user) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Đang chuyển hướng...</h2>
        </div>
      </div>
    )
  }

  // Render the layout after auth is fully loaded and user exists
  return (
    <div
      className="flex bg-background"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="hidden md:block">
        <HRSidebar />
      </div>
      <HRSwipeableSidebar
        open={isMobileSidebarOpen}
        onOpenChange={setIsMobileSidebarOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <HRHeader onOpenMobileMenu={() => setIsMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-auto min-h-0">{children}</main>
      </div>
    </div>
  )
}
