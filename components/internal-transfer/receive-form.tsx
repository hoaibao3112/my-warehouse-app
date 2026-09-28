"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { PackageCheck, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"

interface RequestItem {
  id: string
  product_id: string
  product_name: string
  exported_quantity: number
  exported_unit_name: string
  exported_unit_id: string
}

interface ReceiveFormProps {
  requestId: string
  items: RequestItem[]
  productUnitsMap: Record<string, Array<{
    id: string
    name: string
    code: string
    base_quantity: number
    is_default?: boolean
    source?: string
  }>>
  onSuccess?: () => void
}

export function ReceiveForm({ requestId, items, productUnitsMap, onSuccess }: ReceiveFormProps) {
  const [receivedData, setReceivedData] = useState<Record<string, { quantity: number; unitId: string }>>(
    items.reduce((acc, item) => ({
      ...acc,
      [item.id]: {
        quantity: item.exported_quantity,
        unitId: item.exported_unit_id
      }
    }), {})
  )
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const updateItem = (itemId: string, field: 'quantity' | 'unitId', value: any) => {
    setReceivedData({
      ...receivedData,
      [itemId]: {
        ...receivedData[itemId],
        [field]: value
      }
    })
  }

  const hasDiscrepancy = () => {
    return items.some(item => {
      const received = receivedData[item.id]
      return received.quantity !== item.exported_quantity || received.unitId !== item.exported_unit_id
    })
  }

  const calculateDiscrepancy = (item: RequestItem, received: { quantity: number; unitId: string }) => {
    // Get unit info for exported unit
    const exportedUnit = productUnitsMap[item.product_id]?.find(u => u.id === item.exported_unit_id)
    const receivedUnit = productUnitsMap[item.product_id]?.find(u => u.id === received.unitId)

    if (!exportedUnit || !receivedUnit) {
      return { discrepancy: 0, baseUnit: '' }
    }

    // Convert to base units
    const exportedBase = item.exported_quantity * (exportedUnit.base_quantity || 1)
    const receivedBase = received.quantity * (receivedUnit.base_quantity || 1)

    // Find base unit name
    const baseUnit = productUnitsMap[item.product_id]?.find(u => u.base_quantity === 1)

    return {
      discrepancy: receivedBase - exportedBase,
      baseUnit: baseUnit?.code || baseUnit?.name || ''
    }
  }

  const handleReceive = async () => {
    setLoading(true)
    try {
      const itemsData = Object.entries(receivedData).map(([itemId, data]) => ({
        itemId,
        receivedQuantity: data.quantity,
        receivedUnitId: data.unitId
      }))

      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/receive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsData })
      })

      const data = await response.json()

      if (data.success) {
        if (data.data.hasDiscrepancy) {
          toast({
            title: "Đã xác nhận nhận hàng",
            description: "Có chênh lệch. Đang chờ Kho Tổng xác nhận.",
            variant: "default"
          })
        } else {
          toast({
            title: "Hoàn thành",
            description: "Nhận hàng thành công. Phiếu đã hoàn thành."
          })
        }
        if (onSuccess) {
          onSuccess()
        } else {
          router.push("/store/internal-transfers")
          router.refresh()
        }
      } else {
        throw new Error(data.error || "Có lỗi xảy ra")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
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
          <PackageCheck className="h-5 w-5" />
          Xác Nhận Nhận Hàng
        </CardTitle>
        <CardDescription>
          Nhập số lượng thực tế nhận được. Nếu có chênh lệch, sẽ gửi cho Kho Tổng xác nhận.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDiscrepancy() && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Phát hiện chênh lệch
                </p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">
                  Số lượng nhận khác với số lượng xuất. Sau khi xác nhận, phiếu sẽ được gửi cho Kho Tổng xác nhận chênh lệch.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-semibold">Sản phẩm</th>
                <th className="text-left p-3 font-semibold w-32">SL xuất</th>
                <th className="text-left p-3 font-semibold w-32">ĐV xuất</th>
                <th className="text-left p-3 font-semibold w-32">SL nhận</th>
                <th className="text-left p-3 font-semibold w-40">ĐV nhận</th>
                <th className="text-left p-3 font-semibold w-24">Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const received = receivedData[item.id]
                const isDifferent = received.quantity !== item.exported_quantity || received.unitId !== item.exported_unit_id
                const { discrepancy, baseUnit } = calculateDiscrepancy(item, received)

                return (
                  <tr key={item.id} className={`border-b hover:bg-muted/50 ${isDifferent ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
                    <td className="p-3">
                      <p className="font-medium">{item.product_name}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-muted-foreground">{item.exported_quantity}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-muted-foreground">{item.exported_unit_name}</p>
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min="0"
                        className="w-full"
                        value={received.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td className="p-3">
                      <Select
                        value={received.unitId}
                        onValueChange={(value) => updateItem(item.id, 'unitId', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(productUnitsMap[item.product_id] || []).map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      {isDifferent && (
                        <p className="text-amber-600 font-medium text-sm">
                          {discrepancy > 0 ? '+' : ''}
                          {discrepancy} {baseUnit}
                        </p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {items.map((item) => {
            const received = receivedData[item.id]
            const isDifferent = received.quantity !== item.exported_quantity || received.unitId !== item.exported_unit_id
            const { discrepancy, baseUnit } = calculateDiscrepancy(item, received)

            return (
              <Card key={item.id} className={`p-3 ${isDifferent ? 'border-amber-500' : ''}`}>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium flex-1">{item.product_name}</p>
                    {isDifferent && (
                      <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs">
                        Chênh lệch
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pb-2 border-b">
                    <div>
                      <p className="text-muted-foreground">SL xuất</p>
                      <p className="font-semibold">{item.exported_quantity} {item.exported_unit_name}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">SL nhận</Label>
                      <Input
                        type="number"
                        min="0"
                        className="h-9 mt-1"
                        value={received.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      />
                      {isDifferent && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          Chênh lệch: {discrepancy > 0 ? '+' : ''}
                          {discrepancy} {baseUnit}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Đơn vị</Label>
                      <Select
                        value={received.unitId}
                        onValueChange={(value) => updateItem(item.id, 'unitId', value)}
                      >
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(productUnitsMap[item.product_id] || []).map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        <Button
          onClick={handleReceive}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          <PackageCheck className="h-4 w-4 mr-2" />
          {loading ? "Đang xử lý..." : hasDiscrepancy() ? "Xác nhận (Có chênh lệch)" : "Xác nhận nhận hàng"}
        </Button>
      </CardContent>
    </Card>
  )
}
