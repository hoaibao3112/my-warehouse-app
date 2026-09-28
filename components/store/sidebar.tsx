"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Package, TrendingUp, FileText, AlertCircle, LogOut,
  ShoppingCart, Receipt, Users, PackagePlus, Clock, ChevronLeft,
  Wrench, CalendarCheck, ChevronDown,
  BarChart3, History, ClipboardCheck, ArrowRightLeft, Repeat,
  Ruler, ChefHat, FolderOpen, Truck
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/components/auth-provider"
import { hasPermission, isWarehouseManager, isAdmin, isGeneralManager, isHR } from "@/lib/auth-helpers"
import { useState, useEffect, useMemo } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"

interface MenuItem {
  href: string
  label: string | ((warehouseType?: string) => string)
  icon: any
  requiredPermission?: string
  managerOnly?: boolean
  adminOnly?: boolean
  adminOrGMOnly?: boolean
  hideForAdminOrGM?: boolean
}

interface MenuGroup {
  id: string
  label: string
  icon: any
  items: MenuItem[]
  managerOnly?: boolean
  adminOrGMOnly?: boolean
}

// Menu items organized by groups
const menuGroups: MenuGroup[] = [
  {
    id: "dashboard",
    label: "Tổng Quan",
    icon: LayoutDashboard,
    items: [
      { href: "/store", label: "Bảng Điều Khiển", icon: LayoutDashboard },
    ]
  },
  {
    id: "staff-management",
    label: "Nhân Sự",
    icon: Users,
    managerOnly: true, // Only managers see this group
    items: [
      { href: "/store/users", label: "Quản Lý Nhân Viên", icon: Users, managerOnly: true },
      { href: "/store/shifts/calendar", label: "Lịch Xếp Ca", icon: Clock, managerOnly: true },
      { href: "/store/shifts/swap-approval", label: "Duyệt Đổi Ca", icon: ArrowRightLeft, managerOnly: true },
      { href: "/store/shifts/leave-approval", label: "Duyệt Nghỉ Phép", icon: CalendarCheck, managerOnly: true },
      { href: "/store/shifts/sales-history", label: "Lịch Sử Ca", icon: History, managerOnly: true },
    ]
  },
  {
    id: "sales",
    label: "Bán Hàng",
    icon: ShoppingCart,
    items: [
      { href: "/store/sales", label: "Bán Hàng", icon: ShoppingCart, requiredPermission: "sales", hideForAdminOrGM: true },
      { href: "/store/shifts/my-shift", label: "Ca Bán Hàng", icon: FileText, requiredPermission: "sales" },
      { href: "/store/invoices", label: "Quản Lý Hóa Đơn", icon: Receipt, managerOnly: true },
    ]
  },
  {
    id: "inventory",
    label: "Kho Hàng",
    icon: Package,
    items: [
      { href: "/store/inventory", label: "Hàng & Công Cụ Tồn Kho", icon: Package },
      { href: "/store/categories", label: "Danh Mục", icon: FolderOpen },
      { href: "/store/units", label: "Đơn Vị & Quy Đổi", icon: Ruler },
      { href: "/store/recipes", label: "Sản Phẩm Chế Biến", icon: ChefHat },
      { href: "/store/loss-reports", label: "Báo Cáo Mất Hàng", icon: AlertCircle, requiredPermission: "sales" },
    ]
  },
  {
    id: "transfers",
    label: "Nhập/Xuất Hàng",
    icon: TrendingUp,
    items: [
      { href: "/store/suppliers", label: "Nhà Cung Cấp", icon: Truck, requiredPermission: "purchase_requests" },
      { href: "/store/inventory-intake", label: "Nhập Hàng", icon: PackagePlus, requiredPermission: "purchase_requests" },
      { href: "/store/internal-transfers", label: "Nhập Hàng Nội Bộ", icon: Repeat, requiredPermission: "purchase_requests" },
    ]
  },
  {
    id: "reports",
    label: "Báo Cáo",
    icon: BarChart3,
    items: [
      { href: "/store/reports", label: "Kiểm Kê", icon: ClipboardCheck, requiredPermission: "reports" },
      { href: "/store/reports/sales", label: "Báo Cáo Doanh Thu", icon: FileText, managerOnly: true },
    ]
  },
]

