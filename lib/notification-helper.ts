/**
 * Notification Helper
 * Unified functions to send both in-app and FCM push notifications
 */

import { notification_type } from "./generated/prisma"
import { createNotification } from "./notification-service"

interface SendNotificationParams {
    userId: string | string[]
    type: notification_type
    title: string
    message: string
    redirectUrl?: string
    data?: Record<string, any>
    /**
     * FCM notification type for mobile app routing
     * Maps to NotificationType in lib/mobile/notification-service.ts
     */
    fcmType?: string
}

/**
 * Send notification to both:
 * 1. In-app notification bell (saved to database)
 * 2. FCM push notification to mobile devices
 * 
 * This is the preferred function to use when you want the user to receive
 * both an in-app notification AND a push notification on their phone.
 */
export async function sendNotificationWithFCM(
    params: SendNotificationParams
): Promise<{ inAppSuccess: boolean; fcmSuccess: boolean }> {
    const { userId, type, title, message, redirectUrl, data, fcmType } = params

    let inAppSuccess = false
    let fcmSuccess = false

    // 1. Create in-app notification (saved to database, shown in bell dropdown)
    try {
        await createNotification({
            userId,
            type,
            title,
            message,
            redirectUrl,
            data,
        })
        inAppSuccess = true
        console.log(`[Notification] In-app notification created for user(s):`, userId)
    } catch (error) {
        console.error("[Notification] Failed to create in-app notification:", error)
    }

    // 2. Send FCM push notification to mobile devices
    try {
        const userIds = Array.isArray(userId) ? userId : [userId]

        // Call the FCM send API
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/notifications/send`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userIds,
                    title,
                    body: message,
                    type: fcmType || mapNotificationTypeToFCM(type),
                    data: {
                        ...data,
                        redirectUrl,
                    },
                }),
            }
        )

        const result = await response.json()

        if (result.success) {
            fcmSuccess = true
            console.log(
                `[Notification] FCM sent: success=${result.successCount}, fail=${result.failureCount}`
            )
        } else {
            console.warn("[Notification] FCM send returned error:", result.error)
        }
    } catch (error) {
        console.error("[Notification] Failed to send FCM notification:", error)
    }

    return { inAppSuccess, fcmSuccess }
}

/**
 * Map database notification_type to FCM notification type
 * Used for mobile app routing when notification is tapped
 */
function mapNotificationTypeToFCM(type: notification_type): string {
    const mapping: Record<notification_type, string> = {
        SHIFT_SWAP_CREATED: "shift_pending",
        SHIFT_SWAP_ACCEPTED: "shift_pending",
        SHIFT_SWAP_APPROVED: "shift_pending",
        SHIFT_SWAP_REJECTED: "shift_pending",
        SHIFT_REGISTRATION_APPROVED: "shift_pending",
        SHIFT_REGISTRATION_REJECTED: "shift_pending",
        LEAVE_REQUEST_APPROVED: "shift_pending",
        LEAVE_REQUEST_REJECTED: "shift_pending",
        TRANSFER_CREATED: "transfer_request",
        TRANSFER_APPROVED: "transfer_approved",
        TRANSFER_REJECTED: "transfer_rejected",
        TRANSFER_READY_EXPORT: "transfer_approved",
        TRANSFER_RECEIVED: "transfer_approved",
        CHECK_IN_LATE: "shift_reminder_checkin",
        CASH_DISCREPANCY: "new_order",
        ATTENDANCE_MODIFIED: "shift_pending",
        SYSTEM_ANNOUNCEMENT: "new_order",
        SALARY_ADVANCE_CREATED: "salary_advance",
        SALARY_ADVANCE_APPROVED: "salary_advance",
        SALARY_ADVANCE_REJECTED: "salary_advance",
    }

    return mapping[type] || "new_order"
}

/**
 * Convenience function: Send notification only to in-app bell (no FCM push)
 * Use this when you only want to show notification in the app, not push to phone
 */
export async function sendInAppNotification(
    params: Omit<SendNotificationParams, "fcmType">
): Promise<boolean> {
    try {
        await createNotification(params)
        return true
    } catch (error) {
        console.error("[Notification] Failed to create in-app notification:", error)
        return false
    }
}
