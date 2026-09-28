import { notification_type } from "./generated/prisma"

export interface NotificationData {
  requestId?: string
  transferId?: string
  shiftDate?: string
  sessionId?: string
  [key: string]: any
}

/**
 * Get the redirect URL for a notification
 * Uses redirect_url if available, otherwise builds URL based on type and data
 */
export function getNotificationRedirectUrl(
  type: notification_type,
  redirectUrl: string | null,
  data: NotificationData | null
): string {
  // Use explicit redirect URL if provided
  if (redirectUrl) {
    return redirectUrl
  }

  // Fallback logic based on notification type
  switch (type) {
    // Shift Swap Notifications
    case "SHIFT_SWAP_CREATED":
    case "SHIFT_SWAP_ACCEPTED":
    case "SHIFT_SWAP_APPROVED":
    case "SHIFT_SWAP_REJECTED":
      if (data?.shiftDate) {
        return `/admin/schedule?date=${data.shiftDate}`
      }
      return "/admin/schedule"

    // Shift Registration Notifications
    case "SHIFT_REGISTRATION_APPROVED":
    case "SHIFT_REGISTRATION_REJECTED":
      if (data?.shiftDate) {
        return `/admin/schedule?date=${data.shiftDate}`
      }
      return "/admin/schedule"

    // Leave Request Notifications
    case "LEAVE_REQUEST_PENDING":
      return "/hr/leave-requests"
    case "LEAVE_REQUEST_APPROVED":
    case "LEAVE_REQUEST_REJECTED":
      return "/admin/schedule"

    // Transfer Notifications
    case "TRANSFER_CREATED":
    case "TRANSFER_APPROVED":
    case "TRANSFER_REJECTED":
      if (data?.transferId) {
        return `/admin/warehouse-transfers/${data.transferId}`
      }
      return "/admin/warehouse-transfers"

    case "TRANSFER_READY_EXPORT":
    case "TRANSFER_RECEIVED":
      if (data?.transferId) {
        return `/store/transfers/${data.transferId}`
      }
      return "/store/transfers"

    // Attendance Notifications
    case "CHECK_IN_LATE":
    case "CASH_DISCREPANCY":
    case "ATTENDANCE_MODIFIED":
      if (data?.sessionId) {
        return `/admin/attendance?session=${data.sessionId}`
      }
      return "/admin/attendance"

    // System Announcements
    case "SYSTEM_ANNOUNCEMENT":
      return "/admin/dashboard"

    default:
      return "/admin/dashboard"
  }
}

/**
 * Get icon name for notification type (for use with lucide-react icons)
 */
export function getNotificationIcon(type: notification_type): string {
  switch (type) {
    case "SHIFT_SWAP_CREATED":
    case "SHIFT_SWAP_ACCEPTED":
    case "SHIFT_SWAP_APPROVED":
    case "SHIFT_SWAP_REJECTED":
      return "RefreshCw"

    case "SHIFT_REGISTRATION_APPROVED":
    case "SHIFT_REGISTRATION_REJECTED":
      return "Calendar"

    case "LEAVE_REQUEST_PENDING":
    case "LEAVE_REQUEST_APPROVED":
    case "LEAVE_REQUEST_REJECTED":
      return "CalendarX"

    case "TRANSFER_CREATED":
    case "TRANSFER_APPROVED":
    case "TRANSFER_REJECTED":
    case "TRANSFER_READY_EXPORT":
    case "TRANSFER_RECEIVED":
      return "Package"

    case "CHECK_IN_LATE":
      return "Clock"

    case "CASH_DISCREPANCY":
      return "DollarSign"

    case "ATTENDANCE_MODIFIED":
      return "Edit"

    case "SYSTEM_ANNOUNCEMENT":
      return "Bell"

    default:
      return "Bell"
  }
}

/**
 * Get color class for notification type
 */
export function getNotificationColor(type: notification_type): string {
  switch (type) {
    case "SHIFT_SWAP_APPROVED":
    case "SHIFT_REGISTRATION_APPROVED":
    case "LEAVE_REQUEST_APPROVED":
    case "TRANSFER_APPROVED":
    case "TRANSFER_RECEIVED":
      return "text-green-600"

    case "SHIFT_SWAP_REJECTED":
    case "SHIFT_REGISTRATION_REJECTED":
    case "LEAVE_REQUEST_REJECTED":
    case "TRANSFER_REJECTED":
      return "text-red-600"

    case "LEAVE_REQUEST_PENDING":
    case "CHECK_IN_LATE":
    case "CASH_DISCREPANCY":
      return "text-orange-600"

    case "TRANSFER_READY_EXPORT":
    case "TRANSFER_CREATED":
      return "text-blue-600"

    default:
      return "text-gray-600"
  }
}
