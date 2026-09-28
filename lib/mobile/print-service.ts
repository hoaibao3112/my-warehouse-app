/**
 * Multi-Protocol Print Service for Warehouse Express
 * Supports:
 * - Classic Bluetooth SPP (Serial Port Profile) - Most thermal printers
 * - Bluetooth Low Energy (BLE) - Modern printers
 * - WiFi/LAN TCP Socket - Network printers (port 9100)
 * 
 * ESC/POS thermal printers (58mm/80mm) and A4 printers
 */

import { Preferences } from '@capacitor/preferences';
import { BluetoothLe, ScanResult } from '@capacitor-community/bluetooth-le';
import { BluetoothSerial } from '@fmesasc/capacitor-bluetooth-serial';
import { TcpSocket } from '@deedarb/capacitor-tcp-socket';
import { Network } from '@capacitor/network';
import { requestBluetoothPermission } from './permissions';
import { isNativePlatform } from './platform';
import { printWebDocument } from './web-print';

export type PrinterType = 'thermal_58mm' | 'thermal_80mm' | 'a4_bluetooth';

// Extended connection types for better printer support
export type PrinterConnectionType = 'bluetooth_classic' | 'bluetooth_le' | 'wifi';

export type DocumentType =
  | 'invoice'
  | 'transfer_voucher'
  | 'supplier_intake'
  | 'shift_summary'
  | 'loss_report'
  | 'inventory_report';

export interface BluetoothPrinter {
  id: string; // MAC address for Bluetooth, IP:port for WiFi
  name: string;
  type: PrinterType;
  connectionType: PrinterConnectionType;
  isConnected: boolean;
  lastUsed?: Date;
  // WiFi specific fields
  ipAddress?: string;
  port?: number;
}

export interface PrinterConfig {
  documentType: DocumentType;
  printerId: string | null; // null = no default printer
}

export interface PrintJob {
  id: string;
  documentType: DocumentType;
  data: any;
  status: 'pending' | 'printing' | 'success' | 'failed';
  error?: string;
  createdAt: Date;
}

// Storage keys
const PRINTERS_KEY = 'bluetooth_printers';
const PRINTER_CONFIGS_KEY = 'printer_configs';

// Track connection states
let isBluetoothSerialConnected = false;
let currentConnectedDeviceId: string | null = null;
let wifiClientMap: Record<string, number> = {}; // Map "ip:port" to client ID

// ================================
// INITIALIZATION
// ================================

/**
 * Initialize all Bluetooth modules (BLE and Classic)
 */
export async function initializeBluetooth(): Promise<boolean> {
  try {
    // Request permissions first
    const permission = await requestBluetoothPermission();
    if (!permission.granted) {
      throw new Error('Bluetooth permission denied');
    }

    // Initialize both BLE and Classic Bluetooth
    try {
      await BluetoothLe.initialize();
      console.log('[initializeBluetooth] BLE initialized');
    } catch (e) {
      console.warn('[initializeBluetooth] BLE init failed (may not be available):', e);
    }

    try {
      // BluetoothSerial doesn't need explicit init on most devices
      // We assume it's available if the plugin connects
    } catch (e) {
      console.warn('[initializeBluetooth] Classic BT check failed:', e);
    }

    return true;
  } catch (error) {
    console.error('Error initializing Bluetooth:', error);
    return false;
  }
}

/**
 * Check if Bluetooth is enabled
 */
export async function isBluetoothEnabled(): Promise<boolean> {
  try {
    // Check both BLE and Classic
    let bleEnabled = false;
    let classicEnabled = false;

    try {
      const result: any = await BluetoothLe.isEnabled();
      // Handle different return types (boolean or { value: boolean } or { enabled: boolean })
      bleEnabled = result === true || result?.value === true || result?.enabled === true;
    } catch (e) {
      console.log('[isBluetoothEnabled] BLE check failed');
    }

    try {
      const result: any = await BluetoothSerial.isEnabled();
      classicEnabled = result === true || result?.enabled === true;
    } catch (e) {
      console.log('[isBluetoothEnabled] Classic check failed');
    }

    return bleEnabled || classicEnabled;
  } catch (error) {
    console.error('Error checking Bluetooth status:', error);
    return false;
  }
}

