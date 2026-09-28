/**
 * Camera Service
 * Handle photo capture for mobile app (vouchers, receipts, damage reports, etc.)
 */

import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNativePlatform } from './platform';

export interface CapturedPhoto {
  dataUrl: string;
  filePath?: string;
  webPath?: string;
  format: string;
  saved: boolean;
}

export interface CameraOptions {
  quality?: number; // 0-100, default 90
  width?: number; // Max width in pixels
  height?: number; // Max height in pixels
  allowEditing?: boolean; // Allow crop/rotate, default false
  source?: 'camera' | 'gallery'; // Default 'camera'
  saveToGallery?: boolean; // Save to device gallery, default false
}

/**
 * Check if camera is available
 */
export function isCameraAvailable(): boolean {
  return isNativePlatform();
}

/**
 * Take a photo using device camera
 */
export async function takePhoto(options: CameraOptions = {}): Promise<CapturedPhoto | null> {
  if (!isCameraAvailable()) {
    console.warn('Camera not available on this platform');
    return null;
  }

  try {
    const {
      quality = 90,
      width,
      height,
      allowEditing = false,
      source = 'camera',
      saveToGallery = false
    } = options;

    // Take photo
    const photo: Photo = await Camera.getPhoto({
      quality,
      width,
      height,
      allowEditing,
      resultType: CameraResultType.DataUrl, // Base64 data URL
      source: source === 'gallery' ? CameraSource.Photos : CameraSource.Camera,
      saveToGallery
    });

    if (!photo.dataUrl) {
      throw new Error('Failed to capture photo');
    }

    return {
      dataUrl: photo.dataUrl,
      filePath: photo.path,
      webPath: photo.webPath,
      format: photo.format,
      saved: saveToGallery
    };
  } catch (error: any) {
    console.error('Error taking photo:', error);

    // User cancelled
    if (error.message?.includes('cancelled') || error.message?.includes('User cancelled')) {
      return null;
    }

    throw error;
  }
}

/**
 * Pick photo from gallery
 */
export async function pickPhotoFromGallery(options: CameraOptions = {}): Promise<CapturedPhoto | null> {
  return takePhoto({ ...options, source: 'gallery' });
}

/**
 * Save photo to device filesystem
 * Returns the saved file path
 */
export async function savePhotoToDevice(
  dataUrl: string,
  fileName: string,
  directory: Directory = Directory.Documents
): Promise<string | null> {
  if (!isNativePlatform()) {
    console.warn('Filesystem not available on this platform');
    return null;
  }

  try {
    // Extract base64 data from data URL
    const base64Data = dataUrl.split(',')[1];

    // Save to filesystem
    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory,
      recursive: true // Create parent directories if needed
    });

    console.log('Photo saved to:', result.uri);
    return result.uri;
  } catch (error) {
    console.error('Error saving photo:', error);
    throw error;
  }
}

/**
 * Read photo from device filesystem
 */
export async function readPhotoFromDevice(
  filePath: string,
  directory: Directory = Directory.Documents
): Promise<string | null> {
  if (!isNativePlatform()) {
    console.warn('Filesystem not available on this platform');
    return null;
  }

  try {
    const result = await Filesystem.readFile({
      path: filePath,
      directory
    });

    // Return as data URL
    return `data:image/jpeg;base64,${result.data}`;
  } catch (error) {
    console.error('Error reading photo:', error);
    throw error;
  }
}

/**
 * Delete photo from device filesystem
 */
export async function deletePhotoFromDevice(
  filePath: string,
  directory: Directory = Directory.Documents
): Promise<boolean> {
  if (!isNativePlatform()) {
    console.warn('Filesystem not available on this platform');
    return false;
  }

  try {
    await Filesystem.deleteFile({
      path: filePath,
      directory
    });

    console.log('Photo deleted:', filePath);
    return true;
  } catch (error) {
    console.error('Error deleting photo:', error);
    return false;
  }
}

/**
 * Resize base64 image data URL
 * Useful for reducing upload size
 */
export async function resizeImage(
  dataUrl: string,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      // Create canvas and resize
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to data URL
      const resizedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(resizedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = dataUrl;
  });
}

/**
 * Convert data URL to Blob
 * Useful for uploading to server
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

/**
 * Convert data URL to File
 * Useful for form uploads
 */
export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], fileName, { type: blob.type });
}

/**
 * Upload photo to server
 */
export async function uploadPhotoToServer(
  dataUrl: string,
  endpoint: string,
  fileName: string = 'photo.jpg',
  additionalData?: Record<string, any>
): Promise<any> {
  try {
    // Convert to file
    const file = dataUrlToFile(dataUrl, fileName);

    // Create form data
    const formData = new FormData();
    formData.append('file', file);

    // Add additional data
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }

    // Upload
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error uploading photo:', error);
    throw error;
  }
}

/**
 * Take photo and upload to server
 * Convenience function combining capture + upload
 */
export async function captureAndUpload(
  endpoint: string,
  options: CameraOptions = {},
  additionalData?: Record<string, any>
): Promise<any> {
  // Take photo
  const photo = await takePhoto(options);

  if (!photo) {
    throw new Error('Photo capture cancelled or failed');
  }

  // Resize if needed (reduce upload size)
  const resizedDataUrl = await resizeImage(photo.dataUrl, 1920, 1920, 0.85);

  // Upload
  return uploadPhotoToServer(
    resizedDataUrl,
    endpoint,
    `photo_${Date.now()}.jpg`,
    additionalData
  );
}

/**
 * Request camera permissions
 * Returns true if granted, false otherwise
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (!isNativePlatform()) {
    return false;
  }

  try {
    const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    return permissions.camera === 'granted' || permissions.photos === 'granted';
  } catch (error) {
    console.error('Error requesting camera permissions:', error);
    return false;
  }
}

/**
 * Check camera permissions status
 */
export async function checkCameraPermission(): Promise<boolean> {
  if (!isNativePlatform()) {
    return false;
  }

  try {
    const permissions = await Camera.checkPermissions();
    return permissions.camera === 'granted' || permissions.photos === 'granted';
  } catch (error) {
    console.error('Error checking camera permissions:', error);
    return false;
  }
}
