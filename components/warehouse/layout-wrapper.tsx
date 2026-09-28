"use client"

import React from "react"
import { useAuthContext } from "@/components/auth-provider"
import { usePageLoading } from "@/hooks/use-page-loading"
import { WarehouseSidebar } from "@/components/warehouse/sidebar"
import { WarehouseHeader } from "@/components/warehouse/header"
import { WarehouseSwipeableSidebar } from "@/components/warehouse/swipeable-sidebar"
import { useAutoApproveShifts } from "@/hooks/useAutoApproveShifts"
import { mobileFetch } from "@/lib/mobile/api-client"

const REDIRECT_KEY = 'warehouse_redirect_count'
const MAX_REDIRECTS = 3

// Roles allowed to access /warehouse (Main Warehouse)
// - MANAGER (Main warehouse manager)
// - WAREHOUSE_STAFF (Main warehouse staff)
const ALLOWED_ROLES = ['MANAGER', 'WAREHOUSE_STAFF']

export function WarehouseLayoutWrapper({ children }: { children: React.ReactNode }) {
    const auth = useAuthContext()
    useAutoApproveShifts()
    const isNavigating = usePageLoading()
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false)
    const [isMounted, setIsMounted] = React.useState(false)
    const [redirectBlocked, setRedirectBlocked] = React.useState(false)
    const [warehouseType, setWarehouseType] = React.useState<string | null>(null)
    const [checkingWarehouse, setCheckingWarehouse] = React.useState(true)

    React.useEffect(() => {
        setIsMounted(true)
        if (auth.user) {
            try { sessionStorage.removeItem(REDIRECT_KEY) } catch { }
        }
    }, [auth.user])

    // Fetch warehouse type to verify it's MAIN warehouse
    React.useEffect(() => {
        const fetchWarehouseType = async () => {
            if (!auth.user || !auth.user.warehouseId) {
                setCheckingWarehouse(false)
                return
            }

            try {
                const response = await mobileFetch(`/api/warehouses/${auth.user.warehouseId}`)
                const data = await response.json()
                if (data.data?.type) {
                    setWarehouseType(data.data.type)
                }
            } catch (err) {
                console.error('[WarehouseLayoutWrapper] Failed to fetch warehouse type:', err)
            } finally {
                setCheckingWarehouse(false)
            }
        }

        if (auth.user && !auth.loading) {
            fetchWarehouseType()
        }
    }, [auth.user, auth.loading])

    // Client-side auth + role check + warehouse type check
    React.useEffect(() => {
        if (isMounted && !auth.loading && !redirectBlocked && !checkingWarehouse) {
            // No user - redirect to login
            if (!auth.user) {
                let redirectCount = 0
                try {
                    redirectCount = parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0', 10)
                } catch { }

                if (redirectCount >= MAX_REDIRECTS) {
                    console.warn('[WarehouseLayoutWrapper] Too many redirects, blocking')
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

                console.log('[WarehouseLayoutWrapper] No user, redirecting to login')
                window.location.href = '/login'
                return
            }

            const userRole = auth.user.role

            // Check role - only MANAGER and WAREHOUSE_STAFF allowed
            if (!ALLOWED_ROLES.includes(userRole || '')) {
                console.log('[WarehouseLayoutWrapper] User role not allowed:', userRole)
                // Redirect based on role
                if (userRole === 'ADMIN') {
                    // ADMIN should use /admin
                    window.location.href = '/admin'
                } else if (userRole === 'WAREHOUSE_MANAGER' || userRole === 'STAFF') {
                    // Branch warehouse roles go to /store
                    window.location.href = '/store'
                } else if (userRole === 'HR') {
                    window.location.href = '/hr'
                } else {
                    window.location.href = '/login'
                }
                return
            }

            // For MANAGER and WAREHOUSE_STAFF role, verify warehouse type is MAIN
            if (userRole === 'MANAGER' || userRole === 'WAREHOUSE_STAFF') {
                if (warehouseType && warehouseType !== 'MAIN') {
                    console.log(`[WarehouseLayoutWrapper] ${userRole} has non-MAIN warehouse, redirecting to /store`)
                    window.location.href = '/store'
                    return
                }
            }
        }
    }, [isMounted, auth.loading, auth.user, redirectBlocked, checkingWarehouse, warehouseType])

    // Show loading while checking auth or warehouse type
    if (!isMounted || auth.loading || isNavigating || checkingWarehouse) {
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
                <WarehouseSidebar />
            </div>
            <WarehouseSwipeableSidebar
                open={isMobileSidebarOpen}
                onOpenChange={setIsMobileSidebarOpen}
            />
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <WarehouseHeader onOpenMobileMenu={() => setIsMobileSidebarOpen(true)} />
                <main className="flex-1 overflow-auto min-h-0">{children}</main>
            </div>
        </div>
    )
}
