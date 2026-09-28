'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { TimeRulesSection, TimeRulesData } from './time-rules-section'
import { ProductSelector, SelectedProduct } from './product-selector'
import { PromotionType } from './basic-info-step'
import { mobileFetch } from '@/lib/mobile/api-client'

export type DiscountType = 'PERCENTAGE' | 'FIXED'

export interface ConditionsData {
  discountType: DiscountType
  discountValue: number
  maxDiscountAmount: number
  minAmount: number
  minQuantity: number
  timeRules: TimeRulesData
  buyProducts: SelectedProduct[]
  giftProducts: SelectedProduct[]
  discountProducts: SelectedProduct[]
  // New fields for GIFT promotion (Buy 1 Get 1 Same Product)
  giftCategoryIds: string[]
  minProductPrice: number
}

interface ConditionsStepProps {
  data: ConditionsData
  promotionType: PromotionType
  onChange: (data: ConditionsData) => void
}

interface Category {
  id: string
  name: string
}

export function ConditionsStep({ data, promotionType, onChange }: ConditionsStepProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)

  useEffect(() => {
    if (promotionType === 'GIFT') {
      fetchCategories()
    }
  }, [promotionType])

  const fetchCategories = async () => {
    setLoadingCategories(true)
    try {
      const response = await mobileFetch('/api/categories')
      const result = await response.json()
      if (result.success) {
        setCategories(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    } finally {
      setLoadingCategories(false)
    }
  }

  const handleChange = (field: keyof ConditionsData, value: any) => {
    console.log('ConditionsStep handleChange:', field, value)
    onChange({ ...data, [field]: value })
  }

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    const newCategoryIds = checked
      ? [...(data.giftCategoryIds || []), categoryId]
      : (data.giftCategoryIds || []).filter(id => id !== categoryId)
    handleChange('giftCategoryIds', newCategoryIds)
  }

  const showDiscountSettings =
    promotionType === 'DISCOUNT' ||
    promotionType === 'COMBO'

  const showBuyGetSettings =
    promotionType === 'BUY_X_GET_Y' ||
    promotionType === 'COMBO'

  const showGiftSettings =
    promotionType === 'GIFT' ||
    promotionType === 'COMBO'

  return (
    <div className="space-y-6">
      {/* Discount Settings */}
      {showDiscountSettings && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">Cài Đặt Giảm Giá</h3>

          <div>
            <Label>Loại Giảm Giá</Label>
            <Select
              value={data.discountType}
              onValueChange={(value: DiscountType) => handleChange('discountType', value)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENTAGE">Phần Trăm (%)</SelectItem>
                <SelectItem value="FIXED">Số Tiền Cố Định (VND)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>
                Giá Trị Giảm {data.discountType === 'PERCENTAGE' ? '(%)' : '(VND)'}
                <span className="text-red-500"> *</span>
              </Label>
              <Input
                type="number"
                min="0"
                max={data.discountType === 'PERCENTAGE' ? '100' : undefined}
                step={data.discountType === 'PERCENTAGE' ? '0.01' : '1000'}
                value={data.discountValue}
                onChange={(e) => handleChange('discountValue', Number(e.target.value))}
                className="mt-2"
              />
            </div>

            {data.discountType === 'PERCENTAGE' && (
              <div>
                <Label>Giảm Tối Đa (VND)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={data.maxDiscountAmount}
                  onChange={(e) => handleChange('maxDiscountAmount', Number(e.target.value))}
                  placeholder="Không giới hạn"
                  className="mt-2"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Purchase Conditions */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-lg">Điều Kiện Mua Hàng</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tổng Tiền Tối Thiểu (VND)</Label>
            <Input
              type="number"
              min="0"
              step="1000"
              value={data.minAmount}
              onChange={(e) => handleChange('minAmount', Number(e.target.value))}
              placeholder="0 = không yêu cầu"
              className="mt-2"
            />
          </div>

          <div>
            <Label>Số Lượng Sản Phẩm Tối Thiểu</Label>
            <Input
              type="number"
              min="0"
              value={data.minQuantity}
              onChange={(e) => handleChange('minQuantity', Number(e.target.value))}
              placeholder="0 = không yêu cầu"
              className="mt-2"
            />
          </div>
        </div>
      </div>

      {/* Time-Based Rules */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-lg">Quy Tắc Thời Gian</h3>
        <TimeRulesSection
          data={data.timeRules}
          onChange={(timeRules) => handleChange('timeRules', timeRules)}
        />
      </div>

      {/* Buy X Get Y Rules */}
      {showBuyGetSettings && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">Quy Tắc Mua X Tặng Y</h3>

          <ProductSelector
            label="Sản Phẩm Mua (X)"
            selectedProducts={data.buyProducts}
            onChange={(products) => {
              console.log('[BUY_X_GET_Y] buyProducts onChange:', products)
              handleChange('buyProducts', products)
            }}
            placeholder="Chọn sản phẩm phải mua..."
          />

          <div className="border-t pt-4">
            <ProductSelector
              label="Sản Phẩm Tặng (Y)"
              selectedProducts={data.giftProducts}
              onChange={(products) => {
                console.log('[BUY_X_GET_Y] giftProducts onChange:', products)
                handleChange('giftProducts', products)
              }}
              placeholder="Chọn sản phẩm tặng kèm..."
            />
          </div>
        </div>
      )}

      {/* Gift Rules - Buy 1 Get 1 Same Product */}
      {showGiftSettings && !showBuyGetSettings && (
        <div className="border rounded-lg p-4 space-y-4 bg-gradient-to-r from-pink-50 to-orange-50">
          <h3 className="font-semibold text-lg text-orange-900">🎁 Mua 1 Tặng 1 (Cùng Sản Phẩm)</h3>
          <p className="text-sm text-muted-foreground">
            Khách hàng mua 2 sản phẩm cùng loại sẽ được miễn phí 1 sản phẩm (giảm 50% tổng giá).
          </p>

          {/* Product Selector for eligible products */}
          <ProductSelector
            label="Sản Phẩm Được Áp Dụng Mua 1 Tặng 1"
            selectedProducts={data.buyProducts}
            onChange={(products) => {
              console.log('[GIFT] buyProducts onChange:', products)
              handleChange('buyProducts', products)
            }}
            placeholder="Chọn sản phẩm áp dụng khuyến mãi..."
            showQuantity={false}
          />

          {(!data.buyProducts || data.buyProducts.length === 0) && (
            <p className="text-xs text-orange-600">
              ⚠️ Vui lòng chọn ít nhất 1 sản phẩm để áp dụng khuyến mãi
            </p>
          )}

          {/* Info Box */}
          <div className="bg-orange-100 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-800">
              <strong>Ví dụ:</strong> Nếu chọn &quot;Cà Phê Sữa&quot; và &quot;Trà Sữa&quot;:
            </p>
            <ul className="text-xs text-orange-700 mt-1 list-disc list-inside">
              <li>Khách mua 2 ly Cà Phê Sữa → Được giảm giá 1 ly (trả tiền 1 ly)</li>
              <li>Khách mua 4 ly Trà Sữa → Được giảm giá 2 ly (trả tiền 2 ly)</li>
              <li>Khách mua 2 ly Sinh Tố → Không được giảm (không trong danh sách)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Product-Specific Discounts */}
      {showDiscountSettings && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-lg">Giảm Giá Theo Sản Phẩm</h3>
          <p className="text-sm text-muted-foreground">
            Áp dụng giảm giá chỉ cho các sản phẩm được chọn (ví dụ: giảm giá trên Cafe)
          </p>

          <ProductSelector
            label="Sản Phẩm Được Giảm Giá"
            selectedProducts={data.discountProducts}
            onChange={(products) => handleChange('discountProducts', products)}
            placeholder="Chọn sản phẩm..."
            showQuantity={false}
          />

          <p className="text-xs text-muted-foreground">
            Để trống = áp dụng cho tất cả sản phẩm trong đơn hàng
          </p>
        </div>
      )}

      {/* Validation Messages */}
      {promotionType === 'BUY_X_GET_Y' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <strong>Lưu ý:</strong> Chương trình "Mua X Tặng Y" yêu cầu phải chọn cả sản phẩm mua và sản phẩm tặng.
          </p>
        </div>
      )}
    </div>
  )
}
