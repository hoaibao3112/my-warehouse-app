'use client'

import { useState, useRef } from 'react'
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
  availableUnits?: any[]
}

interface CreateLossReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId: string
  onSuccess: () => void
}

export default function CreateLossReportDialog({
  open,
  onOpenChange,
  warehouseId,
  onSuccess
}: CreateLossReportDialogProps) {
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<LossItem[]>([])
  const [submitting, setSubmitting] = useState(false)

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
    // Initial update with base unit
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
          quantity: product.stock,
          multiplier: 1
        }]
      } : item
    ))

    // Fetch unit conversions
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
        maxStock: unit.quantity
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

      const qty = Number(item.quantityLost)
      if (!qty || qty <= 0) {
        toast.error(`Số lượng mất phải lớn hơn 0 cho sản phẩm "${item.productName}"`)
        return
      }

      if (qty > item.maxStock) {
        toast.error(`Số lượng mất (${qty}) vượt quá tồn kho (${item.maxStock}) cho sản phẩm "${item.productName}"`)
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetchWithRateLimit('/api/inventory-loss-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
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
        throw new Error(json?.error || 'Failed to create loss report')
      }

      toast.success('Báo cáo mất hàng đã được tạo')

      // Reset form
      setReason('')
      setItems([])
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      toast.error('Lỗi tạo báo cáo', { description: err.message })
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
          <DialogTitle>Tạo Báo Cáo Mất Hàng</DialogTitle>
          <DialogDescription>
            Báo cáo sản phẩm mất, hư hỏng hoặc hết hạn sử dụng
          </DialogDescription>
        </DialogHeader>

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
                disabled={submitting}
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
                  <div key={item.id} className="border rounded-lg p-3 md:p-4 relative bg-card/50">
                    <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:items-start">

                      {/* Mobile Delete Button (Absolute) */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        disabled={submitting}
                        className="absolute top-1 right-1 md:hidden h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 p-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>

                      {/* Product Selector */}
                      <div className="flex-1 w-full pr-8 md:pr-0">
                        <Label className="text-xs md:text-sm">Sản phẩm*</Label>
                        <ProductStockSelector
                          warehouseId={warehouseId}
                          value={item.productId}
                          productName={item.productName}
                          onSelect={(product) => handleProductSelect(item.id, product)}
                          onInputChange={(value) => updateItem(item.id, 'productName', value)}
                          disabled={submitting}
                        />
                        {item.productId && (
                          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-1">
                            <span>Khả dụng: </span>
                            <span className="font-semibold text-green-600">
                              {item.maxStock} {item.unitName}
                            </span>
                            {(() => {
                              const unit = item.availableUnits?.find(u => u.unitId === item.unitId)
                              if (unit && unit.multiplier > 1) {
                                const baseUnit = item.availableUnits?.find(u => u.multiplier === 1)
                                return <span className="text-gray-400 font-normal ml-1">(={unit.multiplier} {baseUnit?.unitName || 'đơn vị gốc'})</span>
                              }
                              return null
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Quantity & Unit Row */}
                      <div className="flex gap-3 w-full md:w-auto mt-2 md:mt-0">
                        {/* Quantity */}
                        <div className="flex-1 md:w-32">
                          <Label htmlFor={`qty-${item.id}`} className="text-xs md:text-sm">Số lượng*</Label>
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
                            className="mt-1"
                          />
                        </div>

                        {/* Unit Selection */}
                        <div className="flex-1 md:w-32">
                          <Label className="text-xs md:text-sm">Đơn vị</Label>
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
                      </div>

                      {/* Desktop Delete Button */}
                      <div className="hidden md:block pt-6">
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
                ))
                }
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
              {submitting ? 'Đang tạo...' : 'Tạo báo cáo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
