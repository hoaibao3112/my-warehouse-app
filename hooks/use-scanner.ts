/**
 * useScanner Hook
 * Easy-to-use hook for barcode/QR scanning
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { ScanResult } from '@/lib/mobile/scanner-service';
import {
  isScannerAvailable,
  parseProductCode,
  parseVoucherCode,
  isValidBarcode
} from '@/lib/mobile/scanner-service';

interface UseScannerOptions {
  onScan?: (result: ScanResult) => void;
  onProductScan?: (productCode: string) => void;
  onVoucherScan?: (voucherCode: string) => void;
  validateFormat?: string;
  autoToast?: boolean;
}

export function useScanner(options: UseScannerOptions = {}) {
  const {
    onScan,
    onProductScan,
    onVoucherScan,
    validateFormat,
    autoToast = true
  } = options;

  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

  /**
   * Open scanner dialog
   */
  const openScanner = useCallback(() => {
    if (!isScannerAvailable()) {
      toast.error('Tính năng quét mã chỉ khả dụng trên mobile');
      return;
    }
    setScannerOpen(true);
  }, []);

  /**
   * Close scanner dialog
   */
  const closeScanner = useCallback(() => {
    setScannerOpen(false);
  }, []);

  /**
   * Handle scan result
   */
  const handleScan = useCallback((result: ScanResult) => {
    console.log('Scanned:', result);
    setLastScan(result);

    // Validate if format specified
    if (validateFormat && !isValidBarcode(result.text, validateFormat)) {
      toast.error(`Mã không hợp lệ. Cần format: ${validateFormat}`);
      return;
    }

    // Auto toast
    if (autoToast) {
      toast.success(`Đã quét: ${result.text.substring(0, 20)}${result.text.length > 20 ? '...' : ''}`);
    }

    // Call general callback
    onScan?.(result);

    // Parse and call specific callbacks
    if (onProductScan) {
      const productCode = parseProductCode(result);
      if (productCode) {
        onProductScan(productCode);
      }
    }

    if (onVoucherScan) {
      const voucherCode = parseVoucherCode(result);
      if (voucherCode) {
        onVoucherScan(voucherCode);
      }
    }

    // Close scanner
    closeScanner();
  }, [validateFormat, autoToast, onScan, onProductScan, onVoucherScan, closeScanner]);

  return {
    scannerOpen,
    openScanner,
    closeScanner,
    handleScan,
    lastScan,
    isAvailable: isScannerAvailable()
  };
}

/**
 * Hook specifically for product scanning
 */
export function useProductScanner(onProductScan: (productCode: string) => void) {
  return useScanner({ onProductScan });
}

/**
 * Hook specifically for voucher scanning
 */
export function useVoucherScanner(onVoucherScan: (voucherCode: string) => void) {
  return useScanner({ onVoucherScan });
}