/**
 * Enable Bluetooth
 */
export async function enableBluetooth(): Promise<boolean> {
  try {
    // Try to enable via Classic Bluetooth (more reliable for printers)
    try {
      await BluetoothSerial.enable();
      return true;
    } catch (e) {
      console.log('[enableBluetooth] Classic enable failed, trying BLE');
    }

    try {
      await BluetoothLe.enable();
      return true;
    } catch (e) {
      console.log('[enableBluetooth] BLE enable failed');
    }

    return false;
  } catch (error) {
    console.error('Error enabling Bluetooth:', error);
    return false;
  }
}

// ================================
// BLUETOOTH SCANNING
// ================================

/**
 * Scan for ALL Bluetooth printers (BLE + Classic bonded devices)
 * This is the main function to use for comprehensive printer discovery
 */
export async function scanForPrinters(
  durationMs: number = 10000
): Promise<BluetoothPrinter[]> {
  const allDevices: BluetoothPrinter[] = [];
  const seenIds = new Set<string>();

  // First, get paired/bonded Classic Bluetooth devices
  // This is the most reliable method for thermal printers
  try {
    console.log('[scanForPrinters] Getting bonded Classic BT devices...');
    const bondedDevices = await scanClassicBluetoothDevices();

    for (const device of bondedDevices) {
      if (!seenIds.has(device.id)) {
        seenIds.add(device.id);
        allDevices.push(device);
      }
    }
    console.log(`[scanForPrinters] Found ${bondedDevices.length} bonded Classic BT devices`);
  } catch (e) {
    console.warn('[scanForPrinters] Classic BT scan failed:', e);
  }

  // Then scan for BLE devices
  try {
    console.log('[scanForPrinters] Scanning BLE devices...');
    const bleDevices = await scanBLEDevices(durationMs);

    for (const device of bleDevices) {
      if (!seenIds.has(device.id)) {
        seenIds.add(device.id);
        allDevices.push(device);
      }
    }
    console.log(`[scanForPrinters] Found ${bleDevices.length} BLE devices`);
  } catch (e) {
    console.warn('[scanForPrinters] BLE scan failed:', e);
  }

  console.log(`[scanForPrinters] Total devices found: ${allDevices.length}`);
  return allDevices;
}

/**
 * Scan for Classic Bluetooth bonded (paired) devices
 * Most thermal printers use Classic Bluetooth SPP
 */
async function scanClassicBluetoothDevices(): Promise<BluetoothPrinter[]> {
  try {
    // Check if enabled
    const enabledState: any = await BluetoothSerial.isEnabled();
    const isEnabled = enabledState === true || enabledState?.enabled === true;

    if (!isEnabled) {
      console.log('[scanClassicBT] Bluetooth not enabled, trying to enable...');
      await BluetoothSerial.enable();
    }

    // Scan for devices (using scan() method which returns available devices)
    // Note: Some plugins use list() for bonded devices, but @fmesasc uses scan()
    const result = await BluetoothSerial.scan();
    const devices = result.devices || [];

    console.log('[scanClassicBT] Found devices:', devices);

    return devices.map((device: { address: string; name?: string; class?: number }) => ({
      id: device.address,
      name: device.name || 'Unknown Device',
      type: guessPrinterType(device.name || ''),
      connectionType: 'bluetooth_classic' as PrinterConnectionType,
      isConnected: false,
    }));
  } catch (error) {
    console.error('[scanClassicBT] Error:', error);
    throw error;
  }
}

/**
 * Scan for BLE (Bluetooth Low Energy) devices
 */
