"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

/**
 * Inventory Check Item Component
 * 
 * For physical inventory counting
 * Shows:
 * - System quantity (in base unit or display unit)
 * - Actual counted quantity (user input)
 * - Discrepancy calculation with UNIT CONVERSION
 */

interface InventoryCheckItemProps {
    productId: string
    productCode: string
    productName: string
    systemQuantity: number // In base unit
    systemUnitCode: string
    onCountComplete: (data: {
        productId: string
        actualQuantity: number
        actualUnitId: string
    }) => void
}

export function InventoryCheckItem({
    productId,
    productCode,
    productName,
    systemQuantity,
    systemUnitCode,
    onCountComplete
}: InventoryCheckItemProps) {
    const [actualQuantity, setActualQuantity] = useState<string>("")
    const [selectedUnitId, setSelectedUnitId] = useState<string>("")
    const [units, setUnits] = useState<any[]>([])
    const [counted, setCounted] = useState(false)

    // Fetch units when component mounts
    useEffect(() => {
        const fetchUnits = async () => {
            const response = await fetch(`/api/products/${productId}/units`)
            const data = await response.json()
            if (data.success) {
                setUnits(data.data.units || [])
                setSelectedUnitId(data.data.baseUnit?.unitId || "")
            }
        }
        fetchUnits()
    }, [productId])

    // Convert string to number for calculations, handling comma for Vietnamese locale
    const numericQuantity = actualQuantity === ""
        ? 0
        : Number(actualQuantity.replace(/,/g, '.'))

    // Safety check for NaN
    if (isNaN(numericQuantity)) {
        // This should be prevented by onChange regex, but just in case
        console.warn("Invalid quantity input:", actualQuantity)
    }

    const handleCount = () => {
        if (!selectedUnitId || numericQuantity < 0) {
            alert("Vui lòng nhập số lượng và chọn đơn vị")
            return
        }

        onCountComplete({
            productId,
            actualQuantity: numericQuantity,
            actualUnitId: selectedUnitId
        })

        setCounted(true)
    }

    const selectedUnit = units.find(u => u.unitId === selectedUnitId)
    const actualBaseQuantity = selectedUnit
        ? numericQuantity * selectedUnit.multiplier
        : numericQuantity

    const discrepancy = actualBaseQuantity - systemQuantity
    const hasDiscrepancy = Math.abs(discrepancy) > 0

    return (
        <Card className={counted ? (hasDiscrepancy ? "border-orange-500" : "border-green-500") : ""}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="text-base">{productName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{productCode}</p>
                    </div>

                    {counted && (
                        <Badge variant={hasDiscrepancy ? "destructive" : "outline"} className={!hasDiscrepancy ? "text-green-600 border-green-600" : ""}>
                            {hasDiscrepancy ? "Có chênh lệch" : "Khớp"}
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* System Quantity */}
                <div className="rounded-md bg-muted p-3">
                    <Label className="text-xs text-muted-foreground">Số lượng hệ thống</Label>
                    <p className="text-lg font-semibold mt-1">
                        {systemQuantity.toLocaleString()} {systemUnitCode}
                    </p>
                </div>

                {/* Actual Count Input */}
                {!counted && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Số lượng đếm được</Label>
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={actualQuantity}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        // Allow digits and single dot or comma
                                        if (val === '' || /^\d+([.,]\d*)?$/.test(val) || /^[.,]\d*$/.test(val)) {
                                            setActualQuantity(val);
                                        }
                                    }}
                                    placeholder="0"
                                    className="text-lg font-medium"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Đơn vị</Label>
                                <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn đơn vị" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {units.map(unit => (
                                            <SelectItem key={unit.unitId} value={unit.unitId}>
                                                {unit.unitCode}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Preview Conversion */}
                        {selectedUnit && selectedUnit.multiplier > 1 && numericQuantity > 0 && (
                            <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-2 text-sm">
                                <p className="text-blue-900 dark:text-blue-100">
                                    {numericQuantity.toLocaleString('vi-VN')} {selectedUnit.unitCode} = {actualBaseQuantity.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} {systemUnitCode}
                                </p>
                            </div>
                        )}

                        <Button onClick={handleCount} className="w-full">
                            Xác nhận đã đếm
                        </Button>
                    </div>
                )}

                {/* Result after counting */}
                {counted && (
                    <div className="space-y-3">
                        <div className="rounded-md bg-muted p-3">
                            <Label className="text-xs text-muted-foreground">Số lượng đã đếm</Label>
                            <p className="text-lg font-semibold mt-1">
                                {numericQuantity} {selectedUnit?.unitCode}
                                {selectedUnit && selectedUnit.multiplier > 1 && (
                                    <span className="text-sm font-normal text-muted-foreground ml-2">
                                        = {actualBaseQuantity} {systemUnitCode}
                                    </span>
                                )}
                            </p>
                        </div>

                        {/* Discrepancy Display */}
                        {hasDiscrepancy ? (
                            <div className="rounded-md bg-orange-50 dark:bg-orange-950 p-3 flex items-start gap-2">
                                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-semibold text-orange-900 dark:text-orange-100">
                                        Chênh lệch: {discrepancy > 0 ? '+' : ''}{discrepancy} {systemUnitCode}
                                    </p>
                                    <p className="text-sm text-orange-700 dark:text-orange-300">
                                        {discrepancy > 0 ? 'Thừa' : 'Thiếu'} {Math.abs(discrepancy).toLocaleString()} {systemUnitCode}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-md bg-green-50 dark:bg-green-950 p-3 flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                <p className="font-semibold text-green-900 dark:text-green-100">
                                    Số lượng khớp với hệ thống
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
