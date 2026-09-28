/**
 * Barcode/QR Scanner Service
 * Handles barcode and QR code scanning using device camera
 */

import { BarcodeScanner, SupportedFormat } from '@capacitor-community/barcode-scanner';
import { requestCameraPermission } from './permissions';
import { isNativePlatform } from './platform';

export interface ScanResult {
  text: string;
  format: string;
}

/**
 * Check if scanner is available
 */
export function isScannerAvailable(): boolean {
  return isNativePlatform();
}

/**
 * Prepare scanner (request permissions and check availability)
 */
export async function prepareScanner(): Promise<boolean> {
  if (!isNativePlatform()) {
    return false;
  }

  try {
    // Request camera permission
    const permission = await requestCameraPermission();

    if (!permission.granted) {
      return false;
    }

    // Check permission status from BarcodeScanner
    const status = await BarcodeScanner.checkPermission({ force: false });

    return status.granted || false;
  } catch (error) {
    console.error('Error preparing scanner:', error);
    return false;
  }
}

/**
 * Start scanning
 * Shows camera overlay and waits for scan
 */
export async function startScan(): Promise<ScanResult | null> {
  try {
    // Prepare scanner (permissions)
    const ready = await prepareScanner();

    if (!ready) {
      throw new Error('Camera permission not granted');
    }

    // Hide background (makes web content invisible)
    document.body.classList.add('scanner-active');

    // Start scanning
    const result = await BarcodeScanner.startScan({
      targetedFormats: [
        SupportedFormat.QR_CODE,
        SupportedFormat.CODE_128,
        SupportedFormat.CODE_39,
        SupportedFormat.EAN_13,
        SupportedFormat.EAN_8,
        SupportedFormat.UPC_A,
        SupportedFormat.UPC_E
      ]
    });

    // Remove scanner-active class
    document.body.classList.remove('scanner-active');

    if (result.hasContent) {
      return {
        text: result.content || '',
        format: result.format || 'UNKNOWN'
      };
    }

    return null;
  } catch (error) {
    // Clean up on error
    document.body.classList.remove('scanner-active');
    console.error('Error scanning:', error);
    throw error;
  }
}

/**
 * Stop scanning (user cancelled)
 */
export async function stopScan(): Promise<void> {
  try {
    await BarcodeScanner.stopScan();
    document.body.classList.remove('scanner-active');
  } catch (error) {
    console.error('Error stopping scan:', error);
  }
}

/**
 * Show camera preview (for custom UI)
 */
export async function showCameraPreview(): Promise<void> {
  try {
    await BarcodeScanner.prepare();
    document.body.classList.add('scanner-active');
  } catch (error) {
    console.error('Error showing camera preview:', error);
    throw error;
  }
}

/**
 * Hide camera preview
 */
export async function hideCameraPreview(): Promise<void> {
  try {
    await BarcodeScanner.hideBackground();
    document.body.classList.remove('scanner-active');
  } catch (error) {
    console.error('Error hiding camera preview:', error);
  }
}

/**
 * Enable/disable torch (flashlight)
 */
export async function toggleTorch(enable: boolean): Promise<void> {
  try {
    if (enable) {
      await BarcodeScanner.enableTorch();
    } else {
      await BarcodeScanner.disableTorch();
    }
  } catch (error) {
    console.error('Error toggling torch:', error);
  }
}

/**
 * Check if torch is available
 */
export async function isTorchAvailable(): Promise<boolean> {
  try {
    const status = await BarcodeScanner.getTorchState();
    return status.isAvailable || false;
  } catch (error) {
    console.error('Error checking torch availability:', error);
    return false;
  }
}

/**
 * Scan with timeout
 */
export async function scanWithTimeout(timeoutMs: number = 30000): Promise<ScanResult | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopScan();
      reject(new Error('Scan timeout'));
    }, timeoutMs);

    startScan()
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Validate barcode format
 */
export function isValidBarcode(text: string, expectedFormat?: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  // Basic validation
  if (expectedFormat) {
    switch (expectedFormat) {
      case 'EAN_13':
        return /^\d{13}$/.test(text);
      case 'EAN_8':
        return /^\d{8}$/.test(text);
      case 'UPC_A':
        return /^\d{12}$/.test(text);
      case 'CODE_128':
      case 'CODE_39':
        return text.length >= 4;
      case 'QR_CODE':
        return text.length > 0;
      default:
        return true;
    }
  }

  return true;
}

/**
 * Format barcode text for display
 */
export function formatBarcodeText(text: string, format: string): string {
  switch (format) {
    case 'EAN_13':
    case 'EAN_8':
      // Add dashes for readability
      return text.replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3');
    case 'QR_CODE':
      // Truncate long QR codes
      return text.length > 50 ? text.substring(0, 50) + '...' : text;
    default:
      return text;
  }
}

/**
 * Parse product code from barcode
 * Can customize this based on your barcode format
 */
export function parseProductCode(scanResult: ScanResult): string | null {
  const { text, format } = scanResult;

  // Example: If your product codes are EAN-13 barcodes
  if (format === 'EAN_13' || format === 'EAN_8') {
    return text;
  }

  // Example: If QR codes contain JSON with product info
  if (format === 'QR_CODE') {
    try {
      const data = JSON.parse(text);
      return data.productCode || data.code || text;
    } catch {
      // Not JSON, return as-is
      return text;
    }
  }

  // Default: return raw text
  return text;
}

/**
 * Parse voucher code from barcode/QR
 */
export function parseVoucherCode(scanResult: ScanResult): string | null {
  const { text, format } = scanResult;

  // QR codes often contain voucher codes
  if (format === 'QR_CODE') {
    try {
      const data = JSON.parse(text);
      return data.voucherCode || data.code || text;
    } catch {
      return text;
    }
  }

  // CODE_128 commonly used for voucher codes
  if (format === 'CODE_128') {
    return text;
  }

  return text;
}
