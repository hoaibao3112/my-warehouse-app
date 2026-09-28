"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { CheckCircle, XCircle, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"

interface RequestItem {
  id: string
  product_id: string
  product_name: string
  manager_quantity: number
  manager_unit_id: string
  manager_unit_name: string
  current_stock_display?: number
  stock_unit_name?: string
}

interface GmApprovalViewProps {
  requestId: string
  items: RequestItem[]
  productUnitsMap: Record<string, Array<{ id: string; name: string; code: string }>>
  warehouseName: string
  onSuccess?: () => void
}

export function GmApprovalView({ requestId, items, productUnitsMap, warehouseName, onSuccess }: GmApprovalViewProps) {
  const [editedItems, setEditedItems] = useState<Record<string, { quantity: number; unitId: string }>>(
    items.reduce((acc, item) => ({
      ...acc,
      [item.id]: {
        quantity: item.manager_quantity,
        unitId: item.manager_unit_id
      }
    }), {})
  )
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const updateItem = (itemId: string, field: 'quantity' | 'unitId', value: any) => {
    setEditedItems({
      ...editedItems,
      [itemId]: {
        ...editedItems[itemId],
        [field]: value
      }
    })
  }

  const handleApprove = async () => {
    setLoading(true)

    // Validation
    const invalidItems = Object.values(editedItems).filter(i => i.quantity === undefined || i.quantity < 0 || isNaN(i.quantity))
    if (invalidItems.length > 0) {
      toast({
        variant: "destructive",
        title: "Lỗi validation",
        description: "Vui lòng kiểm tra lại số lượng (phải >= 0)"
      })
      setLoading(false)
      return
    }

    try {
      const itemsData = Object.entries(editedItems).map(([itemId, data]) => ({
        itemId,
        quantity: data.quantity,
        unitId: data.unitId
      }))

      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/gm-approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsData })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Thành công",
          description: "Đã duyệt phiếu yêu cầu và chuyển cho Kho Tổng"
        })
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

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập lý do từ chối"
      })
      return
    }

    setLoading(true)
    try {
      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/gm-approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Đã từ chối",
          description: "Phiếu yêu cầu đã bị từ chối"
        })
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
      setShowRejectDialog(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Duyệt Phiếu Yêu Cầu - Tổng Quản Lý</CardTitle>
          <CardDescription>
            Xem xét số lượng yêu cầu và tồn kho hiện tại của kho {warehouseName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4">
            <div className="flex items-start gap-2">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Thông tin đặc biệt cho Tổng Quản Lý
                </p>
                <p className="text-blue-700 dark:text-blue-300 mt-1">
                  Bạn có thể thấy tồn kho hiện tại của kho để quyết định có nên duyệt yêu cầu hay không.
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
                  <th className="text-left p-3 font-semibold w-32">SL yêu cầu (QL)</th>
                  <th className="text-left p-3 font-semibold w-32">ĐV đề xuất</th>
                  <th className="text-left p-3 font-semibold w-32">Tồn kho CH</th>
                  <th className="text-left p-3 font-semibold w-32">SL duyệt</th>
                  <th className="text-left p-3 font-semibold w-40">Đơn vị</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
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
                        {item.current_stock_display !== undefined ? `${item.current_stock_display} ${item.stock_unit_name || item.manager_unit_name || ''}` : "N/A"}
                      </p>
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="w-full"
                        value={editedItems[item.id]?.quantity ?? ''}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value ? parseFloat(e.target.value) : '')}
                      />
                    </td>
                    <td className="p-3">
                      <Select
                        value={editedItems[item.id]?.unitId || item.manager_unit_id}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{item.product_name}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs pb-2 border-b">
                    <div>
                      <p className="text-muted-foreground">SL yêu cầu (QL)</p>
                      <p className="font-semibold">{item.manager_quantity} {item.manager_unit_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tồn kho CH</p>
                      <p className="font-semibold text-blue-600">{item.current_stock_display !== undefined ? `${item.current_stock_display} ${item.stock_unit_name || item.manager_unit_name || ''}` : "N/A"}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Số lượng duyệt</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="h-9 mt-1"
                        value={editedItems[item.id]?.quantity ?? ''}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value ? parseFloat(e.target.value) : '')}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Đơn vị</Label>
                      <Select
                        value={editedItems[item.id]?.unitId || item.manager_unit_id}
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
            ))}
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {loading ? "Đang xử lý..." : "Duyệt phiếu"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowRejectDialog(true)}
              disabled={loading}
              className="flex-1"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Từ chối
            </Button>
          </div>
        </CardContent>
      </Card >

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối phiếu yêu cầu</DialogTitle>
            <DialogDescription>
              Vui lòng nhập lý do từ chối phiếu yêu cầu này
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lý do từ chối *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Nhập lý do từ chối..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
