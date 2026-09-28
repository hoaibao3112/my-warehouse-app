"use client"

import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { vi } from "date-fns/locale"
import {
  Bell,
  Calendar,
  CalendarX,
  Clock,
  DollarSign,
  Edit,
  Package,
  RefreshCw,
  Trash2,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useNotificationsList, Notification } from "@/hooks/use-notifications-list"
import { useNotificationCount } from "@/hooks/use-notification-count"
import {
  getNotificationRedirectUrl,
  getNotificationIcon,
  getNotificationColor,
} from "@/lib/notification-navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

const iconMap: Record<string, any> = {
  Bell,
  Calendar,
  CalendarX,
  Clock,
  DollarSign,
  Edit,
  Package,
  RefreshCw,
}

interface NotificationDropdownProps {
  children?: React.ReactNode
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const router = useRouter()
  const { user } = useAuth()
  const {
    notifications,
    isLoading,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll,
    refresh,
  } = useNotificationsList()
  const { refresh: refreshCount } = useNotificationCount()

  const handleNotificationClick = async (notification: Notification) => {
    try {
      // Mark notification as read first
      await markAsRead(notification.id)
      await refreshCount()

      // Get the redirect URL
      let url = getNotificationRedirectUrl(
        notification.type,
        notification.redirect_url,
        notification.data
      )

      console.log('[NotificationDropdown] Target URL:', url, 'User role:', user?.role)

      // Check if user has permission to access the URL
      // If not, redirect to their default dashboard
      if (user) {
        const userRole = user.role
        const isAdmin = userRole === "ADMIN"
        const isManager = userRole === "MANAGER"
        const isWarehouseStaff = userRole === "WAREHOUSE_STAFF"
        const isWarehouseManager = userRole === "WAREHOUSE_MANAGER"
        const isStaff = userRole === "STAFF"
        const isGeneralManager = userRole === "GENERAL_MANAGER"
        const isAttendanceStaff = userRole === "ATTENDANCE_STAFF"
        const isHR = userRole === "HR"

        const canAccessAdmin = isAdmin || isManager || isWarehouseStaff
        const canAccessStore = isWarehouseManager || isStaff || isGeneralManager
        const canAccessAttendance = isAttendanceStaff
        const canAccessHR = isHR

        // Check URL permission
        const isAdminUrl = url.startsWith("/admin")
        const isStoreUrl = url.startsWith("/store")
        const isAttendanceUrl = url.startsWith("/attendance")
        const isHRUrl = url.startsWith("/hr")

        // If user can't access the URL, redirect to their dashboard
        if (isAdminUrl && !canAccessAdmin) {
          if (canAccessStore) url = "/store"
          else if (canAccessHR) url = "/hr"
          else if (canAccessAttendance) url = "/attendance"
          console.log('[NotificationDropdown] No permission for admin route, redirecting to:', url)
        } else if (isStoreUrl && !canAccessStore) {
          if (canAccessAdmin) url = "/admin"
          else if (canAccessHR) url = "/hr"
          else if (canAccessAttendance) url = "/attendance"
          console.log('[NotificationDropdown] No permission for store route, redirecting to:', url)
        } else if (isHRUrl && !canAccessHR) {
          if (canAccessAdmin) url = "/admin"
          else if (canAccessStore) url = "/store"
          else if (canAccessAttendance) url = "/attendance"
          console.log('[NotificationDropdown] No permission for HR route, redirecting to:', url)
        } else if (isAttendanceUrl && !canAccessAttendance) {
          if (canAccessStore) url = "/store"
          else if (canAccessAdmin) url = "/admin"
          else if (canAccessHR) url = "/hr"
          console.log('[NotificationDropdown] No permission for attendance route, redirecting to:', url)
        }
      }

      console.log('[NotificationDropdown] Final URL:', url)

      // Use Next.js router for navigation (avoids page reload and logout issues)
      router.push(url)
    } catch (error) {
      console.error('[NotificationDropdown] Error handling notification click:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    await markAllAsRead()
    await refreshCount()
  }

  const handleDeleteAll = async () => {
    await deleteAll()
    await refreshCount()
  }

  const handleDeleteNotification = async (
    e: React.MouseEvent,
    notificationId: string
  ) => {
    e.stopPropagation() // Prevent notification click
    await deleteNotification(notificationId)
    await refreshCount()
  }

  const getIcon = (type: string) => {
    const iconName = getNotificationIcon(type as any)
    const IconComponent = iconMap[iconName] || Bell
    return IconComponent
  }

  // Refresh notifications when dropdown opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      refresh()
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[350px] max-w-[94vw]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Thông báo</h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={notifications.length === 0}
              title="Đánh dấu đã đọc tất cả"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteAll}
              disabled={notifications.length === 0}
              title="Xóa tất cả"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Bell className="h-12 w-12 mb-2 opacity-20" />
              <p className="text-sm">Không có thông báo</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getIcon(notification.type)
                const colorClass = getNotificationColor(notification.type)

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "group relative px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50",
                      !notification.is_read && "bg-blue-50/50"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {/* Unread Indicator */}
                    {!notification.is_read && (
                      <div className="absolute left-2 top-5 h-2 w-2 rounded-full bg-blue-600" />
                    )}

                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className={cn("mt-0.5", colorClass)}>
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 line-clamp-1">
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale: vi,
                          })}
                        </p>
                      </div>

                      {/* Delete Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                        onClick={(e) => handleDeleteNotification(e, notification.id)}
                        title="Xóa thông báo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Load More Button */}
          {hasMore && (
            <div className="p-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={loadMore}
                disabled={isLoading}
              >
                {isLoading ? "Đang tải..." : "Xem thêm"}
              </Button>
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
