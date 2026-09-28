/**
 * Permission Handler System for Capacitor Mobile App
 * Handles runtime permissions with user-friendly explanations
 */

import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { PushNotifications } from '@capacitor/push-notifications';
import { BluetoothLe } from '@capacitor-community/bluetooth-le';

export type PermissionType =
  | 'camera'
  | 'bluetooth'
  | 'notifications'
  | 'location'
  | 'storage';

export interface PermissionStatus {
  granted: boolean;
  denied: boolean;
  neverAskAgain: boolean;
}

export interface PermissionInfo {
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

/**
 * Permission descriptions for user explanation
 */
export const PERMISSION_DESCRIPTIONS: Record<PermissionType, PermissionInfo> = {
  camera: {
    title: 'Quyền Camera',
    description:
      'Cho phép quét mã barcode/QR code sản phẩm và chụp ảnh chứng từ',
    icon: 'camera',
    required: false
  },
  bluetooth: {
    title: 'Quyền Bluetooth',
    description: 'Cho phép kết nối với máy in để in hóa đơn và phiếu kho',
    icon: 'bluetooth',
    required: false
  },
  notifications: {
    title: 'Quyền Thông báo',
    description:
      'Nhận cập nhật về đơn hàng mới, yêu cầu chuyển kho và cảnh báo tồn kho',
    icon: 'bell',
    required: false
  },
  location: {
    title: 'Quyền Vị trí',
    description:
      'Cần thiết để quét thiết bị Bluetooth trên Android 6-11 (yêu cầu của hệ điều hành)',
    icon: 'map-pin',
    required: false
  },
  storage: {
    title: 'Quyền Lưu trữ',
    description: 'Cho phép xuất/nhập file Excel và lưu PDF',
    icon: 'folder',
    required: false
  }
};

/**
 * Check if running on native platform
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Check Camera Permission
 */
export async function checkCameraPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    const result = await Camera.checkPermissions();
    return {
      granted: result.camera === 'granted',
      denied: result.camera === 'denied',
      neverAskAgain: result.camera === 'denied'
    };
  } catch (error) {
    console.error('Error checking camera permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request Camera Permission
 */
export async function requestCameraPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    const result = await Camera.requestPermissions({ permissions: ['camera'] });
    return {
      granted: result.camera === 'granted',
      denied: result.camera === 'denied',
      neverAskAgain: result.camera === 'denied'
    };
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Check Bluetooth Permission
 */
export async function checkBluetoothPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    // On Android 12+, need BLUETOOTH_SCAN and BLUETOOTH_CONNECT
    // BluetoothLe plugin handles this automatically
    const enabled = await BluetoothLe.isEnabled();
    return {
      granted: enabled,
      denied: !enabled,
      neverAskAgain: false
    };
  } catch (error) {
    console.error('Error checking Bluetooth permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request Bluetooth Permission
 * This will also request Location permission on Android 6-11
 */
export async function requestBluetoothPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    // Enable Bluetooth - this will trigger permission requests
    await BluetoothLe.initialize();
    const enabled = await BluetoothLe.isEnabled();

    if (!enabled && isAndroid()) {
      // Request to enable Bluetooth
      await BluetoothLe.enable();
    }

    return {
      granted: true,
      denied: false,
      neverAskAgain: false
    };
  } catch (error) {
    console.error('Error requesting Bluetooth permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Check Push Notifications Permission
 */
export async function checkNotificationsPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    const result = await PushNotifications.checkPermissions();
    return {
      granted: result.receive === 'granted',
      denied: result.receive === 'denied',
      neverAskAgain: result.receive === 'denied'
    };
  } catch (error) {
    console.error('Error checking notifications permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request Push Notifications Permission
 */
export async function requestNotificationsPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    const result = await PushNotifications.requestPermissions();
    return {
      granted: result.receive === 'granted',
      denied: result.receive === 'denied',
      neverAskAgain: result.receive === 'denied'
    };
  } catch (error) {
    console.error('Error requesting notifications permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request Barcode Scanner Permission (Camera + prepare scanner)
 */
export async function requestBarcodeScannerPermission(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    const status = await BarcodeScanner.checkPermission({ force: true });

    if (status.granted) {
      return { granted: true, denied: false, neverAskAgain: false };
    }

    if (status.denied) {
      // Denied once, ask again
      const newStatus = await BarcodeScanner.checkPermission({ force: true });
      return {
        granted: newStatus.granted || false,
        denied: newStatus.denied || false,
        neverAskAgain: newStatus.denied || false
      };
    }

    // Restricted or not determined
    return { granted: false, denied: true, neverAskAgain: true };
  } catch (error) {
    console.error('Error requesting barcode scanner permission:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Open app settings (for when user denied permission)
 */
export async function openAppSettings(): Promise<void> {
  if (!isNativePlatform()) {
    return;
  }

  try {
    if (isAndroid()) {
      // On Android, we can open app settings using an intent
      // This requires a custom plugin or using Capacitor's App plugin
      alert(
        'Vui lòng vào Cài đặt > Ứng dụng > Warehouse Express > Quyền để cấp quyền'
      );
    }
  } catch (error) {
    console.error('Error opening app settings:', error);
  }
}

/**
 * Request multiple permissions at once
 */
export async function requestMultiplePermissions(
  permissions: PermissionType[]
): Promise<Record<PermissionType, PermissionStatus>> {
  const results: Record<string, PermissionStatus> = {};

  for (const permission of permissions) {
    switch (permission) {
      case 'camera':
        results.camera = await requestCameraPermission();
        break;
      case 'bluetooth':
        results.bluetooth = await requestBluetoothPermission();
        break;
      case 'notifications':
        results.notifications = await requestNotificationsPermission();
        break;
      case 'storage':
        // Storage permissions are handled automatically by Filesystem plugin
        results.storage = { granted: true, denied: false, neverAskAgain: false };
        break;
      case 'location':
        // Location is requested automatically when requesting Bluetooth
        results.location = { granted: true, denied: false, neverAskAgain: false };
        break;
    }
  }

  return results as Record<PermissionType, PermissionStatus>;
}

/**
 * Get all permissions status
 */
export async function getAllPermissionsStatus(): Promise<
  Record<PermissionType, PermissionStatus>
> {
  if (!isNativePlatform()) {
    return {
      camera: { granted: true, denied: false, neverAskAgain: false },
      bluetooth: { granted: true, denied: false, neverAskAgain: false },
      notifications: { granted: true, denied: false, neverAskAgain: false },
      location: { granted: true, denied: false, neverAskAgain: false },
      storage: { granted: true, denied: false, neverAskAgain: false }
    };
  }

  const [camera, bluetooth, notifications] = await Promise.all([
    checkCameraPermission(),
    checkBluetoothPermission(),
    checkNotificationsPermission()
  ]);

  return {
    camera,
    bluetooth,
    notifications,
    location: bluetooth, // Location is tied to Bluetooth on Android
    storage: { granted: true, denied: false, neverAskAgain: false }
  };
}
