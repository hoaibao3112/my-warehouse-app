'use client';

/**
 * Barcode Scanner Component
 * Reusable component for scanning barcodes and QR codes
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Camera, X, Zap, ZapOff, ScanLine } from 'lucide-react';
import {
  isScannerAvailable,
  startScan,
  stopScan,
  toggleTorch,
  isTorchAvailable,
  type ScanResult
} from '@/lib/mobile/scanner-service';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (result: ScanResult) => void;
  title?: string;
  description?: string;
  allowManualInput?: boolean;
}

export function BarcodeScanner({
  open,
  onClose,
  onScan,
  title = 'Quét mã vạch',
  description = 'Đưa camera đến mã vạch hoặc QR code',
  allowManualInput = true
}: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Check torch availability
  useEffect(() => {
    if (open && isScannerAvailable()) {
      isTorchAvailable().then(setTorchAvailable);
    }
  }, [open]);

  // Auto-start scan when dialog opens
  useEffect(() => {
    if (open && isScannerAvailable() && !showManualInput) {
      handleStartScan();
    }

    // Cleanup when dialog closes
    return () => {
      if (scanning) {
        stopScan();
      }
    };
  }, [open, showManualInput]);

  const handleStartScan = async () => {
    try {
      setScanning(true);

      const result = await startScan();

      if (result) {
        console.log('Scan result:', result);
        toast.success(`Đã quét: ${result.text}`);
        onScan(result);
        handleClose();
      } else {
        toast.info('Không quét được mã');
      }
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Lỗi khi quét mã: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setScanning(false);
    }
  };

  const handleStopScan = async () => {
    try {
      await stopScan();
      setScanning(false);
    } catch (error) {
      console.error('Error stopping scan:', error);
    }
  };

  const handleToggleTorch = async () => {
    try {
      const newState = !torchOn;
      await toggleTorch(newState);
      setTorchOn(newState);
    } catch (error) {
      console.error('Error toggling torch:', error);
      toast.error('Lỗi khi bật/tắt đèn pin');
    }
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan({
        text: manualInput.trim(),
        format: 'MANUAL'
      });
      handleClose();
    }
  };

  const handleClose = () => {
    handleStopScan();
    setManualInput('');
    setShowManualInput(false);
    setTorchOn(false);
    onClose();
  };

  if (!isScannerAvailable()) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quét mã không khả dụng</DialogTitle>
            <DialogDescription>
              Tính năng quét mã chỉ hoạt động trên ứng dụng mobile
            </DialogDescription>
          </DialogHeader>
          {allowManualInput && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nhập mã thủ công:</label>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Nhập mã..."
                  className="w-full px-3 py-2 border rounded-md"
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Hủy
                </Button>
                <Button onClick={handleManualSubmit} disabled={!manualInput.trim()} className="flex-1">
                  Xác nhận
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!showManualInput ? (
          <div className="space-y-4">
            {/* Scanner UI */}
            <div className="relative aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center">
              {scanning ? (
                <div className="text-center text-white">
                  <ScanLine className="h-16 w-16 mx-auto mb-4 animate-pulse" />
                  <p className="text-lg font-medium">Đang quét...</p>
                  <p className="text-sm text-gray-300 mt-2">Đưa camera đến mã vạch</p>
                </div>
              ) : (
                <div className="text-center text-white">
                  <Camera className="h-16 w-16 mx-auto mb-4" />
                  <p className="text-lg">Sẵn sàng quét</p>
                </div>
              )}

              {/* Scanning frame overlay */}
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-4 border-green-500 rounded-lg animate-pulse"></div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              {torchAvailable && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleTorch}
                  disabled={!scanning}
                  className={torchOn ? 'bg-yellow-100' : ''}
                >
                  {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                </Button>
              )}

              <Button variant="outline" onClick={handleClose} className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Hủy
              </Button>

              {!scanning && (
                <Button onClick={handleStartScan} className="flex-1">
                  <Camera className="h-4 w-4 mr-2" />
                  Quét
                </Button>
              )}

              {scanning && (
                <Button variant="destructive" onClick={handleStopScan} className="flex-1">
                  <X className="h-4 w-4 mr-2" />
                  Dừng
                </Button>
              )}
            </div>

            {/* Manual input option */}
            {allowManualInput && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowManualInput(true)}
                className="w-full"
              >
                Nhập mã thủ công
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nhập mã:</label>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Nhập mã vạch hoặc QR code..."
                className="w-full px-3 py-2 border rounded-md"
                onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowManualInput(false)}
                className="flex-1"
              >
                Quay lại
              </Button>
              <Button onClick={handleManualSubmit} disabled={!manualInput.trim()} className="flex-1">
                Xác nhận
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
