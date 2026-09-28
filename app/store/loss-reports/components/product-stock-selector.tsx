'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { mobileFetch } from "@/lib/mobile/api-client"

interface Product {
  id: string
  code: string
  name: string
  stock: number
  unit: string
  unitId: string
  unitPrice?: number
}

interface ProductStockSelectorProps {
  warehouseId: string
  value: string
  productName: string
  onSelect: (product: Product) => void
  onInputChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function ProductStockSelector({
  warehouseId,
  value,
  productName,
  onSelect,
  onInputChange,
  placeholder = "Tìm kiếm sản phẩm...",
  disabled = false
}: ProductStockSelectorProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchTimerRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch products with stock > 0
  const fetchProducts = async (query: string) => {
    if (!query || query.trim().length === 0) {
      setProducts([])
      return
    }

    setLoading(true)
    try {
      const res = await mobileFetch(`/api/warehouse-stock?warehouseId=${encodeURIComponent(warehouseId)}&search=${encodeURIComponent(query)}&page=1&pageSize=50`
      )
      const json = await res.json()

      if (res.ok && json?.success && Array.isArray(json.data)) {
        // Map warehouse stock to product format
        const inStockProducts = json.data.map((item: any) => ({
          id: item.product_id,
          code: item.product_code || '',
          name: item.product_name || '',
          stock: Number(item.quantity) || 0,
          unit: item.unit_code || item.unit_name || '',
          unitId: item.unit_id || '',
          unitPrice: item.unit_price ? Number(item.unit_price) : undefined
        }))

        setProducts(inStockProducts)
        setHighlightedIndex(0)
        setShowResults(inStockProducts.length > 0)
      } else {
        setProducts([])
      }
    } catch (err) {
      console.error('Failed to fetch products:', err)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  // Debounced search
  const handleInputChange = (inputValue: string) => {
    onInputChange(inputValue)

    if (searchTimerRef.current !== null) {
      clearTimeout(searchTimerRef.current)
    }

    searchTimerRef.current = window.setTimeout(() => {
      fetchProducts(inputValue)
    }, 300)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || products.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, products.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (products[highlightedIndex]) {
        handleSelect(products[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowResults(false)
    }
  }

  const handleSelect = (product: Product) => {
    onSelect(product)
    setShowResults(false)
    setProducts([])
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }

    if (showResults) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showResults])

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          type="text"
          value={productName}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (products.length > 0) {
              setShowResults(true)
            }
          }}
          placeholder={placeholder}
          className="pl-9 text-base md:text-sm"
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {/* Results Dropdown */}
      {showResults && products.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 border border-input rounded-lg shadow-lg bg-popover text-popover-foreground z-[9999] max-h-60 overflow-y-auto w-full min-w-[300px] md:min-w-0">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Đang tải...</div>
          )}
          {!loading && products.map((product, index) => (
            <button
              key={product.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleSelect(product)
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full text-left px-4 py-3 md:py-2 hover:bg-muted cursor-pointer border-b border-border last:border-b-0 ${index === highlightedIndex ? 'bg-muted' : ''
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm md:text-base">{product.name}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">{product.code}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showResults && !loading && products.length === 0 && productName.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 border border-input rounded-lg shadow-lg bg-white z-50 px-3 py-2 text-sm text-muted-foreground">
          Không tìm thấy sản phẩm có tồn kho
        </div>
      )}
    </div>
  )
}
