'use client';

/**
 * Notification Settings Page
 * Configure which notifications to receive on mobile
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Bell, BellOff, Smartphone, ShoppingCart, Package, CheckCircle, XCircle, AlertTriangle, Clock, Inbox, Send } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { MobilePageHeader } from "@/components/mobile/mobile-page-header";
import { isNativePlatform } from '@/lib/mobile/platform';
import {
  getNotificationSettings,
  updateNotificationSetting,
  type NotificationType
} from '@/lib/mobile/notification-service';

interface NotificationSetting {
  type: NotificationType;
  label: string;
  description: string;
  icon: any;
  enabled: boolean;
}

const NOTIFICATION_TYPES: Omit<NotificationSetting, 'enabled'>[] = [
  {
    type: 'new_order',
    label: 'Đơn hàng mới',
    description: 'Thông báo khi có đơn hàng mới được tạo',
    icon: ShoppingCart
  },
  {
    type: 'transfer_request',
    label: 'Yêu cầu chuyển kho',
    description: 'Thông báo khi có yêu cầu chuyển kho mới',
    icon: Package
  },
  {
    type: 'transfer_approved',
    label: 'Phê duyệt chuyển kho',
    description: 'Thông báo khi yêu cầu chuyển kho được phê duyệt',
    icon: CheckCircle
  },
  {
    type: 'transfer_rejected',
    label: 'Từ chối chuyển kho',
    description: 'Thông báo khi yêu cầu chuyển kho bị từ chối',
    icon: XCircle
  },
  {
    type: 'low_stock',
    label: 'Cảnh báo tồn kho thấp',
    description: 'Thông báo khi sản phẩm sắp hết hàng',
    icon: AlertTriangle
  },
  {
    type: 'shift_pending',
    label: 'Ca làm việc chờ xác nhận',
    description: 'Thông báo khi có ca làm việc cần xác nhận',
    icon: Clock
  },
  {
    type: 'supplier_intake',
    label: 'Nhập hàng từ NCC',
    description: 'Thông báo khi có phiếu nhập hàng mới từ nhà cung cấp',
    icon: Inbox
  }
];

export default function NotificationSettingsPage() {
  const { user } = useAuthContext();
  const [isMobile, setIsMobile] = useState(false);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingFCM, setTestingFCM] = useState(false);

  useEffect(() => {
    const mobile = isNativePlatform();
    setIsMobile(mobile);

    if (mobile) {
      loadSettings();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadSettings() {
    try {
      const savedSettings = await getNotificationSettings();

      const settingsWithState = NOTIFICATION_TYPES.map(type => ({
        ...type,
        enabled: savedSettings[type.type] ?? true
      }));

      setSettings(settingsWithState);
    } catch (error) {
      console.error('Error loading notification settings:', error);
      toast.error('Lỗi khi tải cài đặt thông báo');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(type: NotificationType, enabled: boolean) {
    try {
      // Update local state optimistically
      setSettings(prev =>
        prev.map(setting =>
          setting.type === type ? { ...setting, enabled } : setting
        )
      );

      // Save to storage
      await updateNotificationSetting(type, enabled);

      toast.success(
        enabled ? 'Đã bật thông báo' : 'Đã tắt thông báo'
      );
    } catch (error) {
      console.error('Error updating notification setting:', error);
      toast.error('Lỗi khi cập nhật cài đặt');

      // Revert on error
      await loadSettings();
    }
  }

  async function handleTestFCM() {
    if (!user?.id) {
      toast.error('Bạn cần đăng nhập để test FCM');
      return;
    }

    setTestingFCM(true);
    try {
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          title: 'Test FCM Notification',
          body: `Đây là thông báo test FCM lúc ${new Date().toLocaleTimeString('vi-VN')}`,
          type: 'new_order',
          data: {
            testId: `test-${Date.now()}`
          }
        })
      });

      const result = await response.json();

      if (!result.success) {
        toast.error(result.error || 'Lỗi khi gửi thông báo test');
      }
      // No toast on success - FCM notification will appear as heads-up
    } catch (error) {
      console.error('Error testing FCM:', error);
      toast.error('Lỗi khi gửi thông báo test');
    } finally {
      setTestingFCM(false);
    }
  }

  if (!isMobile) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Cài đặt thông báo
            </CardTitle>
            <CardDescription>
              Tính năng này chỉ khả dụng trên ứng dụng mobile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
              <Smartphone className="h-6 w-6 text-muted-foreground" />
              <p className="text-muted-foreground">
                Vui lòng mở trang này trên ứng dụng di động để cấu hình thông báo push
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Test FCM Card - Available for Admin on Desktop */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Test FCM Push Notification
            </CardTitle>
            <CardDescription>
              Gửi thông báo test để kiểm tra FCM hoạt động đúng
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950">
              <AlertTriangle className="h-6 w-6 text-blue-600" />
              <div className="flex-1">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Thông báo test sẽ được gửi đến tất cả thiết bị đã đăng ký của bạn ({user?.email})
                </p>
              </div>
            </div>
            <Button
              onClick={handleTestFCM}
              disabled={testingFCM || !user?.id}
              className="w-full"
            >
              {testingFCM ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Gửi thông báo test FCM
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Đang tải...</p>
          </div>
        </div>
      </div>
    );
  }

  const enabledCount = settings.filter(s => s.enabled).length;
  const totalCount = settings.length;

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Bell}
        title="Cài Đặt Thông Báo"
        subtitle="Quản lý thông báo push"
      />
      <div className="container mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Cài đặt thông báo
          </h1>
          <p className="text-muted-foreground mt-1">
            Chọn loại thông báo bạn muốn nhận trên thiết bị di động
          </p>
        </div>

        {/* Summary Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {enabledCount > 0 ? (
                  <Bell className="h-8 w-8 text-green-500" />
                ) : (
                  <BellOff className="h-8 w-8 text-muted-foreground" />
                )}
                <div>
                  <div className="font-semibold text-lg">
                    {enabledCount} / {totalCount} loại thông báo đang bật
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {enabledCount === 0 && 'Bạn sẽ không nhận thông báo nào'}
                    {enabledCount > 0 && enabledCount < totalCount && 'Một số thông báo đang tắt'}
                    {enabledCount === totalCount && 'Tất cả thông báo đang bật'}
                  </div>
                </div>
              </div>
              <Badge variant={enabledCount > 0 ? 'default' : 'secondary'}>
                {enabledCount > 0 ? 'Đang hoạt động' : 'Tắt'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Loại thông báo</CardTitle>
            <CardDescription>
              Bật/tắt từng loại thông báo theo nhu cầu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.map(setting => {
              const Icon = setting.icon;
              return (
                <div
                  key={setting.type}
                  className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${setting.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Icon className={`h-5 w-5 ${setting.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1">
                      <Label
                        htmlFor={setting.type}
                        className={`font-medium cursor-pointer ${!setting.enabled && 'text-muted-foreground'}`}
                      >
                        {setting.label}
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {setting.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={setting.type}
                    checked={setting.enabled}
                    onCheckedChange={(checked) => handleToggle(setting.type, checked)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Lưu ý</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-2">
              <li>Thông báo push hoạt động kể cả khi app đang tắt</li>
              <li>Bạn có thể thay đổi cài đặt này bất cứ lúc nào</li>
              <li>Thông báo sẽ không làm gián đoạn chế độ "Không làm phiền"</li>
              <li>Cài đặt này chỉ áp dụng cho thiết bị này</li>
              <li>Để tắt hoàn toàn, vào Cài đặt thiết bị → Ứng dụng → Warehouse Express → Thông báo</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
