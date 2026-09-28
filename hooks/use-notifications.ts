/**
 * useNotifications Hook
 * Handles push notification registration, listening, and navigation
 */

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import {
  initializeNotifications,
  onRegistrationSuccess,
  onRegistrationError,
  onNotificationReceived,
  onNotificationActionPerformed,
  removeAllNotificationListeners,
  registerTokenWithBackend,
  getNavigationPath,
  formatNotification,
  showLocalNotification
} from '@/lib/mobile/notification-service';
import { isNativePlatform } from '@/lib/mobile/platform';
import { incrementNotificationCount } from '@/hooks/use-notification-count';
import { mobileFetch } from '@/lib/mobile/api-client';

interface UseNotificationsOptions {
  userId?: string;
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationTapped?: (notification: PushNotificationSchema) => void;
  autoNavigate?: boolean; // Auto navigate when notification tapped
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const router = useRouter();
  const initialized = useRef(false);
  const { userId, onNotificationReceived: onReceived, onNotificationTapped, autoNavigate = true } = options;

  /**
   * Handle notification received in foreground
   * Shows a LocalNotification (native system notification) so it looks like background FCM
   */
  const handleNotificationReceived = useCallback(async (notification: PushNotificationSchema) => {
    console.log('Notification received in foreground:', notification);

    // Increment unread count immediately (event-based, no API call)
    incrementNotificationCount();

    // Show native system notification using LocalNotifications
    // This makes foreground notifications look identical to background FCM
    await showLocalNotification(
      notification.title || 'Warehouse Express',
      notification.body || 'Bạn có thông báo mới',
      notification.data
    );

    // Call custom handler if provided
    onReceived?.(notification);
  }, [onReceived]);

  /**
   * Handle notification action (user tapped)
   */
  const handleNotificationAction = useCallback((action: ActionPerformed) => {
    console.log('Notification action performed:', action);

    const notification = action.notification;

    // Call custom handler if provided
    onNotificationTapped?.(notification);

    // Auto-navigate if enabled
    if (autoNavigate) {
      const path = getNavigationPath(notification);
      if (path) {
        console.log('Navigating to:', path);
        router.push(path);
      }
    }
  }, [router, onNotificationTapped, autoNavigate]);

  /**
   * Initialize push notifications
   */
  useEffect(() => {
    if (!isNativePlatform() || initialized.current) {
      return;
    }

    initialized.current = true;

    const setup = async () => {
      try {
        // Initialize push notifications
        const success = await initializeNotifications();

        if (!success) {
          console.log('Push notifications not initialized (permission denied or error)');
          return;
        }

        // Listen for registration success
        onRegistrationSuccess(async (token) => {
          console.log('FCM Token received:', token);

          // Register with backend if userId provided
          if (userId) {
            const registered = await registerTokenWithBackend(token, userId);
            if (registered) {
              console.log('Token registered with backend');
            } else {
              console.error('Failed to register token with backend');
            }
          }
        });

        // Listen for registration errors
        onRegistrationError((error) => {
          console.error('Push notification registration error:', error);
          toast.error('Lỗi khi đăng ký thông báo');
        });

        // Listen for notifications received (foreground)
        onNotificationReceived(handleNotificationReceived);

        // Listen for notification actions (user tapped)
        onNotificationActionPerformed(handleNotificationAction);

        console.log('Push notifications initialized successfully');
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };

    setup();

    // Cleanup listeners on unmount
    return () => {
      removeAllNotificationListeners();
      initialized.current = false;
    };
  }, [userId, handleNotificationReceived, handleNotificationAction]);

  /**
   * Manually send a test notification (for testing)
   */
  const sendTestNotification = useCallback(async () => {
    if (!userId) {
      toast.error('Cần userId để gửi thông báo test');
      return;
    }

    try {
      const response = await mobileFetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          title: 'Test Notification',
          body: 'This is a test notification from Warehouse Express',
          type: 'new_order',
          data: {
            invoiceId: 'test-123'
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Đã gửi thông báo test');
      } else {
        toast.error('Lỗi khi gửi thông báo test');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error('Lỗi khi gửi thông báo test');
    }
  }, [userId]);

  return {
    isMobile: isNativePlatform(),
    sendTestNotification
  };
}
