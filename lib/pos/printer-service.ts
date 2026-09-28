/**
 * ESC/POS Printer Service
 * 
 * Kết nối và điều khiển máy in nhiệt ESC/POS qua Web Serial API.
 * Hỗ trợ nhiều máy in đồng thời (Bill, Kitchen, Label).
 */

// ESC/POS Commands
export const ESC_POS_COMMANDS = {
    INIT: new Uint8Array([0x1B, 0x40]),
    OPEN_DRAWER: new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]),
    OPEN_DRAWER_PIN5: new Uint8Array([0x1B, 0x70, 0x01, 0x19, 0xFA]),
    ALIGN_CENTER: new Uint8Array([0x1B, 0x61, 0x01]),
    ALIGN_LEFT: new Uint8Array([0x1B, 0x61, 0x00]),
    ALIGN_RIGHT: new Uint8Array([0x1B, 0x61, 0x02]),
    BOLD_ON: new Uint8Array([0x1B, 0x45, 0x01]),
    BOLD_OFF: new Uint8Array([0x1B, 0x45, 0x00]),
    DOUBLE_HEIGHT: new Uint8Array([0x1B, 0x21, 0x10]),
    DOUBLE_WIDTH: new Uint8Array([0x1B, 0x21, 0x20]),
    DOUBLE_SIZE: new Uint8Array([0x1B, 0x21, 0x30]),
    NORMAL_SIZE: new Uint8Array([0x1B, 0x21, 0x00]),
    CUT_PAPER: new Uint8Array([0x1D, 0x56, 0x00]),
    CUT_PAPER_PARTIAL: new Uint8Array([0x1D, 0x56, 0x01]),
    FEED_LINE: new Uint8Array([0x0A]),
    FEED_3_LINES: new Uint8Array([0x1B, 0x64, 0x03]),
    FEED_5_LINES: new Uint8Array([0x1B, 0x64, 0x05]),
}

export type PrinterConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface PrinterInfo {
    role: string
    name: string
    vendorId: number
    productId: number
}

interface ActivePrinter {
    port: SerialPort;
    writer: WritableStreamDefaultWriter<Uint8Array> | null;
    info: PrinterInfo;
    status: PrinterConnectionStatus;
}

class ESCPOSPrinterService {
    private activePrinters: Map<string, ActivePrinter> = new Map()
    private statusListeners: Set<(role: string, status: PrinterConnectionStatus) => void> = new Set()

    isSupported(): boolean {
        return typeof window !== 'undefined' && 'serial' in navigator
    }

    getStatus(role: string): PrinterConnectionStatus {
        return this.activePrinters.get(role)?.status || 'disconnected'
    }

    getPrinterInfo(role: string): PrinterInfo | null {
        return this.activePrinters.get(role)?.info || null
    }

    getAllActivePrinters(): PrinterInfo[] {
        return Array.from(this.activePrinters.values()).map(p => p.info)
    }

    onStatusChange(callback: (role: string, status: PrinterConnectionStatus) => void): () => void {
        this.statusListeners.add(callback)
        return () => this.statusListeners.delete(callback)
    }

    private setStatus(role: string, status: PrinterConnectionStatus) {
        const printer = this.activePrinters.get(role)
        if (printer) {
            printer.status = status
        }
        this.statusListeners.forEach(cb => cb(role, status))
    }

    async connect(role: string = 'BILL'): Promise<boolean> {
        if (!this.isSupported()) return false

        try {
            // Check if already connecting for this role
            if (this.getStatus(role) === 'connecting') return false

            // Request port from user
            const port = await navigator.serial.requestPort({
                filters: [
                    { usbVendorId: 0x0483 },
                    { usbVendorId: 0x1A86 },
                    { usbVendorId: 0x067B },
                    { usbVendorId: 0x10C4 },
                    { usbVendorId: 0x0403 },
                    { usbVendorId: 0x04B8 },
                    { usbVendorId: 0x0519 },
                ]
            })

            await port.open({
                baudRate: 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                flowControl: 'none'
            })

            const info = port.getInfo()
            const printerInfo: PrinterInfo = {
                role,
                name: `Printer ${role} (VID:0x${info.usbVendorId?.toString(16) || '???'})`,
                vendorId: info.usbVendorId || 0,
                productId: info.usbProductId || 0
            }

            let writer = null
            if (port.writable) {
                writer = port.writable.getWriter()
            }

            this.activePrinters.set(role, {
                port,
                writer,
                info: printerInfo,
                status: 'connected'
            })

            // Initialize
            await this.sendCommand(role, ESC_POS_COMMANDS.INIT)

            this.setStatus(role, 'connected')
            return true

        } catch (error: any) {
            console.error(`Failed to connect printer for ${role}:`, error)
            if (error.name === 'NotFoundError') {
                // User cancelled
            } else {
                this.setStatus(role, 'error')
            }
            return false
        }
    }

