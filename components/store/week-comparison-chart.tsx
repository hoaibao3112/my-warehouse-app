'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts'
import { CalendarDays, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { mobileFetch } from '@/lib/mobile/api-client'
import { toast } from 'sonner'

// Day names in Vietnamese
const DAY_OPTIONS = [
    { value: '1', label: 'Thứ 2' },
    { value: '2', label: 'Thứ 3' },
    { value: '3', label: 'Thứ 4' },
    { value: '4', label: 'Thứ 5' },
    { value: '5', label: 'Thứ 6' },
    { value: '6', label: 'Thứ 7' },
    { value: '0', label: 'Chủ nhật' },
]

interface WeekData {
    date: string
    weekLabel: string
    revenue: number
    target: number
    invoiceCount: number
    percentage: number
}

interface WeekComparisonChartProps {
    warehouseId: string | null
}

export function WeekComparisonChart({ warehouseId }: WeekComparisonChartProps) {
    const [loading, setLoading] = useState(false)
    const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay().toString())
    const [data, setData] = useState<{
        dayName: string
        target: number
        weeks: WeekData[]
    } | null>(null)

    useEffect(() => {
        if (warehouseId) {
            fetchData()
        }
    }, [warehouseId, dayOfWeek])

    const fetchData = async () => {
        if (!warehouseId) return

        setLoading(true)
        try {
            const params = new URLSearchParams({
                warehouseId,
                dayOfWeek,
                weeks: '4',
            })

            const res = await mobileFetch(`/api/reports/week-comparison?${params.toString()}`)
            const json = await res.json()

            if (json.success) {
                setData(json.data)
            } else {
                toast.error(json.error || 'Lỗi tải dữ liệu')
            }
        } catch (error) {
            console.error('Error fetching week comparison:', error)
            toast.error('Lỗi tải dữ liệu so sánh')
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

    const getTrend = (current: number, previous: number) => {
        if (!previous || previous === 0) return { icon: <Minus className="w-4 h-4" />, color: 'text-muted-foreground', change: 0 }
        const change = ((current - previous) / previous) * 100
        if (change > 5) return { icon: <TrendingUp className="w-4 h-4" />, color: 'text-green-600', change }
        if (change < -5) return { icon: <TrendingDown className="w-4 h-4" />, color: 'text-red-600', change }
        return { icon: <Minus className="w-4 h-4" />, color: 'text-muted-foreground', change }
    }

    // Custom tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload as WeekData
            return (
                <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-sm">
                    <p className="font-semibold">{d.weekLabel}</p>
                    <p className="text-xs text-muted-foreground">{d.date}</p>
                    <p className="mt-1">Doanh thu: {formatCurrency(d.revenue)}</p>
                    <p>Target: {formatCurrency(d.target)}</p>
                    <p>Đạt: {d.percentage}%</p>
                    <p>Số hóa đơn: {d.invoiceCount}</p>
                </div>
            )
        }
        return null
    }

    // Reverse data for display (oldest first, newest last)
    const chartData = data?.weeks ? [...data.weeks].reverse() : []

    // Calculate trend (this week vs last week)
    const thisWeek = data?.weeks[0]
    const lastWeek = data?.weeks[1]
    const trend = thisWeek && lastWeek ? getTrend(thisWeek.revenue, lastWeek.revenue) : null

    return (
        <Card className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-primary" />
                    So Sánh Theo Tuần
                </h3>

                <div className="flex items-center gap-3">
                    <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                        <SelectTrigger className="w-32">
                            <SelectValue placeholder="Chọn thứ" />
                        </SelectTrigger>
                        <SelectContent>
                            {DAY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loading ? (
                <div className="h-80 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            ) : !data || chartData.length === 0 ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                    Không có dữ liệu
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary */}
                    {thisWeek && (
                        <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
                            <div>
                                <p className="text-xs text-muted-foreground">Tuần này ({data.dayName})</p>
                                <p className="text-2xl font-bold text-primary">{formatCurrency(thisWeek.revenue)}</p>
                            </div>
                            {trend && (
                                <div className={`flex items-center gap-1 ${trend.color}`}>
                                    {trend.icon}
                                    <span className="font-medium">
                                        {trend.change > 0 ? '+' : ''}{trend.change.toFixed(1)}%
                                    </span>
                                    <span className="text-xs text-muted-foreground">so với tuần trước</span>
                                </div>
                            )}
                            {data.target > 0 && (
                                <Badge className={`ml-auto ${thisWeek.percentage >= 100 ? 'bg-green-100 text-green-800' :
                                    thisWeek.percentage >= 80 ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                    }`}>
                                    {thisWeek.percentage}% Target
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Chart */}
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="weekLabel" />
                            <YAxis tickFormatter={(v) => formatCurrency(v)} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            {data.target > 0 && (
                                <ReferenceLine
                                    y={data.target}
                                    stroke="#ef4444"
                                    strokeDasharray="5 5"
                                    label={{ value: 'Target', position: 'right', fill: '#ef4444' }}
                                />
                            )}
                            <Bar
                                dataKey="revenue"
                                name="Doanh Thu"
                                fill="#3b82f6"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>

                    {/* Week cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {data.weeks.map((week, idx) => {
                            const prevWeek = data.weeks[idx + 1]
                            const weekTrend = prevWeek ? getTrend(week.revenue, prevWeek.revenue) : null

                            return (
                                <div key={week.date} className="p-3 rounded-lg border border-border">
                                    <p className="text-xs text-muted-foreground">{week.weekLabel}</p>
                                    <p className="text-xs text-muted-foreground">{week.date}</p>
                                    <p className="font-bold mt-1">{formatCurrency(week.revenue)}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                        <span className="text-xs text-muted-foreground">{week.invoiceCount} HĐ</span>
                                        {weekTrend && (
                                            <span className={`text-xs flex items-center gap-0.5 ${weekTrend.color}`}>
                                                {weekTrend.icon}
                                                {weekTrend.change > 0 ? '+' : ''}{weekTrend.change.toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </Card>
    )
}
