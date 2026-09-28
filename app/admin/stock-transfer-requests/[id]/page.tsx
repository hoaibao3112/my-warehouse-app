"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import { Textarea } from "@/components/ui/textarea"
import { Download, ClipboardCheck } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function AdminTransferRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [requestId, setRequestId] = useState("")
  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warehousesMap, setWarehousesMap] = useState<Record<string, string>>({})
  const [approvalQuantities, setApprovalQuantities] = useState<{ [key: string]: number }>({})
  const [rejectionReason, setRejectionReason] = useState("")

  useEffect(() => {
    params.then((p) => {
      setRequestId(p.id)
      fetchRequest(p.id)
    })
    // fetch warehouse names for display
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
  }, [params])

  const fetchRequest = async (id: string) => {
    try {
      setLoading(true)
      const res = await mobileFetch(`/api/stock-transfer-requests/${id}`)
      const json = await res.json()
      if (json?.success) {
        setRequest(json.data)
        const initial: { [key: string]: number } = {}
        json.data.details?.forEach((d: any) => {
          // API uses `received_quantity` for the approved/received field and `quantity` for requested
          initial[d.id] = d.received_quantity || 0
        })
        setApprovalQuantities(initial)
      } else {
        setError(json?.error || "Không tìm thấy yêu cầu")
      }
    } catch (err: any) {
      setError(err?.message || "Lỗi tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setActionLoading(true)
    setError(null)
    try {
      // The approve API expects items: [{ itemId, approvedQuantity, approvedUnitCode }]
      const items = request.details.map((d: any) => ({
        itemId: d.id,
        approvedQuantity: approvalQuantities[d.id] || 0,
        approvedUnitCode: d.unit_code || '',
      }))

      const res = await mobileFetch(`/api/stock-transfer-requests/${requestId}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi")

      toast.success("Đã duyệt yêu cầu - Hàng hóa đã được xuất kho")
      await fetchRequest(requestId)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError("Vui lòng nhập lý do từ chối")
      return
    }

    setActionLoading(true)
    setError(null)
    try {
      const res = await mobileFetch(`/api/stock-transfer-requests/${requestId}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi")

      toast.success("Đã từ chối yêu cầu chuyển kho")
      await fetchRequest(requestId)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setActionLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Đang tải...</div>
      </div>
    )
  }

  if (error && !request) {
    return (
      <div className="p-8">
        <div className="text-center text-destructive">{error}</div>
        <Button onClick={() => router.back()} className="mt-4 mx-auto block">
          Quay lại
        </Button>
      </div>
    )
  }

  const formatDate = (value: any) => {
    try {
      if (!value) return "-"
      return formatDbDateToDisplay(value)
    } catch {
      return "-"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ClipboardCheck}
        title="Chi Tiết Yêu Cầu"
        subtitle="Yêu cầu chuyển kho"
        gradient="blue"
      />
      <div className="p-4 md:p-8 space-y-6">
        <Button variant="outline" onClick={() => router.back()} className="hidden md:inline-flex">
          ← Quay lại
        </Button>
        <Button variant="outline" onClick={() => router.back()} className="md:hidden">
          ← Quay lại
        </Button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Chi tiết yêu cầu chuyển kho</h1>
            </div>
            <Badge className={getStatusColor(request.status as any) || "bg-gray-100 text-gray-800"}>
              {getStatusLabel(request.status as any) || request.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className="text-sm text-muted-foreground">Kho Con (Kho nhận)</p>
              <p className="text-lg font-semibold">{warehousesMap[request.to_warehouse_id] || request.to_warehouse_id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ngày tạo</p>
              <p className="text-lg font-semibold">
                {formatDate(request.created_at)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ngày xuất kho</p>
              <p className="text-lg font-semibold">
                {request.exported_at ? new Date(request.exported_at).toLocaleString("vi-VN") : "-"}
              </p>
            </div>
          </div>

          {request.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-red-800 mb-2">Lý do từ chối</h3>
              <p className="text-red-700">{request.rejection_reason}</p>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold mb-4">Chi tiết sản phẩm</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="text-left py-3 px-4 font-semibold">Mã Sản Phẩm</th>
                    <th className="text-center py-3 px-4 font-semibold">Yêu Cầu</th>
                    {(request.status === TRANSFER_STATUS.CHO_DUYET || request.status === TRANSFER_STATUS.DA_DUYET) ? (
                      <th className="text-center py-3 px-4 font-semibold">Duyệt Lại (Kho Tổng)</th>
                    ) : (
                      <th className="text-center py-3 px-4 font-semibold">Đã Duyệt (Kho Tổng)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {request.details && request.details.length > 0 ? (
                    request.details.map((detail: any) => (
                      <tr key={detail.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div className="font-medium">{detail.product_name || detail.product_id}</div>
                          {detail.product_code && <div className="text-sm text-muted-foreground">{detail.product_code}</div>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {/* Display original quantity requested by manager - NEVER changes */}
                          <div className="font-semibold">{detail.quantity}</div>
                          <div className="text-xs text-muted-foreground">
                            {detail.unit_name || detail.unit_code || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(request.status === TRANSFER_STATUS.CHO_DUYET || request.status === TRANSFER_STATUS.DA_DUYET) ? (
                            <>
                              <Input
                                type="number"
                                value={approvalQuantities[detail.id] || 0}
                                onChange={(e) =>
                                  setApprovalQuantities({
                                    ...approvalQuantities,
                                    [detail.id]: Number(e.target.value) || 0,
                                  })
                                }
                                min="0"
                                max={detail.convertedQuantity ?? detail.quantity}
                                className="w-20 mx-auto"
                              />
                              <div className="text-xs text-muted-foreground mt-1">
                                {detail.convertedQuantity ?? detail.quantity}
                              </div>
                            </>
                          ) : (
                            <div>
                              <div className="font-semibold text-blue-600">{detail.received_quantity ?? detail.received_quantity === 0 ? detail.received_quantity : '-'}</div>
                              <div className="text-xs text-muted-foreground">
                                {detail.approved_unit_code ?? detail.unit_code ?? '-'}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 px-4 text-center text-muted-foreground">
                        Không có chi tiết sản phẩm
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Actions & Signature Section */}
        {(request.status === TRANSFER_STATUS.CHO_DUYET || request.status === TRANSFER_STATUS.DA_DUYET) && (
          <Card className="p-6 bg-yellow-50 border border-yellow-200">
            <h2 className="text-lg font-semibold mb-4 text-yellow-900">
              {request.status === TRANSFER_STATUS.CHO_DUYET ? "Duyệt Yêu Cầu" : "Duyệt Lại Yêu Cầu (Kho Tổng)"}
            </h2>

            <div className="space-y-4 mb-4">
              <div>
                <label className="text-sm font-semibold mb-2 block text-yellow-900">Hoặc từ chối yêu cầu</label>
                <Textarea
                  placeholder="Nhập lý do từ chối..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="min-h-24"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
              >
                Từ Chối
              </Button>
              <Button onClick={handleApprove} disabled={actionLoading}>
                {actionLoading ? "Đang xử lý..." : "Duyệt Yêu Cầu"}
              </Button>
            </div>
          </Card>
        )}

        {request.status === 'DA_XUAT_KHO' && (
          <Card className="p-6 bg-cyan-50 border border-cyan-200">
            <h2 className="text-lg font-semibold mb-4 text-cyan-900">Chờ Kho Con Xác Nhận</h2>
            <p className="text-cyan-800 mb-4">
              Hàng hóa đã được xuất từ Kho Tổng. Kho Con đang xác nhận số lượng nhận thực tế.
            </p>
          </Card>
        )}

        {request.status === TRANSFER_STATUS.CHO_ADMIN_XAC_NHAN && (
          <Card className="p-6 bg-purple-50 border border-purple-200">
            <h2 className="text-lg font-semibold mb-4 text-purple-900">Xác Nhận Nhập Thiếu Hàng</h2>
            <p className="text-purple-800 mb-6">
              Kho Con đã nhập số lượng bé hơn số duyệt. Vui lòng xác nhận để hoàn thành.
            </p>

            <div className="flex gap-2 justify-end">
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={async () => {
                  setActionLoading(true)
                  setError(null)
                  try {
                    const res = await mobileFetch(`/api/stock-transfer-requests/${requestId}/admin-confirm-shortage`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: 'CONFIRM' })
                    })

                    const json = await res.json()
                    if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi")

                    toast.success("Đã xác nhận - Yêu cầu chuyển kho hoàn thành")
                    await mobileFetch(`/api/stock-transfer-requests/${requestId}`).then(r => r.json()).then(j => {
                      if (j?.success) setRequest(j.data)
                    })
                  } catch (err: any) {
                    setError(err?.message || String(err))
                  } finally {
                    setActionLoading(false)
                  }
                }}
                disabled={actionLoading}
              >
                {actionLoading ? "Đang xử lý..." : "Xác Nhận"}
              </Button>
            </div>
          </Card>
        )}

        {request.status === 'HOAN_THANH' && (
          <Card className="p-6 bg-green-50 border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-4xl">✓</div>
                <div>
                  <h2 className="text-lg font-semibold text-green-900">Yêu cầu đã hoàn thành</h2>
                  <p className="text-green-800">
                    Ngày hoàn thành: {formatDbDateToDisplay(request.completed_at)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  window.open(`/api/stock-transfer-requests/${requestId}/pdf`, "_blank")
                }}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                In Phiếu PDF
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
