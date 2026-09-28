"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import { Input } from "@/components/ui/input"
import { Download, FileText } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function StoreTransferRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [requestId, setRequestId] = useState("")
  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [receivedQuantities, setReceivedQuantities] = useState<{ [key: string]: number }>({})

  useEffect(() => {
    params.then((p) => {
      setRequestId(p.id)
      fetchRequest(p.id)
    })
  }, [params])

  const fetchRequest = async (id: string) => {
    try {
      setLoading(true)
      const res = await mobileFetch(`/api/stock-transfer-requests/${id}`)
      const json = await res.json()
      if (json?.success) {
        setRequest(json.data)
        // Initialize received quantities from approved quantities
        const initial: { [key: string]: number } = {}
        if (json.data.details) {
          json.data.details.forEach((d: any) => {
            initial[d.id] = d.received_quantity || 0
          })
        } else if (json.data.items) {
          json.data.items.forEach((d: any) => {
            initial[d.id] = d.received_quantity || 0
          })
        }
        setReceivedQuantities(initial)
      } else {
        setError(json?.error || "Không tìm thấy yêu cầu")
      }
    } catch (err: any) {
      setError(err?.message || "Lỗi tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    setError(null)
    try {
      const items = (request.details || request.items || []).map((d: any) => ({
        itemId: d.id,
        actualReceivedQuantity: receivedQuantities[d.id] || 0,
      }))

      const res = await mobileFetch(`/api/stock-transfer-requests/${requestId}/sign-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi")

      toast.success("Xác nhận thành công - Yêu cầu đã hoàn thành")
      await fetchRequest(requestId)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Đang tải...</div>
      </div>
    )
  }

  if (error || !request) {
    return (
      <div className="p-8">
        <div className="text-center text-destructive">{error || "Không tìm thấy yêu cầu"}</div>
        <Button onClick={() => router.back()} className="mt-4 mx-auto block">
          Quay lại
        </Button>
      </div>
    )
  }

  const formatDate = (value: any) => {
    return formatDbDateToDisplay(value)
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={FileText}
        title="Chi Tiết Yêu Cầu"
        subtitle={request.request_number ? `Số: ${request.request_number}` : "Chi tiết yêu cầu chuyển kho"}
        gradient="blue"
      />

      <div className="p-4 md:p-8 space-y-6">
        <Button variant="outline" onClick={() => router.back()}>
          ← Quay lại
        </Button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Debug: Show actual status */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
            Status: {request.status} | Type: {typeof request.status}
          </div>
        )}

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Chi tiết yêu cầu chuyển kho</h1>
              <p className="text-muted-foreground mt-1">Số: {request.request_number}</p>
            </div>
            <Badge className={getStatusColor(request.status as any)}>
              {getStatusLabel(request.status as any)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className="text-sm text-muted-foreground">Ngày tạo</p>
              <p className="text-lg font-semibold">{formatDate(request.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ngày chuyển kho</p>
              <p className="text-lg font-semibold">
                {formatDate(request.completed_at)}
              </p>
            </div>
          </div>

          {request.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-red-800 mb-2">Yêu cầu bị từ chối</h3>
              <p className="text-red-700">{request.rejection_reason}</p>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold mb-4">Sản phẩm yêu cầu</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="text-left py-3 px-4 font-semibold">Sản Phẩm</th>
                    <th className="text-center py-3 px-4 font-semibold">Số Lượng Yêu Cầu</th>
                    <th className="text-center py-3 px-4 font-semibold">Đơn Vị Yêu Cầu</th>
                    <th className="text-center py-3 px-4 font-semibold">Đã Duyệt (Số Lượng)</th>
                    <th className="text-center py-3 px-4 font-semibold">Đơn Vị Duyệt</th>
                    {request?.status === 'HOAN_THANH' && (
                      <th className="text-center py-3 px-4 font-semibold">Nhận Thực Tế</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(request.items || request.details) && (request.items || request.details).length > 0 ? (
                    (request.items || request.details).map((item: any) => (
                      <tr key={item.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div className="font-medium">{item.product_name || item.product?.name || "Sản phẩm không xác định"}</div>
                          <div className="text-sm text-muted-foreground">{item.product_code || item.product?.code || ""}</div>
                        </td>
                        <td className="py-3 px-4 text-center">{item.quantity ?? item.requested_quantity ?? '-'}</td>
                        <td className="py-3 px-4 text-center">{item.unit_name || item.unit?.name || "-"}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="font-semibold text-blue-600">{item.received_quantity ?? item.approved_quantity ?? 0}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.approved_unit_code ? item.approved_unit_code : (item.unit_name || item.unit?.name || "-")}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.approved_unit_code ? (
                            <span className="font-medium text-orange-600">{item.approved_unit_code}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        {request?.status === 'HOAN_THANH' && (
                          <td className="py-3 px-4 text-center font-semibold text-green-600">
                            {item.actual_received_quantity ?? 0}
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={request?.status === 'HOAN_THANH' ? 6 : 5} className="py-4 px-4 text-center text-muted-foreground">
                        Không có sản phẩm
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Confirmation & Received Quantity Section */}
        {request?.status === 'DA_XUAT_KHO' && (
          <Card className="p-6 bg-blue-50 border border-blue-200">
            <h2 className="text-lg font-semibold mb-4 text-blue-900">Xác Nhận Số Lượng Nhận</h2>
            <p className="text-blue-800 mb-6">
              Kho Tổng đã xuất kho. Vui lòng nhập số lượng nhận thực tế và xác nhận để hoàn thành quy trình.
            </p>

            <div className="border rounded-lg overflow-hidden mb-6">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="text-left py-3 px-4 font-semibold">Sản Phẩm</th>
                    <th className="text-center py-3 px-4 font-semibold">Số Lượng Duyệt (Đơn Vị)</th>
                    <th className="text-center py-3 px-4 font-semibold">Số Lượng Nhận Thực Tế</th>
                  </tr>
                </thead>
                <tbody>
                  {(request.details || request.items || []).length > 0 ? (
                    (request.details || request.items || []).map((item: any) => (
                      <tr key={item.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div className="font-medium">{item.product_name || item.product?.name || "Sản phẩm"}</div>
                          <div className="text-sm text-muted-foreground">{item.product_code || item.product?.code || ""}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="font-semibold text-blue-600">{item.received_quantity ?? 0}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.approved_unit?.name || item.approved_unit?.code ? (
                              item.approved_unit.name || item.approved_unit.code
                            ) : (
                              item.unit_name || item.unit?.name || "-"
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Input
                            type="number"
                            value={receivedQuantities[item.id] ?? 0}
                            onChange={(e) =>
                              setReceivedQuantities({
                                ...receivedQuantities,
                                [item.id]: Number(e.target.value) || 0,
                              })
                            }
                            min="0"
                            className="w-20 mx-auto text-center"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 px-4 text-center text-muted-foreground">
                        Không có sản phẩm
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleConfirm} disabled={confirming}>
                {confirming ? "Đang xác nhận..." : "Xác Nhận Hoàn Thành"}
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
