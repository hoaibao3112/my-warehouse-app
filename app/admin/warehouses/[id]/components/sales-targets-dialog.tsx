'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Target, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { mobileFetch } from '@/lib/mobile/api-client'

// Day names in Vietnamese
const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

interface SalesTarget {
    day_of_week: number
    day_name: string
    shift_a_target: number
    shift_b_target: number
    shift_c_target: number
    shift_d_target: number
    daily_target: number
}

interface SalesTargetsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    warehouseId: string
    warehouseName: string
}

export function SalesTargetsDialog({
    open,
    onOpenChange,
    warehouseId,
    warehouseName,
}: SalesTargetsDialogProps) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [targets, setTargets] = useState<SalesTarget[]>([])

    // Fetch existing targets
    useEffect(() => {
        if (open && warehouseId) {
            fetchTargets()
        }
    }, [open, warehouseId])

    const fetchTargets = async () => {
        try {
            setLoading(true)
            const res = await mobileFetch(`/api/warehouses/${warehouseId}/sales-targets`)
            const data = await res.json()

            if (data.success) {
                setTargets(data.data.targets)
            } else {
                toast.error(data.error || 'Lỗi tải dữ liệu')
            }
        } catch (error) {
            console.error('Error fetching targets:', error)
            toast.error('Lỗi tải dữ liệu target')
        } finally {
            setLoading(false)
        }
    }

    const handleTargetChange = (dayOfWeek: number, field: keyof SalesTarget, value: string) => {
        const numValue = parseFloat(value) || 0
        setTargets(prev => prev.map(t => {
            if (t.day_of_week === dayOfWeek) {
                const updated = { ...t, [field]: numValue }
                // Auto-calculate daily total if not manually editing daily_target
                if (field !== 'daily_target') {
                    updated.daily_target = updated.shift_a_target + updated.shift_b_target +
                        updated.shift_c_target + updated.shift_d_target
                }
                return updated
            }
            return t
        }))
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            const res = await mobileFetch(`/api/warehouses/${warehouseId}/sales-targets`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targets })
            })

            const data = await res.json()

            if (data.success) {
                toast.success('Đã lưu target bán hàng')
                onOpenChange(false)
            } else {
                toast.error(data.error || 'Lỗi lưu target')
            }
        } catch (error) {
            console.error('Error saving targets:', error)
            toast.error('Lỗi lưu target')
        } finally {
            setSaving(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        Target Bán Hàng - {warehouseName}
                    </DialogTitle>
                    <DialogDescription>
                        Thiết lập target doanh thu theo từng ca làm và từng ngày trong tuần
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-12 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                            <span className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-blue-500" />
                                Ca A: 6:30-10:30
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-green-500" />
                                Ca B: 10:31-14:30
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-orange-500" />
                                Ca C: 14:31-18:30
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-purple-500" />
                                Ca D: 18:31-22:00
                            </span>
                        </div>

                        {/* Targets Table */}
                        <div className="border rounded-lg overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-6 gap-2 p-3 bg-muted text-sm font-medium border-b">
                                <div>Ngày</div>
                                <div className="text-center text-blue-600">Ca A</div>
                                <div className="text-center text-green-600">Ca B</div>
                                <div className="text-center text-orange-600">Ca C</div>
                                <div className="text-center text-purple-600">Ca D</div>
                                <div className="text-center">Tổng ngày</div>
                            </div>

                            {/* Rows - Start from Monday (1) */}
                            {[1, 2, 3, 4, 5, 6, 0].map(dayIndex => {
                                const target = targets.find(t => t.day_of_week === dayIndex)
                                if (!target) return null

                                return (
                                    <div key={dayIndex} className="grid grid-cols-6 gap-2 p-3 border-b last:border-0 items-center">
                                        <div className="font-medium text-sm">
                                            {target.day_name}
                                        </div>
                                        <div>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="100000"
                                                value={target.shift_a_target || ''}
                                                onChange={(e) => handleTargetChange(dayIndex, 'shift_a_target', e.target.value)}
                                                placeholder="0"
                                                className="text-center text-sm h-9"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="100000"
                                                value={target.shift_b_target || ''}
                                                onChange={(e) => handleTargetChange(dayIndex, 'shift_b_target', e.target.value)}
                                                placeholder="0"
                                                className="text-center text-sm h-9"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="100000"
                                                value={target.shift_c_target || ''}
                                                onChange={(e) => handleTargetChange(dayIndex, 'shift_c_target', e.target.value)}
                                                placeholder="0"
                                                className="text-center text-sm h-9"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="100000"
                                                value={target.shift_d_target || ''}
                                                onChange={(e) => handleTargetChange(dayIndex, 'shift_d_target', e.target.value)}
                                                placeholder="0"
                                                className="text-center text-sm h-9"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="100000"
                                                value={target.daily_target || ''}
                                                onChange={(e) => handleTargetChange(dayIndex, 'daily_target', e.target.value)}
                                                placeholder="0"
                                                className="text-center text-sm h-9 font-semibold bg-muted/50"
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Summary */}
                        <Card className="p-4 bg-muted/30">
                            <div className="text-sm text-muted-foreground mb-2">Tổng target tuần</div>
                            <div className="text-2xl font-bold text-primary">
                                {formatCurrency(targets.reduce((sum, t) => sum + t.daily_target, 0))} đ
                            </div>
                        </Card>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Hủy
                    </Button>
                    <Button onClick={handleSave} disabled={saving || loading}>
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang lưu...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Lưu Target
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
