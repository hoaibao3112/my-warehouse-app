'use client';

/**
 * CameraCapture Component
 * Reusable camera capture component with preview
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Camera, Image as ImageIcon, Trash2, Upload, X } from 'lucide-react';
import { useCamera } from '@/hooks/use-camera';
import type { CapturedPhoto } from '@/lib/mobile/camera-service';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onPhotoTaken: (photo: CapturedPhoto) => void;
  title?: string;
  description?: string;
  showGallery?: boolean; // Show gallery button, default true
  showPreview?: boolean; // Show preview after capture, default true
  allowMultiple?: boolean; // Allow multiple photos, default false
}

export function CameraCapture({
  open,
  onClose,
  onPhotoTaken,
  title = 'Chụp ảnh',
  description = 'Chụp ảnh hoặc chọn từ thư viện',
  showGallery = true,
  showPreview = true,
  allowMultiple = false
}: CameraCaptureProps) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<CapturedPhoto | null>(null);

  const { isCapturing, capturePhoto, pickFromGallery, clearPhoto } = useCamera({
    onPhotoTaken: (photo) => {
      if (showPreview) {
        setPreviewPhoto(photo);
      } else {
        handlePhotoConfirm(photo);
      }
    }
  });

  const handleCapture = async () => {
    const photo = await capturePhoto({
      allowEditing: true
    });
    // Photo will be handled by onPhotoTaken callback
  };

  const handleGallery = async () => {
    const photo = await pickFromGallery({
      allowEditing: true
    });
    // Photo will be handled by onPhotoTaken callback
  };

  const handlePhotoConfirm = (photo: CapturedPhoto) => {
    if (allowMultiple) {
      setPhotos([...photos, photo]);
    } else {
      onPhotoTaken(photo);
      handleClose();
    }
    setPreviewPhoto(null);
  };

  const handlePhotoReject = () => {
    setPreviewPhoto(null);
    clearPhoto();
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleConfirmAll = () => {
    photos.forEach(photo => onPhotoTaken(photo));
    handleClose();
  };

  const handleClose = () => {
    setPhotos([]);
    setPreviewPhoto(null);
    clearPhoto();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview mode - Show captured photo */}
          {previewPhoto && (
            <div className="space-y-4">
              <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={previewPhoto.dataUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handlePhotoReject}
                >
                  <X className="w-4 h-4 mr-2" />
                  Chụp lại
                </Button>
                <Button
                  onClick={() => handlePhotoConfirm(previewPhoto)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Sử dụng ảnh này
                </Button>
              </div>
            </div>
          )}

          {/* Capture mode - Show camera buttons */}
          {!previewPhoto && (
            <div className="space-y-4">
              {/* Multiple photos preview */}
              {allowMultiple && photos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Đã chụp: {photos.length} ảnh</p>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={photo.dataUrl}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6 p-0"
                          onClick={() => handleRemovePhoto(index)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Capture buttons */}
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleCapture}
                  disabled={isCapturing}
                  size="lg"
                  className="w-full"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  {isCapturing ? 'Đang mở camera...' : 'Chụp ảnh'}
                </Button>

                {showGallery && (
                  <Button
                    onClick={handleGallery}
                    disabled={isCapturing}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    <ImageIcon className="w-5 h-5 mr-2" />
                    Chọn từ thư viện
                  </Button>
                )}
              </div>

              {/* Info text */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700">
                  💡 Mẹo: Chụp ảnh trong ánh sáng tốt để dễ đọc và xử lý
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {allowMultiple && photos.length > 0 ? 'Hủy' : 'Đóng'}
          </Button>

          {allowMultiple && photos.length > 0 && (
            <Button onClick={handleConfirmAll}>
              Xác nhận ({photos.length} ảnh)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simple image preview component
 */
interface ImagePreviewProps {
  src: string;
  alt?: string;
  onRemove?: () => void;
  className?: string;
}

export function ImagePreview({ src, alt = 'Image', onRemove, className = '' }: ImagePreviewProps) {
  return (
    <div className={`relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain"
      />
      {onRemove && (
        <Button
          size="sm"
          variant="destructive"
          className="absolute top-2 right-2"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
