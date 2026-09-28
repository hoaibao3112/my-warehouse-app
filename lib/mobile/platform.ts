/**
 * Platform Detection Utilities
 */

/**
 * Check if code is running in browser (client-side)
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safely get Capacitor object (only in browser)
 */
function getCapacitor() {
  if (!isBrowser()) return null;
  try {
    // Dynamic import to avoid SSR issues
    const { Capacitor } = require('@capacitor/core');
    return Capacitor;
  } catch {
    return null;
  }
}

/**
 * Check if running on native platform (iOS/Android)
 */
export function isNativePlatform(): boolean {
  const Capacitor = getCapacitor();
  if (!Capacitor) return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Check if running on web/browser
 */
export function isWeb(): boolean {
  const Capacitor = getCapacitor();
  if (!Capacitor) return true; // Default to web on SSR
  try {
    return Capacitor.getPlatform() === 'web';
  } catch {
    return true;
  }
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  const Capacitor = getCapacitor();
  if (!Capacitor) return false;
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Check if running on iOS
 */
export function isIOS(): boolean {
  const Capacitor = getCapacitor();
  if (!Capacitor) return false;
  try {
    return Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/**
 * Get current platform
 */
export function getPlatform(): 'web' | 'android' | 'ios' {
  const Capacitor = getCapacitor();
  if (!Capacitor) return 'web';
  try {
    return Capacitor.getPlatform() as 'web' | 'android' | 'ios';
  } catch {
    return 'web';
  }
}
