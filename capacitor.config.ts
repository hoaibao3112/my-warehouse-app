import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.warehouse.express',
  appName: 'Warehouse Express',
  webDir: 'out',

  server: {
    // URL backend đã deploy
    url: process.env.NEXT_PUBLIC_API_URL || 'https://pos.expresscafe.com.vn/',
    cleartext: true, // Cho phép HTTP trong development
    androidScheme: 'https'
  },

  android: {
    minWebViewVersion: 55, // Chrome 55+ (Android 7.0+)
    allowMixedContent: true,
    backgroundColor: '#ffffff',
  },

  plugins: {
    PushNotifications: {
      // Only badge and sound - 'alert' causes in-app banner instead of system notification
      presentationOptions: ['badge', 'sound']
    },
    SplashScreen: {
      launchShowDuration: 0, // Auto hide when app is ready
      launchAutoHide: true, // Hide splash when web content loaded
      launchFadeOutDuration: 300, // Quick fade out animation
      backgroundColor: '#ffffff',
      showSpinner: false, // Disable spinner for faster feel
      splashImmersive: true, // Immersive mode for Android
      splashFullScreen: true
    },
    StatusBar: {
      style: 'dark', // Dark icons on light background
      backgroundColor: '#ffffff', // White background
      overlaysWebView: false // Prevent content from extending behind status bar
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    // Enable edge-to-edge mode for Android 
    EdgeToEdge: {
      enable: true
    }
  }
};

export default config;
