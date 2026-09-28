'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BasicInfoStep, BasicInfoData, PromotionType } from './basic-info-step'
import { ConditionsStep, ConditionsData } from './conditions-step'
import { ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { toast } from "sonner"
import { mobileFetch } from '@/lib/mobile/api-client'

/**
 * Convert database time format "10:00:00" to UI format "10h"
 */
function convertTimeForDisplay(timeStr: string | null): string {
  if (!timeStr) return ''

  // Format "10:00:00" -> "10h"
  const match = timeStr.match(/^(\d{1,2}):/)
  if (match) {
    return `${parseInt(match[1], 10)}h`
  }

  // Already in "10h" format
  if (timeStr.match(/^\d{1,2}h$/)) {
    return timeStr
  }

  return ''
}

interface PromotionWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  editData?: any // Promotion data for editing
}

const initialBasicInfo: BasicInfoData = {
  name: '',
  description: '',
  promotionType: 'DISCOUNT',
  isActive: true,
  startDate: '',
  endDate: '',
  warehouseIds: [],
  priority: 0,
  applyWithOtherPromotions: false,
}

const initialConditions: ConditionsData = {
  discountType: 'PERCENTAGE',
  discountValue: 0,
  maxDiscountAmount: 0,
  minAmount: 0,
  minQuantity: 0,
  timeRules: {
    applyTimeType: 'ALWAYS',
    applyDays: [],
    timeStart: '',
    timeEnd: '',
  },
  buyProducts: [],
  giftProducts: [],
  discountProducts: [],
  // New fields for GIFT promotion (Buy 1 Get 1)
  giftCategoryIds: [],
  minProductPrice: 0,
}

