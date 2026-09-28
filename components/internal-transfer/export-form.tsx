"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useRouter } from "next/navigation"
import { Package, TruckIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"

interface RequestItem {
  id: string
  product_id: string
  product_name: string
  requested_quantity: number
  requested_unit_name: string
  manager_quantity: number
  manager_unit_name: string
  manager_unit_id: string
  main_stock_display?: number
  base_unit_id?: string
}

interface ExportFormProps {
  requestId: string
  items: RequestItem[]
  units?: Array<{ id: string; name: string; code: string; base_quantity?: number }> // Optional now
  productUnitsMap?: Record<string, Array<{ id: string; name: string; code: string; base_quantity?: number }>>
  toWarehouseName?: string
  onSuccess?: () => void
}

export function ExportForm({ requestId, items, units, productUnitsMap, toWarehouseName, onSuccess }: ExportFormProps) {
  // Add null safety checks
  const safeItems = items || []
  const safeUnits = units || []

  const [exportData, setExportData] = useState<Record<string, { quantity: number; unitId: string }>>(
    safeItems.reduce((acc, item) => ({
      ...acc,
      [item.id]: {
        quantity: item.manager_quantity,
        unitId: item.manager_unit_id
      }
    }), {})
  )
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const updateItem = (itemId: string, field: 'quantity' | 'unitId', value: any) => {
    setExportData({
      ...exportData,
      [itemId]: {
        ...exportData[itemId],
        [field]: value
      }
    })
  }

  const handleExport = async () => {
    setLoading(true)
    try {
      const itemsData = Object.entries(exportData).map(([itemId, data]) => ({
        itemId,
        exportedQuantity: data.quantity,
        exportedUnitId: data.unitId
      }))

      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/export`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsData, notes })
      })

      const data = await response.json()

      if (data.success) {
        toast.success("Đã xuất kho thành công. Chờ kho con xác nhận nhận hàng.")
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
      console.error("Export error caught:", error)
      const errorMessage = error?.message || "Có lỗi xảy ra khi xuất kho"
      toast.error(errorMessage, {
        description: "Không thể xuất kho",
        duration: 5000
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TruckIcon className="h-5 w-5" />
          Xuất Hàng Từ Kho Tổng
        </CardTitle>
        <CardDescription>
          Nhập số lượng và đơn vị thực tế xuất cho kho {toWarehouseName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-4">
          <div className="flex items-start gap-2">
            <Package className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Thông tin quan trọng
              </p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                Bạn có thể thấy tồn kho hiện tại của kho tổng và số lượng kho con yêu cầu.
                Nhập số lượng thực tế xuất (có thể khác với yêu cầu nếu không đủ hàng).
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-semibold">Sản phẩm</th>
                <th className="text-left p-3 font-semibold w-32">SL đã duyệt</th>
                <th className="text-left p-3 font-semibold w-32">ĐV gốc</th>
                <th className="text-left p-3 font-semibold w-32">Tồn Kho Tổng</th>
                <th className="text-left p-3 font-semibold w-32">SL xuất</th>
                <th className="text-left p-3 font-semibold w-40">Đơn vị xuất</th>
              </tr>
            </thead>
            <tbody>
              {safeItems.map((item) => (
                <tr key={item.id} className="border-b hover:bg-muted/50">
                  <td className="p-3">
                    <p className="font-medium">{item.product_name}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-muted-foreground">{item.manager_quantity}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-muted-foreground">{item.manager_unit_name}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-semibold text-blue-600 dark:text-blue-400">
                      {(() => {
                        if (item.main_stock_display === undefined) return "N/A"

                        const currentUnitId = exportData[item.id]?.unitId || item.manager_unit_id
                        const specificUnits = productUnitsMap?.[item.product_id] || safeUnits
                        const unitInfo = specificUnits.find(u => u.id === currentUnitId)
                        const conversionRate = unitInfo?.base_quantity || 1

                        const convertedStock = Math.round((item.main_stock_display / conversionRate) * 100) / 100
                        // Clean unit name: remove content in parentheses
                        const unitName = unitInfo?.name || ''
                        const cleanName = unitName.split('(')[0].trim()
                        return `${convertedStock} ${cleanName}`
                      })()}
                    </p>
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="w-full"
                      value={exportData[item.id]?.quantity ?? item.manager_quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value ? parseFloat(e.target.value) : '')}
                    />
                  </td>
                  <td className="p-3">
                    <div className="space-y-1">
                      <Select
                        value={exportData[item.id]?.unitId || item.manager_unit_id}
                        onValueChange={(value) => updateItem(item.id, 'unitId', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const specificUnits = productUnitsMap?.[item.product_id] || safeUnits
                            const hasCurrentUnit = specificUnits.some(u => u.id === item.manager_unit_id)

                            return (
                              <>
                                {!hasCurrentUnit && item.manager_unit_id && (
                                  <SelectItem value={item.manager_unit_id}>
                                    {item.manager_unit_name || "Đơn vị hiện tại"}
                                  </SelectItem>
                                )}
                                {specificUnits.map((unit: any) => (
                                  <SelectItem key={unit.id} value={unit.id}>
                                    {unit.name} {unit.base_quantity ? `(x${unit.base_quantity})` : ''}
                                  </SelectItem>
                                ))}
                              </>
                            )
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {safeItems.map((item) => (
            <Card key={item.id} className="p-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">{item.product_name}</p>

                <div className="grid grid-cols-2 gap-2 text-xs pb-2 border-b">
                  <div>
                    <p className="text-muted-foreground">SL đã duyệt</p>
                    <p className="font-semibold">{item.manager_quantity} {item.manager_unit_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tồn Kho Tổng</p>
                    <p className="font-semibold text-blue-600">
                      {(() => {
                        if (item.main_stock_display === undefined) return "N/A"

                        const currentUnitId = exportData[item.id]?.unitId || item.manager_unit_id
                        const specificUnits = productUnitsMap?.[item.product_id] || safeUnits
                        const unitInfo = specificUnits.find(u => u.id === currentUnitId)
                        const conversionRate = unitInfo?.base_quantity || 1

                        const convertedStock = Math.round((item.main_stock_display / conversionRate) * 100) / 100
                        const unitName = unitInfo?.name || ''
                        const cleanName = unitName.split('(')[0].trim()
                        return `${convertedStock} ${cleanName}`
                      })()}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Số lượng xuất</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-9 mt-1"
                      value={exportData[item.id]?.quantity ?? item.manager_quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value ? parseFloat(e.target.value) : '')}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Đơn vị xuất</Label>
                    <Select
                      value={exportData[item.id]?.unitId || item.manager_unit_id}
                      onValueChange={(value) => updateItem(item.id, 'unitId', value)}
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Ensure current unit is available even if fetch fails */}
                        {(() => {
                          const specificUnits = productUnitsMap?.[item.product_id] || safeUnits
                          const hasCurrentUnit = specificUnits.some(u => u.id === item.manager_unit_id)

                          return (
                            <>
                              {!hasCurrentUnit && item.manager_unit_id && (
                                <SelectItem value={item.manager_unit_id}>
                                  {item.manager_unit_name || "Đơn vị hiện tại"}
                                </SelectItem>
                              )}
                              {specificUnits.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                            </>
                          )
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Ghi chú (tùy chọn)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nhập ghi chú về lô hàng xuất..."
            rows={3}
          />
        </div>

        <Button
          onClick={handleExport}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          <TruckIcon className="h-4 w-4 mr-2" />
          {loading ? "Đang xuất kho..." : "Xác nhận xuất kho"}
        </Button>
      </CardContent>
    </Card>
  )
}