async function scanBLEDevices(durationMs: number): Promise<BluetoothPrinter[]> {
  try {
    const enabledState: any = await BluetoothLe.isEnabled();
    const isEnabled = enabledState === true || enabledState?.value === true || enabledState?.enabled === true;

    if (!isEnabled) {
      console.log('[scanBLE] BLE not enabled');
      return [];
    }

    const devices: BluetoothPrinter[] = [];
    const discoveredIds = new Set<string>();

    // Start BLE scanning
    const scanListener = await BluetoothLe.addListener('onScanResult', (result: any) => {
      if (result.device && !discoveredIds.has(result.device.deviceId)) {
        discoveredIds.add(result.device.deviceId);

        const name = result.device.name || 'Unknown Device';

        // Filter for likely printers
        const isPrinter =
          name.toLowerCase().includes('printer') ||
          name.toLowerCase().includes('print') ||
          name.toLowerCase().includes('pos') ||
          name.toLowerCase().includes('rpp') ||
          name.toLowerCase().includes('mpt') ||
          name.toLowerCase().includes('thermal') ||
          name.toLowerCase().includes('xprinter') ||
          name.toLowerCase().includes('epson') ||
          name.toLowerCase().includes('star');

        if (isPrinter || !result.device.name) {
          devices.push({
            id: result.device.deviceId,
            name: name,
            type: guessPrinterType(name),
            connectionType: 'bluetooth_le',
            isConnected: false
          });
        }
      }
    });

    await BluetoothLe.requestLEScan({});

    // Wait for scan duration
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await BluetoothLe.stopLEScan();
    await scanListener.remove();

    return devices;
  } catch (error) {
    console.error('[scanBLE] Error:', error);
    throw error;
  }
}

/**
 * Guess printer type from device name
 */
function guessPrinterType(name: string): PrinterType {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('58mm') || lowerName.includes('58')) {
    return 'thermal_58mm';
  }

  if (lowerName.includes('80mm') || lowerName.includes('80')) {
    return 'thermal_80mm';
  }

  if (lowerName.includes('a4')) {
    return 'a4_bluetooth';
  }

  // Default to 80mm thermal printer (most common)
  return 'thermal_80mm';
}

// ================================
// WiFi/LAN PRINTER FUNCTIONS
// ================================

/**
 * Scan for WiFi printers in local network using real TCP socket
 * Scans common printer ports (9100, 9101, 9102) on local subnet
 */
export async function scanForWiFiPrinters(subnet?: string): Promise<BluetoothPrinter[]> {
  try {
    const printers: BluetoothPrinter[] = [];

    // Try to get local IP if subnet not provided
    let targetSubnet = subnet;
    if (!targetSubnet) {
      const localIP = await getLocalIPAddress();
      if (localIP) {
        targetSubnet = localIP.substring(0, localIP.lastIndexOf('.'));
        console.log('[scanWiFi] Detected subnet:', targetSubnet);
      }
    }

    if (!targetSubnet) {
      console.warn('[scanWiFi] Cannot detect local subnet. Please add printer manually.');
      return [];
    }

    const commonPorts = [9100, 9101, 9102]; // Common ESC/POS printer ports

    // Scan subnet range with real TCP connections
    // Use smaller range for faster scanning (common router DHCP ranges)
    const scanRanges = [
      { start: 1, end: 50 },
      { start: 100, end: 150 },
      { start: 200, end: 254 }
    ];

    const scanPromises: Promise<void>[] = [];

    for (const range of scanRanges) {
      for (let i = range.start; i <= range.end; i++) {
        const ip = `${targetSubnet}.${i}`;

        for (const port of commonPorts) {
          scanPromises.push(
            testPrinterConnectionTCP(ip, port, 500)
              .then((isOnline) => {
                if (isOnline) {
                  console.log(`[scanWiFi] Found printer at ${ip}:${port}`);
                  printers.push({
                    id: `${ip}:${port}`,
                    name: `WiFi Printer ${ip}:${port}`,
                    type: 'thermal_80mm',
                    connectionType: 'wifi',
                    isConnected: false,
                    ipAddress: ip,
                    port: port,
                  });
                }
              })
              .catch(() => {
                // Ignore failed connections
              })
          );
        }
      }
    }

    // Wait for all scans with timeout
    await Promise.race([
      Promise.all(scanPromises),
      new Promise((resolve) => setTimeout(resolve, 15000))
    ]);

    console.log(`[scanWiFi] Found ${printers.length} WiFi printers`);
    return printers;
  } catch (error) {
    console.error('Error scanning for WiFi printers:', error);
    throw error;
  }
}