export function PromotionWizardDialog({
  open,
  onOpenChange,
  onSuccess,
  editData,
}: PromotionWizardDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [basicInfo, setBasicInfo] = useState<BasicInfoData>(initialBasicInfo)
  const [conditions, setConditions] = useState<ConditionsData>(initialConditions)
  const [saving, setSaving] = useState(false)
  // Load edit data when provided
  useEffect(() => {
    if (editData && open) {
      console.log('Loading edit data:', editData)
      console.log('apply_days raw:', editData.apply_days, 'type:', typeof editData.apply_days)

      // Map basic info
      setBasicInfo({
        name: editData.name || '',
        description: editData.description || '',
        promotionType: editData.promotion_type || 'DISCOUNT',
        isActive: editData.is_active ?? true,
        startDate: editData.start_date ? new Date(editData.start_date).toISOString().slice(0, 16) : '',
        endDate: editData.end_date ? new Date(editData.end_date).toISOString().slice(0, 16) : '',
        warehouseIds: editData.warehouses?.map((w: any) => w.id) || [],
        priority: editData.priority || 0,
        applyWithOtherPromotions: editData.apply_with_other_promotions ?? false,
      })

      // Map conditions
      setConditions({
        discountType: editData.discount_type || 'PERCENTAGE',
        discountValue: Number(editData.discount_value) || 0,
        maxDiscountAmount: Number(editData.max_discount_amount) || 0,
        minAmount: Number(editData.min_amount) || 0,
        minQuantity: Number(editData.min_quantity) || 0,
        timeRules: {
          applyTimeType: editData.apply_time_type || 'ALWAYS',
          applyDays: (() => {
            // Handle different formats of apply_days
            if (!editData.apply_days) return []

            // If it's already an array, return it
            if (Array.isArray(editData.apply_days)) {
              console.log('apply_days is array:', editData.apply_days)
              return editData.apply_days
            }

            // If it's a string, try to parse it as JSON
            if (typeof editData.apply_days === 'string') {
              try {
                const parsed = JSON.parse(editData.apply_days)
                console.log('apply_days parsed from JSON:', parsed)
                return Array.isArray(parsed) ? parsed : []
              } catch (e) {
                console.warn('Failed to parse apply_days JSON:', editData.apply_days, e)
                return []
              }
            }

            return []
          })(),
          timeStart: convertTimeForDisplay(editData.time_start),
          timeEnd: convertTimeForDisplay(editData.time_end),
        },
        buyProducts: editData.buyProducts?.map((p: any) => ({
          productId: p.product_id || p.item_id,
          productName: p.product_name,
          quantity: p.quantity_required || 1,
          source: p.source || 'PRODUCT',
        })) || [],
        giftProducts: editData.gifts?.map((g: any) => ({
          productId: g.product_id || g.item_id,
          productName: g.product_name,
          quantity: g.quantity || 1,
          source: g.source || 'PRODUCT',
        })) || [],
        discountProducts: editData.discountProducts?.map((p: any) => ({
          productId: p.product_id || p.item_id,
          productName: p.product_name,
          quantity: 1,
          source: p.source || 'PRODUCT',
        })) || [],
        // New fields for GIFT promotion
        giftCategoryIds: (() => {
          if (!editData.gift_category_ids) return []
          if (Array.isArray(editData.gift_category_ids)) return editData.gift_category_ids
          if (typeof editData.gift_category_ids === 'string') {
            try {
              const parsed = JSON.parse(editData.gift_category_ids)
              return Array.isArray(parsed) ? parsed : []
            } catch { return [] }
          }
          return []
        })(),
        minProductPrice: Number(editData.min_product_price) || 0,
      })
    } else if (!open) {
      // Reset when dialog closes
      resetForm()
    }
  }, [editData, open])

  // Debug: Log conditions changes
  useEffect(() => {
    console.log('Wizard conditions updated:', conditions)
  }, [conditions])

  const resetForm = () => {
    setStep(1)
    setBasicInfo(initialBasicInfo)
    setConditions(initialConditions)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const validateStep1 = (): boolean => {
    if (!basicInfo.name.trim()) {
      toast.error('Vui lòng nhập tên chương trình')
      return false
    }

    if (!basicInfo.startDate) {
      toast.error('Vui lòng chọn ngày bắt đầu')
      return false
    }

    if (!basicInfo.endDate) {
      toast.error('Vui lòng chọn ngày kết thúc')
      return false
    }

    if (new Date(basicInfo.startDate) >= new Date(basicInfo.endDate)) {
      toast.error('Ngày kết thúc phải sau ngày bắt đầu')
      return false
    }

    return true
  }

  const validateStep2 = (): boolean => {
    // Validate based on promotion type
    if (basicInfo.promotionType === 'DISCOUNT' || basicInfo.promotionType === 'COMBO') {
      if (conditions.discountValue <= 0) {
        toast.error('Vui lòng nhập giá trị giảm giá')
        return false
      }
    }

    if (basicInfo.promotionType === 'BUY_X_GET_Y') {
      if (conditions.buyProducts.length === 0) {
        toast.error('Vui lòng chọn sản phẩm mua (X)')
        return false
      }

      if (conditions.giftProducts.length === 0) {
        toast.error('Vui lòng chọn sản phẩm tặng (Y)')
        return false
      }
    }

    if (basicInfo.promotionType === 'GIFT') {
      // Validate GIFT promotion (Buy 1 Get 1) - require at least one product
      if (!conditions.buyProducts || conditions.buyProducts.length === 0) {
        toast.error('Vui lòng chọn ít nhất 1 sản phẩm để áp dụng khuyến mãi Mua 1 Tặng 1')
        return false
      }
    }

    // Validate time rules - chỉ bắt buộc khi chọn loại thời gian cụ thể
    if (conditions.timeRules.applyTimeType === 'DAY' || conditions.timeRules.applyTimeType === 'DATETIME') {
      if (conditions.timeRules.applyDays.length === 0) {
        toast.error('Vui lòng chọn ít nhất một ngày áp dụng')
        return false
      }
    }

    if (conditions.timeRules.applyTimeType === 'TIME' || conditions.timeRules.applyTimeType === 'DATETIME') {
      if (!conditions.timeRules.timeStart || !conditions.timeRules.timeEnd) {
        toast.error('Vui lòng chọn khung giờ áp dụng')
        return false
      }
    }

    return true
  }

  const handleNext = () => {
    if (!validateStep1()) return
    setStep(2)
  }

  const handleBack = () => {
    setStep(1)
  }

  const handleSave = async () => {
    console.log('=== VALIDATION DEBUG ===')
    console.log('Promotion Type:', basicInfo.promotionType)
    console.log('Discount Value:', conditions.discountValue)
    console.log('Buy Products:', conditions.buyProducts)
    console.log('Gift Products:', conditions.giftProducts)
    console.log('Time Rules:', conditions.timeRules)

    if (!validateStep2()) {
      console.log('Validation failed!')
      return
    }

    setSaving(true)

    try {
      // Prepare API payload
      const payload = {
        name: basicInfo.name,
        description: basicInfo.description,
        promotionType: basicInfo.promotionType,
        isActive: basicInfo.isActive,
        startDate: basicInfo.startDate,
        endDate: basicInfo.endDate,
        priority: basicInfo.priority,
        applyWithOtherPromotions: basicInfo.applyWithOtherPromotions,
        warehouseIds: basicInfo.warehouseIds,

        discountType: conditions.discountType,
        discountValue: conditions.discountValue,
        maxDiscountAmount: conditions.maxDiscountAmount || null,
        minAmount: conditions.minAmount || null,
        minQuantity: conditions.minQuantity || null,

        applyTimeType: conditions.timeRules.applyTimeType,
        applyDays: conditions.timeRules.applyDays,
        timeStart: conditions.timeRules.timeStart || null,
        timeEnd: conditions.timeRules.timeEnd || null,

        buyProducts: conditions.buyProducts.map(p => ({
          productId: p.productId,
          quantity: p.quantity,
          source: p.source, // CRITICAL: Include source for item_type determination
        })),
        giftProducts: conditions.giftProducts.map(p => ({
          productId: p.productId,
          quantity: p.quantity,
          source: p.source, // CRITICAL: Include source for item_type determination
        })),
        discountProducts: conditions.discountProducts.map(p => ({
          productId: p.productId,
          source: p.source, // CRITICAL: Include source for item_type determination
        })),
        // New fields for GIFT promotion (Buy 1 Get 1)
        giftCategoryIds: conditions.giftCategoryIds,
        minProductPrice: conditions.minProductPrice || null,
      }

      console.log('=== FINAL PAYLOAD BEFORE SUBMIT ===')
      console.log('Gift Products with source:', payload.giftProducts)
      console.log('Buy Products with source:', payload.buyProducts)
      console.log('Full Payload:', JSON.stringify(payload, null, 2))

      const isEditing = !!editData
      const url = isEditing ? `/api/promotions/${editData.id}` : '/api/promotions'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await mobileFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed to ${isEditing ? 'update' : 'create'} promotion`)
      }

      toast.success(`Chương trình khuyến mãi đã được ${isEditing ? 'cập nhật' : 'tạo'}`)

      handleClose()
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || `Không thể ${editData ? 'cập nhật' : 'tạo'} chương trình khuyến mãi`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editData ? 'Chỉnh Sửa Chương Trình Khuyến Mãi' : 'Tạo Chương Trình Khuyến Mãi'}
          </DialogTitle>
          <DialogDescription>
            Bước {step} / 2:{' '}
            {step === 1 ? 'Thông tin cơ bản và thời gian áp dụng' : 'Điều kiện và quy tắc'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center space-x-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${step === 1
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/20 text-primary'
                  }`}
              >
                1
              </div>
              <div className="w-20 h-1 bg-muted"></div>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${step === 2
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
                  }`}
              >
                2
              </div>
            </div>
          </div>

          {/* Step Content */}
          {step === 1 ? (
            <BasicInfoStep data={basicInfo} onChange={setBasicInfo} />
          ) : (
            <ConditionsStep
              data={conditions}
              promotionType={basicInfo.promotionType}
              onChange={setConditions}
            />
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <div>
              {step === 2 && (
                <Button type="button" variant="outline" onClick={handleBack}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Quay Lại
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Hủy
              </Button>

              {step === 1 ? (
                <Button type="button" onClick={handleNext}>
                  Tiếp Theo
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Đang lưu...' : 'Lưu Chương Trình'}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
