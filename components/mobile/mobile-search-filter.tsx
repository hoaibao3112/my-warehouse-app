'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'

export interface FilterOption {
  key: string
  label: string
  options: { value: string; label: string }[]
  type: 'select' | 'multiselect' | 'radio'
}

interface MobileSearchFilterProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterOption[]
  activeFilters?: Record<string, any>
  onFilterChange?: (filters: Record<string, any>) => void
  showFilterCount?: boolean
}

export function MobileSearchFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm...',
  filters = [],
  activeFilters = {},
  onFilterChange,
  showFilterCount = true,
}: MobileSearchFilterProps) {
  const isMobile = useIsMobile()
  const [filterOpen, setFilterOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState(activeFilters)

  const activeFilterCount = Object.keys(activeFilters).filter(
    (key) => activeFilters[key] !== undefined && activeFilters[key] !== ''
  ).length

  const applyFilters = () => {
    onFilterChange?.(localFilters)
    setFilterOpen(false)
  }

  const clearFilters = () => {
    setLocalFilters({})
    onFilterChange?.({})
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          className="pl-10 pr-4"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Filter button (mobile only) */}
      {isMobile && filters.length > 0 && (
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Lọc
              {showFilterCount && activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Bộ lọc</SheetTitle>
              <SheetDescription>
                Tùy chỉnh tiêu chí tìm kiếm của bạn
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6 overflow-y-auto max-h-[60vh] pb-4">
              {filters.map((filter) => (
                <div key={filter.key} className="space-y-2">
                  <label className="text-sm font-medium">{filter.label}</label>
                  {filter.type === 'select' && (
                    <select
                      value={localFilters[filter.key] || ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          [filter.key]: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="">Tất cả</option>
                      {filter.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {filter.type === 'radio' && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={filter.key}
                          checked={!localFilters[filter.key]}
                          onChange={() =>
                            setLocalFilters({
                              ...localFilters,
                              [filter.key]: undefined,
                            })
                          }
                        />
                        <span className="text-sm">Tất cả</span>
                      </label>
                      {filter.options.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={filter.key}
                            checked={localFilters[filter.key] === opt.value}
                            onChange={() =>
                              setLocalFilters({
                                ...localFilters,
                                [filter.key]: opt.value,
                              })
                            }
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" className="flex-1" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                Xóa
              </Button>
              <Button className="flex-1" onClick={applyFilters}>
                Áp dụng
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Active filters badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(activeFilters).map(([key, value]) => {
            if (!value) return null
            const filter = filters.find((f) => f.key === key)
            if (!filter) return null
            const option = filter.options.find((o) => o.value === value)
            if (!option) return null

            return (
              <Badge key={key} variant="secondary" className="gap-1">
                {filter.label}: {option.label}
                <button
                  onClick={() => {
                    const newFilters = { ...activeFilters }
                    delete newFilters[key]
                    onFilterChange?.(newFilters)
                  }}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
