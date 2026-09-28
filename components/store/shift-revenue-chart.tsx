'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts'
import { BarChart3, PieChartIcon, Target, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { mobileFetch } from '@/lib/mobile/api-client'
import { toast } from 'sonner'
import { format } from 'date-fns'

// Get today's date in YYYY-MM-DD format
function getTodayDateString(): string {
    return format(new Date(), 'yyyy-MM-dd')
}

// Shift colors
const SHIFT_COLORS = {
    A: '#3b82f6', // Blue
    B: '#10b981', // Green
    C: '#f59e0b', // Orange
    D: '#8b5cf6', // Purple
}

const STATUS_COLORS = {
    achieved: '#22c55e',
    partial: '#eab308',
    not_achieved: '#ef4444',
}

interface ShiftData {
    shift: string
    name: string
    color: string
    revenue: number
    target: number
    percentage: number
    invoiceCount: number
    status: 'achieved' | 'partial' | 'not_achieved'
}

interface ShiftRevenueChartProps {
    warehouseId: string | null
    date?: string
}

export function ShiftRevenueChart({ warehouseId, date }: ShiftRevenueChartProps) {
    const [loading, setLoading] = useState(false)
    const [chartType, setChartType] = useState<'bar' | 'pie'>('bar')
    const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
    // Initialize with empty, will set on client
    const [selectedDate, setSelectedDate] = useState('')
    const [data, setData] = useState<{
        shifts: ShiftData[]
        total: {
            revenue: number
            target: number
            percentage: number
            invoiceCount: number
            status: 'achieved' | 'partial' | 'not_achieved'
        }
    } | null>(null)

    // Set today's date on client mount (avoid SSR timezone mismatch)
    useEffect(() => {
        const initialDate = date && date.length > 0 ? date : getTodayDateString()
        setSelectedDate(initialDate)
    }, [])

    // Update when date prop changes
    useEffect(() => {
        if (date && date.length > 0) {
            setSelectedDate(date)
        }
    }, [date])

    useEffect(() => {
        if (warehouseId && selectedDate) {
            fetchData()
        }
    }, [warehouseId, selectedDate, period])

    const fetchData = async () => {
        if (!warehouseId) return

        setLoading(true)
        try {
            const params = new URLSearchParams({
                warehouseId,
                date: selectedDate,
                period,
            })

            const res = await mobileFetch(`/api/reports/shift-revenue?${params.toString()}`)
            const json = await res.json()

            if (json.success) {
                setData(json.data)
            } else {
                toast.error(json.error || 'Lỗi tải dữ liệu')
            }
        } catch (error) {
            console.error('Error fetching shift revenue:', error)
            toast.error('Lỗi tải dữ liệu ca làm')
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(value)
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'achieved':
                return 'Đạt'
            case 'partial':
                return 'Gần đạt'
            case 'not_achieved':
                return 'Chưa đạt'
            default:
                return '-'
        }
    }

    const getStatusBadgeColor = (status: string) => {
        switch (status) {
            case 'achieved':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            case 'partial':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            case 'not_achieved':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            default:
                return ''
        }
    }

    // Custom tooltip for bar chart
    const CustomBarTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload as ShiftData
            return (
                <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-sm">
                    <p className="font-semibold">{d.name}</p>
                    <p>Doanh thu: {formatCurrency(d.revenue)}</p>
                    <p>Target: {formatCurrency(d.target)}</p>
                    <p>Đạt: {d.percentage}%</p>
                    <p>Số hóa đơn: {d.invoiceCount}</p>
                    <Badge className={`mt-1 ${getStatusBadgeColor(d.status)}`}>
                        {getStatusLabel(d.status)}
                    </Badge>
                </div>
            )
        }
        return null
    }

    // Custom label for pie chart
    const renderPieLabel = ({ name, percentage }: any) => {
        return `${name}: ${percentage}%`
    }

    return (
        <Card className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Doanh Thu Theo Ca Làm
                </h3>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Picker */}
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-40"
                    />

                    {/* Period Selector */}
                    <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="day">Ngày</SelectItem>
                            <SelectItem value="week">Tuần</SelectItem>
                            <SelectItem value="month">Tháng</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Chart Type Toggle */}
                    <div className="flex rounded-lg border border-border overflow-hidden">
                        <button
                            onClick={() => setChartType('bar')}
                            className={`p-2 ${chartType === 'bar' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                        >
                            <BarChart3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setChartType('pie')}
                            className={`p-2 ${chartType === 'pie' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                        >
                            <PieChartIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="h-80 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            ) : !data ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                    Không có dữ liệu
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">Tổng Doanh Thu</p>
                            <p className="text-lg font-bold text-primary">{formatCurrency(data.total.revenue)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">Target</p>
                            <p className="text-lg font-bold">{formatCurrency(data.total.target)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">Đạt %</p>
                            <p className="text-lg font-bold">{data.total.percentage}%</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">Trạng thái</p>
                            <Badge className={getStatusBadgeColor(data.total.status)}>
                                {getStatusLabel(data.total.status)}
                            </Badge>
                        </div>
                    </div>

                    {/* Chart */}
                    {chartType === 'bar' ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={data.shifts} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                                <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 12 }} />
                                <Tooltip content={<CustomBarTooltip />} />
                                <Legend />
                                <Bar dataKey="revenue" name="Doanh Thu" radius={[0, 4, 4, 0]}>
                                    {data.shifts.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                                <Bar dataKey="target" name="Target" fill="#94a3b8" opacity={0.5} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={data.shifts.filter(s => s.revenue > 0)}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        dataKey="revenue"
                                        nameKey="name"
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                        labelLine={false}
                                    >
                                        {data.shifts.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                                </PieChart>
                            </ResponsiveContainer>

                            {/* Legend with status */}
                            <div className="flex flex-col justify-center gap-3">
                                {data.shifts.map((shift) => (
                                    <div key={shift.shift} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded" style={{ backgroundColor: shift.color }} />
                                            <span className="font-medium">{shift.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">{formatCurrency(shift.revenue)}</span>
                                            <Badge className={`text-xs ${getStatusBadgeColor(shift.status)}`}>
                                                {shift.percentage}%
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Shift details cards (mobile-friendly) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                        {data.shifts.map((shift) => (
                            <div
                                key={shift.shift}
                                className="p-3 rounded-lg border border-border"
                                style={{ borderLeftWidth: 4, borderLeftColor: shift.color }}
                            >
                                <p className="text-xs text-muted-foreground">{shift.name}</p>
                                <p className="font-bold">{formatCurrency(shift.revenue)}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="text-xs text-muted-foreground">{shift.invoiceCount} HĐ</span>
                                    <Badge className={`text-xs ${getStatusBadgeColor(shift.status)}`}>
                                        {getStatusLabel(shift.status)}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    )
}
