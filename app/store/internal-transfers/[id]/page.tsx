"use client"

import { useEffect, useState } from "react"
import { redirect, useParams } from "next/navigation"
import { hasPermission, isWarehouseManager, isGeneralManager } from "@/lib/auth-helpers"
import { useAuth } from "@/hooks/use-auth"
import { mobileFetch } from "@/lib/mobile/api-client"
import { RequestDetailView } from "@/components/internal-transfer/request-detail-view"
import { ManagerApprovalForm } from "@/components/internal-transfer/manager-approval-form"
import { GmApprovalView } from "@/components/internal-transfer/gm-approval-view"
import { ReceiveForm } from "@/components/internal-transfer/receive-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function InternalTransferDetailPage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams()
  const requestId = params?.id as string

  const [data, setData] = useState<{ request: any, items: any[] } | null>(null)
  const [units, setUnits] = useState<any[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) {
      redirect("/login")
    }

    if (!authLoading && user) {
      // Only store users can access this page
      const allowedRoles = ["STAFF", "WAREHOUSE_MANAGER", "GENERAL_MANAGER", "WAREHOUSE_STAFF", "MANAGER"]
      const hasAccessRole = allowedRoles.includes(user.role)
      const hasAccessPermission = hasPermission(user, "purchase_requests")

      if (!hasAccessRole && !hasAccessPermission) {
        redirect("/store")
      }

      fetchData()
    }
  }, [user, authLoading, requestId])

  const fetchData = async () => {
    try {
      // Fetch request details
      const detailRes = await mobileFetch(`/api/internal-transfer-requests/${requestId}`)
      if (detailRes.ok) {
        const detailJson = await detailRes.json()
        if (detailJson.success && detailJson.data) {
          setData({ request: detailJson.data, items: detailJson.data.items || [] })
        } else {
          // If not found or error, maybe redirect or show error
          return
        }
      }

      // Fetch units
      const unitsRes = await mobileFetch("/api/units?page=1&pageSize=1000&active=true")
      if (unitsRes.ok) {
        const unitsJson = await unitsRes.json()
        if (unitsJson.success && unitsJson.data) {
          setUnits(unitsJson.data)
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoadingConfig(false)
    }
  }

  if (authLoading || loadingConfig) {
    return <div className="p-8 text-center">Đang tải chi tiết...</div>
  }

  if (!user || !data) return <div className="p-8 text-center">Không tìm thấy phiếu yêu cầu</div>

  const { request, items } = data

  // Determine action component
  let actionComponent = null
  if (request.status === "CHO_QUAN_LY_DUYET" && (isWarehouseManager(user) || isGeneralManager(user) || user.role === "ADMIN" || user.role === "Admin")) {
    actionComponent = (
      <ManagerApprovalForm
        requestId={request.id}
        items={items}
        units={units}
        isGeneralManager={isGeneralManager(user) || user.role === "ADMIN" || user.role === "Admin"}
      />
    )
  } else if (request.status === "CHO_TONG_QUAN_LY_DUYET" && isGeneralManager(user)) {
    actionComponent = (
      <GmApprovalView
        requestId={request.id}
        items={items}
        warehouseName={request.to_warehouse_name}
      />
    )
  } else if (request.status === "DA_XUAT_KHO") {
    actionComponent = (
      <ReceiveForm
        requestId={request.id}
        items={items}
        units={units}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/store/internal-transfers">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Chi Tiết Phiếu Yêu Cầu</h1>
          <p className="text-muted-foreground mt-1">
            Xem chi tiết và xử lý phiếu yêu cầu nhập hàng nội bộ
          </p>
        </div>
      </div>

      {actionComponent}

      <RequestDetailView
        request={request}
        items={items}
        userRole={user.role}
      />
    </div>
  )
}
