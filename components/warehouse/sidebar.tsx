
"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, LayoutDashboard, Package, TrendingUp, LogOut, PackagePlus, ChevronLeft, Wrench, FileText, ClipboardList, Scale, PackageOpen, Users } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/components/auth-provider"
import { useState, useMemo } from "react"

interface SidebarProps {
    onNavigate?: () => void
}

interface MenuItem {
    href: string
    label: string
    icon: any
    requiredPermission?: string
    requiredRole?: 'ADMIN' | 'MANAGER'
}

interface MenuGroup {
    id: string
    label: string
    icon: any
    items: MenuItem[]
    requiredRole?: 'ADMIN' | 'MANAGER'
}

// Menu items for Main Warehouse (Kho Tổng)
// Based on permissions from old admin sidebar logic
const menuGroups: MenuGroup[] = [
    {
        id: "dashboard",
        label: "TỔNG QUAN",
        icon: LayoutDashboard,
        items: [
            { href: "/warehouse", label: "Bảng Điều Khiển", icon: LayoutDashboard },
        ]
    },
    {
        id: "warehouse-management",
        label: "QUẢN LÝ KHO",
        icon: Package,
        items: [
            { href: "/warehouse/products", label: "Sản Phẩm & Công Cụ", icon: Package, requiredPermission: "product_management" },
            { href: "/warehouse/inventory-intake", label: "Nhập Hàng", icon: PackagePlus, requiredPermission: "inventory_intake" },
            { href: "/warehouse/internal-transfers", label: "Xuất Hàng Nội Bộ", icon: TrendingUp, requiredPermission: "warehouse_transfer" },
            { href: "/warehouse/external-sales-exports", label: "Xuất Bán Hàng", icon: PackageOpen },


            { href: "/warehouse/units", label: "Quản Lý Đơn Vị", icon: Scale, requiredRole: 'MANAGER' },
        ]
    },
    {
        id: "reports",
        label: "BÁO CÁO",
        icon: FileText,
        items: [
            { href: "/warehouse/reports", label: "Báo Cáo", icon: FileText, requiredPermission: "reports" },
        ]
    },
]

