"use client"

import React, { Suspense, lazy } from "react"
import { AuthProvider } from "@/components/auth-provider"
import { Toaster } from "sonner"
import { isNativePlatform } from "@/lib/mobile/platform"
import { cacheService } from "@/lib/offline/cache-service"

// Lazy load NotificationProvider - FCM không cần thiết ngay khi khởi động
const NotificationProvider = lazy(() =>
  import("@/components/notification-provider").then(mod => ({ default: mod.NotificationProvider }))
)

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize Capacitor app with cryptographically signed authentication token
  // This replaces the simple "capacitor-app=true" cookie with a signed token
  React.useEffect(() => {
    if (isNativePlatform()) {
      const initCapacitor = async () => {
        try {
          let deviceInfo = {}

          // Try to get Capacitor Device info if available
          if (typeof window !== 'undefined' && (window as any).Capacitor) {
            try {
              const { Device } = await import('@capacitor/device')
              const info = await Device.getInfo()
              const id = await Device.getId()
              deviceInfo = {
                platform: info.platform,
                model: info.model,
                uuid: id.identifier
              }
            } catch (e) {
              console.log('[Providers] Device info not available')
            }
          }

          // Call API to get signed token that cannot be forged
          const response = await fetch('/api/capacitor/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deviceInfo)
          })

          if (response.ok) {
            console.log('[Providers] ✅ Capacitor app initialized with cryptographically signed token')
          } else {
            console.error('[Providers] ❌ Failed to initialize Capacitor app')
          }
        } catch (error) {
          console.error('[Providers] Error initializing Capacitor:', error)
        }
      }

      initCapacitor()
    }
  }, []);

  // Register Service Worker for PWA/Offline support
  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register sw.js from public folder
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope)
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })
    }
  }, []);



  // Initialize cache service
  React.useEffect(() => {
    cacheService.initialize().catch(error => {
      console.error('[Providers] Failed to initialize cache service:', error)
    })
  }, [])

  // Defer non-critical Capacitor listeners
  React.useEffect(() => {
    if (!isNativePlatform()) return;

    let backPressedOnce = false;
    let backPressTimeout: ReturnType<typeof setTimeout> | null = null;

    // Use requestIdleCallback for non-critical initialization
    const initCapacitorListeners = () => {
      import('@capacitor/app').then(({ App }) => {
        // Handle back button with double-tap to exit
        App.addListener('backButton', ({ canGoBack }) => {
          console.log('Back button pressed, canGoBack:', canGoBack);

          // If we can go back in browser history, do that
          if (canGoBack) {
            window.history.back();
            return;
          }

          // At root page - require double tap to exit
          if (!backPressedOnce) {
            backPressedOnce = true;
            console.log('Press back again to exit');

            // Show toast notification to user
            if (typeof window !== 'undefined' && (window as any).sonner) {
              (window as any).sonner.toast.info('Nhấn Back lần nữa để thoát');
            }

            // Reset after 2 seconds
            backPressTimeout = setTimeout(() => {
              backPressedOnce = false;
            }, 2000);
          } else {
            // Second press within 2 seconds - exit app
            if (backPressTimeout) {
              clearTimeout(backPressTimeout);
            }
            console.log('Exiting app...');
            App.exitApp();
          }
        });

        // Handle app state changes (minimize, resume, etc.)
        App.addListener('appStateChange', ({ isActive }) => {
          console.log('App state changed. Is active:', isActive);

          // Reset back button counter when app becomes inactive
          if (!isActive) {
            backPressedOnce = false;
            if (backPressTimeout) {
              clearTimeout(backPressTimeout);
              backPressTimeout = null;
            }
          }
        });

        // Handle app URL open events (for deep linking)
        App.addListener('appUrlOpen', (data) => {
          console.log('App opened with URL:', data.url);
        });
      });
    };

    // Defer to idle time or after 2 seconds (whichever comes first)
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(initCapacitorListeners, { timeout: 2000 });
    } else {
      setTimeout(initCapacitorListeners, 1000);
    }

    // Cleanup function
    return () => {
      if (backPressTimeout) {
        clearTimeout(backPressTimeout);
      }
    };
  }, []);

  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </Suspense>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}
