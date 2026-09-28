'use client';

/**
 * Printer Settings Page - Clean & Simple Version
 * Quản lý cấu hình máy in đơn giản cho từng kho hàng.
 */

import { useEffect, useState } from 'react';
import {
  Printer,
  Wifi,
  Bluetooth,
  Monitor,
  Cable,
  Plus,
  RefreshCw,
  Trash2,
  Trash,
  Settings,
  Store,
  Check,
  Save
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

import { useAuthContext } from '@/components/auth-provider';
import { usePrinter } from '@/hooks/use-printer';
import { isNativePlatform } from '@/lib/mobile/platform';
import { MobilePageHeader } from "@/components/mobile/mobile-page-header";
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';

// Types
type PrinterFunction = 'BILL' | 'KITCHEN' | 'LABEL';
type ConnectionType = 'usb' | 'wifi' | 'bluetooth' | 'system';

interface PrinterMapping {
  id: string;
  printer_function: PrinterFunction;
  printer_id: string | null;
  printer_name: string;
  connection_type: ConnectionType;
  ip_address?: string;
  port?: number;
  category_mappings: { category_id: string; category: { name: string } }[];
}

const FUNCTION_LABELS: Record<PrinterFunction, string> = {
  BILL: 'In Hóa Đơn (Bill)',
  KITCHEN: 'In Lệnh Bếp',
  LABEL: 'In Tem Nhãn',
};

export default function PrinterSettingsPage() {
  const { user } = useAuthContext();
  const [isMobile, setIsMobile] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [mappings, setMappings] = useState<PrinterMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Manual Add State
  const [manualIP, setManualIP] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualFunc, setManualFunc] = useState<PrinterFunction>('BILL');
  const [manualType, setManualType] = useState('thermal_80mm');
  const [isTesting, setIsTesting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Multi-printer hooks
  const billPrinter = usePrinter('BILL');
  const kitchenPrinter = usePrinter('KITCHEN');
  const labelPrinter = usePrinter('LABEL');

  const rolePrinters = {
    BILL: billPrinter,
    KITCHEN: kitchenPrinter,
    LABEL: labelPrinter
  };

  useEffect(() => {
    const checkMobile = () => {
      const isMobileScreen = window.innerWidth < 768; // Common tablet/mobile breakpoint
      setIsMobile(isNativePlatform() || isMobileScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    fetchWarehouses();

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      fetchConfigs();
    }
  }, [selectedWarehouseId]);

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouses?pageSize=100');
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        const filteredWarehouses = data.data.filter((w: any) => w.type !== 'PARTNER');
        setWarehouses(filteredWarehouses);
        if (filteredWarehouses.length > 0) {
          setSelectedWarehouseId(filteredWarehouses[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchConfigs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouses/${selectedWarehouseId}/printer-configs`);
      const data = await res.json();
      if (data.success) {
        setMappings(data.data || []);
        setCategories(data.metadata?.categories || []);
      }
    } catch (err) {
      toast.error('Không thể tải cấu hình');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(body: any) {
    if (!selectedWarehouseId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/warehouses/${selectedWarehouseId}/printer-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Đã lưu thành công');
        fetchConfigs();
      } else {
        toast.error(data.error || 'Lỗi khi lưu');
      }
    } catch (err) {
      toast.error('Lỗi kết nối');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  }

  async function confirmRemove() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/warehouses/${selectedWarehouseId}/printer-configs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteId })
      });
      if ((await res.json()).success) {
        toast.success('Đã gỡ máy in thành công');
        fetchConfigs();
      }
    } catch (err) {
      toast.error('Lỗi khi xóa máy in');
    } finally {
      setDeleteId(null);
    }
  }

  async function handleCheckConnection(ip: string) {
    if (!ip) return;
    setIsTesting(true);
    try {
      const res = await fetch('/api/system/test-printer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Kết nối máy in thành công!');
        setIsVerified(true);
      } else {
        toast.error(data.error || 'Không thể kết nối tới máy in');
        setIsVerified(false);
      }
    } catch (err) {
      toast.error('Lỗi kiểm tra kết nối');
    } finally {
      setIsTesting(false);
    }
  }

  async function handleTestPrint(fn: PrinterFunction) {
    // Logic for individual test print via API or local driver
    toast.info(`Đang gửi lệnh in thử tới ${FUNCTION_LABELS[fn]}...`);
    // Placeholder for actual print logic
  }

  async function toggleCategoryMapping(fn: PrinterFunction, catId: string) {
    const mapping = mappings.find(m => m.printer_function === fn);
    if (!mapping) {
      toast.error('Vui lòng gán máy in trước khi chọn nhóm hàng');
      return;
    }

    const currentIds = mapping.category_mappings.map(m => m.category_id);
    const newIds = currentIds.includes(catId)
      ? currentIds.filter(id => id !== catId)
      : [...currentIds, catId];

    await handleSave({
      id: mapping.id,
      printer_function: fn,
      category_ids: newIds
    });
  }

  // --- Render ---



  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto space-y-6">
      {/* Header Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main Config Area */}
        <div className={`${isMobile ? 'lg:col-span-12' : 'lg:col-span-9'} space-y-6`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold tracking-tight">Cấu hình Máy In</h1>
              </div>
              <p className="text-[11px] text-muted-foreground">Quản lý điều phối in bill, in bếp và in tem cho từng kho hàng.</p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchConfigs} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <div className="flex items-center gap-3 bg-muted/40 p-2 rounded-lg border">
                <Store className="h-4 w-4 text-muted-foreground ml-2" />
                <Select value={selectedWarehouseId || ''} onValueChange={setSelectedWarehouseId}>
                  <SelectTrigger className="w-[180px] h-9 border-0 bg-transparent focus:ring-0 font-medium">
                    <SelectValue placeholder="Chọn kho..." />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Hỗ trợ in theo chức năng</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(['BILL', 'KITCHEN', 'LABEL'] as PrinterFunction[]).map(fn => {
              const mapping = mappings.find(m => m.printer_function === fn);
              return (
                <Card key={fn} className={mapping ? 'border-primary/20 shadow-sm' : 'border-dashed'}>
                  <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-sm font-bold">{FUNCTION_LABELS[fn]}</CardTitle>
                      <CardDescription className="text-xs">
                        {fn === 'BILL' ? 'In bill khách, mở két.' : fn === 'KITCHEN' ? 'Báo món vào bếp.' : 'In tem đồ uống.'}
                      </CardDescription>
                    </div>
                    <Badge variant={mapping ? 'default' : 'secondary'} className="text-[10px] uppercase">
                      {mapping ? 'Đã gán' : 'Trống'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {mapping ? (
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-neutral-50 border text-xs space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col flex-1 truncate">
                              <span className="font-bold text-primary text-[13px] truncate">{mapping.printer_name}</span>
                              <span className="text-[9px] uppercase text-muted-foreground font-semibold flex items-center gap-1.5 mt-0.5">
                                <span className="px-1 bg-neutral-100 rounded border text-[8px]">{mapping.connection_type}</span>
                                {mapping.connection_type === 'wifi' && <span className="text-secondary font-mono">{mapping.ip_address}</span>}
                              </span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleRemove(mapping.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex gap-2">
                            {mapping.connection_type === 'wifi' && (
                              <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => handleCheckConnection(mapping.ip_address || '')} disabled={isTesting}>
                                {isTesting ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
                                KIỂM TRA
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => handleTestPrint(fn)}>
                              <Printer className="h-3 w-3 mr-1" />
                              IN THỬ
                            </Button>
                          </div>
                        </div>

                        {fn !== 'BILL' && (
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground block">Nhóm hàng áp dụng</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {categories.map(cat => {
                                const isMapped = mapping.category_mappings.some(cm => cm.category_id === cat.id);
                                return (
                                  <Badge
                                    key={cat.id}
                                    variant={isMapped ? "default" : "outline"}
                                    className="cursor-pointer text-[10px] px-2 py-0"
                                    onClick={() => toggleCategoryMapping(fn, cat.id)}
                                  >
                                    {isMapped && <Check className="h-2 w-2 mr-1" />}
                                    {cat.name}
                                  </Badge>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center border border-dashed rounded bg-neutral-50/50">
                        <p className="text-xs text-muted-foreground">Chưa có cấu hình</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Manual IP Support UI */}
            <Card id="manual-config-area" className="md:col-span-2 lg:col-span-3 border-neutral-200 shadow-sm overflow-hidden">
              <div className="bg-primary/[0.03] p-4 border-b">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                    <Wifi className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold">Thêm máy in WiFi (Manual IP)</CardTitle>
                    <CardDescription className="text-[10px]">Cài đặt cho các máy in trong cùng mạng LAN hoặc WiFi.</CardDescription>
                  </div>
                </div>
              </div>

              <CardContent className="p-5 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Tên máy in</Label>
                    <Input placeholder="Ví dụ: Bếp Trung Tâm" className="h-10 text-xs px-3 bg-white" value={manualName} onChange={e => setManualName(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Địa chỉ IP</Label>
                    <Input
                      placeholder="192.168.1.xxx"
                      className="h-10 text-xs font-mono px-3 bg-white"
                      value={manualIP}
                      onChange={e => {
                        setManualIP(e.target.value);
                        setIsVerified(false);
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Khổ giấy / Loại</Label>
                    <Select value={manualType} onValueChange={setManualType}>
                      <SelectTrigger className="h-10 text-xs px-3 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="thermal_80mm">Thermal 80mm (K80)</SelectItem>
                        <SelectItem value="thermal_58mm">Thermal 58mm (K58)</SelectItem>
                        <SelectItem value="label_4increment">Tem Nhãn (40x30)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Chức năng in</Label>
                    <Select value={manualFunc} onValueChange={v => setManualFunc(v as any)}>
                      <SelectTrigger className="h-10 text-xs px-3 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BILL">In Hóa Đơn (Bill)</SelectItem>
                        <SelectItem value="KITCHEN">In Lệnh Bếp</SelectItem>
                        <SelectItem value="LABEL">In Tem Nhãn</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t mt-4">
                  <Button
                    variant={isVerified ? "outline" : "default"}
                    className={`flex-1 sm:flex-none sm:min-w-[180px] h-10 font-bold text-xs uppercase tracking-tight ${isVerified ? 'border-green-500 text-green-600 bg-green-50/30' : ''}`}
                    disabled={isTesting || !manualIP}
                    onClick={() => handleCheckConnection(manualIP)}
                  >
                    {isTesting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : isVerified ? <Check className="h-4 w-4 mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
                    {isVerified ? 'ĐÃ XÁC MINH IP' : 'KIỂM TRA KẾT NỐI'}
                  </Button>

                  <Button
                    className="flex-1 sm:ml-auto h-10 font-bold uppercase text-xs tracking-tight shadow-md shadow-primary/10 hover:shadow-lg transition-all"
                    disabled={isSaving || !manualIP || !manualName || !isVerified}
                    onClick={async () => {
                      await handleSave({
                        printer_id: `net:${manualIP}:9100`,
                        printer_name: manualName,
                        printer_type: manualType,
                        ip_address: manualIP,
                        port: 9100,
                        connection_type: 'wifi',
                        printer_function: manualFunc
                      });
                      setManualIP('');
                      setManualName('');
                      setIsVerified(false);
                    }}
                  >
                    {isSaving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    LƯU CẤU HÌNH NGAY
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {!isMobile && (
          <div className="lg:col-span-3 lg:sticky lg:top-8 space-y-6">
            <div className="flex items-center gap-2 mb-2 p-1">
              <Cable className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Kết nối trực tiếp</h3>
            </div>

            <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">USB Serial (Desktop)</span>
              </div>

              {(['BILL', 'KITCHEN', 'LABEL'] as PrinterFunction[]).map(role => {
                const { isConnected, isConnecting, printerInfo, connect, disconnect, isSupported } = rolePrinters[role];
                return (
                  <div key={role} className="flex flex-col p-4 border rounded-xl bg-neutral-50/50 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded ${isConnected ? 'bg-green-100/50 text-green-600' : 'bg-white text-neutral-400 border shadow-sm'}`}>
                          <Printer className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold leading-none">{FUNCTION_LABELS[role]}</span>
                          <span className="text-[10px] text-muted-foreground mt-1">
                            {isConnected ? `Sẵn sàng (VID:${printerInfo?.vendorId})` : 'Chưa kết nối'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isConnected ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="w-full text-[11px] font-bold h-9 uppercase shadow-sm hover:shadow-md transition-all active:scale-95 text-white"
                        disabled={isConnecting || !isSupported}
                        onClick={async () => {
                          const ok = await connect();
                          if (ok && rolePrinters[role].printerInfo) {
                            const info = rolePrinters[role].printerInfo;
                            handleSave({
                              printer_id: `${info?.vendorId}:${info?.productId}`,
                              printer_name: info?.name,
                              connection_type: 'usb',
                              printer_function: role
                            });
                          }
                        }}
                      >
                        {isConnecting ? <RefreshCw className="h-3 w-3 animate-spin mr-2" /> : <Cable className="h-3 w-3 mr-2" />}
                        Kết nối USB
                      </Button>
                    ) : (
                      <div className="flex gap-2 pt-1 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-[10px] font-bold uppercase bg-white"
                          onClick={() => toast.info('Đang in thử...')}
                        >In Thử</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-[10px] font-bold text-red-500 uppercase px-2 hover:bg-red-50"
                          onClick={disconnect}
                        >Gỡ</Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!billPrinter.isSupported && (
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg text-xs leading-relaxed text-orange-800">
                  Trình duyệt không hỗ trợ **Web Serial**. Vui lòng dùng Chrome hoặc Edge để kết nối USB.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Xác nhận gỡ máy in"
        description="Bạn có chắc chắn muốn gỡ cấu hình máy in này khỏi kho hàng? Các thiết lập nhóm sản phẩm liên quan cũng sẽ bị xóa."
        onConfirm={confirmRemove}
        confirmText="Gỡ máy in"
      />
    </div>
  );
}