/**
 * Get local IP address of device
 */
async function getLocalIPAddress(): Promise<string | null> {
  try {
    // Method 1: Try Capacitor Network plugin
    try {
      const status = await Network.getStatus();
      console.log('[getLocalIP] Network status:', status);

      if (status.connected && status.connectionType === 'wifi') {
        console.log('[getLocalIP] Connected to WiFi');
      }
    } catch (networkError) {
      console.log('[getLocalIP] Network plugin not available:', networkError);
    }

    // Method 2: Use WebRTC to detect local IP
    if (typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined') {
      return new Promise((resolve) => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        const noop = () => { };

        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(noop);

        const timeout = setTimeout(() => {
          pc.close();
          resolve(null);
        }, 3000);

        pc.onicecandidate = (ice) => {
          if (!ice || !ice.candidate || !ice.candidate.candidate) {
            return;
          }

          const candidate = ice.candidate.candidate;
          const ipMatch = candidate.match(/(\d{1,3}\.){3}\d{1,3}/);

          if (ipMatch) {
            const ip = ipMatch[0];
            if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) {
              console.log('[getLocalIP] Found local IP via WebRTC:', ip);
              clearTimeout(timeout);
              pc.close();
              resolve(ip);
            }
          }
        };
      });
    }

    return null;
  } catch (error) {
    console.error('Error getting local IP:', error);
    return null;
  }
}

/**
 * Test connection to a printer using real TCP socket
 */
async function testPrinterConnectionTCP(ip: string, port: number, timeoutMs: number = 1000): Promise<boolean> {
  try {
    // Use native TCP socket plugin for real connection test
    // Note: timeout is in seconds usually for plugins, but check definition
    // @deedarb/capacitor-tcp-socket usually takes timeout in seconds

    // Convert ms to seconds (rounding up)
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));

    const result = await TcpSocket.connect({
      ipAddress: ip,
      port: port,
      timeout: timeoutSeconds
    });

    // If we get here, connection succeeded
    const client = result.client;

    // Disconnect immediately
    await TcpSocket.disconnect({ client });

    return true;
  } catch (error) {
    // Connection failed
    return false;
  }
}

/**
 * Add WiFi printer manually by IP and port
 */
export async function addWiFiPrinter(
  ip: string,
  port: number = 9100,
  name?: string,
  type: PrinterType = 'thermal_80mm'
): Promise<BluetoothPrinter> {
  try {
    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      throw new Error('Địa chỉ IP không hợp lệ. Vui lòng nhập đúng định dạng (ví dụ: 192.168.1.100)');
    }

    // Validate port
    if (port < 1 || port > 65535) {
      throw new Error('Số cổng không hợp lệ. Vui lòng nhập từ 1 đến 65535');
    }

    // Test connection with TCP socket
    let connectionStatus = false;
    try {
      connectionStatus = await testPrinterConnectionTCP(ip, port, 3000);
      console.log(`[addWiFiPrinter] Connection test to ${ip}:${port}:`, connectionStatus);
    } catch (e) {
      console.log('[addWiFiPrinter] Connection test failed, adding printer anyway');
    }

    const printer: BluetoothPrinter = {
      id: `${ip}:${port}`,
      name: name || `WiFi Printer ${ip}:${port}`,
      type: type,
      connectionType: 'wifi',
      isConnected: connectionStatus,
      ipAddress: ip,
      port: port,
    };

    // Save printer
    await savePrinter(printer);

    return printer;
  } catch (error) {
    console.error('Error adding WiFi printer:', error);
    throw error;
  }
}

