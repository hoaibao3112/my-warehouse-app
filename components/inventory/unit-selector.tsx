"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { AlertCircle } from "lucide-react"

/**
 * Unit Selector with Conversion Preview
 * 
 * Shows available units for a product and displays conversion preview
 * 
 * Features:
 * - Displays conversion formula (e.g., "1 Thùng = 24 Chai")
 * - Live preview of converted quantity
 * - Validates unit is available for product
 */

interface UnitOption {
    unitId: string
    unitCode: string
    unitName: string
    multiplier: number
}

interface UnitSelectorProps {
    productId: string
    value: string // Selected unit ID
    onChange: (unitId: string) => void
    quantity?: number // Current input quantity
    label?: string
    disabled?: boolean
}

export function UnitSelector({
    productId,
    value,
    onChange,
    quantity = 0,
    label = "Đơn vị",
    disabled = false
}: UnitSelectorProps) {
    const [units, setUnits] = useState<UnitOption[]>([])
    const [loading, setLoading] = useState(false)
    const [baseUnit, setBaseUnit] = useState<UnitOption | null>(null)

    useEffect(() => {
        if (!productId) return

        const fetchUnits = async () => {
            setLoading(true)
            try {
                // Fetch available units for this product
                const response = await fetch(`/api/products/${productId}/units`)
                const data = await response.json()

                if (data.success) {
                    setUnits(data.data.units || [])
                    setBaseUnit(data.data.baseUnit || null)
                }
            } catch (error) {
                console.error("Error fetching units:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchUnits()
    }, [productId])

    const selectedUnit = units.find(u => u.unitId === value)
    const baseQuantity = selectedUnit && quantity
        ? quantity * selectedUnit.multiplier
        : 0

    return (
        <div className="space-y-2">
            <Label htmlFor="unit-select">{label}</Label>

            <Select
                value={value}
                onValueChange={onChange}
                disabled={disabled || loading}
            >
                <SelectTrigger id="unit-select">
                    <SelectValue placeholder="Chọn đơn vị" />
                </SelectTrigger>
                <SelectContent>
                    {units.map((unit) => (
                        <SelectItem key={unit.unitId} value={unit.unitId}>
                            <div className="flex items-center justify-between w-full">
                                <span className="font-medium">{unit.unitCode}</span>
                                <span className="text-sm text-muted-foreground ml-2">
                                    {unit.unitName}
                                </span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Conversion Preview */}
            {selectedUnit && selectedUnit.multiplier > 1 && baseUnit && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="space-y-1 text-sm">
                            <p className="font-medium text-blue-900 dark:text-blue-100">
                                Quy đổi đơn vị
                            </p>
                            <p className="text-blue-700 dark:text-blue-300">
                                1 {selectedUnit.unitCode} = {selectedUnit.multiplier} {baseUnit.unitCode}
                            </p>

                            {quantity > 0 && (
                                <p className="text-blue-600 dark:text-blue-400 font-semibold">
                                    {quantity} {selectedUnit.unitCode} = {baseQuantity} {baseUnit.unitCode}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Base unit selected */}
            {selectedUnit && selectedUnit.multiplier === 1 && (
                <p className="text-sm text-muted-foreground">
                    Đơn vị cơ bản - không cần quy đổi
                </p>
            )}
        </div>
    )
}

/**
 * Quantity Input with Unit Selector Combined
 */
interface QuantityWithUnitInputProps {
    productId: string
    quantity: number
    onQuantityChange: (quantity: number) => void
    unitId: string
    onUnitChange: (unitId: string) => void
    label?: string
    disabled?: boolean
    min?: number
}

export function QuantityWithUnitInput({
    productId,
    quantity,
    onQuantityChange,
    unitId,
    onUnitChange,
    label = "Số lượng",
    disabled = false,
    min = 0
}: QuantityWithUnitInputProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="quantity-input">{label}</Label>
                <Input
                    id="quantity-input"
                    type="number"
                    value={quantity}
                    onChange={(e) => onQuantityChange(Number(e.target.value))}
                    min={min}
                    disabled={disabled}
                    className="w-full"
                />
            </div>

            <UnitSelector
                productId={productId}
                value={unitId}
                onChange={onUnitChange}
                quantity={quantity}
                disabled={disabled}
            />
        </div>
    )
}
