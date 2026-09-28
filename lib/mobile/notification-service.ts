/**
 * Push Notification Service
 * Handles FCM registration, receiving notifications, and navigation
 */

import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { isNativePlatform } from './platform';

export type NotificationType =
  | 'new_order'
  | 'transfer_request'
  | 'transfer_approved'
  | 'transfer_rejected'
  | 'low_stock'
  | 'shift_pending'
  | 'supplier_intake'
  | 'shift_reminder_checkin'
  | 'shift_reminder_checkout';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}

const FCM_TOKEN_KEY = 'fcm_token';
const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

/**
 * Initialize push notifications
 */
export async function initializeNotifications(): Promise<boolean> {
  if (!isNativePlatform()) {
    console.log('Push notifications only work on native platforms');
    return false;
  }

  try {
    // Request permission for push notifications
    const permResult = await PushNotifications.requestPermissions();

    if (permResult.receive !== 'granted') {
      console.log('Push notification permission denied');
      return false;
    }

    // Request permission for local notifications
    const localPermResult = await LocalNotifications.requestPermissions();
    if (localPermResult.display !== 'granted') {
      console.log('Local notification permission denied');
    }

    // Create notification channels for Android
    await createNotificationChannels();

    // Register with Apple / Google to receive push via APNS/FCM
    await PushNotifications.register();

    return true;
  } catch (error) {
    console.error('Error initializing push notifications:', error);
    return false;
  }
}

/**
 * Create notification channels for Android
 * This enables heads-up (popup) notifications with IMPORTANCE_HIGH
 */
async function createNotificationChannels(): Promise<void> {
  try {
    // Create channel for LocalNotifications
    await LocalNotifications.createChannel({
      id: 'fcm_foreground',
      name: 'Thông báo ứng dụng',
      description: 'Thông báo khi ứng dụng đang mở',
      importance: 5, // IMPORTANCE_HIGH - enables heads-up notifications
      visibility: 1, // VISIBILITY_PUBLIC
      sound: 'default',
      vibration: true,
      lights: true
    });

    // Create channel for PushNotifications (background)
    await PushNotifications.createChannel({
      id: 'default',
      name: 'Thông báo chung',
      description: 'Thông báo từ Warehouse Express',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true
    });

    console.log('Notification channels created successfully');
  } catch (error) {
    console.error('Error creating notification channels:', error);
  }
}

/**
 * Show a local notification (native system notification)
 * Use this when FCM is received in foreground to show native notification
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    // Use modulo to keep ID within Java int range (max 2,147,483,647)
    const notificationId = Math.floor(Date.now() % 2147483647);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId,
          title: title,
          body: body,
          channelId: 'fcm_foreground',
          // Don't specify icons - use system default from AndroidManifest
          iconColor: '#3B82F6',
          extra: data || {},
          // No schedule = show immediately
          ongoing: false
        }
      ]
    });

    console.log('Local notification scheduled:', notificationId);
  } catch (error) {
    console.error('Error showing local notification:', error);
  }
}

/**
 * Add listener for registration success
 */
export function onRegistrationSuccess(callback: (token: string) => void) {
  PushNotifications.addListener('registration', async (token: Token) => {
    console.log('Push registration success, token:', token.value);

    // Save token locally
    await saveFCMToken(token.value);

    // Call callback to send to server
    callback(token.value);
  });
}

/**
 * Add listener for registration error
 */
export function onRegistrationError(callback: (error: any) => void) {
  PushNotifications.addListener('registrationError', (error: any) => {
    console.error('Push registration error:', error);
    callback(error);
  });
}

/**
 * Add listener for notification received (foreground)
 */
export function onNotificationReceived(callback: (notification: PushNotificationSchema) => void) {
  PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
    console.log('Push notification received:', notification);
    callback(notification);
  });
}

/**
 * Add listener for notification action (user tapped)
 */
export function onNotificationActionPerformed(callback: (action: ActionPerformed) => void) {
  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    console.log('Push notification action performed:', action);
    callback(action);
  });
}

/**
 * Remove all notification listeners
 */
export async function removeAllNotificationListeners() {
  await PushNotifications.removeAllListeners();
}

/**
 * Get delivered notifications (notification center)
 */
