"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, Clock, Calendar, FileText,
  Settings, LogOut, ChevronLeft, ChevronDown, UserCheck, ArrowRightLeft, CalendarDays, DollarSign
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/components/auth-provider"
import { useState, useEffect } from "react"

interface MenuItem {
  href: string
  label: string
  icon: any
}

interface MenuGroup {
  id: string
  label: string
  icon: any
  items: MenuItem[]
}

// HR menu items
const menuGroups: MenuGroup[] = [
  {
    id: "dashboard",
    label: "Tổng Quan",
    icon: LayoutDashboard,
    items: [
      { href: "/hr", label: "Bảng Điều Khiển", icon: LayoutDashboard },
    ]
  },
  {
    id: "employees",
    label: "Nhân Viên",
    icon: Users,
    items: [
      { href: "/hr/employees", label: "Quản Lý Nhân Viên", icon: Users },
    ]
  },
  {
    id: "attendance",
    label: "Chấm Công",
    icon: Clock,
    items: [
      { href: "/hr/shifts", label: "Xếp Ca Làm Việc", icon: CalendarDays },
      { href: "/hr/attendance", label: "Báo Cáo Chấm Công", icon: FileText },
      { href: "/hr/shift-swaps", label: "Quản Lý Đổi Ca", icon: ArrowRightLeft },
    ]
  },
  {
    id: "approval",
    label: "Duyệt Phiếu",
    icon: UserCheck,
    items: [
      { href: "/hr/leave-requests", label: "Duyệt Nghỉ Phép", icon: Calendar },
      { href: "/hr/salary-advance", label: "Duyệt Ứng Lương", icon: DollarSign },
    ]
  },
]

export function HRSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const auth = useAuthContext()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  // Initialize expanded groups based on current path
  useEffect(() => {
    const currentGroup = menuGroups.find(group =>
      group.items.some(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    )
    if (currentGroup && !expandedGroups.includes(currentGroup.id)) {
      setExpandedGroups(prev => [...prev, currentGroup.id])
    }
  }, [pathname])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  // Check if item is active
  const isItemActive = (item: MenuItem) => {
    if (item.href === "/hr") return pathname === "/hr"
    return pathname === item.href || pathname.startsWith(item.href + "/")
  }

  // Check if group has active item
  const hasActiveItem = (group: MenuGroup) => {
    return group.items.some(item => isItemActive(item))
  }

  return (
    <aside className={cn(
      "bg-gradient-to-b from-sidebar via-sidebar to-sidebar border-r border-sidebar-border flex flex-col h-full transition-all duration-300 ease-out",
      isCollapsed ? "w-20" : "w-64"
    )}>
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

      <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
        {menuGroups.map((group) => {
          const GroupIcon = group.icon
          const isExpanded = expandedGroups.includes(group.id)
          const hasActive = hasActiveItem(group)

          // If only one item in group, show it directly without dropdown
          if (group.items.length === 1) {
            const item = group.items[0]
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
          }

          return (
            <div key={group.id} className="space-y-0.5">
              {/* Group Header */}
              <button
                onClick={() => !isCollapsed && toggleGroup(group.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  hasActive
                    ? "bg-sidebar-accent/80 text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                )}
                title={isCollapsed ? group.label : undefined}
              >
                <GroupIcon className="w-5 h-5 flex-shrink-0" />
                <span className={cn(
                  "flex-1 font-medium text-sm whitespace-nowrap text-left transition-all duration-200 overflow-hidden",
                  isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                )}>
                  {group.label}
                </span>
                {!isCollapsed && (
                  <ChevronDown className={cn(
                    "w-4 h-4 flex-shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-180"
                  )} />
                )}
              </button>

              {/* Group Items */}
              {!isCollapsed && (
                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                )}>
                  <div className="pl-4 space-y-0.5 pt-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = isItemActive(item)

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "group relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                            isActive
                              ? "bg-sidebar-primary/90 text-sidebar-primary-foreground shadow-sm"
                              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                          )}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium text-sm whitespace-nowrap">
                            {item.label}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
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