// ================================
// CONNECTION MANAGEMENT
// ================================

/**
 * Connect to printer based on connection type
 */
export async function connectToPrinter(printerId: string): Promise<boolean> {
  try {
    const printers = await getSavedPrinters();
    const printer = printers.find(p => p.id === printerId);

    if (!printer) {
      throw new Error('Printer not found');
    }

    console.log(`[connectToPrinter] Connecting to ${printer.name} (${printer.connectionType})`);

    switch (printer.connectionType) {
      case 'wifi':
        return await connectWiFiPrinter(printer);

      case 'bluetooth_classic':
        return await connectClassicBluetoothPrinter(printer);

      case 'bluetooth_le':
        return await connectBLEPrinter(printer);

      default:
        // Legacy support
        return await connectClassicBluetoothPrinter(printer);
    }
  } catch (error) {
    console.error('Error connecting to printer:', error);
    return false;
  }
}

async function connectWiFiPrinter(printer: BluetoothPrinter): Promise<boolean> {
  if (!printer.ipAddress || !printer.port) {
    throw new Error('WiFi printer missing IP or port');
  }

  // For WiFi, we just test connection here. 
  // Real persistent connection is managing per-request for simplicity, 
  // or we can keep it open but state management is harder with networking issues.
  // We'll test it and if good return true.

  return await testPrinterConnectionTCP(printer.ipAddress, printer.port, 5000);
}

