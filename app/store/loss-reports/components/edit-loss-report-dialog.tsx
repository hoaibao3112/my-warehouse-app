'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchWithRateLimit } from '@/lib/api-rate-limit'
import ProductStockSelector from './product-stock-selector'
import { mobileFetch } from "@/lib/mobile/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface LossItem {
  id: string
  productId: string
  productName: string
  productCode: string
  unitId: string
  unitName: string
  quantityLost: string
  maxStock: number
  unitPrice?: number
  availableUnits?: any[] // Added availableUnits
}

interface EditLossReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportId: string
  warehouseId: string
  onSuccess: () => void
}

export default function EditLossReportDialog({
  open,
  onOpenChange,
  reportId,
  warehouseId,
  onSuccess
}: EditLossReportDialogProps) {
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<LossItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  // Load existing report data
  useEffect(() => {
    if (open && reportId) {
      loadReportData()
    }
  }, [open, reportId])

  const loadReportData = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRateLimit(`/api/inventory-loss-reports/${reportId}`)
      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to load report')
      }

      const report = json.data
      setReason(report.reason || '')

      // Load items and fetch current stock for validation
      if (report.items && Array.isArray(report.items)) {
        const itemsWithStock = await Promise.all(
          report.items.map(async (item: any) => {
            // Fetch current stock
            let currentStock = 0
            let availableUnits = []

            try {
              // Get stock
              /* Skipped explicit stock fetch here as we will use display-units API which returns conversions */
            } catch (err) { }

            // Fetch unit conversions
            try {
              const stockRes = await mobileFetch(`/api/warehouse-stock?warehouseId=${encodeURIComponent(warehouseId)}&productId=${item.product_id}`)
              const stockJson = await stockRes.json()
              let baseQty = 0
              if (stockRes.ok && stockJson?.success && stockJson.data && stockJson.data.length > 0) {
                baseQty = Number(stockJson.data[0].quantity || 0)
              }

              // To correctly calculate maxStock for editing, we need to add back the lost quantity
              // to the current base stock before fetching display units.
              // This allows the user to reduce the lost quantity (effectively "recovering" stock)
              // or increase it up to the original available stock + current stock.

              // First, get the multiplier for the unit the item was originally lost in.
              // This requires fetching all units for the product first.
              const allUnitsRes = await fetchWithRateLimit(`/api/products/${item.product_id}/units`)
              const allUnitsJson = await allUnitsRes.json()
              let lostQuantityInBaseUnit = 0;
              if (allUnitsRes.ok && allUnitsJson.success) {
                const originalLostUnit = allUnitsJson.data.find((u: any) => u.id === item.unit_id);
                if (originalLostUnit) {
                  lostQuantityInBaseUnit = Number(item.quantity_lost || 0) * originalLostUnit.multiplier;
                }
              }

              const baseQtyWithLost = baseQty + lostQuantityInBaseUnit;

              const unitsRes = await fetchWithRateLimit(`/api/products/${item.product_id}/display-units?baseQuantity=${baseQtyWithLost}`)
              const unitsJson = await unitsRes.json()
              if (unitsRes.ok && unitsJson.success) {
                availableUnits = unitsJson.data
              }

              // Find current unit in availableUnits to set maxStock
              const currentUnit = availableUnits.find((u: any) => u.unitId === item.unit_id)
              currentStock = currentUnit ? currentUnit.quantity : 0
            } catch (err) {
              console.error('Failed to load units', err)
            }

            return {
              id: item.id || `existing-${Math.random()}`, // Ensure ID
              productId: item.product_id,
              productName: item.product_name || '',
              productCode: item.product_code || '',
              unitId: item.unit_id,
              unitName: item.unit_name || item.unit_code || '',
              quantityLost: String(item.quantity_lost || ''),
              maxStock: currentStock, // maxStock is now the quantity in the selected unit, including the "recovered" lost amount
              unitPrice: item.unit_price,
              availableUnits
            }
          })
        )

        setItems(itemsWithStock)
      }
    } catch (err: any) {
      toast.error('Lỗi tải dữ liệu báo cáo', { description: err.message })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const addItem = () => {
    setItems([
      ...items,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: '',
        productName: '',
        productCode: '',
        unitId: '',
        unitName: '',
        quantityLost: '',
        maxStock: 0,
        availableUnits: [],
      }
    ])
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const updateItem = (id: string, field: keyof LossItem, value: any) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const handleProductSelect = async (itemId: string, product: any) => {
    // Basic update
    setItems(items.map(item =>
      item.id === itemId ? {
        ...item,
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        unitId: product.unitId,
        unitName: product.unit,
        maxStock: product.stock,
        unitPrice: product.unitPrice,
        availableUnits: [{
          unitId: product.unitId,
          unitName: product.unit,
          quantity: product.stock, // This is current available stock
          multiplier: 1
        }]
      } : item
    ))

    // Fetch units
    try {
      const res = await fetchWithRateLimit(`/api/products/${product.id}/display-units?baseQuantity=${product.stock}`)
      const json = await res.json()
      if (res.ok && json.success) {
        setItems(prev => prev.map(item =>
          item.id === itemId ? { ...item, availableUnits: json.data } : item
        ))
      }
    } catch (err) {
      console.error('Failed to fetch units', err)
    }
  }

  const handleUnitChange = (itemId: string, unitId: string) => {
    setItems(prevItems => prevItems.map(item => {
      if (item.id !== itemId) return item
      const unit = item.availableUnits?.find((u: any) => u.unitId === unitId)
      if (!unit) return item
      return {
        ...item,
        unitId: unit.unitId,
        unitName: unit.unitName,
        maxStock: unit.quantity, // Update maxStock based on the new unit's quantity
        quantityLost: '', // Reset quantity when unit changes to avoid invalid values
      }
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!reason || reason.trim() === '') {
      toast.error('Vui lòng nhập lý do (bắt buộc)')
      return
    }

    if (items.length === 0) {
      toast.error('Vui lòng thêm ít nhất một sản phẩm')
      return
    }

    for (const item of items) {
      if (!item.productId) {
        toast.error('Vui lòng chọn sản phẩm cho tất cả các mục')
        return
      }
      if (!item.unitId) {
        toast.error(`Vui lòng chọn đơn vị cho sản phẩm "${item.productName}"`)
        return
      }

      const qty = Number(item.quantityLost)
      if (!qty || qty <= 0) {
        toast.error(`Số lượng mất phải lớn hơn 0 cho sản phẩm "${item.productName}"`)
        return
      }

      if (qty > item.maxStock) {
        toast.error(`Số lượng mất (${qty}) vượt quá tồn kho khả dụng (${item.maxStock}) cho sản phẩm "${item.productName}"`)
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetchWithRateLimit(`/api/inventory-loss-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason || undefined,
          items: items.map(item => ({
            productId: item.productId,
            unitId: item.unitId,
            quantityLost: Number(item.quantityLost),
            unitPrice: item.unitPrice
          }))
        })
      })

      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to update loss report')
      }

      toast.success('Báo cáo mất hàng đã được cập nhật')

      // Reset form
      setReason('')
      setItems([])
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      toast.error('Lỗi cập nhật báo cáo', { description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setReason('')
      setItems([])
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh Sửa Báo Cáo Mất Hàng</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin báo cáo mất hàng
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Đang tải...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Lý do</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Hàng hết hạn sử dụng, hàng hỏng do vận chuyển, mất cắp..."
                rows={3}
              />
            </div>

            {/* Items List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Danh sách sản phẩm mất*</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  disabled={submitting || loading}
                  className="gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Thêm sản phẩm
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        {/* Product Selector */}
                        <div className="flex-1">
                          <Label className="text-xs">Sản phẩm*</Label>
                          <ProductStockSelector
                            warehouseId={warehouseId}
                            value={item.productId}
                            productName={item.productName}
                            onSelect={(product) => handleProductSelect(item.id, product)}
                            onInputChange={(value) => updateItem(item.id, 'productName', value)}
                            disabled={submitting}
                          />
                          {item.productId && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Khả dụng: <span className="font-semibold text-green-600">
                                {item.maxStock} {item.unitName}
                                {(() => {
                                  const unit = item.availableUnits?.find(u => u.unitId === item.unitId)
                                  if (unit && unit.multiplier > 1) {
                                    const baseUnit = item.availableUnits?.find(u => u.multiplier === 1)
                                    return <span className="text-gray-400 font-normal ml-1">(={unit.multiplier} {baseUnit?.unitName || 'đơn vị gốc'})</span>
                                  }
                                  return null
                                })()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="w-32">
                          <Label htmlFor={`qty-${item.id}`} className="text-xs">Số lượng*</Label>
                          <Input
                            id={`qty-${item.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            max={item.maxStock}
                            value={item.quantityLost}
                            onChange={(e) => updateItem(item.id, 'quantityLost', e.target.value)}
                            placeholder="0"
                            disabled={!item.productId || submitting}
                          />
                        </div>

                        {/* Unit Selection */}
                        <div className="w-32">
                          <Label className="text-xs">Đơn vị</Label>
                          <Select
                            disabled={!item.productId || submitting}
                            value={item.unitId}
                            onValueChange={(value) => handleUnitChange(item.id, value)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Đơn vị" />
                            </SelectTrigger>
                            <SelectContent>
                              {item.availableUnits?.map((u: any) => (
                                <SelectItem key={u.unitId} value={u.unitId}>
                                  {u.unitName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Delete Button */}
                        <div className="pt-5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(item.id)}
                            disabled={submitting}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitting || items.length === 0}>
                {submitting ? 'Đang cập nhật...' : 'Cập nhật báo cáo'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
