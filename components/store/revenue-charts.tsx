"use client"

import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { WAREHOUSE_CHANGE_EVENT } from "./warehouse-selector"
import { toast } from "sonner"

interface RevenueData {
  date: string
  revenue: number
  invoiceCount: number
}

interface DailyRevenue {
  [key: string]: number
}

export function RevenueCharts() {
  const [chartData, setChartData] = useState<RevenueData[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [avgDaily, setAvgDaily] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {

        // Get warehouse ID
        const me = await (await mobileFetch('/api/auth/me')).json()
        const user = me?.data

        let warehouseId: string | null = null
        if (user?.role === 'GENERAL_MANAGER') {
          try {
            warehouseId = sessionStorage.getItem('selectedWarehouseId')
          } catch (e) {
            console.error('Failed to access sessionStorage:', e)
          }
        } else {
          warehouseId = user?.warehouseId || null
        }

        const q = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : ''
        const res = await mobileFetch(`/api/sales/invoices${q}`)
        const json = await res.json()

        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')

        const invoices = json.data || []

        // Group invoices by date
        const dailyRevenue: DailyRevenue = {}
        const invoicesByDate: { [key: string]: number } = {}

        invoices.forEach((inv: any) => {
          const date = formatDbDateToDisplay(inv.created_at)
          dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(inv.total_amount)
          invoicesByDate[date] = (invoicesByDate[date] || 0) + 1
        })

        // Convert to array and sort by date (most recent last for chart)
        const data = Object.entries(dailyRevenue)
          .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
          .slice(-7) // Last 7 days
          .map(([date, revenue]) => ({
            date,
            revenue: Math.round(Number(revenue)),
            invoiceCount: invoicesByDate[date] || 0,
          }))

        setChartData(data)

        const total = invoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0)
        setTotalRevenue(total)
        setAvgDaily(data.length > 0 ? total / data.length : 0)
      } catch (err) {
        console.error("Failed to load revenue data", err)
        toast.error("Không thể tải dữ liệu doanh thu")
      } finally {
        setLoading(false)
      }
    }

    load()

    // Listen for warehouse changes - reload immediately
    const handleWarehouseChange = () => {
      load()
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [])

  // Data for pie chart (top 3 days)
  const topDays = [...chartData].sort((a, b) => b.revenue - a.revenue).slice(0, 3)
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b']

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">Tổng Doanh Thu (7 ngày)</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {Number(totalRevenue).toLocaleString("vi-VN")}đ
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">Doanh Thu Trung Bình/Ngày</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {Number(avgDaily).toLocaleString("vi-VN")}đ
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">Số Hóa Đơn (7 ngày)</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">
            {chartData.reduce((sum, d) => sum + d.invoiceCount, 0)}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Daily Revenue */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Doanh Thu Theo Ngày</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground">Đang tải...</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={12} />
                <YAxis />
                <Tooltip
                  formatter={(value) => Number(value).toLocaleString("vi-VN") + "đ"}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Doanh Thu (đ)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">Chưa có dữ liệu</div>
          )}
        </Card>

        {/* Line Chart - Invoice Count */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Số Hóa Đơn Theo Ngày</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground">Đang tải...</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={12} />
                <YAxis />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                />
                <Legend />
                <Line type="monotone" dataKey="invoiceCount" stroke="#10b981" name="Số Hóa Đơn" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">Chưa có dữ liệu</div>
          )}
        </Card>
      </div>

      {/* Pie Chart - Top Days */}
      {topDays.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Top 3 Ngày Doanh Thu Cao Nhất</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={topDays}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ date, revenue }) => `${date}: ${Number(revenue).toLocaleString("vi-VN")}đ`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="revenue"
                >
                  {topDays.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => Number(value).toLocaleString("vi-VN") + "đ"} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center gap-3">
              {topDays.map((day, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[idx] }}></div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{day.date}</div>
                    <div className="text-sm text-muted-foreground">{Number(day.revenue).toLocaleString("vi-VN")}đ</div>
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">{day.invoiceCount} HĐ</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