    async disconnect(role: string): Promise<void> {
        const printer = this.activePrinters.get(role)
        if (!printer) return

        try {
            if (printer.writer) {
                await printer.writer.close()
            }
            if (printer.port) {
                await printer.port.close()
            }
            this.activePrinters.delete(role)
            this.setStatus(role, 'disconnected')
        } catch (error) {
            console.error(`Error disconnecting printer ${role}:`, error)
        }
    }

    async sendCommand(role: string, command: Uint8Array): Promise<boolean> {
        const printer = this.activePrinters.get(role)
        if (!printer || !printer.writer || printer.status !== 'connected') {
            return false
        }

        try {
            await printer.writer.write(command)
            return true
        } catch (error) {
            console.error(`Failed to send command to ${role}:`, error)
            this.setStatus(role, 'error')
            return false
        }
    }

    async printText(role: string, text: string): Promise<boolean> {
        const encoder = new TextEncoder()
        return this.sendCommand(role, encoder.encode(text))
    }

    async openCashDrawer(role: string = 'BILL'): Promise<boolean> {
        return this.sendCommand(role, ESC_POS_COMMANDS.OPEN_DRAWER)
    }

    async printReceipt(role: string, lines: string[]): Promise<boolean> {
        const printer = this.activePrinters.get(role)
        if (!printer) return false

        try {
            await this.sendCommand(role, ESC_POS_COMMANDS.INIT)
            for (const line of lines) {
                await this.printText(role, line + '\n')
            }
            await this.sendCommand(role, ESC_POS_COMMANDS.FEED_5_LINES)
            await this.sendCommand(role, ESC_POS_COMMANDS.CUT_PAPER_PARTIAL)
            return true
        } catch (error) {
            console.error(`Failed to print receipt on ${role}:`, error)
            return false
        }
    }

    async autoReconnect(): Promise<void> {
        if (!this.isSupported()) return

        try {
            const ports = await navigator.serial.getPorts()
            // In a real app, we might store which port was for which role.
            // For now, we simple assign the first one to BILL if nothing is connected.
            if (ports.length > 0 && !this.activePrinters.has('BILL')) {
                const port = ports[0]
                await port.open({ baudRate: 9600 })

                const info = port.getInfo()
                const printerInfo: PrinterInfo = {
                    role: 'BILL',
                    name: 'Auto-reconnected Printer',
                    vendorId: info.usbVendorId || 0,
                    productId: info.usbProductId || 0
                }

                this.activePrinters.set('BILL', {
                    port,
                    writer: port.writable?.getWriter() || null,
                    info: printerInfo,
                    status: 'connected'
                })
                this.setStatus('BILL', 'connected')
            }
        } catch (error) {
            console.error('Auto-reconnect failed:', error)
        }
    }
}

export const printerService = new ESCPOSPrinterService()

declare global {
    interface Navigator {
        serial: Serial
    }
    interface Serial {
        requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
        getPorts(): Promise<SerialPort[]>
    }
    interface SerialPortRequestOptions {
        filters?: SerialPortFilter[]
    }
    interface SerialPortFilter {
        usbVendorId?: number
        usbProductId?: number
    }
    interface SerialPort {
        readable: ReadableStream<Uint8Array> | null
        writable: WritableStream<Uint8Array> | null
        open(options: SerialOptions): Promise<void>
        close(): Promise<void>
        getInfo(): SerialPortInfo
    }
    interface SerialOptions {
        baudRate: number
        dataBits?: number
        parity?: 'none' | 'even' | 'odd'
        stopBits?: number
        flowControl?: 'none' | 'hardware'
    }
    interface SerialPortInfo {
        usbVendorId?: number
        usbProductId?: number
    }
}
