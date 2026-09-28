"use client"

import React from "react"
import { useAuthContext } from "@/components/auth-provider"
import { usePageLoading } from "@/hooks/use-page-loading"
import { AttendanceSidebar } from "@/components/attendance/attendance-sidebar"
import { AttendanceHeader } from "@/components/attendance/attendance-header"
import { SwipeableSidebar } from "@/components/mobile/swipeable-sidebar"

const REDIRECT_KEY = 'attendance_redirect_count'
const MAX_REDIRECTS = 3

export function AttendanceLayoutWrapper({ children }: { children: React.ReactNode }) {
    const auth = useAuthContext()
    const isNavigating = usePageLoading()
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false)
    const [isMounted, setIsMounted] = React.useState(false)
    const [redirectBlocked, setRedirectBlocked] = React.useState(false)

    React.useEffect(() => {
        setIsMounted(true)
        if (auth.user) {
            try { sessionStorage.removeItem(REDIRECT_KEY) } catch { }
        }
    }, [auth.user])

    React.useEffect(() => {
        if (isMounted && !auth.loading && !auth.user && !redirectBlocked) {
            let redirectCount = 0
            try {
                redirectCount = parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0', 10)
            } catch { }

            if (redirectCount >= MAX_REDIRECTS) {
                console.warn('[AttendanceLayoutWrapper] Too many redirects, blocking')
                setRedirectBlocked(true)
                try {
                    sessionStorage.removeItem(REDIRECT_KEY)
                    document.cookie = 'auth-token=; Max-Age=0; path=/;'
                } catch { }
                return
            }

            try {
                sessionStorage.setItem(REDIRECT_KEY, String(redirectCount + 1))
            } catch { }

            console.log('[AttendanceLayoutWrapper] No user, redirecting to login')
            window.location.href = '/login'
        }
    }, [isMounted, auth.loading, auth.user, redirectBlocked])

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
                <AttendanceSidebar />
            </div>
            <SwipeableSidebar
                open={isMobileSidebarOpen}
                onOpenChange={setIsMobileSidebarOpen}
                SidebarComponent={AttendanceSidebar}
            />
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <AttendanceHeader onOpenMobileMenu={() => setIsMobileSidebarOpen(true)} />
                <main className="flex-1 overflow-auto min-h-0">{children}</main>
            </div>
        </div>
    )
}