export async function getDeliveredNotifications() {
  const notificationList = await PushNotifications.getDeliveredNotifications();
  return notificationList.notifications;
}

/**
 * Remove delivered notifications
 */
export async function removeDeliveredNotifications(notifications: PushNotificationSchema[]) {
  await PushNotifications.removeDeliveredNotifications({ notifications });
}

/**
 * Remove all delivered notifications
 */
export async function removeAllDeliveredNotifications() {
  await PushNotifications.removeAllDeliveredNotifications();
}

/**
 * Save FCM token to local storage
 */
export async function saveFCMToken(token: string): Promise<void> {
  try {
    await Preferences.set({
      key: FCM_TOKEN_KEY,
      value: token
    });
  } catch (error) {
    console.error('Error saving FCM token:', error);
  }
}

/**
 * Get FCM token from local storage
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: FCM_TOKEN_KEY });
    return value;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

/**
 * Save notification settings
 */
export async function saveNotificationSettings(settings: Record<NotificationType, boolean>): Promise<void> {
  try {
    await Preferences.set({
      key: NOTIFICATION_SETTINGS_KEY,
      value: JSON.stringify(settings)
    });
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
}

/**
 * Get notification settings
 */
export async function getNotificationSettings(): Promise<Record<NotificationType, boolean>> {
  try {
    const { value } = await Preferences.get({ key: NOTIFICATION_SETTINGS_KEY });

    if (!value) {
      // Default: all enabled
      return {
        new_order: true,
        transfer_request: true,
        transfer_approved: true,
        transfer_rejected: true,
        low_stock: true,
        shift_pending: true,
        supplier_intake: true,
        shift_reminder_checkin: true,
        shift_reminder_checkout: true
      };
    }

    return JSON.parse(value);
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return {
      new_order: true,
      transfer_request: true,
      transfer_approved: true,
      transfer_rejected: true,
      low_stock: true,
      shift_pending: true,
      supplier_intake: true,
      shift_reminder_checkin: true,
      shift_reminder_checkout: true
    };
  }
}

/**
 * Update single notification setting
 */
export async function updateNotificationSetting(
  type: NotificationType,
  enabled: boolean
): Promise<void> {
  const settings = await getNotificationSettings();
  settings[type] = enabled;
  await saveNotificationSettings(settings);
}

/**
 * Check if notification type is enabled
 */
export async function isNotificationEnabled(type: NotificationType): Promise<boolean> {
  const settings = await getNotificationSettings();
  return settings[type] ?? true;
}

/**
 * Register FCM token with backend
 */
export async function registerTokenWithBackend(token: string, userId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/notifications/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        userId,
        platform: 'android'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to register token with backend');
    }

    return true;
  } catch (error) {
    console.error('Error registering token with backend:', error);
    return false;
  }
}

/**
 * Navigate to specific page based on notification data
 */
export function getNavigationPath(notification: PushNotificationSchema): string | null {
  const data = notification.data;

  if (!data || !data.type) {
    return null;
  }

  switch (data.type as NotificationType) {
    case 'new_order':
      return data.invoiceId ? `/store/invoices` : null;

    case 'transfer_request':
    case 'transfer_approved':
    case 'transfer_rejected':
      return data.transferId
        ? `/store/stock-transfer-requests/${data.transferId}`
        : '/store/stock-transfer-requests';

    case 'low_stock':
      return '/store/inventory';

    case 'shift_pending':
      return '/store/shifts';

    case 'supplier_intake':
      return data.intakeId
        ? `/admin/inventory-intake`
        : '/admin/inventory-intake';

    default:
      return null;
  }
}

/**
 * Format notification for display
 */
export function formatNotification(notification: PushNotificationSchema): {
  title: string;
  body: string;
  icon: string;
} {
  const type = notification.data?.type as NotificationType;

  const icons: Record<NotificationType, string> = {
    new_order: '🛒',
    transfer_request: '📦',
    transfer_approved: '✅',
    transfer_rejected: '❌',
    low_stock: '⚠️',
    shift_pending: '⏰',
    supplier_intake: '📥',
    shift_reminder_checkin: '⏰',
    shift_reminder_checkout: '🏁'
  };

  return {
    title: notification.title || 'Warehouse Express',
    body: notification.body || 'Bạn có thông báo mới',
    icon: icons[type] || '🔔'
  };
}
