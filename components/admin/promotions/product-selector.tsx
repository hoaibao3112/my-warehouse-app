'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Plus, Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mobileFetch } from "@/lib/mobile/api-client"

export interface SelectedProduct {
  productId: string
  productName: string
  quantity: number
  source?: string // 'PRODUCT' or 'RECIPE'
}

interface ProductSelectorProps {
  label: string
  selectedProducts: SelectedProduct[]
  onChange: (products: SelectedProduct[]) => void
  placeholder?: string
  showQuantity?: boolean // New prop to control quantity input visibility
}

interface Product {
  id: string
  name: string
  sku: string
  source: string // 'STOCK' or 'RECIPE'
}

export function ProductSelector({
  label,
  selectedProducts,
  onChange,
  placeholder = "Tìm kiếm sản phẩm...",
  showQuantity = true // Default to true for backward compatibility
}: ProductSelectorProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [selectedProductName, setSelectedProductName] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const response = await mobileFetch('/api/products/all-for-promotion')
      const data = await response.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products

    const search = searchTerm.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search)
    )
  }, [products, searchTerm])

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setShowDropdown(true)
    if (!value) {
      setSelectedProductId('')
      setSelectedProductName('')
    }
  }

  const handleSelectProduct = (product: Product) => {
    console.log('handleSelectProduct called with:', product)
    // Use sku (code) instead of id (UUID) for product identification
    setSelectedProductId(product.sku)
    setSelectedProductName(product.name)
    setSearchTerm(product.name)
    setShowDropdown(false)
    console.log('selectedProductId set to:', product.sku)
  }

  const handleAddProduct = () => {
    console.log('handleAddProduct called!')
    console.log('selectedProductId:', selectedProductId)
    console.log('quantity:', quantity)

    if (!selectedProductId || quantity <= 0) {
      console.log('Validation failed: selectedProductId or quantity invalid')
      return
    }

    // Find product by sku (which is now stored in selectedProductId)
    const product = products.find(p => p.sku === selectedProductId)
    if (!product) {
      console.log('Product not found!')
      return
    }

    console.log('Adding product:', product)

    // Use sku as productId for identification
    const existingIndex = selectedProducts.findIndex(p => p.productId === product.sku)

    let updatedProducts;
    if (existingIndex >= 0) {
      const updated = [...selectedProducts]
      updated[existingIndex].quantity = quantity
      updated[existingIndex].source = product.source === 'RECIPE' ? 'RECIPE' : 'PRODUCT'
      updatedProducts = updated
    } else {
      updatedProducts = [
        ...selectedProducts,
        {
          productId: product.sku, // Use code/sku instead of UUID
          productName: product.name,
          quantity,
          source: product.source === 'RECIPE' ? 'RECIPE' : 'PRODUCT' // Map STOCK to PRODUCT
        }
      ]
    }

    console.log('ProductSelector onChange called with:', updatedProducts)
    onChange(updatedProducts)

    // Reset
    setSelectedProductId('')
    setSelectedProductName('')
    setSearchTerm('')
    setQuantity(1)
  }

  const handleRemoveProduct = (productId: string) => {
    onChange(selectedProducts.filter(p => p.productId !== productId))
  }

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    const updated = selectedProducts.map(p =>
      p.productId === productId ? { ...p, quantity: newQuantity } : p
    )
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {selectedProducts.length > 0 && (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
            {selectedProducts.length} sản phẩm đã chọn
          </span>
        )}
      </div>

      {/* Add Product Section */}
      <div className="border rounded-md p-4">
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-8" ref={dropdownRef}>
            <Label htmlFor={`product-${label}`} className="text-sm mb-2 block">
              Chọn sản phẩm
            </Label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  id={`product-${label}`}
                  type="text"
                  placeholder={placeholder}
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  className="pl-9 pr-10"
                  autoComplete="off"
                />
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>

              {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[300px] overflow-auto">
                  {loading ? (
                    <div className="p-3 text-sm text-muted-foreground">Đang tải...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      {searchTerm ? 'Không tìm thấy sản phẩm' : 'Không có sản phẩm'}
                    </div>
                  ) : (
                    filteredProducts.map(product => (
                      <div
                        key={product.id}
                        className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm"
                        onClick={() => handleSelectProduct(product)}
                      >
                        {product.name} - {product.sku}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {showQuantity && (
            <div className="col-span-2">
              <Label htmlFor={`quantity-${label}`} className="text-sm mb-2 block">
                Số lượng
              </Label>
              <Input
                id={`quantity-${label}`}
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                placeholder="Nhập SL"
              />
            </div>
          )}

          <div className={showQuantity ? "col-span-2" : "col-span-4"}>
            <Label className="text-sm mb-2 block text-transparent">.</Label>
            <Button
              type="button"
              onClick={handleAddProduct}
              disabled={!selectedProductId || (showQuantity && quantity <= 0)}
              className={`w-full ${!selectedProductId || quantity <= 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed hover:bg-gray-300'
                  : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Thêm
            </Button>
          </div>
        </div>
      </div>

      {/* Selected Products Table */}
      {selectedProducts.length > 0 ? (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Tên Sản Phẩm</th>
                {showQuantity && (
                  <th className="text-center p-3 text-sm font-medium w-32">Số Lượng</th>
                )}
                <th className="text-center p-3 text-sm font-medium w-20">Xóa</th>
              </tr>
            </thead>
            <tbody>
              {selectedProducts.map((product, index) => (
                <tr
                  key={product.productId}
                  className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                >
                  <td className="p-3 text-sm">{product.productName}</td>
                  {showQuantity && (
                    <td className="p-3">
                      <Input
                        type="number"
                        min="1"
                        value={product.quantity}
                        onChange={(e) => handleQuantityChange(product.productId, Number(e.target.value))}
                        className="w-full text-center"
                      />
                    </td>
                  )}
                  <td className="p-3 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveProduct(product.productId)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-md p-6 text-center">
          <div className="text-muted-foreground text-sm">
            <p className="font-medium">Chưa có sản phẩm nào</p>
            <p className="text-xs mt-1">Chọn sản phẩm và nhấn nút "Thêm" màu xanh để thêm vào danh sách</p>
          </div>
        </div>
      )}
    </div>
  )
}