export function StoreSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const auth = useAuthContext()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [warehouseType, setWarehouseType] = useState<string>()
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  // Determine active item based on longest matching path
  const activeHref = useMemo(() => {
    let bestMatch = ""
    let maxLen = 0

    const isMatch = (itemHref: string, path: string) => {
      if (itemHref === "/store") return path === "/store"
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

  // Initialize expanded groups based on active item
  useEffect(() => {
    const activeGroup = menuGroups.find(group =>
      group.items.some(item => item.href === activeHref)
    )
    if (activeGroup && !expandedGroups.includes(activeGroup.id)) {
      setExpandedGroups(prev => [...prev, activeGroup.id])
    }
  }, [activeHref])

  // Fetch warehouse type for current user
  useEffect(() => {
    if ((auth.user?.role === "WAREHOUSE_MANAGER" || auth.user?.role === "STAFF" || auth.user?.role === "ATTENDANCE_STAFF") && auth.user?.warehouseId) {
      mobileFetch(`/api/warehouses/${auth.user.warehouseId}`)
        .then(res => res.json())
        .then(data => {
          if (data.data?.type) {
            setWarehouseType(data.data.type)
          }
        })
        .catch(err => console.error('Failed to fetch warehouse type:', err))
    }
  }, [auth.user?.role, auth.user?.warehouseId])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  // Check if menu item is visible
  const isItemVisible = (item: MenuItem) => {
    const isManagerRole = isWarehouseManager(auth.user) || isAdmin(auth.user) || isGeneralManager(auth.user) || isHR(auth.user)

    if (item.managerOnly && !isManagerRole) return false
    if (item.adminOnly && !(auth.user?.role === 'ADMIN')) return false
    if (item.adminOrGMOnly && !(isAdmin(auth.user) || isGeneralManager(auth.user))) return false
    if (item.hideForAdminOrGM && (isAdmin(auth.user) || isGeneralManager(auth.user))) return false
    if (item.requiredPermission && !hasPermission(auth.user, item.requiredPermission)) return false

    // Hide Dashboard for STAFF roles as they are redirected to specific functions
    if (item.href === "/store" && (auth.user?.role === "STAFF" || auth.user?.role === "WAREHOUSE_STAFF" || auth.user?.role === "ATTENDANCE_STAFF")) {
      return false
    }

    // Special Rule: Inventory for Internal Stores is visible ONLY to TQL (General Manager) and Admin
    // Store Managers and Employee cannot see full inventory list anymore.
    if (item.href === '/store/inventory' && warehouseType !== 'PARTNER') {
      if (!(isAdmin(auth.user) || isGeneralManager(auth.user))) {
        return false
      }
    }

    // Hide specific functions for PARTNER warehouses
    if (warehouseType === 'PARTNER') {
      const hiddenForPartner = [
        '/store/internal-transfers', // No internal transfers from Main
        '/store/loss-reports',       // No loss reporting to Admin
      ]
      if (hiddenForPartner.includes(item.href)) return false
    }

    // Items specific to Partner Warehouses (Franchise)
    // Internal Stores inherit these from Main, so they shouldn't manage them locally.
    const partnerOnlyItems = [
      '/store/categories',
      '/store/units',
      '/store/recipes',
      '/store/suppliers',
      '/store/inventory-intake',
    ]
    if (partnerOnlyItems.includes(item.href) && warehouseType !== 'PARTNER') {
      return false
    }

    // STAFF users now have full access to all features (sales, inventory, etc.)
    // No need to hide anything from STAFF

    return true
  }

  // Check if group is visible (has at least one visible item)
  const isGroupVisible = (group: MenuGroup) => {
    if (auth.loginMode === 'reports') {
      const reportGroupIds = ['dashboard', 'reports']
      if (!reportGroupIds.includes(group.id)) return false
    }

    return group.items.some(item => isItemVisible(item))
  }

  // Check if item is active based on activeHref
  const isItemActive = (item: MenuItem) => {
    return item.href === activeHref
  }

  // Check if group has active item
  const hasActiveItem = (group: MenuGroup) => {
    return group.items.some(item => isItemActive(item))
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

      <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
        {menuGroups.filter(isGroupVisible).map((group) => {
          const GroupIcon = group.icon
          const isExpanded = expandedGroups.includes(group.id)
          const hasActive = hasActiveItem(group)
          const visibleItems = group.items.filter(isItemVisible)

          // If only one item in group, show it directly without dropdown
          if (visibleItems.length === 1) {
            const item = visibleItems[0]
            const Icon = item.icon
            const isActive = isItemActive(item)
            const itemLabel = typeof item.label === 'function' ? item.label(warehouseType) : item.label

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
                title={isCollapsed ? itemLabel : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn(
                  "font-medium text-sm whitespace-nowrap transition-all duration-200 overflow-hidden",
                  isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                )}>
                  {itemLabel}
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
                    {visibleItems.map((item) => {
                      const Icon = item.icon
                      const isActive = isItemActive(item)
                      const itemLabel = typeof item.label === 'function' ? item.label(warehouseType) : item.label

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
                            {itemLabel}
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
              sessionStorage.removeItem("selectedWarehouseId") // Clear persisted preference
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