async function connectClassicBluetoothPrinter(printer: BluetoothPrinter): Promise<boolean> {
  try {
    // Check if already connected to this device
    if (isBluetoothSerialConnected && currentConnectedDeviceId === printer.id) {
      try {
        const result: any = await BluetoothSerial.isConnected({ address: printer.id });
        if (result === true || result?.connected === true) {
          console.log('[connectClassicBT] Already connected');
          return true;
        }
      } catch (e) {
        // Not connected or error checking, proceed to connect
      }
    }

    // Disconnect from any existing connection first
    try {
      if (isBluetoothSerialConnected) {
        await BluetoothSerial.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
    }

    console.log(`[connectClassicBT] Connecting to ${printer.id}`);
    await BluetoothSerial.connect({ address: printer.id });

    isBluetoothSerialConnected = true;
    currentConnectedDeviceId = printer.id;

    console.log(`[connectClassicBT] Connected successfully to ${printer.name}`);
    return true;
  } catch (error) {
    console.error('[connectClassicBT] Connection failed:', error);
    isBluetoothSerialConnected = false;
    currentConnectedDeviceId = null;
    throw error;
  }
}

async function connectBLEPrinter(printer: BluetoothPrinter): Promise<boolean> {
  try {
    await BluetoothLe.connect({ deviceId: printer.id });
    console.log(`[connectBLE] Connected to ${printer.name}`);
    return true;
  } catch (error) {
    console.error('[connectBLE] Connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from printer
 */
export async function disconnectFromPrinter(printerId: string): Promise<void> {
  try {
    const printers = await getSavedPrinters();
    const printer = printers.find(p => p.id === printerId);

    if (!printer) {
      return;
    }

    switch (printer.connectionType) {
      case 'bluetooth_classic':
        if (currentConnectedDeviceId === printerId) {
          await BluetoothSerial.disconnect();
          isBluetoothSerialConnected = false;
          currentConnectedDeviceId = null;
        }
        break;

      case 'bluetooth_le':
        await BluetoothLe.disconnect({ deviceId: printerId });
        break;

      case 'wifi':
        // Close specific client if we have one (we mostly use one-shot)
        const client = wifiClientMap[printer.id];
        if (client) {
          try {
            await TcpSocket.disconnect({ client });
            delete wifiClientMap[printer.id];
          } catch (e) { }
        }
        break;
    }
  } catch (error) {
    console.error('Error disconnecting from printer:', error);
  }
}

// ================================
// DATA SENDING
// ================================

/**
 * Send data to printer based on connection type
 */
async function sendDataToPrinter(
  printerId: string,
  data: Uint8Array
): Promise<void> {
  try {
    const printers = await getSavedPrinters();
    const printer = printers.find(p => p.id === printerId);

    if (!printer) {
      throw new Error('Printer not found');
    }

    console.log(`[sendData] Sending ${data.length} bytes to ${printer.name} (${printer.connectionType})`);

    switch (printer.connectionType) {
      case 'wifi':
        await sendDataToWiFiPrinterTCP(printer.ipAddress!, printer.port!, data);
        break;

      case 'bluetooth_classic':
        await sendDataToClassicBluetooth(data);
        break;

      case 'bluetooth_le':
        await sendDataToBLEPrinter(printerId, data);
        break;

      default:
        // Legacy support - try classic first
        await sendDataToClassicBluetooth(data);
    }

    console.log('[sendData] Data sent successfully');
  } catch (error) {
    console.error('Error sending data to printer:', error);
    throw error;
  }
}

/**
 * Send data to WiFi printer via TCP socket
 */
async function sendDataToWiFiPrinterTCP(ip: string, port: number, data: Uint8Array): Promise<void> {
  try {
    // Open a fresh connection for sending data (reliable approach)
    const connectResult = await TcpSocket.connect({
      ipAddress: ip,
      port: port,
      timeout: 10 // 10 seconds timeout for printing
    });

    const client = connectResult.client;

    try {
      // Convert Uint8Array to string for the plugin
      // NOTE: This plugin might expect base64 or raw string. 
      // Checking definition earlier, it said `data: string`. 
      // Usually TCP plugins send string as-is or utf-8. 
      // Ideally we want raw bytes. String.fromCharCode does that roughly.
      const dataString = String.fromCharCode(...data);

      await TcpSocket.send({ client, data: dataString });

      // Small delay to ensure data flushed
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      // Ensure we disconnect
      await TcpSocket.disconnect({ client });
    }

    console.log(`[sendWiFi] Sent ${data.length} bytes to ${ip}:${port}`);
  } catch (error) {
    console.error('Error sending data to WiFi printer:', error);
    throw error;
  }
}

/**
 * Send data via Classic Bluetooth Serial
 */
async function sendDataToClassicBluetooth(data: Uint8Array): Promise<void> {
  try {
    if (!isBluetoothSerialConnected) {
      // Try to reconnect?
      throw new Error('Not connected to Classic Bluetooth device');
    }

    const dataString = String.fromCharCode(...data);

    await BluetoothSerial.write({ value: dataString } as any);

    console.log(`[sendClassicBT] Sent ${data.length} bytes`);
  } catch (error) {
    console.error('Error sending via Classic BT:', error);
    throw error;
  }
}

/**
 * Send data via BLE
 */
async function sendDataToBLEPrinter(printerId: string, data: Uint8Array): Promise<void> {
  try {
    // Common printer service UUIDs
    const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
    const CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

    // Write data in chunks (max 20 bytes per write for BLE)
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      await BluetoothLe.write({
        deviceId: printerId,
        service: SERVICE_UUID,
        characteristic: CHAR_UUID,
        value: btoa(String.fromCharCode(...chunk))
      });
    }

    console.log(`[sendBLE] Sent ${data.length} bytes`);
  } catch (error) {
    console.error('Error sending via BLE:', error);
    throw error;
  }
}

// ================================
// PRINTER STORAGE MANAGEMENT
// ================================

/**
 * Save printer to local storage
 */
export async function savePrinter(printer: BluetoothPrinter): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: PRINTERS_KEY });
    const printers: BluetoothPrinter[] = value ? JSON.parse(value) : [];

    // Update or add printer
    const index = printers.findIndex((p) => p.id === printer.id);
    if (index >= 0) {
      printers[index] = { ...printer, lastUsed: new Date() };
    } else {
      printers.push({ ...printer, lastUsed: new Date() });
    }

    await Preferences.set({
      key: PRINTERS_KEY,
      value: JSON.stringify(printers)
    });
  } catch (error) {
    console.error('Error saving printer:', error);
  }
}

