"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { usePrinter } from '@/hooks/use-printer'
import {
    Printer,
    CreditCard,
    Unplug,
    Loader2,
    AlertCircle,
    CheckCircle2,
    DollarSign
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PrinterControlProps {
    className?: string
    showLabel?: boolean
}

/**
 * Component điều khiển máy in và két tiền
 * 
 * Hiển thị trạng thái kết nối và các nút điều khiển:
 * - Kết nối/Ngắt kết nối máy in
 * - Mở két tiền
 */
export function PrinterControl({ className, showLabel = true }: PrinterControlProps) {
    const {
        status,
        isConnected,
        isConnecting,
        isSupported,
        error,
        printerInfo,
        connect,
        disconnect,
        openDrawer
    } = usePrinter()

    const [isOpening, setIsOpening] = useState(false)

    const handleOpenDrawer = async () => {
        setIsOpening(true)
        await openDrawer()
        setIsOpening(false)
    }

    // Not supported message
    if (!isSupported) {
        return (
            <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Trình duyệt không hỗ trợ kết nối máy in</span>
            </div>
        )
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn("gap-2", className)}
                >
                    <Printer className={cn(
                        "w-4 h-4",
                        isConnected && "text-green-600",
                        status === 'error' && "text-red-600"
                    )} />
                    {showLabel && (
                        <span className="hidden sm:inline">
                            {isConnected ? 'Máy in' : 'Kết nối máy in'}
                        </span>
                    )}
                    {isConnected && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            OK
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Máy in & Két tiền</h4>
                        <Badge variant={isConnected ? "default" : "secondary"}>
                            {isConnected ? 'Đã kết nối' : 'Chưa kết nối'}
                        </Badge>
                    </div>

                    {/* Printer info */}
                    {printerInfo && (
                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                            <div className="font-medium">{printerInfo.name}</div>
                            <div className="text-xs">
                                VID: 0x{printerInfo.vendorId.toString(16).toUpperCase()} |
                                PID: 0x{printerInfo.productId.toString(16).toUpperCase()}
                            </div>
                        </div>
                    )}

                    {/* Error message */}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-2">
                        {!isConnected ? (
                            <Button
                                onClick={connect}
                                disabled={isConnecting}
                                className="w-full"
                            >
                                {isConnecting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Đang kết nối...
                                    </>
                                ) : (
                                    <>
                                        <Printer className="w-4 h-4 mr-2" />
                                        Kết nối máy in
                                    </>
                                )}
                            </Button>
                        ) : (
                            <>
                                {/* Open drawer button */}
                                <Button
                                    onClick={handleOpenDrawer}
                                    disabled={isOpening}
                                    className="w-full bg-green-600 hover:bg-green-700"
                                >
                                    {isOpening ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Đang mở...
                                        </>
                                    ) : (
                                        <>
                                            <DollarSign className="w-4 h-4 mr-2" />
                                            Mở két tiền
                                        </>
                                    )}
                                </Button>

                                {/* Disconnect button */}
                                <Button
                                    onClick={disconnect}
                                    variant="outline"
                                    className="w-full"
                                >
                                    <Unplug className="w-4 h-4 mr-2" />
                                    Ngắt kết nối
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Help text */}
                    <p className="text-xs text-muted-foreground">
                        💡 Kết nối máy in nhiệt qua cổng USB. Két tiền phải được cắm vào máy in qua cổng RJ11.
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    )
}

/**
 * Nút mở két tiền đơn giản (dùng khi đã có kết nối sẵn)
 */
export function OpenDrawerButton({ className }: { className?: string }) {
    const { isConnected, openDrawer } = usePrinter()
    const [isOpening, setIsOpening] = useState(false)

    const handleClick = async () => {
        setIsOpening(true)
        await openDrawer()
        setIsOpening(false)
    }

    return (
        <Button
            onClick={handleClick}
            disabled={!isConnected || isOpening}
            variant="outline"
            size="sm"
            className={cn("gap-2", className)}
        >
            {isOpening ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <DollarSign className="w-4 h-4" />
            )}
            Mở két
        </Button>
    )
}
