"use client"

import { DashboardOverview } from "@/components/admin/dashboard-overview"

import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { LayoutDashboard } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Warehouse, Users, Building2, Gift } from "lucide-react"
import { useAuthContext } from "@/components/auth-provider"

export default function AdminDashboard() {
  const auth = useAuthContext()
  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={LayoutDashboard}
        title={auth.loginMode === 'reports' ? "Báo Cáo & Dashboard" : "Quản Trị"}
        subtitle={auth.loginMode === 'reports' ? "Theo dõi sức khỏe cửa hàng" : "Bảng điều khiển quản trị"}
        gradient={auth.loginMode === 'reports' ? "orange" : "brown"}
      />

      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        <div className="hidden md:block">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            {auth.loginMode === 'reports' ? "Báo Cáo & Dashboard" : "Bảng Điều Khiển Quản Trị"}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            {auth.loginMode === 'reports' ? "Theo dõi hiệu suất và sức khỏe hệ thống" : "Quản lý hệ thống kho hàng và nhân sự"}
          </p>
        </div>

        <DashboardOverview />

        {/* Quick Actions - Hidden in reports mode */}
        {auth.loginMode !== 'reports' && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Truy Cập Nhanh</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/admin/warehouses">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Warehouse className="w-6 h-6 text-blue-500" />
                  <span className="text-sm">Kho Hàng</span>
                </Button>
              </Link>
              <Link href="/admin/hr/employees">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Users className="w-6 h-6 text-green-500" />
                  <span className="text-sm">Nhân Viên</span>
                </Button>
              </Link>
              <Link href="/admin/suppliers">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Building2 className="w-6 h-6 text-purple-500" />
                  <span className="text-sm">Nhà Cung Cấp</span>
                </Button>
              </Link>
              <Link href="/admin/vouchers">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Gift className="w-6 h-6 text-orange-500" />
                  <span className="text-sm">Khuyến Mãi</span>
                </Button>
              </Link>
            </div>
          </Card>
        )}


      </div>
    </div>
  )
}
