'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type ApplyTimeType = 'ALWAYS' | 'DAY' | 'TIME' | 'DATETIME'

export interface TimeRulesData {
  applyTimeType: ApplyTimeType
  applyDays: string[]
  timeStart: string
  timeEnd: string
}

interface TimeRulesSectionProps {
  data: TimeRulesData
  onChange: (data: TimeRulesData) => void
}

const DAYS_OF_WEEK = [
  { value: 'MONDAY', label: 'Thứ 2' },
  { value: 'TUESDAY', label: 'Thứ 3' },
  { value: 'WEDNESDAY', label: 'Thứ 4' },
  { value: 'THURSDAY', label: 'Thứ 5' },
  { value: 'FRIDAY', label: 'Thứ 6' },
  { value: 'SATURDAY', label: 'Thứ 7' },
  { value: 'SUNDAY', label: 'Chủ nhật' },
]

export function TimeRulesSection({ data, onChange }: TimeRulesSectionProps) {
  // Ensure applyDays is always an array
  const applyDays = Array.isArray(data.applyDays) ? data.applyDays : []

  const handleTimeTypeChange = (value: ApplyTimeType) => {
    onChange({
      ...data,
      applyTimeType: value,
      // Reset dependent fields
      applyDays: value === 'ALWAYS' || value === 'TIME' ? [] : applyDays,
      timeStart: value === 'ALWAYS' || value === 'DAY' ? '' : data.timeStart,
      timeEnd: value === 'ALWAYS' || value === 'DAY' ? '' : data.timeEnd,
    })
  }

  const handleDayToggle = (day: string, checked: boolean) => {
    const newDays = checked
      ? [...applyDays, day]
      : applyDays.filter(d => d !== day)

    onChange({ ...data, applyDays: newDays })
  }

  const handleTimeChange = (field: 'timeStart' | 'timeEnd', value: string) => {
    onChange({ ...data, [field]: value })
  }

  const getPreviewText = () => {
    if (data.applyTimeType === 'ALWAYS') {
      return 'Áp dụng luôn luôn'
    }

    const parts: string[] = []

    if (data.applyTimeType === 'DAY' || data.applyTimeType === 'DATETIME') {
      if (applyDays.length > 0) {
        const dayLabels = applyDays
          .map(day => DAYS_OF_WEEK.find(d => d.value === day)?.label)
          .filter(Boolean)
        parts.push(`vào ${dayLabels.join(', ')} hàng tuần`)
      }
    }

    if (data.applyTimeType === 'TIME' || data.applyTimeType === 'DATETIME') {
      if (data.timeStart && data.timeEnd) {
        parts.push(`từ ${data.timeStart} - ${data.timeEnd}`)
      }
    }

    return parts.length > 0
      ? `Áp dụng ${parts.join(' ')}`
      : 'Chưa có quy tắc thời gian'
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Quy Tắc Thời Gian</Label>
        <Select
          value={data.applyTimeType}
          onValueChange={(value: ApplyTimeType) => handleTimeTypeChange(value)}
        >
          <SelectTrigger className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALWAYS">Luôn luôn</SelectItem>
            <SelectItem value="DAY">Theo ngày trong tuần</SelectItem>
            <SelectItem value="TIME">Theo khung giờ</SelectItem>
            <SelectItem value="DATETIME">Theo ngày + khung giờ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Days of Week Selection */}
      {(data.applyTimeType === 'DAY' || data.applyTimeType === 'DATETIME') && (
        <div className="space-y-3">
          <Label>Chọn Ngày Áp Dụng</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.value}
                onClick={() => handleDayToggle(day.value, !applyDays.includes(day.value))}
                className={`
                  px-4 py-2 rounded border font-medium text-sm transition-colors
                  ${applyDays.includes(day.value)
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white hover:border-blue-300'
                  }
                `}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time Range Selection */}
      {(data.applyTimeType === 'TIME' || data.applyTimeType === 'DATETIME') && (
        <div className="space-y-4">
          <div>
            <Label>Chọn Giờ Bắt Đầu</Label>
            <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
              {Array.from({ length: 24 }, (_, i) => `${i}h`).map((hour) => (
                <button
                  key={hour}
                  onClick={() => handleTimeChange('timeStart', hour)}
                  className={`
                    px-3 py-2 rounded border text-sm font-medium transition-colors
                    ${data.timeStart === hour
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white hover:border-blue-300'
                    }
                  `}
                >
                  {hour}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Chọn Giờ Kết Thúc</Label>
            <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
              {Array.from({ length: 24 }, (_, i) => `${i}h`).map((hour) => (
                <button
                  key={hour}
                  onClick={() => handleTimeChange('timeEnd', hour)}
                  className={`
                    px-3 py-2 rounded border text-sm font-medium transition-colors
                    ${data.timeEnd === hour
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-white hover:border-green-300'
                    }
                  `}
                >
                  {hour}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="p-3 bg-muted rounded-md">
        <p className="text-sm text-muted-foreground">Xem trước:</p>
        <p className="text-sm font-medium mt-1">{getPreviewText()}</p>
      </div>
    </div>
  )
}
