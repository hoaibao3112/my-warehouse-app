"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Clock, Calendar, UserCheck, Building2 } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface DashboardStats {
  totalEmployees: number
  activeEmployees: number
  totalWarehouses: number
  todayAttendance: number
  pendingLeaveRequests: number
}

export default function HRDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardStats()
  }, [])

  const loadDashboardStats = async () => {
    try {
      setLoading(true)

      // Load employee count
      const employeesResponse = await mobileFetch('/api/hr/employees?pageSize=1')
      const employeesData = await employeesResponse.json()

      // For now, use placeholder data for other stats
      // These can be implemented with proper APIs later
      setStats({
        totalEmployees: employeesData.total || 0,
        activeEmployees: employeesData.total || 0, // TODO: Filter by is_active
        totalWarehouses: 0, // TODO: Add warehouse count API
        todayAttendance: 0, // TODO: Add today's attendance count
        pendingLeaveRequests: 0, // TODO: Add pending leave requests count
      })
    } catch (error) {
      console.error('Failed to load dashboard stats:', error)
      toast.error("Không thể tải dữ liệu thống kê")
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: "Tổng Nhân Viên",
      value: stats?.totalEmployees || 0,
      description: "Tổng số nhân viên trong hệ thống",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Nhân Viên Đang Làm",
      value: stats?.activeEmployees || 0,
      description: "Nhân viên đang hoạt động",
      icon: UserCheck,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Số Kho/Cửa Hàng",
      value: stats?.totalWarehouses || 0,
      description: "Tổng số kho và cửa hàng",
      icon: Building2,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Chấm Công Hôm Nay",
      value: stats?.todayAttendance || 0,
      description: "Số lượt chấm công hôm nay",
      icon: Clock,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Nghỉ Phép Chờ Duyệt",
      value: stats?.pendingLeaveRequests || 0,
      description: "Đơn xin nghỉ phép chờ duyệt",
      icon: Calendar,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
  ]

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Bảng Điều Khiển HR</h1>
        <p className="text-muted-foreground mt-1">
          Tổng quan về nhân sự và chấm công
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-20 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          statCards.map((card, index) => {
            const Icon = card.icon
            return (
              <Card key={index} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <div className={`${card.bgColor} p-2 rounded-lg`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Chức Năng Chính</CardTitle>
          <CardDescription>
            Các chức năng thường xuyên sử dụng
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/hr/employees"
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <Users className="w-8 h-8 text-primary" />
              <div>
                <div className="font-medium">Quản Lý Nhân Viên</div>
                <div className="text-xs text-muted-foreground">
                  Thêm, sửa, xóa nhân viên
                </div>
              </div>
            </a>

            <a
              href="/hr/attendance"
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <Clock className="w-8 h-8 text-primary" />
              <div>
                <div className="font-medium">Báo Cáo Chấm Công</div>
                <div className="text-xs text-muted-foreground">
                  Xem và xuất báo cáo
                </div>
              </div>
            </a>

            <a
              href="/hr/leave-requests"
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <Calendar className="w-8 h-8 text-primary" />
              <div>
                <div className="font-medium">Duyệt Nghỉ Phép</div>
                <div className="text-xs text-muted-foreground">
                  Quản lý đơn nghỉ phép
                </div>
              </div>
            </a>

            <a
              href="/hr/employees?action=add"
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <UserCheck className="w-8 h-8 text-primary" />
              <div>
                <div className="font-medium">Thêm Nhân Viên Mới</div>
                <div className="text-xs text-muted-foreground">
                  Tạo tài khoản nhân viên
                </div>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
