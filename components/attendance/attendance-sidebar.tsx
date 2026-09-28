"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Clock, Calendar, LogOut, ChevronLeft, ArrowRightLeft, FileText } from "lucide-react"
import { useAuthContext } from "@/components/auth-provider"
import { useState } from "react"

interface MenuItem {
    href: string
    label: string
    icon: any
}

const menuItems: MenuItem[] = [
    { href: "/attendance", label: "Chấm Công", icon: Clock },
    { href: "/attendance/calendar", label: "Lịch Làm Việc", icon: Calendar },
    { href: "/attendance/shift-swaps", label: "Đổi Ca", icon: ArrowRightLeft },
    { href: "/attendance/forms", label: "Tạo Phiếu", icon: FileText },
]

export function AttendanceSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const auth = useAuthContext()
    const [isCollapsed, setIsCollapsed] = useState(false)

    const isItemActive = (item: MenuItem) => {
        if (item.href === "/attendance") return pathname === "/attendance"
        return pathname === item.href || pathname.startsWith(item.href + "/")
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
                    <Image
                        src="/logo.png"
                        alt="Express Cafe"
                        width={280}
                        height={120}
                        className="h-28 w-auto object-contain flex-1"
                        priority
                    />
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

            {/* User Info */}
            {!isCollapsed && auth.user && (
                <div className="px-4 py-3 border-b border-sidebar-border/30">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                        {auth.user.name || auth.user.email}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 mt-0.5">
                        Chấm Công
                    </p>
                </div>
            )}

            <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
                {menuItems.map((item) => {
                    const Icon = item.icon
                    const isActive = isItemActive(item)

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
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
