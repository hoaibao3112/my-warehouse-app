"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { StoreOverview } from "@/components/store/store-overview"
import { StockStatus } from "@/components/store/stock-status"
import { RevenueCharts } from "@/components/store/revenue-charts"
import { TransferRequests } from "@/components/store/transfer-requests"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { LayoutDashboard } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function StoreDashboard() {
  const { user, loginMode, loading, hasPermission } = useAuth()
  const router = useRouter()
  const [warehouseType, setWarehouseType] = useState<string | null>(null)

  // Fetch warehouse type to conditionally hide transfer requests for PARTNER
  useEffect(() => {
    const fetchWarehouseType = async () => {
      if (user?.warehouseId) {
        try {
          const res = await mobileFetch(`/api/warehouses/${user.warehouseId}`)
          const json = await res.json()
          if (json.success && json.data) {
            setWarehouseType(json.data.type)
          }
        } catch (error) {
          console.error("Failed to fetch warehouse details", error)
        }
      }
    }
    fetchWarehouseType()
  }, [user?.warehouseId])

  // ATTENDANCE_STAFF (not here) should be redirected to sales page by middleware/login
  // STAFF users are for attendance only, they see the staff dashboard

  // Staff dashboard handling - Redirect to specific function based on permissions
  const isStaff = user?.role === 'STAFF' || user?.role === 'WAREHOUSE_STAFF' || user?.role === 'ATTENDANCE_STAFF'

  useEffect(() => {
    if (isStaff && !loading && user) {
      if (hasPermission('sales') || hasPermission('view_sales')) {
        router.replace('/store/sales')
      } else if (hasPermission('inventory') || hasPermission('view_inventory') || hasPermission('manage_inventory')) {
        router.replace('/store/inventory')
      } else {
        router.replace('/attendance')
      }
    }
  }, [isStaff, loading, user, router, hasPermission])

  // Show loading state or redirecting state
  if (loading || isStaff) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">{loading ? "Đang tải..." : "Đang chuyển hướng..."}</p>
        </div>
      </div>
    )
  }

  const isPartner = warehouseType === 'PARTNER'

  // Manager/Admin dashboard
  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={LayoutDashboard}
        title={loginMode === 'reports' ? "Báo Cáo & Dashboard" : "Bảng Điều Khiển"}
        subtitle={loginMode === 'reports' ? "Theo dõi sức khỏe cửa hàng" : "Quản lý cửa hàng của bạn"}
        gradient={loginMode === 'reports' ? "orange" : "brown"}
      />

      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">
            {loginMode === 'reports' ? "Báo Cáo & Dashboard" : "Bảng Điều Khiển Cửa Hàng"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {loginMode === 'reports' ? "Theo dõi hiệu suất và sức khỏe hệ thống" : "Quản lý hàng tồn kho và doanh thu của bạn"}
          </p>
        </div>

        <StoreOverview />

        {/* In reports mode, we show only essential visualizations */}
        <div className={`grid grid-cols-1 ${!isPartner && loginMode !== 'reports' ? 'lg:grid-cols-2' : ''} gap-6 md:gap-8`}>
          <StockStatus />
          {!isPartner && loginMode !== 'reports' && <TransferRequests />}
        </div>

        <RevenueCharts />
      </div>
    </div>
  )
}
