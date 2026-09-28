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
import { CheckCircle, XCircle } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"

interface RequestItem {
  id: string
  product_id: string
  product_name: string
  requested_quantity: number
  requested_unit_id: string
  requested_unit_name: string
}

interface ManagerApprovalFormProps {
  requestId: string
  items: RequestItem[]
  productUnitsMap: Record<string, Array<{ id: string; name: string; code: string }>>
  isGeneralManager?: boolean
  onSuccess?: () => void
}

export function ManagerApprovalForm({ requestId, items, productUnitsMap, isGeneralManager, onSuccess }: ManagerApprovalFormProps) {
  const [editedItems, setEditedItems] = useState<Record<string, { quantity: number; unitId: string }>>(
    items.reduce((acc, item) => ({
      ...acc,
      [item.id]: {
        quantity: item.requested_quantity,
        unitId: item.requested_unit_id
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

      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/manager-approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: itemsData,
          // If GM is approving, we might want to signal backend to auto-forward? 
          // For now backend likely doesn't support it without change, but frontend Validation is key here.
          bypassToExport: isGeneralManager
        })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Thành công",
          description: isGeneralManager
            ? "Đã duyệt phiếu (Quyền Tổng Quản Lý)"
            : "Đã duyệt phiếu yêu cầu và chuyển cho Tổng quản lý"
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
      const response = await mobileFetch(`/api/internal-transfer-requests/${requestId}/manager-approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason })
      })

      const data = await response.json()

      if (data.success) {
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
          <CardTitle>
            {isGeneralManager ? "Duyệt Phiếu Yêu Cầu - Tổng Quản Lý" : "Duyệt Phiếu Yêu Cầu - Quản Lý"}
          </CardTitle>
          <CardDescription>
            {isGeneralManager
              ? "Bạn đang duyệt với quyền Tổng Quản Lý. Bạn có thể điều chỉnh số lượng trước khi duyệt."
              : "Xem xét và có thể điều chỉnh số lượng, đơn vị trước khi duyệt"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Sản phẩm</th>
                  <th className="text-left p-3 font-semibold w-32">SL yêu cầu</th>
                  <th className="text-left p-3 font-semibold w-32">ĐV đề xuất</th>
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
                      <p className="text-muted-foreground">{item.requested_quantity}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-muted-foreground">{item.requested_unit_name}</p>
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
                        value={editedItems[item.id]?.unitId || item.requested_unit_id}
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
              <div key={item.id} className="p-3 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">{item.product_name}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Yêu cầu</p>
                      <p className="font-medium">{item.requested_quantity} {item.requested_unit_name}</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t">
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
                        value={editedItems[item.id]?.unitId || item.requested_unit_id}
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
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-6">
            <Button
              variant="destructive"
              onClick={() => setShowRejectDialog(true)}
              disabled={loading}
              className="flex-1"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Từ chối
            </Button>
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="flex-[2]"
              size="lg"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {loading ? "Đang xử lý..." : (isGeneralManager ? "Duyệt & Chuyển Kho Tổng" : "Duyệt Phiếu")}
            </Button>
          </div>
        </CardContent>
      </Card>


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
