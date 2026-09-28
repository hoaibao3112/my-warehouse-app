"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Eye, ClipboardList } from "lucide-react"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import { toast } from "sonner"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"


export default function AdminStockTransferRequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [warehousesMap, setWarehousesMap] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const fetchRequests = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await mobileFetch(`/api/stock-transfer-requests?page=1&pageSize=100`)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi tải dữ liệu")
      setRequests(json.data || [])
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
    // fetch lookups
    const fetchLookups = async () => {
      try {
        const whRes = await mobileFetch(`/api/warehouses?page=1&pageSize=200`)
        const whJson = await whRes.json()
        if (whJson?.success && Array.isArray(whJson.data)) {
          const map: Record<string, string> = {}
          for (const w of whJson.data) map[w.id] = w.name || w.code || w.id
          setWarehousesMap(map)
        }
      } catch (e) {
        // ignore
      }
    }
    fetchLookups()
  }, [])

  const formatDate = (value: any) => {
    try {
      if (!value) return "-"
      return formatDbDateToDisplay(value)
    } catch {
      return "-"
    }
  }

  const handleApprove = async (requestId: string) => {
    // Redirect admin to the detail page so they can enter approved quantities before approving
    window.location.href = `/admin/stock-transfer-requests/${requestId}`
  }

  const handleReject = async (requestId: string) => {
    const reason = prompt("Nhập lý do từ chối:")
    if (!reason || !reason.trim()) return

    setActionLoading(requestId)
    try {
      const res = await mobileFetch(`/api/stock-transfer-requests/${requestId}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason.trim() })
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi từ chối")

      toast.success("Đã từ chối yêu cầu chuyển kho")
      fetchRequests()
    } catch (err: any) {
      toast.error(err?.message || "Không thể từ chối yêu cầu")
    } finally {
      setActionLoading(null)
    }
  }

  const statusMap: { [key: string]: { label: string; color: string } } = {
    CHO_DUYET: { label: "Chờ duyệt", color: "bg-yellow-100 text-yellow-800" },
    DA_DUYET: { label: "Đã duyệt", color: "bg-blue-100 text-blue-800" },
    DA_XUAT_KHO: { label: "Đã xuất kho", color: "bg-cyan-100 text-cyan-800" },
    KHO_TONG_DA_KY: { label: "Kho Tổng đã ký", color: "bg-purple-100 text-purple-800" },
    HOAN_THANH: { label: "Hoàn thành", color: "bg-green-100 text-green-800" },
    TU_CHOI: { label: "Từ chối", color: "bg-red-100 text-red-800" },
    HUY_BO: { label: "Hủy bỏ", color: "bg-gray-100 text-gray-800" },
  }

  const filteredRequests = requests.filter((r) =>
    r.request_number?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ClipboardList}
        title="Yêu Cầu Chuyển Kho"
        subtitle="Duyệt và xử lý yêu cầu"
        gradient="blue"
      />
      
      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Quản Lý Yêu Cầu Chuyển Kho</h1>
            <p className="text-muted-foreground mt-2">Duyệt và xử lý yêu cầu chuyển kho từ các kho con</p>
          </div>
        </div>

      <Card className="p-6">
        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm số yêu cầu..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>}
          {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}
          {!loading && filteredRequests.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Không có yêu cầu nào</p>
          )}

          <ResponsiveTable
            data={filteredRequests}
            columns={[
              {
                key: 'request_number',
                label: 'Số Yêu Cầu',
                render: (request) => <span className="font-medium">{request.request_number}</span>,
                mobilePrimary: true,
              },
              {
                key: 'from_warehouse_id',
                label: 'Từ Kho',
                render: (request) => <span>{warehousesMap[request.from_warehouse_id] || request.from_warehouse_id || "-"}</span>,
              },
              {
                key: 'to_warehouse_id',
                label: 'Đến Kho',
                render: (request) => <span>{warehousesMap[request.to_warehouse_id] || request.to_warehouse_id || "-"}</span>,
              },
              {
                key: 'status',
                label: 'Trạng Thái',
                render: (request) => (
                  <Badge className={getStatusColor(request.status as any) || "bg-gray-100 text-gray-800"}>
                    {getStatusLabel(request.status as any)}
                  </Badge>
                ),
                mobilePrimary: true,
              },
              {
                key: 'created_at',
                label: 'Ngày Tạo',
                render: (request) => <span>{new Date(request.created_at).toLocaleString('vi-VN')}</span>,
              },
            ]}
            actions={[
              {
                label: 'Xem',
                icon: <Eye className="w-4 h-4" />,
                onClick: (request) => {
                  window.location.href = `/admin/stock-transfer-requests/${request.id}`
                },
                variant: 'ghost',
              },
              {
                label: 'Ký',
                onClick: (request) => {
                  window.location.href = `/admin/stock-transfer-requests/${request.id}#signing-section`
                },
                variant: 'default',
                show: (request) => request.status === TRANSFER_STATUS.DA_DUYET,
              },
            ]}
            keyExtractor={(request) => request.id}
            loading={loading}
            emptyMessage="Không có yêu cầu nào"
            mobileCardTitle={(request) => request.request_number}
            mobileCardBadge={(request) => (
              <Badge className={getStatusColor(request.status as any) || "bg-gray-100 text-gray-800"}>
                {getStatusLabel(request.status as any)}
              </Badge>
            )}
            mobileCardMeta={(request) => [
              <>📦 Từ: {warehousesMap[request.from_warehouse_id] || request.from_warehouse_id || "-"}</>,
              <>🏪 Đến: {warehousesMap[request.to_warehouse_id] || request.to_warehouse_id || "-"}</>,
              <>📅 {new Date(request.created_at).toLocaleString('vi-VN')}</>,
            ]}
          />
        </div>
      </Card>

    </div>
    </div>
  )
}