/**
 * Get all saved printers
 */
export async function getSavedPrinters(): Promise<BluetoothPrinter[]> {
  try {
    const { value } = await Preferences.get({ key: PRINTERS_KEY });
    if (!value) return [];

    const printers: BluetoothPrinter[] = JSON.parse(value);

    // Migrate old 'bluetooth' type to 'bluetooth_classic'
    return printers.map((p) => ({
      ...p,
      connectionType: p.connectionType === 'bluetooth' as any ? 'bluetooth_classic' : p.connectionType,
      lastUsed: p.lastUsed ? new Date(p.lastUsed) : undefined
    }));
  } catch (error) {
    console.error('Error getting saved printers:', error);
    return [];
  }
}

/**
 * Remove printer
 */
export async function removePrinter(printerId: string): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: PRINTERS_KEY });
    if (!value) return;

    const printers: BluetoothPrinter[] = JSON.parse(value);
    const filtered = printers.filter((p) => p.id !== printerId);

    await Preferences.set({
      key: PRINTERS_KEY,
      value: JSON.stringify(filtered)
    });

    // Also disconnect if connected
    await disconnectFromPrinter(printerId);
  } catch (error) {
    console.error('Error removing printer:', error);
  }
}

// ================================
// PRINTER CONFIGURATION
// ================================

/**
 * Set default printer for document type
 */
export async function setDefaultPrinter(
  documentType: DocumentType,
  printerId: string | null
): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: PRINTER_CONFIGS_KEY });
    const configs: Record<DocumentType, string | null> = value
      ? JSON.parse(value)
      : {};

    configs[documentType] = printerId;

    await Preferences.set({
      key: PRINTER_CONFIGS_KEY,
      value: JSON.stringify(configs)
    });
  } catch (error) {
    console.error('Error setting default printer:', error);
  }
}

/**
 * Get default printer for document type
 */
export async function getDefaultPrinter(
  documentType: DocumentType
): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: PRINTER_CONFIGS_KEY });
    if (!value) return null;

    const configs: Record<DocumentType, string | null> = JSON.parse(value);
    return configs[documentType] || null;
  } catch (error) {
    console.error('Error getting default printer:', error);
    return null;
  }
}

/**
 * Get all printer configurations
 */
export async function getAllPrinterConfigs(): Promise<
  Record<DocumentType, string | null>
> {
  try {
    const { value } = await Preferences.get({ key: PRINTER_CONFIGS_KEY });
    if (!value) {
      return {
        invoice: null,
        transfer_voucher: null,
        supplier_intake: null,
        shift_summary: null,
        loss_report: null,
        inventory_report: null
      };
    }

    return JSON.parse(value);
  } catch (error) {
    console.error('Error getting printer configs:', error);
    return {
      invoice: null,
      transfer_voucher: null,
      supplier_intake: null,
      shift_summary: null,
      loss_report: null,
      inventory_report: null
    };
  }
}

/**
 * Get warehouse printer configuration
 */
export async function getWarehousePrinterConfig(
  warehouseId: string
): Promise<{ default_printer_id: string | null; require_printer: boolean } | null> {
  try {
    const response = await fetch(`/api/warehouses/${warehouseId}/printer`);
    if (!response.ok) return null;

    const result = await response.json();
    return result.success ? {
      default_printer_id: result.data.default_printer_id,
      require_printer: result.data.require_printer
    } : null;
  } catch (error) {
    console.error('Error fetching warehouse printer config:', error);
    return null;
  }
}

// ================================
// PRINTING FUNCTIONS
// ================================

/**
 * Print document
 */
