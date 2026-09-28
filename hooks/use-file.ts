/**
 * useFile Hook
 * Easy-to-use hook for file operations on mobile
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Directory } from '@capacitor/filesystem';
import {
  isFileSystemAvailable,
  downloadFile,
  downloadExcelFile,
  downloadPDFFile,
  shareFile,
  shareText,
  uploadFile,
  formatFileSize
} from '@/lib/mobile/file-service';
import type { FileInfo, DownloadOptions, ShareOptions } from '@/lib/mobile/file-service';

interface UseFileOptions {
  onDownloadSuccess?: (file: FileInfo) => void;
  onShareSuccess?: () => void;
  onUploadSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

export function useFile(options: UseFileOptions = {}) {
  const {
    onDownloadSuccess,
    onShareSuccess,
    onUploadSuccess,
    onError
  } = options;

  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastDownload, setLastDownload] = useState<FileInfo | null>(null);

  /**
   * Download file from URL
   */
  const download = useCallback(async (url: string, options: DownloadOptions) => {
    if (!isFileSystemAvailable()) {
      toast.error('Download chỉ khả dụng trên mobile');
      return null;
    }

    try {
      setIsDownloading(true);
      toast.info('Đang tải file...');

      const file = await downloadFile(url, options);

      if (file) {
        setLastDownload(file);
        onDownloadSuccess?.(file);
        toast.success(`Đã tải file: ${file.name}`);
      }

      return file;
    } catch (error: any) {
      console.error('Error downloading file:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi tải file: ' + err.message);
      return null;
    } finally {
      setIsDownloading(false);
    }
  }, [onDownloadSuccess, onError]);

  /**
   * Download Excel file
   */
  const downloadExcel = useCallback(async (url: string, fileName?: string) => {
    if (!isFileSystemAvailable()) {
      // Fallback: trigger browser download
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'export.xlsx';
      link.click();
      return null;
    }

    try {
      setIsDownloading(true);
      toast.info('Đang tải Excel...');

      const file = await downloadExcelFile(url, fileName);

      if (file) {
        setLastDownload(file);
        onDownloadSuccess?.(file);
        toast.success(`Đã tải Excel: ${file.name}`);
      }

      return file;
    } catch (error: any) {
      console.error('Error downloading Excel:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi tải Excel: ' + err.message);
      return null;
    } finally {
      setIsDownloading(false);
    }
  }, [onDownloadSuccess, onError]);

  /**
   * Download PDF file
   */
  const downloadPDF = useCallback(async (url: string, fileName?: string) => {
    if (!isFileSystemAvailable()) {
      // Fallback: trigger browser download
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'document.pdf';
      link.click();
      return null;
    }

    try {
      setIsDownloading(true);
      toast.info('Đang tải PDF...');

      const file = await downloadPDFFile(url, fileName);

      if (file) {
        setLastDownload(file);
        onDownloadSuccess?.(file);
        toast.success(`Đã tải PDF: ${file.name}`);
      }

      return file;
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi tải PDF: ' + err.message);
      return null;
    } finally {
      setIsDownloading(false);
    }
  }, [onDownloadSuccess, onError]);

  /**
   * Share file
   */
  const share = useCallback(async (fileUri: string, options?: ShareOptions) => {
    try {
      setIsSharing(true);

      const success = await shareFile(fileUri, options);

      if (success) {
        onShareSuccess?.();
        toast.success('Đã chia sẻ file');
      }

      return success;
    } catch (error: any) {
      console.error('Error sharing file:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi chia sẻ: ' + err.message);
      return false;
    } finally {
      setIsSharing(false);
    }
  }, [onShareSuccess, onError]);

  /**
   * Share text
   */
  const shareTextContent = useCallback(async (text: string, title?: string) => {
    try {
      setIsSharing(true);

      const success = await shareText(text, title);

      if (success) {
        onShareSuccess?.();
        toast.success('Đã chia sẻ');
      }

      return success;
    } catch (error: any) {
      console.error('Error sharing text:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi chia sẻ: ' + err.message);
      return false;
    } finally {
      setIsSharing(false);
    }
  }, [onShareSuccess, onError]);

  /**
   * Upload file to server
   */
  const upload = useCallback(async (
    fileUri: string,
    endpoint: string,
    fieldName?: string,
    additionalData?: Record<string, any>
  ) => {
    try {
      setIsUploading(true);
      toast.info('Đang tải file lên...');

      const result = await uploadFile(fileUri, endpoint, fieldName, additionalData);

      onUploadSuccess?.(result);
      toast.success('Đã tải file lên thành công');
      return result;
    } catch (error: any) {
      console.error('Error uploading file:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      toast.error('Lỗi khi tải file lên: ' + err.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [onUploadSuccess, onError]);

  /**
   * Download and share file
   */
  const downloadAndShare = useCallback(async (
    url: string,
    fileName: string,
    shareOptions?: ShareOptions
  ) => {
    // Download first
    const file = await download(url, { fileName });

    if (!file) {
      return false;
    }

    // Then share
    return share(file.uri, shareOptions);
  }, [download, share]);

  return {
    // State
    isDownloading,
    isSharing,
    isUploading,
    lastDownload,
    isAvailable: isFileSystemAvailable(),

    // Actions
    download,
    downloadExcel,
    downloadPDF,
    share,
    shareTextContent,
    upload,
    downloadAndShare,

    // Utilities
    formatFileSize
  };
}

/**
 * Hook for Excel downloads
 */
export function useExcelDownload(onSuccess?: (file: FileInfo) => void) {
  return useFile({
    onDownloadSuccess: onSuccess
  });
}

/**
 * Hook for PDF downloads
 */
export function usePDFDownload(onSuccess?: (file: FileInfo) => void) {
  return useFile({
    onDownloadSuccess: onSuccess
  });
}
