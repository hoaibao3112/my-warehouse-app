"use client"

import { useState, useEffect, useCallback } from 'react'
import { printerService, PrinterConnectionStatus, PrinterInfo } from '@/lib/pos/printer-service'

/**
 * Hook để kết nối và điều khiển máy in ESC/POS theo chức năng (role)
 * 
 * @example
 * const { isConnected, connect, openDrawer } = usePrinter('BILL')
 * const { isConnected: kConnected, connect: kConnect } = usePrinter('KITCHEN')
 * 
 * // Connect to printer (must be from user click)
 * <Button onClick={connect}>Kết nối máy in Bill</Button>
 * 
 * // Open cash drawer
 * <Button onClick={openDrawer} disabled={!isConnected}>Mở két tiền</Button>
 */
export function usePrinter(role: string = 'BILL') {
    const [status, setStatus] = useState<PrinterConnectionStatus>('disconnected')
    const [printerInfo, setPrinterInfo] = useState<PrinterInfo | null>(null)
    const [isSupported, setIsSupported] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Check support and subscribe to status changes
    useEffect(() => {
        setIsSupported(printerService.isSupported())
        setStatus(printerService.getStatus(role))
        setPrinterInfo(printerService.getPrinterInfo(role))

        const unsubscribe = printerService.onStatusChange((updatedRole, newStatus) => {
            if (updatedRole === role) {
                setStatus(newStatus)
                setPrinterInfo(printerService.getPrinterInfo(role))
            }
        })

        // Try auto-reconnect only once for the whole service? 
        // Or per role? For now we just let the service handle it.
        // printerService.autoReconnect()

        return unsubscribe
    }, [role])

    /**
     * Connect to printer - must be called from user gesture
     */
    const connect = useCallback(async () => {
        setError(null)
        const success = await printerService.connect(role)
        if (!success && printerService.getStatus(role) === 'error') {
            setError(`Không thể kết nối đến máy in ${role}. Vui lòng thử lại.`)
        }
        return success
    }, [role])

    /**
     * Disconnect from printer
     */
    const disconnect = useCallback(async () => {
        await printerService.disconnect(role)
    }, [role])

    /**
     * Open cash drawer
     */
    const openDrawer = useCallback(async () => {
        if (status !== 'connected') {
            setError('Máy in chưa được kết nối')
            return false
        }
        setError(null)
        const success = await printerService.openCashDrawer(role)
        if (!success) {
            setError('Không thể mở két tiền')
        }
        return success
    }, [status, role])

    /**
     * Print receipt
     */
    const printReceipt = useCallback(async (lines: string[]) => {
        if (status !== 'connected') {
            setError('Máy in chưa được kết nối')
            return false
        }
        setError(null)
        const success = await printerService.printReceipt(role, lines)
        if (!success) {
            setError('Không thể in hóa đơn')
        }
        return success
    }, [status, role])

    return {
        // Status
        status,
        isConnected: status === 'connected',
        isConnecting: status === 'connecting',
        isSupported,
        error,
        printerInfo,

        // Actions
        connect,
        disconnect,
        openDrawer,
        printReceipt,
    }
}
