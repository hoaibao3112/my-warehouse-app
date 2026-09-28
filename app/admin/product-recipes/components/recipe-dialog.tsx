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
import { Plus, Trash2, Search, Check, Upload, X, ImageIcon } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useCurrencyInput } from '@/hooks/use-currency-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { mobileFetch } from "@/lib/mobile/api-client"
import { ConversionPreview } from "@/components/recipes/conversion-preview"

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
  const [recipeCode, setRecipeCode] = useState('')
  const [recipeName, setRecipeName] = useState('')
  const [price, setPrice] = useState<string>('')
  const [priceDisplay, setPriceDisplay] = useState('')
  const { formatDisplay, handleInputChange, getNumericValue } = useCurrencyInput()
  const [categoryId, setCategoryId] = useState<string>('')
  const [categories, setCategories] = useState<any[]>([])
  const [unitsMap, setUnitsMap] = useState<{ [key: string]: any[] }>({})
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [warehouseIds, setWarehouseIds] = useState<string[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [selectAllWarehouses, setSelectAllWarehouses] = useState(false)
  const [units, setUnits] = useState<any[]>([])
  const [unitId, setUnitId] = useState<string>('')

  // Image upload states
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
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
        setRecipeCode(recipe.code || '')
        setRecipeName(recipe.name)
        const priceValue = recipe.price?.toString() || ''
        setPrice(priceValue)
        setPriceDisplay(priceValue ? formatDisplay(priceValue) : '')
        setCategoryId(recipe.category_id || '')
        // For edit, set single warehouse_id to array if exists
        setWarehouseIds(recipe.warehouse_id ? [recipe.warehouse_id] : [])
        setSelectAllWarehouses(!recipe.warehouse_id) // If no warehouse = system-wide
        setIngredients(recipe.recipe_ingredients.map((ing: any) => ({
          id: ing.id,
          ingredient_id: ing.ingredient_id,
          product: ing.products?.name || '',
          unit_id: ing.unit_id,
          quantity_required: ing.quantity_required.toString(),
        })))
        setUnitId(recipe.output_unit_id || '')
        // Load units for all existing ingredients in ONE batch request
        loadUnitsForEditBatch(recipe.recipe_ingredients)
        // Load image URL if exists
        setImageUrl(recipe.image_url || '')
        setImagePreview(recipe.image_url || '')
        setImageFile(null)
      } else {
        // For create: start with name step
        setStep('name')
        setRecipeCode('')
        setRecipeName('')
        setPrice('')
        setPriceDisplay('')
        setCategoryId('')
        setUnitId('')
        setWarehouseIds([])
        setSelectAllWarehouses(true) // Default to system-wide
        setIngredients([])
        setUnitsMap({})
        setImageUrl('')
        setImagePreview('')
        setImageFile(null)
      }
      setError('')
      // Fetch categories and units
      fetchCategories()
      fetchUnits()
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
      const response = await mobileFetch(`/api/categories?t=${new Date().getTime()}`, {
        credentials: 'include', // Include cookies in the request
        cache: 'no-store'
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

  // Fetch product units
  const fetchUnits = async () => {
    try {
      const response = await mobileFetch('/api/product-units', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setUnits(data.data || [])
      }
    } catch (err) {
      console.error('Error fetching units:', err)
    }
  }

  // Fetch warehouses (for AdminKhoTong only) - only STORE type warehouses (allowed to sell)
  const fetchWarehouses = async () => {
    try {
      setLoadingWarehouses(true)
      const response = await mobileFetch('/api/warehouses?type=STORE', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        // Filter only STORE type warehouses (allowed to sell)
        const storeWarehouses = (data.data || []).filter((wh: any) => wh.type === 'STORE')
        setWarehouses(storeWarehouses)
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

    // Note: warehouse is optional - if not selected, recipe will be global
    setStep('ingredients')
  }

  function handleBackStep() {
    setStep('name')
  }

  // Handle image selection (preview only, upload on save)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setError('Chỉ chấp nhận ảnh JPEG, PNG, WebP, GIF')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Kích thước ảnh tối đa 5MB')
      return
    }

    setError('')

    // Create preview from file
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
      setImageFile(file)
    }
    reader.readAsDataURL(file)
  }

  // Upload image to server
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      console.log('🔄 Sending upload request...')
      const response = await mobileFetch('/api/recipe-images', {
        method: 'POST',
        body: formData,
      })

      console.log('📡 Upload response status:', response.status)

      if (!response.ok) {
        const data = await response.json()
        console.error('❌ Upload response error:', data)
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      console.log('✅ Upload response data:', data)

      if (!data.success || !data.data?.url) {
        throw new Error('Invalid response from server')
      }

      return data.data.url
    } catch (err: any) {
      console.error('❌ Image upload error:', err)
      throw err
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
      ; (updated[index] as any)[field] = value
    setIngredients(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate required fields
      if (!recipeCode.trim()) {
        setError('Vui lòng nhập mã công thức')
        setLoading(false)
        return
      }

      if (!recipeName.trim()) {
        setError('Vui lòng nhập tên công thức')
        setLoading(false)
        return
      }

      if (!price || parseFloat(price) <= 0) {
        setError('Vui lòng nhập giá tiền hợp lệ')
        setLoading(false)
        return
      }

      if (!categoryId) {
        setError('Vui lòng chọn nhóm hàng')
        setLoading(false)
        return
      }

      // Note: warehouse is optional - if not selected, recipe will be global
      // Note: ingredients are optional - recipe can be created without ingredients

      // Validate ingredients only if any are added
      for (const ing of ingredients) {
        if (!ing.ingredient_id || !ing.unit_id || !ing.quantity_required) {
          setError('Vui lòng điền đầy đủ thông tin nguyên liệu')
          setLoading(false)
          return
        }
      }

      // Upload image if a new file is selected
      let finalImageUrl: string | null = imageUrl
      if (imageFile) {
        try {
          setImageUploading(true)
          console.log('📤 Uploading image:', imageFile.name, imageFile.size, 'bytes')
          finalImageUrl = await uploadImage(imageFile)
          console.log('✅ Image uploaded successfully:', finalImageUrl)
        } catch (err: any) {
          console.error('❌ Image upload failed:', err)
          setError(err.message || 'Không thể tải ảnh lên')
          setLoading(false)
          setImageUploading(false)
          return
        } finally {
          setImageUploading(false)
        }
      } else if (imageUrl) {
        console.log('ℹ️ Using existing image URL:', imageUrl)
      } else {
        console.log('ℹ️ No image selected')
      }

      const url = recipe ? `/api/product-recipes/${recipe.id}` : '/api/product-recipes'
      const method = recipe ? 'PATCH' : 'POST'

      // For create mode, use first ingredient's unit as output unit if available
      // If no ingredients, API will auto-assign a default unit
      let output_unit_id = recipe?.output_unit_id
      if (!recipe && ingredients.length > 0) {
        // For new recipes with ingredients, use first ingredient's unit as default output unit
        output_unit_id = ingredients[0].unit_id
      }

      const payload: any = {
        code: recipeCode.trim(),
        name: recipeName,
        output_quantity: recipe?.output_quantity || 1,
        output_unit_id: unitId || (output_unit_id || null),
        price: price || null,
        category_id: categoryId || null,
        image_url: finalImageUrl || null,
        // Always send ingredients, even if empty array (for delete scenario)
        ingredients: ingredients.map(ing => ({
          ingredient_id: ing.ingredient_id,
          unit_id: ing.unit_id,
          quantity_required: parseFloat(ing.quantity_required),
        })),
      }

      // Include warehouse_ids for AdminKhoTong
      if (isAdminKhoTong) {
        if (selectAllWarehouses) {
          // System-wide: no warehouse_id
          payload.warehouse_id = null
          payload.warehouse_ids = null
        } else if (warehouseIds.length > 0) {
          if (recipe) {
            // For edit: only take first warehouse
            payload.warehouse_id = warehouseIds[0]
          } else {
            // For create: send array of warehouse_ids
            payload.warehouse_ids = warehouseIds
          }
        }
      }

      // Only include product_id for edit mode
      if (recipe) {
        payload.product_id = recipe.product_id
      }

      console.log('💾 Saving recipe with payload:', {
        ...payload,
        ingredients: payload.ingredients ? `${payload.ingredients.length} items` : 'none'
      })

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies in the request
        body: JSON.stringify(payload),
      })

      console.log('📡 Save response status:', response.status)

      if (!response.ok) {
        const data = await response.json()
        console.error('❌ Save failed:', data)
        throw new Error(data.error || 'Failed to save recipe')
      }

      const result = await response.json()
      console.log('✅ Recipe saved successfully:', result)

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('❌ Error saving recipe:', err)
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="code">Mã món*</Label>
                      <Input
                        id="code"
                        value={recipeCode}
                        onChange={e => setRecipeCode(e.target.value.toUpperCase())}
                        placeholder="VD: CF001, NC001, ..."
                        maxLength={50}
                        required
                      />
                    </div>
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
                  </div>
                  {isAdminKhoTong && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Kho bán</Label>
                        {!selectAllWarehouses && warehouses.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Đã chọn: {warehouseIds.length}/{warehouses.length} kho
                          </span>
                        )}
                      </div>

                      <div className="border border-input rounded-lg overflow-hidden">
                        {/* Header with system-wide option */}
                        <div className="flex items-center justify-between p-3 bg-muted/50 border-b border-border">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="create-system-wide"
                              checked={selectAllWarehouses}
                              onCheckedChange={(checked) => {
                                setSelectAllWarehouses(!!checked)
                                if (checked) {
                                  setWarehouseIds([])
                                }
                              }}
                            />
                            <label htmlFor="create-system-wide" className="text-sm font-medium cursor-pointer">
                              🌐 Toàn hệ thống
                            </label>
                          </div>
                          {!selectAllWarehouses && warehouses.length > 0 && (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setWarehouseIds(warehouses.map(w => w.id))}
                              >
                                Chọn tất cả
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setWarehouseIds([])}
                              >
                                Bỏ chọn
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Warehouses grid */}
                        <div className={`p-3 max-h-52 overflow-y-auto ${selectAllWarehouses ? 'opacity-50 pointer-events-none' : ''}`}>
                          {loadingWarehouses ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Đang tải danh sách kho...</p>
                          ) : warehouses.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Không có kho bán nào</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {warehouses.map(wh => {
                                const isChecked = warehouseIds.includes(wh.id)
                                return (
                                  <label
                                    key={wh.id}
                                    htmlFor={`create-wh-${wh.id}`}
                                    className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer transition-colors
                                    ${isChecked
                                        ? 'border-primary bg-primary/5'
                                        : 'border-transparent hover:bg-muted/50'
                                      }`}
                                  >
                                    <Checkbox
                                      id={`create-wh-${wh.id}`}
                                      checked={isChecked}
                                      disabled={selectAllWarehouses}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setWarehouseIds(prev => [...prev, wh.id])
                                        } else {
                                          setWarehouseIds(prev => prev.filter(id => id !== wh.id))
                                        }
                                      }}
                                    />
                                    <span className="text-sm flex-1 truncate">
                                      <span className="font-medium">{wh.code}</span>
                                      <span className="text-muted-foreground ml-1">- {wh.name}</span>
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selected badges */}
                      {warehouseIds.length > 0 && !selectAllWarehouses && (
                        <div className="flex flex-wrap gap-1.5">
                          {warehouseIds.map(id => {
                            const wh = warehouses.find(w => w.id === id)
                            return wh ? (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setWarehouseIds(prev => prev.filter(wid => wid !== id))
                                }}
                              >
                                {wh.code} ✕
                              </Badge>
                            ) : null
                          })}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        💡 Chọn "Toàn hệ thống" để công thức áp dụng cho tất cả kho, hoặc chọn từng kho cụ thể.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="create-price">Giá tiền*</Label>
                    <Input
                      id="create-price"
                      type="text"
                      inputMode="numeric"
                      value={priceDisplay}
                      onChange={e => {
                        const { display, numeric } = handleInputChange(e.target.value)
                        setPriceDisplay(display)
                        setPrice(numeric.toString())
                      }}
                      placeholder="VD: 50.000, 100.000, ..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-category">Nhóm hàng*</Label>
                    <div className="flex gap-2">
                      <select
                        id="create-category"
                        value={categoryId}
                        onChange={e => setCategoryId(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                        disabled={loadingCategories}
                        required
                      >
                        <option value="">-- Chọn nhóm hàng --</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-unit">Đơn vị tính</Label>
                    <select
                      id="create-unit"
                      value={unitId}
                      onChange={e => setUnitId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                    >
                      <option value="">-- Mặc định (Tự động) --</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Image Upload Section */}
                  <div className="space-y-2">
                    <Label>Ảnh sản phẩm (tùy chọn)</Label>
                    <div className="flex items-start gap-4">
                      {/* Image Preview */}
                      <div className="relative w-24 h-24 shrink-0 border-2 border-dashed border-border rounded-lg overflow-hidden bg-muted">
                        {imagePreview ? (
                          <div className="relative w-full h-full group">
                            <img
                              src={imagePreview}
                              alt="Recipe preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error('Failed to load image:', imagePreview)
                                e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setImagePreview('')
                                setImageFile(null)
                                setImageUrl('')
                                if (imageInputRef.current) {
                                  imageInputRef.current.value = ''
                                }
                              }}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md opacity-0 group-hover:opacity-100"
                              title="Xóa ảnh"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Upload Button */}
                      <div className="flex-1 space-y-2">
                        <input
                          type="file"
                          ref={imageInputRef}
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="create-recipe-image"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={imageUploading}
                          className="w-full"
                        >
                          {imageUploading ? (
                            <span className="flex items-center gap-2">
                              <span className="animate-spin">⏳</span>
                              Đang tải...
                            </span>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              {imagePreview ? 'Thay đổi ảnh' : 'Chọn ảnh'}
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          JPEG, PNG, WebP, GIF. Tối đa 5MB
                        </p>
                        {imageFile && (
                          <p className="text-xs text-blue-600">
                            💾 Ảnh sẽ được tải lên khi lưu công thức
                          </p>
                        )}
                        {imageUrl && !imageFile && (
                          <p className="text-xs text-green-600">
                            ✓ Ảnh đã được lưu
                          </p>
                        )}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-code">Mã món*</Label>
                      <Input
                        id="edit-code"
                        value={recipeCode}
                        onChange={e => setRecipeCode(e.target.value.toUpperCase())}
                        placeholder="VD: CF001, NC001, ..."
                        maxLength={50}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Tên công thức*</Label>
                      <Input
                        id="edit-name"
                        value={recipeName}
                        onChange={e => setRecipeName(e.target.value)}
                        placeholder="VD: Cà phê đen, Nước cam ép, ..."
                      />
                    </div>
                  </div>
                  {isAdminKhoTong && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Kho bán</Label>
                        {!selectAllWarehouses && warehouses.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Đã chọn: {warehouseIds.length}/{warehouses.length} kho
                          </span>
                        )}
                      </div>

                      <div className="border border-input rounded-lg overflow-hidden">
                        {/* Header with system-wide option */}
                        <div className="flex items-center justify-between p-3 bg-muted/50 border-b border-border">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="edit-system-wide"
                              checked={selectAllWarehouses}
                              onCheckedChange={(checked) => {
                                setSelectAllWarehouses(!!checked)
                                if (checked) {
                                  setWarehouseIds([])
                                }
                              }}
                            />
                            <label htmlFor="edit-system-wide" className="text-sm font-medium cursor-pointer">
                              🌐 Toàn hệ thống
                            </label>
                          </div>
                          {!selectAllWarehouses && warehouses.length > 0 && (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setWarehouseIds(warehouses.map(w => w.id))}
                              >
                                Chọn tất cả
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setWarehouseIds([])}
                              >
                                Bỏ chọn
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Warehouses grid - allow multiple selection */}
                        <div className={`p-3 max-h-52 overflow-y-auto ${selectAllWarehouses ? 'opacity-50 pointer-events-none' : ''}`}>
                          {loadingWarehouses ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Đang tải danh sách kho...</p>
                          ) : warehouses.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Không có kho bán nào</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {warehouses.map(wh => {
                                const isChecked = warehouseIds.includes(wh.id)
                                return (
                                  <label
                                    key={wh.id}
                                    htmlFor={`edit-wh-${wh.id}`}
                                    className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer transition-colors
                                    ${isChecked
                                        ? 'border-primary bg-primary/5'
                                        : 'border-transparent hover:bg-muted/50'
                                      }`}
                                  >
                                    <Checkbox
                                      id={`edit-wh-${wh.id}`}
                                      checked={isChecked}
                                      disabled={selectAllWarehouses}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          // Allow multiple selection in edit mode too
                                          setWarehouseIds(prev => [...prev, wh.id])
                                        } else {
                                          setWarehouseIds(prev => prev.filter(id => id !== wh.id))
                                        }
                                      }}
                                    />
                                    <span className="text-sm flex-1 truncate">
                                      <span className="font-medium">{wh.code}</span>
                                      <span className="text-muted-foreground ml-1">- {wh.name}</span>
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selected badges */}
                      {warehouseIds.length > 0 && !selectAllWarehouses && (
                        <div className="flex flex-wrap gap-1.5">
                          {warehouseIds.map(id => {
                            const wh = warehouses.find(w => w.id === id)
                            return wh ? (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setWarehouseIds(prev => prev.filter(wid => wid !== id))
                                }}
                              >
                                {wh.code} ✕
                              </Badge>
                            ) : null
                          })}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        💡 Chọn "Toàn hệ thống" để công thức áp dụng cho tất cả kho, hoặc chọn từng kho cụ thể.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="price">Giá tiền*</Label>
                    <Input
                      id="price"
                      type="text"
                      inputMode="numeric"
                      value={priceDisplay}
                      onChange={e => {
                        const { display, numeric } = handleInputChange(e.target.value)
                        setPriceDisplay(display)
                        setPrice(numeric.toString())
                      }}
                      placeholder="VD: 50.000, 100.000, ..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Nhóm hàng*</Label>
                    <div className="flex gap-2">
                      <select
                        id="edit-category"
                        value={categoryId}
                        onChange={e => setCategoryId(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                        disabled={loadingCategories}
                        required
                      >
                        <option value="">-- Chọn nhóm hàng --</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-unit">Đơn vị tính</Label>
                    <select
                      id="edit-unit"
                      value={unitId}
                      onChange={e => setUnitId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
                    >
                      <option value="">-- Mặc định (Tự động) --</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Image Upload Section for Edit Mode */}
                  <div className="space-y-2">
                    <Label>Ảnh sản phẩm (tùy chọn)</Label>
                    <div className="flex items-start gap-4">
                      <div className="relative w-24 h-24 shrink-0 border-2 border-dashed border-border rounded-lg overflow-hidden bg-muted">
                        {imagePreview ? (
                          <div className="relative w-full h-full group">
                            <img
                              src={imagePreview}
                              alt="Recipe preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error('Failed to load image:', imagePreview)
                                e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setImagePreview('')
                                setImageFile(null)
                                setImageUrl('')
                                if (imageInputRef.current) {
                                  imageInputRef.current.value = ''
                                }
                              }}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md opacity-0 group-hover:opacity-100"
                              title="Xóa ảnh"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          type="file"
                          ref={imageInputRef}
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="edit-recipe-image"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={imageUploading}
                          className="w-full"
                        >
                          {imageUploading ? (
                            <span className="flex items-center gap-2">
                              <span className="animate-spin">⏳</span>
                              Đang tải...
                            </span>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              {imagePreview ? 'Thay đổi ảnh' : 'Chọn ảnh'}
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          JPEG, PNG, WebP, GIF. Tối đa 5MB
                        </p>
                        {imageFile && (
                          <p className="text-xs text-blue-600">
                            💾 Ảnh sẽ được tải lên khi lưu công thức
                          </p>
                        )}
                        {imageUrl && !imageFile && (
                          <p className="text-xs text-green-600">
                            ✓ Ảnh đã được lưu
                          </p>
                        )}
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

                          {/* Unit Selection Dropdown */}
                          <div className="w-40">
                            <Label className="text-xs font-medium">Đơn vị*</Label>
                            {ing.ingredient_id ? (
                              <select
                                value={ing.unit_id || ''}
                                onChange={e => handleIngredientChange(idx, 'unit_id', e.target.value)}
                                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm mt-1"
                                disabled={!ing.ingredient_id}
                              >
                                {!ing.unit_id && <option value="">-- Chọn đơn vị --</option>}
                                {(unitsMap[ing.id] || []).map((u: any) => (
                                  <option key={u.id} value={u.id}>
                                    {u.code || u.name}
                                  </option>
                                ))}
                              </select>
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

                        {/* Conversion Preview */}
                        {ing.ingredient_id && ing.unit_id && ing.quantity_required && parseFloat(ing.quantity_required) > 0 && (
                          <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                            <ConversionPreview
                              productId={ing.ingredient_id}
                              fromUnitId={ing.unit_id}
                              quantity={parseFloat(ing.quantity_required)}
                            />
                          </div>
                        )}
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
