"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { CheckCircle, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"

interface RequestItem {
  id: string
  product_id: string
  product_name: string
  exported_quantity: number
  exported_unit_name: string
  exported_unit_id?: string
  received_quantity: number
  received_unit_name: string
  received_unit_id?: string
  discrepancy_quantity: number
}

interface DiscrepancyConfirmFormProps {
  requestId: string
  items: RequestItem[]
  onSuccess?: () => void
}

export function DiscrepancyConfirmForm({ requestId, items, onSuccess }: DiscrepancyConfirmFormProps) {
  const [confirmedData, setConfirmedData] = useState<Record<string, { quantity: number; unitId: string }>>(
    items.reduce((acc, item) => ({
      ...acc,
      [item.id]: {
        quantity: item.received_quantity, // Use store's received quantity as default (as per requirement)
        unitId: item.received_unit_id || '' // Use store's received unit as default
      }
    }), {})
  )
  const [productUnitsMap, setProductUnitsMap] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(false)
  // const { toast } = useToast() // Removing hook usage
  const router = useRouter()

  // Fetch units for all products on mount
  useEffect(() => {
    const fetchAllUnits = async () => {
      const unitsMap: Record<string, any[]> = {}

      for (const item of items) {
        try {
          const res = await mobileFetch(`/api/product-units?productId=${item.product_id}`)
          const json = await res.json()
          if (json.success && json.data) {
            unitsMap[item.product_id] = json.data
          }
        } catch (err) {
          console.error(`Failed to fetch units for product ${item.product_id}:`, err)
          unitsMap[item.product_id] = []
        }
      }

      setProductUnitsMap(unitsMap)
    }

    fetchAllUnits()
  }, [items])

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setConfirmedData({
      ...confirmedData,
      [itemId]: { ...confirmedData[itemId], quantity }
    })
  }

  const updateItemUnit = (itemId: string, unitId: string) => {
    setConfirmedData({
      ...confirmedData,
      [itemId]: { ...confirmedData[itemId], unitId }
    })
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const itemsData = Object.entries(confirmedData).map(([itemId, data]) => ({
        itemId,
        confirmedQuantity: data.quantity,
        confirmedUnitId: data.unitId
      }))

      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/confirm-discrepancy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsData })
      })

      const data = await response.json()

      if (response.status === 423) {
        toast.error("Không thể xác nhận", { description: data.error })
        setLoading(false)
        return
      }

      if (data.success) {
        toast.success("Đã xác nhận", {
          description: "Chênh lệch đã được xác nhận. Phiếu hoàn thành."
        })
        if (onSuccess) {
          onSuccess()
        } else {
          router.push("/warehouse/internal-transfers")
          router.refresh()
        }
      } else {
        throw new Error(data.error || "Có lỗi xảy ra")
      }
    } catch (error: any) {
      toast.error("Lỗi", {
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          Xác Nhận Chênh Lệch
        </CardTitle>
        <CardDescription>
          Xác nhận số lượng cuối cùng. Theo quy định, sử dụng số lượng của Kho Con làm chuẩn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Chính sách xử lý chênh lệch
              </p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                Theo quy định, số lượng thực tế nhận được của Kho Con sẽ được sử dụng làm số liệu cuối cùng.
                Kho Tổng xác nhận và điều chỉnh tồn kho theo số liệu này.
              </p>
            </div>
          </div>
        </div>

        {items.map((item) => {
          const hasDiff = item.discrepancy_quantity !== 0

          return (
            <Card key={item.id} className={`p-4 ${hasDiff ? 'border-amber-500' : ''}`}>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Label className="text-sm font-medium">Sản phẩm</Label>
                    <p className="text-sm text-muted-foreground">{item.product_name}</p>
                  </div>
                  {hasDiff && (
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      Chênh lệch: {item.discrepancy_quantity > 0 ? '+' : ''}{item.discrepancy_quantity}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm">Kho Tổng xuất</Label>
                    <p className="text-lg font-semibold text-muted-foreground">
                      {item.exported_quantity} {item.exported_unit_name}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm">Kho Con nhận</Label>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {item.received_quantity} {item.received_unit_name}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label>Số lượng xác nhận *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={confirmedData[item.id]?.quantity ?? item.received_quantity}
                        onChange={(e) => updateItemQuantity(item.id, parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Đơn vị *</Label>
                      {productUnitsMap[item.product_id]?.length > 0 ? (
                        <select
                          value={confirmedData[item.id]?.unitId || item.received_unit_id || ''}
                          onChange={(e) => updateItemUnit(item.id, e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm h-10 font-medium"
                        >
                          {(productUnitsMap[item.product_id] || []).map((unit: any) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.code || unit.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground text-sm h-10 flex items-center italic">
                          Đang tải...
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mặc định: số và đơn vị Kho Con nhận
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Lưu ý:</strong> Sau khi xác nhận, tồn kho của cả Kho Tổng và Kho Con sẽ được cập nhật theo số lượng xác nhận.
          </p>
        </div>

        <Button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          {loading ? "Đang xử lý..." : "Xác nhận và hoàn thành"}
        </Button>
      </CardContent>
    </Card>
  )
}
