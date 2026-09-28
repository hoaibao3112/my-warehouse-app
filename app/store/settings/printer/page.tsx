'use client';

/**
 * Store Printer Settings Page
 * Manager can scan, manage printers, and configure for their warehouse
 * Supports multiple printers for different document types
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Bluetooth,
  Printer,
  Scan,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  AlertTriangle,
  Wifi,
  Plus,
  Edit2,
  FileText,
  Settings2
} from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/mobile-page-header';
import { useAuth } from '@/hooks/use-auth';
import { isNativePlatform } from '@/lib/mobile/platform';
import {
  scanForPrinters,
  scanForWiFiPrinters,
  addWiFiPrinter,
  getSavedPrinters,
  savePrinter,
  removePrinter,
  testPrint,
  initializeBluetooth,
  isBluetoothEnabled,
  getConnectionTypeLabel,
  type BluetoothPrinter,
  type PrinterType,
  type PrinterConnectionType,
  printDocument
} from '@/lib/mobile/print-service';
import { requestBluetoothPermission } from '@/lib/mobile/permissions';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { mobileFetch } from "@/lib/mobile/api-client"

// Document types for printer assignment
const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Hóa đơn bán hàng', icon: '🧾' },
  { value: 'transfer_voucher', label: 'Phiếu chuyển kho', icon: '📦' },
  { value: 'supplier_intake', label: 'Phiếu nhập NCC', icon: '📥' },
  { value: 'shift_summary', label: 'Báo cáo ca', icon: '📊' },
  { value: 'loss_report', label: 'Phiếu báo hao hụt', icon: '⚠️' },
  { value: 'inventory_report', label: 'Báo cáo tồn kho', icon: '📋' },
];

// Printer types
const PRINTER_TYPES: { value: PrinterType; label: string }[] = [
  { value: 'thermal_58mm', label: 'Thermal 58mm' },
  { value: 'thermal_80mm', label: 'Thermal 80mm' },
  { value: 'a4_bluetooth', label: 'A4 Bluetooth' },
];

interface PrinterConfig {
  id: string;
  warehouse_id: string;
  printer_id: string;
  printer_name: string;
  printer_type: PrinterType;
  connection_type: PrinterConnectionType;
  ip_address?: string;
  port?: number;
  document_type: string;
  is_default: boolean;
}

interface DiscoveredPrinter extends BluetoothPrinter {
  selected?: boolean;
}

export default function StorePrinterSettingsPage() {
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningWifi, setIsScanningWifi] = useState(false);
  const [isBluetoothOn, setIsBluetoothOn] = useState(false);

  // Local saved printers (device storage)
  const [localPrinters, setLocalPrinters] = useState<BluetoothPrinter[]>([]);

  // Discovered printers during scan
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [showDiscoveredSheet, setShowDiscoveredSheet] = useState(false);

  // Warehouse printer configs (server storage)
  const [printerConfigs, setPrinterConfigs] = useState<PrinterConfig[]>([]);

  // Test print state
  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);

  // WiFi printer dialog
  const [showWifiDialog, setShowWifiDialog] = useState(false);
  const [wifiIP, setWifiIP] = useState('');
  const [wifiPort, setWifiPort] = useState('9100');
  const [wifiName, setWifiName] = useState('');
  const [addingWifi, setAddingWifi] = useState(false);

  // Edit printer dialog
  const [editingPrinter, setEditingPrinter] = useState<BluetoothPrinter | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<PrinterType>('thermal_80mm');
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Assign printer to document type dialog
  const [assigningPrinter, setAssigningPrinter] = useState<BluetoothPrinter | null>(null);
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);
  const [showAssignDialog, setShowAssignDialog] = useState(false);

  // Warehouse general settings (legacy)
  const [defaultPrinterId, setDefaultPrinterId] = useState<string | null>(null);
  const [requirePrinter, setRequirePrinter] = useState(false);

  useEffect(() => {
    const mobile = isNativePlatform();
    setIsMobile(mobile);

    if (mobile) {
      initializeData();
    } else {
      loadLocalPrinters();
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.warehouseId) {
      loadPrinterConfigs();
    }
  }, [user?.warehouseId]);

  async function initializeData() {
    try {
      await initializeBluetooth();
      const enabled = await isBluetoothEnabled();
      setIsBluetoothOn(enabled);
      await loadLocalPrinters();
    } catch (error) {
      console.error('Error initializing:', error);
      toast.error('Lỗi khởi tạo Bluetooth');
    } finally {
      setLoading(false);
    }
  }

  async function loadLocalPrinters() {
    try {
      const savedPrinters = await getSavedPrinters();
      setLocalPrinters(savedPrinters);
    } catch (error) {
      console.error('Error loading printers:', error);
    }
  }

  async function loadPrinterConfigs() {
    if (!user?.warehouseId) return;

    try {
      const response = await mobileFetch(`/api/warehouses/${user.warehouseId}/printer-configs`, {
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setPrinterConfigs(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading printer configs:', error);
    }
  }

  // Scan Bluetooth printers
  async function handleScanBluetooth() {
    try {
      const permission = await requestBluetoothPermission();
      if (!permission.granted) {
        toast.error('Cần cấp quyền Bluetooth để quét máy in');
        return;
      }

      setIsScanning(true);
      setDiscoveredPrinters([]);
      toast.info('Đang quét máy in Bluetooth...', { duration: 3000 });

      const discovered = await scanForPrinters(10000);

      if (discovered.length === 0) {
        toast.warning('Không tìm thấy máy in. Kiểm tra máy in đã bật và ở chế độ pairing');
      } else {
        const discoveredWithStatus = discovered.map(p => ({
          ...p,
          selected: localPrinters.some(lp => lp.id === p.id)
        }));
        setDiscoveredPrinters(discoveredWithStatus);
        setShowDiscoveredSheet(true);
        toast.success(`Tìm thấy ${discovered.length} thiết bị`);
      }
    } catch (error) {
      console.error('Error scanning:', error);
      toast.error('Lỗi khi quét máy in');
    } finally {
      setIsScanning(false);
    }
  }

  // Scan WiFi printers
  async function handleScanWiFi() {
    try {
      setIsScanningWifi(true);
      setDiscoveredPrinters([]);

      if (!isMobile) {
        toast.info('Đang quét máy in WiFi... (có thể bị giới hạn trên máy tính)', { duration: 5000 });
      } else {
        toast.info('Đang quét máy in WiFi trong mạng LAN...', { duration: 5000 });
      }

      const discovered = await scanForWiFiPrinters();

      if (discovered.length === 0) {
        toast.warning('Không tìm thấy máy in WiFi. Hãy thêm thủ công bằng địa chỉ IP.');
      } else {
        const discoveredWithStatus = discovered.map(p => ({
          ...p,
          selected: localPrinters.some(lp => lp.id === p.id)
        }));
        setDiscoveredPrinters(discoveredWithStatus);
        setShowDiscoveredSheet(true);
        toast.success(`Tìm thấy ${discovered.length} máy in WiFi`);
      }
    } catch (error) {
      console.error('Error scanning WiFi:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('quét tự động')) {
        toast.info('Không thể quét tự động. Vui lòng thêm thủ công bằng IP.', { duration: 5000 });
      } else {
        toast.error('Lỗi khi quét: ' + errorMessage);
      }
    } finally {
      setIsScanningWifi(false);
    }
  }

  // Toggle selection of discovered printer
  function togglePrinterSelection(printerId: string) {
    setDiscoveredPrinters(prev =>
      prev.map(p =>
        p.id === printerId ? { ...p, selected: !p.selected } : p
      )
    );
  }

  // Save selected discovered printers
  async function saveSelectedPrinters() {
    const selected = discoveredPrinters.filter(p => p.selected);

    if (selected.length === 0) {
      toast.warning('Chưa chọn máy in nào');
      return;
    }

    try {
      for (const printer of selected) {
        await savePrinter(printer);
      }
      await loadLocalPrinters();
      setShowDiscoveredSheet(false);
      setDiscoveredPrinters([]);
      toast.success(`Đã lưu ${selected.length} máy in`);
    } catch (error) {
      console.error('Error saving printers:', error);
      toast.error('Lỗi khi lưu máy in');
    }
  }

  // Web Test Print Handler
  async function handleWebTestPrint(type: 'invoice' | 'transfer_voucher') {
    const dummyData = type === 'invoice' ? {
      invoiceNumber: 'TEST-WEB-001',
      date: new Date(),
      employeeName: (user as any)?.name || 'Admin',
      customerName: 'Khách hàng Test',
      items: [
        { productName: 'Sản phẩm A (Test)', quantity: 1, unitPrice: 100000, total: 100000 },
        { productName: 'Sản phẩm B (Test)', quantity: 2, unitPrice: 50000, total: 100000 }
      ],
      totalAmount: 200000,
      paymentMethod: 'Tiền mặt'
    } : {
      transferNumber: 'TEST-TR-001',
      date: new Date(),
      fromWarehouse: 'Kho Tổng',
      toWarehouse: 'Kho CN1',
      items: [
        { productName: 'Hàng chuyển đi A', quantity: 10, unit: 'Cái', note: 'Mới' }
      ]
    };

    try {
      await printDocument(type as any, dummyData);
    } catch (e) {
      console.error(e);
      toast.error('Lỗi in thử');
    }
  }

  // Add WiFi printer manually
  async function handleAddWiFiPrinter() {
    try {
      setAddingWifi(true);

      if (!wifiIP) {
        toast.error('Vui lòng nhập địa chỉ IP');
        return;
      }

      const port = parseInt(wifiPort) || 9100;
      await addWiFiPrinter(wifiIP, port, wifiName || undefined);

      await loadLocalPrinters();
      toast.success('Đã thêm máy in WiFi!');

      setShowWifiDialog(false);
      setWifiIP('');
      setWifiPort('9100');
      setWifiName('');
    } catch (error) {
      console.error('Error adding WiFi printer:', error);
      toast.error('Lỗi khi thêm máy in: ' + (error as Error).message);
    } finally {
      setAddingWifi(false);
    }
  }

  // Edit printer name and type
  function openEditDialog(printer: BluetoothPrinter) {
    setEditingPrinter(printer);
    setEditName(printer.name);
    setEditType(printer.type);
    setShowEditDialog(true);
  }

  async function handleSaveEdit() {
    if (!editingPrinter) return;

    try {
      const updated: BluetoothPrinter = {
        ...editingPrinter,
        name: editName,
        type: editType,
      };
      await savePrinter(updated);
      await loadLocalPrinters();
      setShowEditDialog(false);
      setEditingPrinter(null);
      toast.success('Đã cập nhật máy in');
    } catch (error) {
      console.error('Error updating printer:', error);
      toast.error('Lỗi khi cập nhật máy in');
    }
  }

  // Remove printer
  async function handleRemovePrinter(printerId: string) {
    try {
      await removePrinter(printerId);
      await loadLocalPrinters();
      toast.success('Đã xóa máy in');
    } catch (error) {
      console.error('Error removing:', error);
      toast.error('Lỗi khi xóa máy in');
    }
  }

  // Test print
  async function handleTestPrint(printerId: string) {
    try {
      setTestingPrinter(printerId);
      toast.info('Đang in thử...');

      const success = await testPrint(printerId);

      if (success) {
        toast.success('In thử thành công!');
      } else {
        toast.error('In thử thất bại');
      }
    } catch (error) {
      console.error('Error test printing:', error);
      toast.error('Lỗi khi in thử: ' + (error as Error).message);
    } finally {
      setTestingPrinter(null);
    }
  }

  // Open assign dialog
  function openAssignDialog(printer: BluetoothPrinter) {
    setAssigningPrinter(printer);
    const assigned = printerConfigs
      .filter(c => c.printer_id === printer.id)
      .map(c => c.document_type);
    setSelectedDocTypes(assigned);
    setShowAssignDialog(true);
  }

  // Toggle document type selection
  function toggleDocType(docType: string) {
    setSelectedDocTypes(prev =>
      prev.includes(docType)
        ? prev.filter(d => d !== docType)
        : [...prev, docType]
    );
  }

  // Save document type assignments
  async function handleSaveAssignments() {
    if (!assigningPrinter || !user?.warehouseId) return;

    try {
      setSaving(true);

      const currentAssigned = printerConfigs
        .filter(c => c.printer_id === assigningPrinter.id)
        .map(c => c.document_type);

      const toAdd = selectedDocTypes.filter(d => !currentAssigned.includes(d));
      const toRemove = currentAssigned.filter(d => !selectedDocTypes.includes(d));

      for (const docType of toAdd) {
        await mobileFetch(`/api/warehouses/${user.warehouseId}/printer-configs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            printer_id: assigningPrinter.id,
            printer_name: assigningPrinter.name,
            printer_type: assigningPrinter.type,
            connection_type: assigningPrinter.connectionType,
            ip_address: assigningPrinter.ipAddress,
            port: assigningPrinter.port,
            document_type: docType,
          }),
        });
      }

      for (const docType of toRemove) {
        await mobileFetch(`/api/warehouses/${user.warehouseId}/printer-configs?document_type=${docType}`,
          { method: 'DELETE', credentials: 'include' }
        );
      }

      await loadPrinterConfigs();
      setShowAssignDialog(false);
      setAssigningPrinter(null);
      toast.success('Đã lưu cấu hình máy in!');
    } catch (error) {
      console.error('Error saving assignments:', error);
      toast.error('Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  }

  // Get document type label
  function getDocTypeLabel(docType: string) {
    return DOCUMENT_TYPES.find(d => d.value === docType)?.label || docType;
  }

  // Get assigned document types for a printer
  function getAssignedDocTypes(printerId: string): string[] {
    return printerConfigs
      .filter(c => c.printer_id === printerId)
      .map(c => c.document_type);
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobilePageHeader
        icon={Printer}
        title="Cài Đặt Máy In"
        subtitle="Quản lý máy in cho kho"
      />

      <div className="container mx-auto p-3 sm:p-4 space-y-4">
        {/* Scan Options / Web Hint */}
        {isMobile ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Scan className="h-5 w-5" />
                Tìm kiếm máy in
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Quét Bluetooth hoặc thêm máy in WiFi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bluetooth */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
                <div className="flex items-center gap-2">
                  <Bluetooth className="h-5 w-5 text-blue-500" />
                  <span className="font-medium text-sm">Bluetooth</span>
                  {isBluetoothOn ? (
                    <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Bật
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600 border-red-300 text-xs">
                      <XCircle className="h-3 w-3 mr-1" />
                      Tắt
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={handleScanBluetooth}
                  disabled={isScanning}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Đang quét...
                    </>
                  ) : (
                    <>
                      <Scan className="h-4 w-4 mr-2" />
                      Quét Bluetooth
                    </>
                  )}
                </Button>
              </div>

              {/* WiFi */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-sm">WiFi (LAN)</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    onClick={handleScanWiFi}
                    disabled={isScanningWifi}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    {isScanningWifi ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Đang quét...
                      </>
                    ) : (
                      <>
                        <Scan className="h-4 w-4 mr-2" />
                        Quét WiFi
                      </>
                    )}
                  </Button>

                  <Dialog open={showWifiDialog} onOpenChange={setShowWifiDialog}>
                    <DialogTrigger asChild>
                      <Button variant="default" size="sm" className="w-full sm:w-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        Thêm thủ công
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Thêm máy in WiFi</DialogTitle>
                        <DialogDescription>
                          Nhập địa chỉ IP và cổng của máy in trong mạng LAN
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="wifi-ip">Địa chỉ IP *</Label>
                          <Input
                            id="wifi-ip"
                            placeholder="192.168.1.100"
                            value={wifiIP}
                            onChange={(e) => setWifiIP(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wifi-port">Cổng (Port)</Label>
                          <Input
                            id="wifi-port"
                            placeholder="9100"
                            value={wifiPort}
                            onChange={(e) => setWifiPort(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wifi-name">Tên máy in (tùy chọn)</Label>
                          <Input
                            id="wifi-name"
                            placeholder="Máy in WiFi 1"
                            value={wifiName}
                            onChange={(e) => setWifiName(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowWifiDialog(false)}
                          disabled={addingWifi}
                          className="w-full sm:w-auto"
                        >
                          Hủy
                        </Button>
                        <Button
                          onClick={handleAddWiFiPrinter}
                          disabled={addingWifi}
                          className="w-full sm:w-auto"
                        >
                          {addingWifi ? 'Đang thêm...' : 'Thêm máy in'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-blue-800">
                <Printer className="h-5 w-5" />
                In qua Trình duyệt Web
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-blue-600">
                Bạn đang sử dụng phiên bản Web. Vui lòng kết nối máy in (USB/LAN) với máy tính và cài đặt Driver.
                Khi bấm "In", hãy chọn máy in từ hộp thoại của trình duyệt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => handleWebTestPrint('invoice')} variant="default" size="sm">
                  In thử Hóa đơn (K80)
                </Button>
                <Button onClick={() => handleWebTestPrint('transfer_voucher')} variant="outline" size="sm" className="bg-white">
                  In thử Phiếu A4
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Saved Printers Card */}
        < Card >
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Máy in đã lưu ({localPrinters.length})
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Nhấn vào máy in để gán loại tài liệu
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : localPrinters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Printer className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Chưa có máy in nào</p>
                <p className="text-xs mt-1">Quét hoặc thêm máy in để bắt đầu</p>
              </div>
            ) : (
              <div className="space-y-3">
                {localPrinters.map(printer => {
                  const assignedDocs = getAssignedDocTypes(printer.id);

                  return (
                    <div
                      key={printer.id}
                      className="border rounded-lg p-3 space-y-3"
                    >
                      {/* Printer Info Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {printer.connectionType === 'wifi' ? (
                              <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <Bluetooth className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            )}
                            <span className="font-medium text-sm truncate">
                              {printer.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {printer.type}
                            </Badge>
                            <Badge
                              variant={printer.connectionType === 'wifi' ? 'secondary' : 'default'}
                              className="text-xs"
                            >
                              {printer.connectionType === 'wifi' ? 'WiFi' : 'BT'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {printer.id}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(printer)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-500"
                            onClick={() => handleRemovePrinter(printer.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Assigned Document Types */}
                      {assignedDocs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {assignedDocs.map(docType => (
                            <Badge
                              key={docType}
                              variant="secondary"
                              className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                            >
                              {DOCUMENT_TYPES.find(d => d.value === docType)?.icon}{' '}
                              {getDocTypeLabel(docType)}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-8"
                          onClick={() => handleTestPrint(printer.id)}
                          disabled={testingPrinter === printer.id}
                        >
                          {testingPrinter === printer.id ? (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              Đang in...
                            </>
                          ) : (
                            <>
                              <Printer className="h-3 w-3 mr-1" />
                              In thử
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          className="flex-1 text-xs h-8"
                          onClick={() => openAssignDialog(printer)}
                        >
                          <Settings2 className="h-3 w-3 mr-1" />
                          Gán tài liệu
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card >

        {/* Document Type Assignments Overview */}
        < Card >
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Cấu hình loại tài liệu
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Máy in được gán cho từng loại tài liệu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {DOCUMENT_TYPES.map(docType => {
                const config = printerConfigs.find(c => c.document_type === docType.value);

                return (
                  <div
                    key={docType.value}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{docType.icon}</span>
                      <span className="text-sm font-medium">{docType.label}</span>
                    </div>
                    {config ? (
                      <Badge variant="secondary" className="text-xs">
                        {config.printer_name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Chưa gán
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card >

        {/* Instructions */}
        < Card >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Hướng dẫn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-1.5 text-xs sm:text-sm text-muted-foreground">
              <li>Quét hoặc thêm máy in thủ công</li>
              <li>Đặt tên và chọn loại máy in (58mm/80mm)</li>
              <li>Gán máy in cho từng loại tài liệu</li>
              <li>In thử để kiểm tra kết nối</li>
            </ol>
          </CardContent>
        </Card >
      </div >

      {/* Discovered Printers Sheet */}
      < Sheet open={showDiscoveredSheet} onOpenChange={setShowDiscoveredSheet} >
        <SheetContent side="bottom" className="h-[80vh] pb-safe">
          <SheetHeader className="pb-2">
            <SheetTitle>Thiết bị tìm thấy ({discoveredPrinters.length})</SheetTitle>
            <SheetDescription>
              Chọn máy in để lưu vào danh sách
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4" style={{ maxHeight: 'calc(80vh - 180px)' }}>
            <div className="space-y-2 pr-2">
              {discoveredPrinters.map(printer => (
                <div
                  key={printer.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${printer.selected
                    ? 'bg-primary/10 border-primary'
                    : 'bg-background hover:bg-muted'
                    }`}
                  onClick={() => togglePrinterSelection(printer.id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${printer.selected ? 'bg-primary border-primary' : 'border-muted-foreground'
                      }`}>
                      {printer.selected && (
                        <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {printer.connectionType === 'wifi' ? (
                          <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Bluetooth className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{printer.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{printer.id}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                    {printer.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          <SheetFooter className="pt-4 pb-6 border-t bg-background">
            <Button
              onClick={saveSelectedPrinters}
              className="w-full"
              size="lg"
              disabled={discoveredPrinters.filter(p => p.selected).length === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              Lưu {discoveredPrinters.filter(p => p.selected).length} máy in đã chọn
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet >

      {/* Edit Printer Dialog */}
      < Dialog open={showEditDialog} onOpenChange={setShowEditDialog} >
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa máy in</DialogTitle>
            <DialogDescription>
              Đổi tên và loại máy in
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Tên máy in</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nhập tên máy in"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Loại máy in</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as PrinterType)}>
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRINTER_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              className="w-full sm:w-auto"
            >
              Hủy
            </Button>
            <Button onClick={handleSaveEdit} className="w-full sm:w-auto">
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Assign Document Types Dialog */}
      < Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog} >
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gán loại tài liệu</DialogTitle>
            <DialogDescription>
              Chọn loại tài liệu sẽ in bằng máy in này
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {DOCUMENT_TYPES.map(docType => {
                const isSelected = selectedDocTypes.includes(docType.value);
                const isUsedByOther = printerConfigs.some(
                  c => c.document_type === docType.value &&
                    c.printer_id !== assigningPrinter?.id
                );

                return (
                  <div
                    key={docType.value}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${isSelected
                      ? 'bg-primary/10 border-primary'
                      : isUsedByOther
                        ? 'bg-muted/50 border-muted'
                        : 'bg-background hover:bg-muted'
                      }`}
                    onClick={() => !isUsedByOther && toggleDocType(docType.value)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
                        }`}>
                        {isSelected && (
                          <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-lg">{docType.icon}</span>
                      <span className="text-sm font-medium">{docType.label}</span>
                    </div>
                    {isUsedByOther && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Đã gán khác
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAssignDialog(false)}
              className="w-full sm:w-auto"
            >
              Hủy
            </Button>
            <Button
              onClick={handleSaveAssignments}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </div >
  );
}
