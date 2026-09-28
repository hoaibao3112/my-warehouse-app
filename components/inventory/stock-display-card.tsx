"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Package, TrendingUp, TrendingDown } from "lucide-react"

/**
 * Stock Display Card with Multiple Unit Options
 * 
 * Shows current stock with ability to switch between different units
 * Example: 100 Thùng | 2,400 Chai
 */

interface DisplayOption {
    unitId: string
    unitCode: string
    unitName: string
    quantity: number
    multiplier: number
}

interface StockBreakdown {
    qtyImported: number
    qtyProduced: number
    qtySold: number
    qtyTransferredIn: number
    qtyTransferredOut: number
    qtyAdjusted: number
}

interface StockDisplayProps {
    productCode: string
    productName: string
    warehouseName: string
    baseQuantity: number
    baseUnit: {
        code: string
        name: string
    }
    displayOptions: DisplayOption[]
    breakdown?: StockBreakdown
    lastUpdated?: Date
}

export function StockDisplayCard({
    productCode,
    productName,
    warehouseName,
    baseQuantity,
    baseUnit,
    displayOptions,
    breakdown,
    lastUpdated
}: StockDisplayProps) {
    const [selectedUnitId, setSelectedUnitId] = useState<string>(
        displayOptions[0]?.unitId || ""
    )

    const selectedOption = displayOptions.find(opt => opt.unitId === selectedUnitId)
    const displayQuantity = selectedOption?.quantity || baseQuantity

    // Stock level status
    const getStockStatus = (qty: number) => {
        if (qty <= 0) return { color: "destructive", label: "Hết hàng" }
        if (qty < 10) return { color: "warning", label: "Sắp hết" }
        return { color: "success", label: "Còn hàng" }
    }

    const status = getStockStatus(baseQuantity)

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-base font-semibold">
                            {productName}
                        </CardTitle>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{productCode}</span>
                            <span>•</span>
                            <span>{warehouseName}</span>
                        </div>
                    </div>

                    <Badge variant={status.color as any}>
                        {status.label}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Main Stock Display */}
                <div className="flex items-end justify-between">
                    <div className="space-y-1">
                        <p className="text-3xl font-bold">
                            {displayQuantity.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {selectedOption?.unitName || baseUnit.name}
                        </p>
                    </div>

                    {/* Unit Switcher */}
                    <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {displayOptions.map((opt) => (
                                <SelectItem key={opt.unitId} value={opt.unitId}>
                                    {opt.unitCode}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Conversion Info */}
                {selectedOption && selectedOption.multiplier > 1 && (
                    <div className="rounded-md bg-muted p-2">
                        <p className="text-xs text-muted-foreground">
                            1 {selectedOption.unitCode} = {selectedOption.multiplier} {baseUnit.code}
                        </p>
                        <p className="text-xs font-medium mt-1">
                            Tồn kho gốc: {baseQuantity.toLocaleString()} {baseUnit.code}
                        </p>
                    </div>
                )}

                {/* Breakdown */}
                {breakdown && (
                    <div className="space-y-2 pt-3 border-t">
                        <p className="text-sm font-medium">Chi tiết biến động</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {breakdown.qtyImported > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Nhập hàng</span>
                                    <span className="font-medium text-green-600 flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" />
                                        +{breakdown.qtyImported.toLocaleString()}
                                    </span>
                                </div>
                            )}

                            {breakdown.qtySold < 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Bán hàng</span>
                                    <span className="font-medium text-red-600 flex items-center gap-1">
                                        <TrendingDown className="h-3 w-3" />
                                        {breakdown.qtySold.toLocaleString()}
                                    </span>
                                </div>
                            )}

                            {breakdown.qtyProduced !== 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Sản xuất</span>
                                    <span className={`font-medium ${breakdown.qtyProduced > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {breakdown.qtyProduced > 0 ? '+' : ''}{breakdown.qtyProduced.toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Last Updated */}
                {lastUpdated && (
                    <p className="text-xs text-muted-foreground">
                        Cập nhật lần cuối: {new Date(lastUpdated).toLocaleString('vi-VN')}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
