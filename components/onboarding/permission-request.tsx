'use client';

/**
 * PermissionRequest Component
 * Request permissions with explanations
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Bell, Bluetooth, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  requestCameraPermission,
  requestNotificationsPermission,
  requestBluetoothPermissions,
  checkCameraPermission,
  checkNotificationsPermission,
  checkBluetoothPermissions,
  openAppSettings
} from '@/lib/mobile/permissions';

export interface PermissionItem {
  id: string;
  icon: 'camera' | 'notifications' | 'bluetooth';
  title: string;
  description: string;
  required: boolean;
}

interface PermissionRequestProps {
  permissions: PermissionItem[];
  onComplete: () => void;
  onSkip?: () => void;
}

type PermissionStatus = 'pending' | 'granted' | 'denied';

export function PermissionRequest({
  permissions,
  onComplete,
  onSkip
}: PermissionRequestProps) {
  const [statuses, setStatuses] = useState<Record<string, PermissionStatus>>(
    permissions.reduce((acc, p) => ({ ...acc, [p.id]: 'pending' }), {})
  );
  const [showPermissionAlert, setShowPermissionAlert] = useState(false);

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'camera':
        return Camera;
      case 'notifications':
        return Bell;
      case 'bluetooth':
        return Bluetooth;
      default:
        return AlertCircle;
    }
  };

  const requestPermission = async (permission: PermissionItem) => {
    let granted = false;

    try {
      switch (permission.id) {
        case 'camera':
          granted = await requestCameraPermission();
          break;
        case 'notifications':
          granted = await requestNotificationsPermission();
          break;
        case 'bluetooth':
          const result = await requestBluetoothPermissions();
          granted = result.scan && result.connect;
          break;
      }

      setStatuses(prev => ({
        ...prev,
        [permission.id]: granted ? 'granted' : 'denied'
      }));
    } catch (error) {
      console.error('Permission request failed:', error);
      setStatuses(prev => ({ ...prev, [permission.id]: 'denied' }));
    }
  };

  const checkPermission = async (permission: PermissionItem) => {
    let granted = false;

    try {
      switch (permission.id) {
        case 'camera':
          granted = await checkCameraPermission();
          break;
        case 'notifications':
          granted = await checkNotificationsPermission();
          break;
        case 'bluetooth':
          const result = await checkBluetoothPermissions();
          granted = result.scan && result.connect;
          break;
      }

      setStatuses(prev => ({
        ...prev,
        [permission.id]: granted ? 'granted' : 'pending'
      }));
    } catch (error) {
      console.error('Permission check failed:', error);
    }
  };

  const handleRequestAll = async () => {
    for (const permission of permissions) {
      await requestPermission(permission);
    }
  };

  const handleContinue = () => {
    const allRequiredGranted = permissions
      .filter(p => p.required)
      .every(p => statuses[p.id] === 'granted');

    if (!allRequiredGranted) {
      setShowPermissionAlert(true);
      return;
    }

    onComplete();
  };

  const allGranted = permissions.every(p => statuses[p.id] === 'granted');
  const hasRequired = permissions.some(p => p.required);

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Cấp quyền truy cập
        </h1>
        <p className="text-gray-600">
          Để sử dụng đầy đủ tính năng, vui lòng cấp các quyền sau
        </p>
      </div>

      {/* Permission list */}
      <div className="space-y-4 flex-1">
        {permissions.map((permission) => {
          const Icon = getIcon(permission.icon);
          const status = statuses[permission.id];

          return (
            <Card key={permission.id} className="p-4">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    status === 'granted'
                      ? 'bg-green-100'
                      : status === 'denied'
                      ? 'bg-red-100'
                      : 'bg-blue-100'
                  }`}>
                    <Icon className={`w-6 h-6 ${
                      status === 'granted'
                        ? 'text-green-600'
                        : status === 'denied'
                        ? 'text-red-600'
                        : 'text-blue-600'
                    }`} />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {permission.title}
                    </h3>
                    {permission.required && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">
                        Bắt buộc
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {permission.description}
                  </p>

                  {/* Status */}
                  {status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => requestPermission(permission)}
                      className="w-full"
                    >
                      Cấp quyền
                    </Button>
                  )}

                  {status === 'granted' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Đã cấp quyền</span>
                    </div>
                  )}

                  {status === 'denied' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-red-600">
                        <XCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Bị từ chối</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAppSettings()}
                        className="w-full"
                      >
                        Mở cài đặt
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="space-y-3 mt-8">
        {!allGranted && (
          <Button
            onClick={handleRequestAll}
            className="w-full h-12"
            size="lg"
          >
            Cấp tất cả quyền
          </Button>
        )}

        <Button
          onClick={handleContinue}
          variant={allGranted ? 'default' : 'outline'}
          className="w-full h-12"
          size="lg"
        >
          {allGranted ? 'Hoàn tất' : 'Tiếp tục'}
        </Button>

        {!hasRequired && onSkip && (
          <Button
            onClick={onSkip}
            variant="ghost"
            className="w-full"
          >
            Bỏ qua
          </Button>
        )}
      </div>

      {/* Permission Alert Dialog */}
      <AlertDialog open={showPermissionAlert} onOpenChange={setShowPermissionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cần cấp quyền bắt buộc</AlertDialogTitle>
            <AlertDialogDescription>
              Vui lòng cấp các quyền bắt buộc để tiếp tục sử dụng ứng dụng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowPermissionAlert(false)}>
              Đã hiểu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
