'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useState, useEffect } from 'react'
import { mobileFetch } from "@/lib/mobile/api-client"

export type PromotionType = 'DISCOUNT' | 'BUY_X_GET_Y' | 'GIFT' | 'COMBO'

export interface BasicInfoData {
  name: string
  description: string
  promotionType: PromotionType
  isActive: boolean
  startDate: string
  endDate: string
  warehouseIds: string[]
  priority: number
  applyWithOtherPromotions: boolean
}

interface BasicInfoStepProps {
  data: BasicInfoData
  onChange: (data: BasicInfoData) => void
}

interface Warehouse {
  id: string
  name: string
  location: string
}

export function BasicInfoStep({ data, onChange }: BasicInfoStepProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const fetchWarehouses = async () => {
    setLoading(true)
    try {
      // Chỉ lấy kho cửa hàng (STORE), không lấy kho tổng (MAIN)
      const response = await mobileFetch('/api/warehouses?type=STORE&pageSize=100')
      const result = await response.json()
      setWarehouses(result.data || [])
    } catch (error) {
      console.error('Failed to fetch warehouses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof BasicInfoData, value: any) => {
    onChange({ ...data, [field]: value })
  }

  const handleWarehouseToggle = (warehouseId: string, checked: boolean) => {
    const newWarehouseIds = checked
      ? [...data.warehouseIds, warehouseId]
      : data.warehouseIds.filter(id => id !== warehouseId)

    handleChange('warehouseIds', newWarehouseIds)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">
          Tên Chương Trình <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={data.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="VD: Mua 5 Tặng 1"
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="description">Mô Tả</Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Mô tả chi tiết chương trình khuyến mãi..."
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="promotionType">
          Loại Chương Trình <span className="text-red-500">*</span>
        </Label>
        <Select
          value={data.promotionType}
          onValueChange={(value: PromotionType) => handleChange('promotionType', value)}
        >
          <SelectTrigger className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DISCOUNT">Giảm Giá</SelectItem>
            <SelectItem value="BUY_X_GET_Y">Mua X Tặng Y</SelectItem>
            <SelectItem value="GIFT">Tặng Quà</SelectItem>
            <SelectItem value="COMBO">Combo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">
            Ngày Bắt Đầu <span className="text-red-500">*</span>
          </Label>
          <Input
            id="startDate"
            type="datetime-local"
            value={data.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="endDate">
            Ngày Kết Thúc <span className="text-red-500">*</span>
          </Label>
          <Input
            id="endDate"
            type="datetime-local"
            value={data.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            className="mt-2"
          />
        </div>
      </div>

      <div>
        <Label>Kho Áp Dụng</Label>
        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có kho</p>
          ) : (
            warehouses.map(warehouse => (
              <div key={warehouse.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`warehouse-${warehouse.id}`}
                  checked={data.warehouseIds.includes(warehouse.id)}
                  onCheckedChange={(checked) =>
                    handleWarehouseToggle(warehouse.id, checked as boolean)
                  }
                />
                <label
                  htmlFor={`warehouse-${warehouse.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {warehouse.name} - {warehouse.location}
                </label>
              </div>
            ))
          )}
        </div>
        {data.warehouseIds.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Không chọn kho = áp dụng cho tất cả kho
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="priority">Độ Ưu Tiên</Label>
        <Input
          id="priority"
          type="number"
          min="0"
          value={data.priority}
          onChange={(e) => handleChange('priority', Number(e.target.value))}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Số càng cao = ưu tiên càng cao khi có nhiều chương trình cùng lúc
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isActive"
            checked={data.isActive}
            onCheckedChange={(checked) => handleChange('isActive', checked as boolean)}
          />
          <label
            htmlFor="isActive"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Kích hoạt chương trình ngay
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="applyWithOtherPromotions"
            checked={data.applyWithOtherPromotions}
            onCheckedChange={(checked) =>
              handleChange('applyWithOtherPromotions', checked as boolean)
            }
          />
          <label
            htmlFor="applyWithOtherPromotions"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Cho phép áp dụng cùng các chương trình khác
          </label>
        </div>
      </div>
    </div>
  )
}
