"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Package, Warehouse, Users, FileText, TrendingUp,
  Settings, LogOut, Layers, UtensilsCrossed, Truck, Gift, ChefHat,
  ChevronLeft, Wrench, Clock, ClipboardCheck, ChevronDown, BarChart3,
  PackagePlus, Navigation, Printer, Bell, UserCheck, DollarSign, Calendar, Repeat,
  PackageOpen
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/components/auth-provider"
import { useState, useEffect, useMemo } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"

interface SidebarProps {
  onNavigate?: () => void
}

interface MenuItem {
  href: string
  label: string | ((warehouseType?: string) => string)
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

// Menu items organized by groups
const menuGroups: MenuGroup[] = [
  {
    id: "dashboard",
    label: "Tổng Quan",
    icon: LayoutDashboard,
    items: [
      { href: "/admin", label: "Bảng Điều Khiển", icon: LayoutDashboard },
    ]
  },
  {
    id: "warehouse-users",
    label: "Kho & Người Dùng",
    icon: Warehouse,
    requiredRole: 'ADMIN',
    items: [
      { href: "/admin/warehouses", label: "Kho Hàng & Người Dùng", icon: Warehouse, requiredRole: 'ADMIN' },
      { href: "/admin/suppliers", label: "Nhà Cung Cấp", icon: TrendingUp, requiredRole: 'ADMIN' },
    ]
  },
  {
    id: "products-units",
    label: "Sản Phẩm & Đơn Vị",
    icon: Package,
    requiredRole: 'ADMIN',
    items: [
      { href: "/admin/product-categories", label: "Danh Mục Sản Phẩm", icon: Layers, requiredRole: 'ADMIN' },
      { href: "/admin/product-recipes", label: "Sản Phẩm Chế Biến", icon: ChefHat, requiredRole: 'ADMIN' },
      { href: "/admin/units", label: "Đơn Vị & Quy Đổi", icon: PackagePlus, requiredRole: 'ADMIN' },
    ]
  },
  {
    id: "external-sales",
    label: "Xuất Bán Hàng",
    icon: PackageOpen,
    items: [
      { href: "/warehouse/external-customers", label: "Khách Hàng Ngoài", icon: Users },
      { href: "/warehouse/external-sales-exports", label: "Phiếu Xuất Bán", icon: PackageOpen },
    ]
  },
  {
    id: "promotions",
    label: "Khuyến Mãi",
    icon: Gift,
    items: [
      { href: "/admin/vouchers", label: "Voucher & Khuyến Mãi", icon: Gift, requiredPermission: "promotion_management" },
    ]
  },
  {
    id: "transfer-management",
    label: "Quản Lý Nhập/Xuất",
    icon: Repeat,
    requiredRole: 'ADMIN',
    items: [
      { href: "/admin/internal-transfers", label: "Phiếu Nhập Hàng Nội Bộ", icon: Repeat, requiredRole: "ADMIN" },
      { href: "/admin/inventory-intake", label: "Phiếu Nhập Hàng NCC", icon: PackagePlus, requiredRole: "ADMIN" },
    ]
  },
  {
    id: "reports",
    label: "Báo Cáo",
    icon: BarChart3,
    items: [
      { href: "/admin/reports", label: "Báo Cáo Doanh Thu", icon: FileText, requiredPermission: "reports" },
      { href: "/admin/reports/inventory-checks", label: "Kiểm Kê Tất Cả Kho", icon: ClipboardCheck, requiredRole: "ADMIN" },
    ]
  },
  {
    id: "hr-management",
    label: "Quản Lý Nhân Sự",
    icon: Users,
    requiredRole: 'ADMIN',
    items: [
      { href: "/admin/hr/employees", label: "Danh Sách Nhân Viên", icon: Users, requiredRole: 'ADMIN' },
      { href: "/admin/hr/attendance", label: "Chấm Công", icon: ClipboardCheck, requiredRole: 'ADMIN' },
    ]
  },
  {
    id: "approval",
    label: "Duyệt Phiếu",
    icon: UserCheck,
    requiredRole: 'ADMIN',
    items: [
      { href: "/admin/hr/leave-requests", label: "Duyệt Nghỉ Phép", icon: Calendar, requiredRole: 'ADMIN' },
      { href: "/admin/hr/salary-advance", label: "Duyệt Ứng Lương", icon: DollarSign, requiredRole: 'ADMIN' },
    ]
  },
  {
    id: "settings",
    label: "Cài Đặt",
    icon: Settings,
    requiredRole: 'ADMIN',
    items: [
      { href: "/admin/settings", label: "Cài Đặt Hệ Thống", icon: Settings, requiredRole: 'ADMIN' },
      { href: "/admin/settings/gps", label: "Cài Đặt GPS Kho", icon: Navigation, requiredRole: 'ADMIN' },
      { href: "/admin/settings/printers", label: "Cài Đặt Máy In", icon: Printer, requiredRole: 'ADMIN' },
      { href: "/admin/settings/notifications", label: "Cài Đặt Thông Báo", icon: Bell, requiredRole: 'ADMIN' },
    ]
  },
]

export function Sidebar({ onNavigate }: SidebarProps = {}) {
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
      if (itemHref === "/admin") return path === "/admin"
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

  // Fetch warehouse type
  useEffect(() => {
    if ((auth.user?.role === "MANAGER" || auth.user?.role === "WAREHOUSE_STAFF" || auth.user?.role === "ADMIN" || auth.user?.role === "WAREHOUSE_MANAGER" || (auth.user?.role as string) === "QuanLyKhoCon") && auth.user?.warehouseId) {
      mobileFetch(`/api/warehouses/${auth.user.warehouseId}`)
        .then(res => res.json())
        .then(data => {
          if (data.data?.type) {
            setWarehouseType(data.data.type)
          }
        })
        .catch(err => console.error('Failed to fetch warehouse type:', err))
    } else if ((auth.user?.role === "ADMIN" || (auth.user?.role as string) === "AdminKhoTong") && !auth.user?.warehouseId) {
      setWarehouseType("MAIN")
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
    // Restrict items in reports mode (Even for ADMIN)
    if (auth.loginMode === 'reports') {
      const allowedReportItems = [
        '/admin',
        '/admin/reports',
        '/admin/vouchers',
        '/admin/hr/attendance'
      ]
      // Check if item href is exactly in allowed or is a dashboard/report sub-route
      const isAllowed = allowedReportItems.some(route =>
        item.href === route ||
        (route !== '/admin' && item.href.startsWith(route)) ||
        (item.href === '/admin' && pathname === '/admin')
      )
      if (!isAllowed) return false
    }

    // ADMIN role has access to everything
    if (auth.user?.role === "ADMIN" || (auth.user?.role as string) === "AdminKhoTong") {
      return true
    }

    // If requiredRole is specified, check if user has the role
    if (item.requiredRole) {
      if (item.requiredRole === 'ADMIN' && (auth.user?.role as string) === 'AdminKhoTong') return true
      return auth.user?.role === item.requiredRole
    }

    // If requiredPermission is specified, check if user has the permission
    if (item.requiredPermission) {
      if (auth.user?.role === "MANAGER" || auth.user?.role === "WAREHOUSE_STAFF") {
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

    return true
  }

  // Check if group is visible
  const isGroupVisible = (group: MenuGroup) => {
    // ADMIN role has access to everything
    if (auth.user?.role === "ADMIN" || (auth.user?.role as string) === "AdminKhoTong") {
      // If in reports mode, only show specific groups
      if (auth.loginMode === 'reports') {
        const reportGroupIds = ['dashboard', 'reports', 'promotions', 'hr-management']
        // Also check if the group HAS any visible items (to handle hr-management vs approval)
        return reportGroupIds.includes(group.id) && group.items.some(item => isItemVisible(item))
      }
      return true
    }

    if (auth.loginMode === 'reports') {
      const reportGroupIds = ['dashboard', 'reports', 'promotions', 'hr-management']
      return reportGroupIds.includes(group.id) && group.items.some(item => isItemVisible(item))
    }

    if (group.requiredRole) {
      return auth.user?.role === group.requiredRole
    }

    return group.items.some(item => isItemVisible(item))
  }

  // Check if item is active based on calculated activeHref
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
                onClick={onNavigate}
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
                          onClick={onNavigate}
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