export async function printDocument(
  documentType: DocumentType,
  data: any,
  printerId?: string,
  warehouseId?: string
): Promise<boolean> {
  try {
    // 1. Web/Desktop Handling
    // Bypass all printer config checks and use browser native print
    if (!isNativePlatform()) {
      console.log('[printDocument] Web platform detected, using browser print');
      return await printWebDocument(documentType, data);
    }

    // 2. Native Mobile Handling
    let targetPrinterId = printerId;

    // If warehouse ID provided, check warehouse-specific printer first
    if (warehouseId && !targetPrinterId) {
      const warehouseConfig = await getWarehousePrinterConfig(warehouseId);

      if (warehouseConfig) {
        if (warehouseConfig.require_printer && !warehouseConfig.default_printer_id) {
          throw new Error('Kho này yêu cầu cấu hình máy in. Vui lòng liên hệ quản lý để thiết lập máy in.');
        }

        if (warehouseConfig.default_printer_id) {
          targetPrinterId = warehouseConfig.default_printer_id;
        }
      }
    }

    // Fallback to document type default printer
    if (!targetPrinterId) {
      targetPrinterId = await getDefaultPrinter(documentType);
    }

    if (!targetPrinterId) {
      throw new Error('Chưa cấu hình máy in cho loại tài liệu này');
    }

    // Get printer details
    const printers = await getSavedPrinters();
    const printer = printers.find((p) => p.id === targetPrinterId);

    if (!printer) {
      throw new Error('Không tìm thấy máy in. Vui lòng kiểm tra lại cài đặt.');
    }

    // Connect to printer
    const connected = await connectToPrinter(targetPrinterId);
    if (!connected) {
      throw new Error('Không thể kết nối với máy in. Vui lòng kiểm tra kết nối.');
    }

    // Generate ESC/POS commands based on document type
    const escposData = await generateESCPOS(documentType, data, printer.type);

    // Send to printer
    await sendDataToPrinter(targetPrinterId, escposData);

    // Update last used
    await savePrinter({ ...printer, lastUsed: new Date() });

    return true;
  } catch (error) {
    console.error('Error printing document:', error);
    throw error;
  }
}

/**
 * Generate ESC/POS commands using templates
 */
async function generateESCPOS(
  documentType: DocumentType,
  data: any,
  printerType: PrinterType
): Promise<Uint8Array> {
  const { generatePrintData } = await import('./print-templates');
  return generatePrintData(documentType, data, printerType);
}

/**
 * Convert string to byte array
 */
function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  return bytes;
}

/**
 * Test print (sample receipt)
 */
export async function testPrint(printerId: string): Promise<boolean> {
  const testData = {
    title: 'TEST PRINT',
    message: 'Printer connection successful!',
    timestamp: new Date().toLocaleString('vi-VN')
  };

  // Connect first
  const connected = await connectToPrinter(printerId);
  if (!connected) {
    throw new Error('Failed to connect to printer');
  }

  // ESC/POS commands for test print
  const commands: number[] = [
    0x1b, 0x40, // Initialize
    0x1b, 0x61, 0x01, // Center
    0x1b, 0x21, 0x30, // Double size
    ...stringToBytes('TEST PRINT\n\n'),
    0x1b, 0x21, 0x00, // Normal size
    ...stringToBytes('Connection OK\n'),
    ...stringToBytes(testData.timestamp + '\n'),
    0x1b, 0x64, 0x03, // Feed
    0x1d, 0x56, 0x00 // Cut
  ];

  await sendDataToPrinter(printerId, new Uint8Array(commands));

  console.log('[testPrint] Test print completed successfully');
  return true;
}

/**
 * Get connection type display label
 */
export function getConnectionTypeLabel(type: PrinterConnectionType): string {
  switch (type) {
    case 'bluetooth_classic':
      return 'Bluetooth Classic';
    case 'bluetooth_le':
      return 'Bluetooth LE';
    case 'wifi':
      return 'WiFi/LAN';
    default:
      return 'Bluetooth';
  }
}
