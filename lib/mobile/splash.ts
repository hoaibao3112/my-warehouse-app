/**
 * Splash Screen Management
 * Hide splash screen when app content is ready
 */

import { isNativePlatform } from './platform';

let splashHidden = false;

/**
 * Hide splash screen - call this when main content is ready
 */
export async function hideSplashScreen(): Promise<void> {
  if (splashHidden || !isNativePlatform()) {
    return;
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({
      fadeOutDuration: 300
    });
    splashHidden = true;
    console.log('[Splash] Hidden successfully');
  } catch (error) {
    console.error('[Splash] Error hiding:', error);
  }
}

/**
 * Show splash screen (for reload scenarios)
 */
export async function showSplashScreen(): Promise<void> {
  if (!isNativePlatform()) {
    return;
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.show({
      autoHide: false,
      fadeInDuration: 200
    });
    splashHidden = false;
    console.log('[Splash] Shown successfully');
  } catch (error) {
    console.error('[Splash] Error showing:', error);
  }
}