export function WarehouseSidebar({ onNavigate }: SidebarProps = {}) {
    const pathname = usePathname()
    const router = useRouter()
    const auth = useAuthContext()
    const [isCollapsed, setIsCollapsed] = useState(false)

    // Manage open state for groups, specifically "warehouse-management" default open
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        "warehouse-management": true
    })

    const toggleGroup = (id: string) => {
        setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
    }

    // Check if menu item is visible based on role and permissions
    const isItemVisible = (item: MenuItem) => {
        const userRole = auth.user?.role

        // If requiredRole is specified, check if user has the role
        if (item.requiredRole) {
            // MANAGER and above (ADMIN) can see MANAGER items
            if (item.requiredRole === 'MANAGER') {
                return userRole === 'MANAGER' || userRole === 'ADMIN'
            }
            return userRole === item.requiredRole
        }

        // If requiredPermission is specified, check if user has the permission
        if (item.requiredPermission) {
            // MANAGER has all permissions by default (main warehouse manager)
            if (userRole === "MANAGER" || userRole === "ADMIN") {
                return true
            }

            // WAREHOUSE_STAFF needs explicit permission
            if (userRole === "WAREHOUSE_STAFF") {
                const userPerms = auth.user?.permissions
                if (!userPerms) return false

                let perms = userPerms
                if (typeof perms === 'string') {
                    try {
                        perms = JSON.parse(perms)
                    } catch {
                        return false
                    }
                }

                if (Array.isArray(perms)) {
                    return perms.includes(item.requiredPermission)
                }
                return false
            }
            return false
        }

        return true
    }

    // Check if group is visible (has at least one visible item)
    const isGroupVisible = (group: MenuGroup) => {
        const userRole = auth.user?.role

        if (group.requiredRole) {
            // MANAGER and above (ADMIN) can see MANAGER groups
            if (group.requiredRole === 'MANAGER') {
                return userRole === 'MANAGER' || userRole === 'ADMIN'
            }
            return userRole === group.requiredRole
        }

        return group.items.some(item => isItemVisible(item))
    }
    // Determine active item based on longest matching path
    const activeHref = useMemo(() => {
        let bestMatch = ""
        let maxLen = 0

        const isMatch = (itemHref: string, path: string) => {
            if (itemHref === "/warehouse") return path === "/warehouse"
            return path === itemHref || path.startsWith(itemHref + "/")
        }

        menuGroups.forEach(group => {
            group.items.forEach(item => {
                if (isMatch(item.href, pathname)) {
                    if (item.href.length > maxLen) {
                        maxLen = item.href.length
                        bestMatch = item.href
                    }
                }
            })
        })
        return bestMatch
    }, [pathname])

    const isItemActive = (item: MenuItem) => {
        return item.href === activeHref
    }

    return (
        <aside
            className={cn(
                "bg-gradient-to-b from-sidebar via-sidebar to-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ease-out h-full",
                isCollapsed ? "w-20" : "w-64"
            )}
        >
            <div className={cn(
                "flex items-center justify-between px-2 py-1 border-b border-sidebar-border/30 transition-all duration-300 flex-shrink-0",
                isCollapsed && "justify-center"
            )}>
                {!isCollapsed && (
                    <div className="flex items-center gap-2 px-2">
                        <Image
                            src="/logo.png"
                            alt="Express Cafe"
                            width={200}
                            height={80}
                            className="h-20 w-auto object-contain flex-1"
                            priority
                        />
                    </div>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn(
                        "hidden md:flex flex-shrink-0 p-1 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-300",
                        !isCollapsed && "ml-1"
                    )}
                    title={isCollapsed ? "Mở rộng" : "Thu gọn"}
                >
                    <ChevronLeft className={cn("w-5 h-5 transition-transform duration-300", isCollapsed && "rotate-180")} />
                </button>
            </div>

            <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
                {menuGroups.filter(isGroupVisible).map((group) => {
                    // Special handling for the large "Warehouse Management" group when NOT collapsed
                    if (!isCollapsed && group.id === "warehouse-management") {
                        const isOpen = openGroups[group.id] || false
                        const GroupIcon = group.icon

                        return (
                            <Collapsible
                                key={group.id}
                                open={isOpen}
                                onOpenChange={() => toggleGroup(group.id)}
                                className="space-y-1"
                            >
                                <CollapsibleTrigger asChild>
                                    <button
                                        className={cn(
                                            "flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all duration-200",
                                            "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <GroupIcon className="w-5 h-5" />
                                            <span className="font-medium text-sm">{group.label}</span>
                                        </div>
                                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-1 pl-4">
                                    {group.items.filter(isItemVisible).map((item) => {
                                        const Icon = item.icon
                                        const isActive = isItemActive(item)
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={onNavigate}
                                                className={cn(
                                                    "group relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 border-l-2",
                                                    isActive
                                                        ? "border-primary bg-sidebar-primary/10 text-primary font-medium"
                                                        : "border-transparent text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                                                )}
                                            >
                                                <Icon className="w-4 h-4 flex-shrink-0" />
                                                <span className="text-sm truncate">{item.label}</span>
                                            </Link>
                                        )
                                    })}
                                </CollapsibleContent>
                            </Collapsible>
                        )
                    }

                    // Default rendering for other groups or when collapsed (flat list)
                    return (
                        <div key={group.id} className="space-y-0.5">
                            {!isCollapsed && group.id !== 'dashboard' && group.id !== 'warehouse-management' && (
                                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{group.label}</div>
                            )}

                            {group.items.filter(isItemVisible).map((item) => {
                                const Icon = item.icon
                                const isActive = isItemActive(item)

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={onNavigate}
                                        className={cn(
                                            "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                                            isActive
                                                ? "bg-sidebar-primary/90 text-sidebar-primary-foreground shadow-md"
                                                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                                        )}
                                        title={isCollapsed ? item.label : undefined}
                                    >
                                        <Icon className="w-5 h-5 flex-shrink-0" />
                                        <span className={cn(
                                            "font-medium text-sm whitespace-nowrap transition-all duration-200 overflow-hidden",
                                            isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                                        )}>
                                            {item.label}
                                        </span>
                                    </Link>
                                )
                            })}
                        </div>
                    )
                })}
            </nav>

            <div className={cn(
                "p-3 border-t border-sidebar-border/30 transition-all duration-300 flex-shrink-0",
                isCollapsed && "px-2.5"
            )}>
                <button
                    onClick={async () => {
                        try {
                            await auth.logout()
                            router.push("/login")
                        } catch (err) {
                            console.error("Logout failed", err)
                        }
                    }}
                    className={cn(
                        "group relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sidebar-foreground/70 hover:text-sidebar-foreground transition-all duration-200",
                        "hover:bg-sidebar-accent/60"
                    )}
                    title={isCollapsed ? "Đăng Xuất" : undefined}
                >
                    <LogOut className="w-5 h-5 flex-shrink-0" />
                    <span className={cn(
                        "font-medium text-sm whitespace-nowrap transition-all duration-200 overflow-hidden",
                        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                    )}>
                        Đăng Xuất
                    </span>
                </button>
            </div>
        </aside>
    )
}
