/**
 * File Service
 * Handle file operations for mobile app (download, upload, share)
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativePlatform } from './platform';

export interface FileInfo {
  name: string;
  path: string;
  uri: string;
  size?: number;
  mimeType?: string;
}

export interface DownloadOptions {
  fileName: string;
  directory?: Directory;
  showNotification?: boolean;
}

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

/**
 * Check if file operations are available
 */
export function isFileSystemAvailable(): boolean {
  return isNativePlatform();
}

/**
 * Download file from URL and save to device
 */
export async function downloadFile(
  url: string,
  options: DownloadOptions
): Promise<FileInfo | null> {
  if (!isFileSystemAvailable()) {
    console.warn('Filesystem not available on this platform');
    // Fallback: trigger browser download
    const link = document.createElement('a');
    link.href = url;
    link.download = options.fileName;
    link.click();
    return null;
  }

  try {
    const {
      fileName,
      directory = Directory.Documents
    } = options;

    // Fetch file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    // Get blob
    const blob = await response.blob();

    // Convert to base64
    const base64Data = await blobToBase64(blob);

    // Write to filesystem
    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory,
      recursive: true
    });

    console.log('File downloaded to:', result.uri);

    return {
      name: fileName,
      path: fileName,
      uri: result.uri,
      size: blob.size,
      mimeType: blob.type
    };
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

/**
 * Download Excel file from server
 */
export async function downloadExcelFile(
  url: string,
  fileName: string = 'export.xlsx'
): Promise<FileInfo | null> {
  return downloadFile(url, {
    fileName,
    directory: Directory.Documents
  });
}

/**
 * Download PDF file from server
 */
export async function downloadPDFFile(
  url: string,
  fileName: string = 'document.pdf'
): Promise<FileInfo | null> {
  return downloadFile(url, {
    fileName,
    directory: Directory.Documents
  });
}

/**
 * Read file from filesystem
 */
export async function readFile(
  filePath: string,
  directory: Directory = Directory.Documents,
  encoding: Encoding = Encoding.UTF8
): Promise<string | null> {
  if (!isFileSystemAvailable()) {
    console.warn('Filesystem not available on this platform');
    return null;
  }

  try {
    const result = await Filesystem.readFile({
      path: filePath,
      directory,
      encoding
    });

    return result.data as string;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}

/**
 * Write file to filesystem
 */
export async function writeFile(
  filePath: string,
  data: string,
  directory: Directory = Directory.Documents,
  encoding: Encoding = Encoding.UTF8
): Promise<FileInfo | null> {
  if (!isFileSystemAvailable()) {
    console.warn('Filesystem not available on this platform');
    return null;
  }

  try {
    const result = await Filesystem.writeFile({
      path: filePath,
      data,
      directory,
      encoding,
      recursive: true
    });

    console.log('File written to:', result.uri);

    return {
      name: filePath,
      path: filePath,
      uri: result.uri
    };
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
}

/**
 * Delete file from filesystem
 */
export async function deleteFile(
  filePath: string,
  directory: Directory = Directory.Documents
): Promise<boolean> {
  if (!isFileSystemAvailable()) {
    console.warn('Filesystem not available on this platform');
    return false;
  }

  try {
    await Filesystem.deleteFile({
      path: filePath,
      directory
    });

    console.log('File deleted:', filePath);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(
  filePath: string,
  directory: Directory = Directory.Documents
): Promise<boolean> {
  if (!isFileSystemAvailable()) {
    return false;
  }

  try {
    await Filesystem.stat({
      path: filePath,
      directory
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * List files in directory
 */
export async function listFiles(
  path: string = '',
  directory: Directory = Directory.Documents
): Promise<FileInfo[]> {
  if (!isFileSystemAvailable()) {
    console.warn('Filesystem not available on this platform');
    return [];
  }

  try {
    const result = await Filesystem.readdir({
      path,
      directory
    });

    return result.files.map(file => ({
      name: file.name,
      path: file.uri,
      uri: file.uri,
      size: file.size,
      mimeType: file.mtime ? undefined : file.type
    }));
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

/**
 * Share file using native share dialog
 */
export async function shareFile(
  fileUri: string,
  options: ShareOptions = {}
): Promise<boolean> {
  if (!isNativePlatform()) {
    console.warn('Share not available on this platform');
    // Fallback: Web Share API if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: options.title,
          text: options.text,
          url: options.url || fileUri
        });
        return true;
      } catch (error) {
        console.error('Web share error:', error);
        return false;
      }
    }
    return false;
  }

  try {
    const {
      title = 'Chia sẻ file',
      text,
      dialogTitle = 'Chia sẻ qua'
    } = options;

    await Share.share({
      title,
      text,
      url: fileUri,
      dialogTitle
    });

    return true;
  } catch (error) {
    console.error('Error sharing file:', error);
    return false;
  }
}

/**
 * Share text content
 */
export async function shareText(
  text: string,
  title: string = 'Chia sẻ'
): Promise<boolean> {
  if (!isNativePlatform()) {
    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Clipboard error:', error);
      return false;
    }
  }

  try {
    await Share.share({
      title,
      text,
      dialogTitle: 'Chia sẻ qua'
    });

    return true;
  } catch (error) {
    console.error('Error sharing text:', error);
    return false;
  }
}

/**
 * Convert Blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload file to server
 */
export async function uploadFile(
  fileUri: string,
  endpoint: string,
  fieldName: string = 'file',
  additionalData?: Record<string, any>
): Promise<any> {
  try {
    // Read file from filesystem
    const fileData = await Filesystem.readFile({
      path: fileUri
    });

    // Convert to blob
    const blob = base64ToBlob(fileData.data as string);

    // Create form data
    const formData = new FormData();
    const fileName = fileUri.split('/').pop() || 'file';
    formData.append(fieldName, blob, fileName);

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
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Convert base64 to Blob
 */
function base64ToBlob(base64: string, mimeType: string = 'application/octet-stream'): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Get file MIME type from extension
 */
export function getMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',

    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',

    // Archives
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',

    // Other
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html'
  };

  return mimeTypes[extension || ''] || 'application/octet-stream';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
