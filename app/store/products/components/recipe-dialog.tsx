'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Search } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { mobileFetch } from "@/lib/mobile/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

interface RecipeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipe?: any | null
  onClose: () => void
  onSuccess: () => void
}

interface IngredientItem {
  id: string
  ingredient_id: string
  product?: string
  unit_id: string
  quantity_required: string
}

export default function RecipeDialog({
  open,
  onOpenChange,
  recipe,
  onClose,
  onSuccess,
}: RecipeDialogProps) {
  const { user } = useAuth()
  const [ingredients, setIngredients] = useState<IngredientItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'name' | 'ingredients'>('name')
  const [recipeName, setRecipeName] = useState('')
  const [price, setPrice] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [categories, setCategories] = useState<any[]>([])
  const [unitsMap, setUnitsMap] = useState<{ [key: string]: any[] }>({})
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageUploading, setImageUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const isAdminKhoTong = user && (user.role === 'AdminKhoTong' || user.role === 'ADMIN')

  // Search states
  const [showProductSearch, setShowProductSearch] = useState<string | null>(null)
  const [productResultsMap, setProductResultsMap] = useState<Record<string, any[]>>({})
  const [highlightedIndexMap, setHighlightedIndexMap] = useState<Record<string, number>>({})
  const searchTimers = useRef<Record<string, number | null>>({})
  const productInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const clickOutsideTimer = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      if (recipe) {
        // For edit: show ingredients step directly
        setStep('ingredients')
        setRecipeName(recipe.name)
        setPrice(recipe.price?.toString() || '')
        setCategoryId(recipe.category_id || '')
        setWarehouseId(recipe.warehouse_id || '')
        setImageUrl(recipe.image_url || '')
        setIngredients(recipe.recipe_ingredients.map((ing: any) => ({
          id: ing.id,
          ingredient_id: ing.ingredient_id,
          product: ing.products?.name || '',
          unit_id: ing.unit_id,
          quantity_required: ing.quantity_required.toString(),
        })))
        // Load units for all existing ingredients in ONE batch request
        loadUnitsForEditBatch(recipe.recipe_ingredients)
      } else {
        // For create: start with name step
        setStep('name')
        setRecipeName('')
        setPrice('')
        setCategoryId('')
        setWarehouseId('')
        setImageUrl('')
        setIngredients([])
        setUnitsMap({})
      }
      setError('')
      // Fetch categories
      fetchCategories()
      // Fetch warehouses for AdminKhoTong
      if (isAdminKhoTong) {
        fetchWarehouses()
      }
    }
  }, [open, recipe, isAdminKhoTong])

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setLoadingCategories(true)
      const response = await mobileFetch('/api/categories', {
        credentials: 'include', // Include cookies in the request
      })
      if (response.ok) {
        const data = await response.json()
        setCategories(data.data || [])
      }
    } catch (err) {
      console.error('Error fetching categories:', err)
    } finally {
      setLoadingCategories(false)
    }
  }

  // Fetch warehouses (for AdminKhoTong only)
  const fetchWarehouses = async () => {
    try {
      setLoadingWarehouses(true)
      const response = await mobileFetch('/api/warehouses', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setWarehouses(data.data || [])
      }
    } catch (err) {
      console.error('Error fetching warehouses:', err)
    } finally {
      setLoadingWarehouses(false)
    }
  }

  // Close search when clicking outside
  useEffect(() => {
    if (!showProductSearch) return

    const handleClickOutside = (e: MouseEvent) => {
      const input = productInputRefs.current[showProductSearch]
      if (input && !input.contains(e.target as Node)) {
        setShowProductSearch(null)
      }
    }

    // Clear any existing timer
    if (clickOutsideTimer.current) {
      clearTimeout(clickOutsideTimer.current)
    }

    // Store timer ID
    clickOutsideTimer.current = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      clickOutsideTimer.current = null
    }, 0) as unknown as number

    return () => {
      if (clickOutsideTimer.current) {
        clearTimeout(clickOutsideTimer.current)
        clickOutsideTimer.current = null
      }
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showProductSearch])

  // Fetch products for a specific item (debounced)
  const fetchProductsFor = async (itemId: string, q: string) => {
    if (!q || q.trim().length === 0) {
      setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
      return
    }
    try {
      const res = await mobileFetch(`/api/products?search=${encodeURIComponent(q)}&page=1&pageSize=25`, {
        credentials: 'include', // Include cookies in the request
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
      setProductResultsMap((s) => ({ ...s, [itemId]: json.data || [] }))
      setHighlightedIndexMap((s) => ({ ...s, [itemId]: 0 }))
      setShowProductSearch(itemId)
    } catch (err) {
      console.warn('Product search failed', err)
      setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
    }
  }

  const handleProductInputChange = (itemId: string, value: string) => {
    // Update ingredient with search text
    const idx = ingredients.findIndex(i => i.id === itemId)
    if (idx >= 0) {
      const updated = [...ingredients]
      updated[idx].product = value
      setIngredients(updated)
    }

    // Debounce search
    if (searchTimers.current[itemId] !== null) {
      clearTimeout(searchTimers.current[itemId] || undefined)
    }
    searchTimers.current[itemId] = window.setTimeout(() => {
      fetchProductsFor(itemId, value)
    }, 300)
  }

  const handleProductInputKeyDown = (itemId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    const results = productResultsMap[itemId] || []
    const highlightedIndex = highlightedIndexMap[itemId] || 0

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = Math.min(highlightedIndex + 1, results.length - 1)
      setHighlightedIndexMap((s) => ({ ...s, [itemId]: nextIndex }))
      setShowProductSearch(itemId)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const nextIndex = Math.max(highlightedIndex - 1, 0)
      setHighlightedIndexMap((s) => ({ ...s, [itemId]: nextIndex }))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[highlightedIndex]) {
        handleSelectProduct(itemId, results[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowProductSearch(null)
    }
  }

  // Batch load units for multiple ingredients at once (for edit mode)
  const loadUnitsForEditBatch = async (ingredients: any[]) => {
    const productIds = ingredients
      .filter((ing: any) => ing.ingredient_id)
      .map((ing: any) => ing.ingredient_id)

    if (productIds.length === 0) return

    try {
      const res = await mobileFetch('/api/products/batch-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productIds })
      })
      const json = await res.json()

      if (res.ok && json?.success) {
        const batchData = json.data || {}
        const newUnitsMap: Record<string, any[]> = {}

        ingredients.forEach((ing: any) => {
          if (ing.ingredient_id && batchData[ing.ingredient_id]) {
            const { units: unitsList } = batchData[ing.ingredient_id]
            // Filter to only convertible units (exclude isolated units)
            const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)
            // Cache convertible units, fallback to all units if none convertible
            newUnitsMap[ing.id] = convertibleUnits.length > 0 ? convertibleUnits : unitsList
          }
        })

        setUnitsMap((m) => ({ ...m, ...newUnitsMap }))
      }
    } catch (err) {
      console.error('Failed to fetch batch units for edit', err)
    }
  }

  const loadUnitsForEdit = async (productId: string, ingredientId: string) => {
    try {
      const res = await mobileFetch(`/api/products/${productId}/units`, {
        credentials: 'include', // Include cookies in the request
      })
      const json = await res.json()
      if (res.ok && json?.success) {
        let unitsList: any[] = []
        if (Array.isArray(json.data)) {
          unitsList = json.data
        } else if (json.data && Array.isArray(json.data.units)) {
          unitsList = json.data.units
        }
        // Filter to only convertible units (exclude isolated units)
        const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)
        // Cache convertible units, fallback to all units if none convertible
        setUnitsMap((m) => ({ ...m, [ingredientId]: convertibleUnits.length > 0 ? convertibleUnits : unitsList }))
      }
    } catch (err) {
      console.error('Failed to fetch units for edit', ingredientId, err)
    }
  }

  const handleSelectProduct = (itemId: string, product: any) => {
    // Update product selection
    const idx = ingredients.findIndex(i => i.id === itemId)
    if (idx >= 0) {
      const updated = [...ingredients]
      updated[idx].ingredient_id = product.id
      updated[idx].product = product.name
      setIngredients(updated)
    }

    // Close search
    setShowProductSearch(null)
    setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
    setHighlightedIndexMap((s) => ({ ...s, [itemId]: 0 }))

      // Fetch units for this product and set default unit (using transfer page logic)
      ; (async () => {
        try {
          const res = await mobileFetch(`/api/products/${product.id}/units`, {
            credentials: 'include', // Include cookies in the request
          })
          const json = await res.json()
          if (res.ok && json?.success) {
            // API may return either an array (legacy) or { units, defaultUnitId }
            let unitsList: any[] = []
            let defaultUnitId: string | undefined = undefined
            if (Array.isArray(json.data)) {
              unitsList = json.data
            } else if (json.data && Array.isArray(json.data.units)) {
              unitsList = json.data.units
              defaultUnitId = json.data.defaultUnitId
            }

            // Filter to only units that have conversion paths (multiplier !== null)
            // This excludes units that are isolated (no conversion relations to the base unit)
            const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)

            console.log('[RecipeDialog] Product:', product.name, 'Total units:', unitsList.length, 'Convertible units:', convertibleUnits.length)
            console.log('[RecipeDialog] Units detail:', unitsList.map((u: any) => ({ code: u.code, multiplier: u.multiplier, isDefault: u.isDefault })))

            // Prefer explicit isDefault flag on units when present.
            // Next prefer product's own unit (if provided on the product object), then API defaultUnitId, then first unit.
            const productUnitId = (product as any).unit_id || (product as any).unitId
            const productUnitName = (product as any).unit_name || (product as any).unitName || (product as any).unit

            let preferred: string | undefined = undefined
            // 1) unit marked isDefault in convertible units list
            const def = convertibleUnits.find((u: any) => u.isDefault)
            if (def) preferred = def.id
            // 2) explicit product.unit_id matches a convertible unit id
            if (!preferred && productUnitId) {
              const matchById = convertibleUnits.find((u: any) => u.id === productUnitId)
              if (matchById) preferred = matchById.id
            }
            // 3) match by product unit name/code
            if (!preferred && productUnitName) {
              const nameLower = String(productUnitName).toLowerCase()
              const matchByName = convertibleUnits.find((u: any) => (u.name && String(u.name).toLowerCase() === nameLower) || (u.code && String(u.code).toLowerCase() === nameLower))
              if (matchByName) preferred = matchByName.id
            }
            // 4) fallback to API defaultUnitId
            if (!preferred && defaultUnitId) preferred = defaultUnitId
            // 5) final fallback to first convertible unit
            if (!preferred) preferred = convertibleUnits[0]?.id
            // 6) if no convertible units, use first unit from all units
            if (!preferred) preferred = unitsList[0]?.id

            // Store only convertible units in the map
            setUnitsMap((m) => ({ ...m, [itemId]: convertibleUnits.length > 0 ? convertibleUnits : unitsList }))

            if (preferred) {
              setIngredients((prevIngredients) =>
                prevIngredients.map(item =>
                  item.id === itemId ? { ...item, unit_id: preferred } : item
                )
              )
            }
          }
        } catch (err) {
          console.error('Failed to fetch units for item', itemId, err)
        }
      })()
  }

  function handleNextStep() {
    setError('')

    // Validate name step
    if (!recipeName.trim()) {
      setError('Vui lòng nhập tên công thức')
      return
    }

    // AdminKhoTong must select a warehouse
    if (isAdminKhoTong && !warehouseId) {
      setError('Vui lòng chọn kho để tạo công thức')
      return
    }

    setStep('ingredients')
  }

  function handleBackStep() {
    setStep('name')
  }

  // Image upload handler
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setError('Chỉ hỗ trợ file ảnh: JPEG, PNG, WebP, GIF')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File ảnh không được vượt quá 5MB')
      return
    }

    setImageUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await mobileFetch('/api/recipe-images', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      setImageUrl(data.data.url)
    } catch (err: any) {
      console.error('Image upload error:', err)
      setError(err.message || 'Không thể upload ảnh')
    } finally {
      setImageUploading(false)
    }
  }

  function handleAddIngredient() {
    setIngredients([
      ...ingredients,
      {
        id: Math.random().toString(),
        ingredient_id: '',
        product: '',
        unit_id: '',
        quantity_required: '',
      },
    ])
  }

  function handleRemoveIngredient(index: number) {
    const ing = ingredients[index]
    setIngredients(ingredients.filter((_, i) => i !== index))
    // Clean up units map
    if (ing.id) {
      setUnitsMap((m) => {
        const newMap = { ...m }
        delete newMap[ing.id]
        return newMap
      })
    }
  }

  function handleIngredientChange(index: number, field: string, value: any) {
    const updated = [...ingredients]
    updated[index][field] = value
    setIngredients(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate
      if (!recipeName.trim()) {
        setError('Vui lòng nhập tên công thức')
        setLoading(false)
        return
      }

      // AdminKhoTong must select a warehouse
      if (isAdminKhoTong && !warehouseId) {
        setError('Vui lòng chọn kho để tạo công thức')
        setLoading(false)
        return
      }

      // Note: ingredients are optional - recipe can be created without ingredients

      // Validate ingredients only if any are added
      for (const ing of ingredients) {
        if (!ing.ingredient_id || !ing.unit_id || !ing.quantity_required) {
          setError('Vui lòng điền đầy đủ thông tin nguyên liệu')
          setLoading(false)
          return
        }
      }

      const url = recipe ? `/api/product-recipes/${recipe.id}` : '/api/product-recipes'
      const method = recipe ? 'PATCH' : 'POST'

      // For create mode, API will auto-create product if not provided
      // Use first ingredient's unit as output unit for new recipes
      let output_unit_id = recipe?.output_unit_id
      if (!recipe && ingredients.length > 0) {
        // For new recipes, use first ingredient's unit as default output unit
        output_unit_id = ingredients[0].unit_id
      }

      const payload: any = {
        name: recipeName,
        output_quantity: recipe?.output_quantity || 1,
        ...(output_unit_id && { output_unit_id }),
        price: price || null,
        category_id: categoryId || null,
        image_url: imageUrl || null,
        ...(ingredients.length > 0 && {
          ingredients: ingredients.map(ing => ({
            ingredient_id: ing.ingredient_id,
            unit_id: ing.unit_id,
            quantity_required: parseFloat(ing.quantity_required),
          })),
        }),
      }

      // Include warehouse_id for AdminKhoTong
      if (isAdminKhoTong && warehouseId) {
        payload.warehouse_id = warehouseId
      }

      // Only include product_id for edit mode
      if (recipe) {
        payload.product_id = recipe.product_id
      }

      const response = await mobileFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies in the request
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save recipe')
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Error:', err)
      setError(err.message || 'Failed to save recipe')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
          <DialogTitle>
            {recipe ? 'Chỉnh sửa công thức' : 'Tạo công thức mới'}
          </DialogTitle>
          <DialogDescription>
            {step === 'name' && !recipe && 'Bước 1: Nhập tên công thức'}
            {step === 'ingredients' && !recipe && 'Bước 2: Thêm nguyên liệu'}
            {recipe && 'Chỉnh sửa công thức chế biến'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-6 py-4 space-y-6 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* STEP 1: Name & Price */}
            {step === 'name' && !recipe && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Thông Tin Công Thức</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Tên công thức*</Label>
                    <Input
                      id="name"
                      value={recipeName}
                      onChange={e => setRecipeName(e.target.value)}
                      placeholder="VD: Cà phê đen, Nước cam ép, ..."
                      autoFocus
                    />
                  </div>
                  {isAdminKhoTong && (
                    <div className="space-y-2">
                      <Label htmlFor="create-warehouse">Kho*</Label>
                      <select
                        id="create-warehouse"
                        value={warehouseId}
                        onChange={e => setWarehouseId(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                        disabled={loadingWarehouses}
                      >
                        <option value="">-- Chọn kho --</option>
                        {warehouses.map(wh => (
                          <option key={wh.id} value={wh.id}>{wh.code} - {wh.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="create-price">Giá tiền (tùy chọn)</Label>
                    <Input
                      id="create-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      placeholder="VD: 50000, 100000, ..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-category">Nhóm hàng (tùy chọn)</Label>
                    <select
                      id="create-category"
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                      disabled={loadingCategories}
                    >
                      <option value="">-- Chọn nhóm hàng --</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Image Upload Section */}
                  <div className="space-y-2">
                    <Label>Ảnh sản phẩm (tùy chọn)</Label>
                    <div className="flex items-start gap-4">
                      {/* Image Preview */}
                      <div className="relative w-24 h-24 border-2 border-dashed border-border rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                        {imageUrl ? (
                          <>
                            <img
                              src={imageUrl}
                              alt="Recipe preview"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setImageUrl('')}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>

                      {/* Upload Button */}
                      <div className="flex-1">
                        <input
                          type="file"
                          ref={imageInputRef}
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={imageUploading}
                          className="w-full"
                        >
                          {imageUploading ? (
                            <>Đang tải...</>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              {imageUrl ? 'Thay đổi ảnh' : 'Chọn ảnh'}
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">
                          JPEG, PNG, WebP, GIF. Tối đa 5MB
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Name & Price section for edit mode */}
            {recipe && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Thông Tin Công Thức</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Tên công thức*</Label>
                    <Input
                      id="edit-name"
                      value={recipeName}
                      onChange={e => setRecipeName(e.target.value)}
                      placeholder="VD: Cà phê đen, Nước cam ép, ..."
                    />
                  </div>
                  {isAdminKhoTong && (
                    <div className="space-y-2">
                      <Label htmlFor="edit-warehouse">Kho*</Label>
                      <select
                        id="edit-warehouse"
                        value={warehouseId}
                        onChange={e => setWarehouseId(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                        disabled={loadingWarehouses}
                      >
                        <option value="">-- Chọn kho --</option>
                        {warehouses.map(wh => (
                          <option key={wh.id} value={wh.id}>{wh.code} - {wh.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="price">Giá tiền (tùy chọn)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      placeholder="VD: 50000, 100000, ..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Nhóm hàng (tùy chọn)</Label>
                    <select
                      id="edit-category"
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                      disabled={loadingCategories}
                    >
                      <option value="">-- Chọn nhóm hàng --</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Image Upload Section for Edit Mode */}
                  <div className="space-y-2">
                    <Label>Ảnh sản phẩm (tùy chọn)</Label>
                    <div className="flex items-start gap-4">
                      <div className="relative w-24 h-24 border-2 border-dashed border-border rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                        {imageUrl ? (
                          <>
                            <img
                              src={imageUrl}
                              alt="Recipe preview"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setImageUrl('')}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          ref={imageInputRef}
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={imageUploading}
                          className="w-full"
                        >
                          {imageUploading ? (
                            <>Đang tải...</>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              {imageUrl ? 'Thay đổi ảnh' : 'Chọn ảnh'}
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">
                          JPEG, PNG, WebP, GIF. Tối đa 5MB
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STEP 2: Ingredients (show only if name is set or editing) */}
            {(step === 'ingredients' || recipe) && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Nguyên liệu*</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddIngredient}
                      className="gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ingredients.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      Chưa có nguyên liệu. Hãy thêm nguyên liệu cho công thức này.
                    </p>
                  ) : (
                    ingredients.map((ing, idx) => (
                      <div key={ing.id} className="relative">
                        <div className="flex gap-3 items-end">
                          {/* Product Search Input */}
                          <div className="flex-1">
                            <Label className="text-xs font-medium">Nguyên liệu*</Label>
                            <div className="relative mt-1">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                              <Input
                                ref={el => { productInputRefs.current[ing.id] = el }}
                                type="text"
                                value={ing.product}
                                onChange={e => handleProductInputChange(ing.id, e.target.value)}
                                onKeyDown={e => handleProductInputKeyDown(ing.id, e)}
                                onFocus={() => {
                                  if (productResultsMap[ing.id]?.length) {
                                    setShowProductSearch(ing.id)
                                  }
                                }}
                                placeholder="Tìm kiếm nguyên liệu..."
                                className="h-9 pl-9"
                                autoComplete="off"
                              />

                              {/* Search Results Dropdown - Inline */}
                              {showProductSearch === ing.id && productResultsMap[ing.id]?.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 border border-input rounded-lg shadow-lg bg-white z-50 max-h-64 overflow-y-auto">
                                  {productResultsMap[ing.id].map((p, pidx) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onMouseDown={e => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleSelectProduct(ing.id, p)
                                      }}
                                      onMouseEnter={() => {
                                        setHighlightedIndexMap((s) => ({ ...s, [ing.id]: pidx }))
                                      }}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer border-b border-border last:border-b-0 ${pidx === highlightedIndexMap[ing.id] ? 'bg-muted' : ''
                                        }`}
                                    >
                                      <div className="font-medium">{p.name}</div>
                                      <div className="text-xs text-gray-500">{p.code}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quantity Input */}
                          <div className="w-32">
                            <Label className="text-xs font-medium">Số lượng*</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={ing.quantity_required}
                              onChange={e =>
                                handleIngredientChange(idx, 'quantity_required', e.target.value)
                              }
                              placeholder="0"
                              className="h-9 mt-1"
                            />
                          </div>

                          {/* Unit Display (Read-only) */}
                          <div className="w-40">
                            <Label className="text-xs font-medium">Đơn vị</Label>
                            {ing.unit_id ? (
                              <div className="px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm h-9 flex items-center font-medium mt-1">
                                {(() => {
                                  const unitsList = unitsMap[ing.id] || []
                                  if (unitsList.length === 0) {
                                    return '(tải dữ liệu...)'
                                  }
                                  const selectedUnit = unitsList.find((u: any) => u.id === ing.unit_id)
                                  return selectedUnit ? `${selectedUnit.code || selectedUnit.name}` : '-'
                                })()}
                              </div>
                            ) : (
                              <div className="px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground text-sm h-9 flex items-center italic mt-1">
                                Chọn nguyên liệu
                              </div>
                            )}
                          </div>

                          {/* Delete Button */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="h-9"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose()
                onOpenChange(false)
              }}
            >
              Hủy
            </Button>

            {/* Show Next button only in name step (create mode) */}
            {step === 'name' && !recipe && (
              <Button type="button" onClick={handleNextStep}>
                Tiếp theo
              </Button>
            )}

            {/* Show Back button only in ingredients step (create mode) */}
            {step === 'ingredients' && !recipe && (
              <>
                <Button type="button" variant="outline" onClick={handleBackStep}>
                  Quay lại
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Đang lưu...' : 'Tạo'}
                </Button>
              </>
            )}

            {/* Show save button in edit mode */}
            {recipe && (
              <Button type="submit" disabled={loading}>
                {loading ? 'Đang lưu...' : 'Cập nhật'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
