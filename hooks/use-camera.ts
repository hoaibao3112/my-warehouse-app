/**
 * useCamera Hook
 * Easy-to-use hook for photo capture on mobile
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { CameraOptions, CapturedPhoto } from '@/lib/mobile/camera-service';
import {
  isCameraAvailable,
  takePhoto,
  pickPhotoFromGallery,
  captureAndUpload,
  requestCameraPermission,
  resizeImage
} from '@/lib/mobile/camera-service';

interface UseCameraOptions {
  onPhotoTaken?: (photo: CapturedPhoto) => void;
  onUploadSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  autoResize?: boolean; // Auto resize to reduce size, default true
  maxWidth?: number; // Max width for resize, default 1920
  maxHeight?: number; // Max height for resize, default 1920
  quality?: number; // JPEG quality 0-1, default 0.85
}

export function useCamera(options: UseCameraOptions = {}) {
  const {
    onPhotoTaken,
    onUploadSuccess,
    onError,
    autoResize = true,
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85
  } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<CapturedPhoto | null>(null);

  /**
   * Capture photo from camera
   */
  const capturePhoto = useCallback(async (cameraOptions: CameraOptions = {}) => {
    if (!isCameraAvailable()) {
      toast.error('Camera chỉ khả dụng trên mobile');
      return null;
    }

    try {
      setIsCapturing(true);

      // Request permission if needed
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        toast.error('Cần cấp quyền camera để chụp ảnh');
        return null;
      }

      // Take photo
      const photo = await takePhoto({
        quality: 90,
        ...cameraOptions
      });

      if (!photo) {
        // User cancelled
        return null;
      }

      // Auto resize if enabled
      let finalPhoto = photo;
      if (autoResize) {
        const resizedDataUrl = await resizeImage(
          photo.dataUrl,
          maxWidth,
          maxHeight,
          quality
        );
        finalPhoto = { ...photo, dataUrl: resizedDataUrl };
      }

      setLastPhoto(finalPhoto);
      onPhotoTaken?.(finalPhoto);

      toast.success('Đã chụp ảnh');
      return finalPhoto;
    } catch (error: any) {
      console.error('Error capturing photo:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi chụp ảnh: ' + err.message);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [autoResize, maxWidth, maxHeight, quality, onPhotoTaken, onError]);

  /**
   * Pick photo from gallery
   */
  const pickFromGallery = useCallback(async (cameraOptions: CameraOptions = {}) => {
    if (!isCameraAvailable()) {
      toast.error('Gallery chỉ khả dụng trên mobile');
      return null;
    }

    try {
      setIsCapturing(true);

      const photo = await pickPhotoFromGallery({
        quality: 90,
        ...cameraOptions
      });

      if (!photo) {
        // User cancelled
        return null;
      }

      // Auto resize if enabled
      let finalPhoto = photo;
      if (autoResize) {
        const resizedDataUrl = await resizeImage(
          photo.dataUrl,
          maxWidth,
          maxHeight,
          quality
        );
        finalPhoto = { ...photo, dataUrl: resizedDataUrl };
      }

      setLastPhoto(finalPhoto);
      onPhotoTaken?.(finalPhoto);

      toast.success('Đã chọn ảnh');
      return finalPhoto;
    } catch (error: any) {
      console.error('Error picking photo:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi chọn ảnh: ' + err.message);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [autoResize, maxWidth, maxHeight, quality, onPhotoTaken, onError]);

  /**
   * Capture and upload photo to server
   */
  const captureAndUploadPhoto = useCallback(async (
    endpoint: string,
    cameraOptions: CameraOptions = {},
    additionalData?: Record<string, any>
  ) => {
    if (!isCameraAvailable()) {
      toast.error('Camera chỉ khả dụng trên mobile');
      return null;
    }

    try {
      setIsCapturing(true);
      setIsUploading(true);

      // Request permission
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        toast.error('Cần cấp quyền camera để chụp ảnh');
        return null;
      }

      // Capture and upload
      const result = await captureAndUpload(endpoint, cameraOptions, additionalData);

      onUploadSuccess?.(result);
      toast.success('Đã tải ảnh lên thành công');
      return result;
    } catch (error: any) {
      console.error('Error capturing and uploading photo:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi tải ảnh lên: ' + err.message);
      return null;
    } finally {
      setIsCapturing(false);
      setIsUploading(false);
    }
  }, [onUploadSuccess, onError]);

  /**
   * Clear last photo
   */
  const clearPhoto = useCallback(() => {
    setLastPhoto(null);
  }, []);

  return {
    // State
    isCapturing,
    isUploading,
    lastPhoto,
    isAvailable: isCameraAvailable(),

    // Actions
    capturePhoto,
    pickFromGallery,
    captureAndUploadPhoto,
    clearPhoto
  };
}

/**
 * Hook for capturing voucher photos
 */
export function useVoucherCamera(onPhotoTaken: (photo: CapturedPhoto) => void) {
  return useCamera({
    onPhotoTaken,
    autoResize: true,
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.9 // Higher quality for voucher text readability
  });
}

/**
 * Hook for capturing damage report photos
 */
export function useDamageReportCamera(onPhotoTaken: (photo: CapturedPhoto) => void) {
  return useCamera({
    onPhotoTaken,
    autoResize: true,
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.85
  });
}

/**
 * Hook for profile/avatar photos
 */
export function useProfileCamera(onPhotoTaken: (photo: CapturedPhoto) => void) {
  return useCamera({
    onPhotoTaken,
    autoResize: true,
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.8 // Lower size for profile pics
  });
}
