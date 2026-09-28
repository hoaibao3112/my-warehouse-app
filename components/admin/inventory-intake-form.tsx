"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { createPortal } from 'react-dom'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Plus, Search } from "lucide-react"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"

import { toast } from "sonner"

interface IntakeItem {
  id: string
  product: string
  productId: string
  quantity: string
  unitId?: string
  smallestUnitId?: string
}

interface InventoryIntakeFormProps {
  onClose: () => void
  onSaved?: () => void
  // optional for editing existing intake
  intakeId?: string | null
  initialItems?: IntakeItem[]
  initialWarehouse?: string | null
}

export function InventoryIntakeForm({ onClose, onSaved, intakeId, initialItems, initialWarehouse }: InventoryIntakeFormProps) {
  // Warehouse removed: intake ALWAYS goes to MAIN warehouse (backend auto-selects)
  const [items, setItems] = useState<IntakeItem[]>(initialItems && initialItems.length ? initialItems : [{ id: "1", product: "", productId: "", quantity: "" }])
  // support editing existing intake
  const isEditing = Boolean(intakeId)
  // notes removed per requirements
  const [showProductSearch, setShowProductSearch] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // per-item product results map to avoid global mixing between multiple item rows
  const [productResultsMap, setProductResultsMap] = useState<Record<string, any[]>>({})
  const [highlightedIndexMap, setHighlightedIndexMap] = useState<Record<string, number>>({})
  const searchTimers = useRef<Record<string, number | null>>({})
  const autofocusTimers = useRef<Record<string, number | null>>({})
  const productContainerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const productInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [unitsMap, setUnitsMap] = useState<Record<string, any[]>>({})
  const [dropdownPos, setDropdownPos] = useState<Record<string, { top: number; left: number; width: number }>>({})


  // helper: fetch products for a specific itemId and query (debounced callers should use searchTimers)
  const fetchProductsFor = async (itemId: string, q: string) => {
    if (!q || q.trim().length === 0) {
      setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
      return
    }
    try {
      const res = await fetchWithRateLimit(`/api/products?search=${encodeURIComponent(q)}&page=1&pageSize=25`)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
      setProductResultsMap((s) => ({ ...s, [itemId]: json.data || [] }))
      setHighlightedIndexMap((s) => ({ ...s, [itemId]: 0 }))
    } catch (err) {
      console.warn('Product search failed', err)
      setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
    }
  }

  // Reset form state when props change (switching between create/edit modes)
  useEffect(() => {
    console.log('Form props changed - resetting. intakeId:', intakeId, 'initialItems:', initialItems)
    // Reset items
    if (initialItems && initialItems.length) {
      setItems(initialItems)
    } else {
      setItems([{ id: "1", product: "", productId: "", quantity: "" }])
    }
    // Reset all search/UI state
    setShowProductSearch(null)
    setProductResultsMap({})
    setHighlightedIndexMap({})
    setUnitsMap({})
    setDropdownPos({})
  }, [intakeId, initialItems])

  // close product search when clicking outside the active product container
  useEffect(() => {
    const onDocPointer = (e: PointerEvent) => {
      if (!showProductSearch) return
      const currentEl = productContainerRefs.current[showProductSearch]
      const dropdownEl = dropdownRefs.current[showProductSearch]
      const target = e.target as Node
      // If click is inside the input container or inside the portal dropdown, don't close.
      if (currentEl && currentEl.contains(target)) return
      if (dropdownEl && dropdownEl.contains(target)) return
      setShowProductSearch(null)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [showProductSearch])

  // compute dropdown position for portal so it sits over other content (avoids clipping in scroll areas)
  useEffect(() => {
    if (!showProductSearch) return
    const updatePos = () => {
      const input = productInputRefs.current[showProductSearch]
      if (!input) return
      const rect = input.getBoundingClientRect()
      // use viewport coordinates and position:fixed for the portal dropdown to avoid stacking context issues
      setDropdownPos((s) => ({ ...s, [showProductSearch]: { top: rect.bottom, left: rect.left, width: rect.width } }))
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showProductSearch, productResultsMap])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      // Clear all search timers
      Object.values(searchTimers.current).forEach(timerId => {
        if (timerId) clearTimeout(timerId)
      })
      // Clear all autofocus timers
      Object.values(autofocusTimers.current).forEach(timerId => {
        if (timerId) clearTimeout(timerId)
      })
    }
  }, [])

  // When editing, fetch units for ALL items in ONE batch request
  // Only re-run when productIds change, not when units/quantities change
  useEffect(() => {
    const fetchUnitsForInitialItems = async () => {
      console.log('Fetching units for items:', items, 'isEditing:', isEditing)

      // Collect all productIds that need units
      const productIdsToFetch = items
        .filter((item) => item.productId && !unitsMap[item.id])
        .map((item) => item.productId)

      if (productIdsToFetch.length === 0) return

      try {
        // Use batch API to fetch units for all products at once
        const res = await fetchWithRateLimit('/api/products/batch-units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: productIdsToFetch })
        })
        const json = await res.json()
        console.log('Batch units API response:', json)

        if (res.ok && json?.success) {
          const batchData = json.data || {}
          const newUnitsMap: Record<string, any[]> = {}

          // Map the batch response to our items
          items.forEach((item) => {
            if (item.productId && batchData[item.productId]) {
              const { units, defaultUnitId } = batchData[item.productId]
              newUnitsMap[item.id] = units || []
              console.log('Setting units for item', item.id, 'units:', units)
            }
          })

          setUnitsMap((m) => ({ ...m, ...newUnitsMap }))
        }
      } catch (err) {
        console.error('Failed to fetch batch units:', err)
      }
    }

    // Run when editing and items have productId
    if (isEditing && items.some((it) => it.productId)) {
      fetchUnitsForInitialItems()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, items.map(i => i.productId).join(',')])

  // Warehouse selection removed: backend auto-selects MAIN warehouse
  // When parent provides initialItems, they are already initialized above.

  // per-item filtered products are read from productResultsMap when rendering each row

  const handleAddItem = () => {
    const newId = String(Math.max(...items.map((i) => Number(i.id)), 0) + 1)
    setItems([...items, { id: newId, product: "", productId: "", quantity: "" }])
  }

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id))
    }
  }

  const handleItemChange = (id: string, field: keyof IntakeItem, value: string) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  // Debounced quantity change handler is REMOVED to fix typing lag
  // Quantity validation happens only on blur or submit now
  // const debouncedQuantityChange = ... (removed)

  const handleSelectProduct = (itemId: string, product: { id: string; name: string }) => {
    // Update items state with selected product directly to ensure input reflects immediately
    setItems(prevItems => prevItems.map(item =>
      item.id === itemId
        ? { ...item, product: product.name, productId: product.id }
        : item
    ))
    // Clear the search input field to avoid persistence of search keyword
    const input = productInputRefs.current[itemId]
    if (input) {
      input.value = product.name
    }
    setShowProductSearch(null)
    setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
    setHighlightedIndexMap((s) => ({ ...s, [itemId]: 0 }))
      // fetch units for this product and default unit selection
      ; (async () => {
        try {
          const res = await fetchWithRateLimit(`/api/products/${product.id}/units`)
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

            console.log('[InventoryIntakeForm] Product:', product.name, 'Total units:', unitsList.length, 'Convertible units:', convertibleUnits.length)
            console.log('[InventoryIntakeForm] Units detail:', unitsList.map((u: any) => ({ code: u.code, multiplier: u.multiplier, isDefault: u.isDefault })))

            // Find smallest unit (highest multiplier, since multiplier = how much base unit = 1 smaller unit)
            let smallestUnit = convertibleUnits[0] || unitsList[0]
            for (const unit of convertibleUnits) {
              if (unit.multiplier > smallestUnit.multiplier) {
                smallestUnit = unit
              }
            }

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
              setItems(prevItems => prevItems.map(item =>
                item.id === itemId ? { ...item, unitId: preferred, smallestUnitId: smallestUnit?.id } : item
              ))

              // autofocus quantity after selecting product/unit
              // Clear any existing autofocus timer for this item
              if (autofocusTimers.current[itemId]) {
                clearTimeout(autofocusTimers.current[itemId]!)
              }
              // Store new timer ID
              autofocusTimers.current[itemId] = window.setTimeout(() => {
                const el = quantityInputRefs.current[itemId]
                if (el && typeof el.focus === 'function') el.focus()
                autofocusTimers.current[itemId] = null
              }, 60) as unknown as number
            }
          }
        } catch (err) {
          // ignore units fetch error
        }
      })()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    // warehouseId removed: backend auto-selects MAIN warehouse
    const submitData = {
      items: items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitId: item.unitId || null,
      })),
    }
    try {
      const method = isEditing && intakeId ? 'PUT' : 'POST'
      const url = isEditing && intakeId ? `/api/inventory-intake/${intakeId}` : '/api/inventory-intake'
      const res = await fetchWithRateLimit(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      })

      // Parse JSON response
      const json = await res.json()

      // Check for errors
      if (!res.ok || !json?.success) {
        // Expected errors (lock, permission, etc) - just show toast, no console pollution
        throw new Error(json?.error || `HTTP ${res.status}: ${res.statusText}`)
      }

      // success
      if (typeof onSaved === 'function') onSaved()
      onClose()
    } catch (err: any) {
      // Show user-friendly error toast - no need to pollute console
      const errorMessage = err?.message || String(err)
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const isFormValid = items.every((item) => item.productId && item.quantity)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">{isEditing ? 'Chỉnh Sửa Nhập Hàng' : 'Tạo Nhập Hàng Mới'}</h2>
        <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Kho hàng UI removed: only the master warehouse is allowed; warehouse is auto-selected on load */}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm sm:text-base">Danh Sách Sản Phẩm</Label>
          <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1 sm:gap-2 bg-transparent text-xs sm:text-sm">
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Thêm Sản Phẩm</span>
            <span className="xs:hidden">Thêm</span>
          </Button>
        </div>
        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1 sm:pr-2">
          {items.map((item, index) => {
            return (
              <div key={item.id} className="flex flex-col gap-2">
                {/* Header with delete button */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Mặt hàng {index + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>

                {/* Product, Quantity, Unit - Responsive layout */}
                <div className="flex flex-col gap-2">
                  {/* Product Selection - Full width on mobile */}
                  <div className="w-full">
                    <Label htmlFor={`product-${item.id}`} className="text-xs mb-1 block">Sản Phẩm</Label>
                    <div className="relative" ref={(el) => { productContainerRefs.current[item.id] = el }}>
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        id={`product-${item.id}`}
                        type="text"
                        ref={(el) => { productInputRefs.current[item.id] = el }}
                        value={item.product}
                        onChange={(e) => {
                          const v = e.target.value
                          handleItemChange(item.id, 'product', v)
                          const prev = searchTimers.current[item.id]
                          if (prev) clearTimeout(prev)
                          searchTimers.current[item.id] = window.setTimeout(() => {
                            fetchProductsFor(item.id, v)
                          }, 250) as unknown as number
                          setShowProductSearch(item.id)
                        }}
                        onFocus={() => setShowProductSearch(item.id)}
                        onKeyDown={(e) => {
                          if (showProductSearch !== item.id) return
                          const results = productResultsMap[item.id] || []
                          const max = results.length - 1
                          const current = highlightedIndexMap[item.id] ?? 0
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            const next = current >= max ? 0 : current + 1
                            setHighlightedIndexMap((s) => ({ ...s, [item.id]: next }))
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            const prev = current <= 0 ? max : current - 1
                            setHighlightedIndexMap((s) => ({ ...s, [item.id]: prev }))
                          } else if (e.key === 'Enter') {
                            e.preventDefault()
                            const results = productResultsMap[item.id] || []
                            if (results.length === 0) return
                            const idx = highlightedIndexMap[item.id] ?? 0
                            const sel = results[idx]
                            if (sel) handleSelectProduct(item.id, sel)
                          } else if (e.key === 'Escape') {
                            setShowProductSearch(null)
                          }
                        }}
                        placeholder="Tìm kiếm..."
                        className="pl-10 h-9"
                        aria-autocomplete="list"
                        aria-expanded={showProductSearch === item.id}
                        aria-controls={`product-list-${item.id}`}
                      />

                      {/* Dropdown */}
                      {showProductSearch === item.id && dropdownPos[item.id] && (productResultsMap[item.id] || []).length >= 0 && createPortal(
                        <div
                          id={`product-list-${item.id}`}
                          role="listbox"
                          ref={(el) => { dropdownRefs.current[item.id] = el }}
                          onPointerDown={(e) => { e.stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onWheel={(e) => { e.stopPropagation(); }}
                          className="bg-background border border-border rounded-lg shadow-lg overflow-y-auto"
                          style={{ position: 'fixed', top: dropdownPos[item.id].top + 'px', left: dropdownPos[item.id].left + 'px', width: dropdownPos[item.id].width + 'px', maxHeight: '200px', zIndex: 2147483647, pointerEvents: 'auto' }}
                        >
                          {(productResultsMap[item.id] || []).length > 0 ? (
                            (productResultsMap[item.id] || []).map((product: any, idx: number) => (
                              <button
                                key={product.id}
                                type="button"
                                onPointerDown={(e) => { e.stopPropagation(); }}
                                onMouseEnter={() => setHighlightedIndexMap((s) => ({ ...s, [item.id]: idx }))}
                                onClick={() => { handleSelectProduct(item.id, product) }}
                                className={`w-full text-left px-4 py-2 transition-colors text-foreground ${((highlightedIndexMap[item.id] ?? 0) === idx) ? 'bg-muted' : 'hover:bg-muted'}`}
                              >
                                <div className="text-sm font-medium">{product.code ? `${product.code} — ${product.name}` : product.name}</div>
                                {product.unit && <div className="text-xs text-muted-foreground">{typeof product.unit === 'object' ? (product.unit.name || product.unit.code) : product.unit}</div>}
                              </button>
                            ))
                          ) : item.product ? (
                            <div className="px-4 py-2 text-muted-foreground text-sm">Không tìm thấy sản phẩm</div>
                          ) : (
                            <div className="px-4 py-2 text-muted-foreground text-sm">Bắt đầu gõ để tìm kiếm...</div>
                          )}
                        </div>
                        , document.body)}
                    </div>
                  </div>

                  {/* Quantity and Unit - Side by side on mobile */}
                  <div className="flex gap-2">
                    {/* Quantity */}
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={`quantity-${item.id}`} className="text-xs mb-1 block">Số Lượng</Label>
                      <Input
                        id={`quantity-${item.id}`}
                        type="number"
                        min="0"
                        step="0.0001"
                        ref={(el) => { quantityInputRefs.current[item.id] = el }}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                        placeholder="SL"
                        className="h-9"
                        required
                      />
                      {/* show equivalent in base unit */}
                      {(item.quantity && unitsMap[item.id] && item.unitId) && (() => {
                        const u = (unitsMap[item.id] || []).find((uu: any) => uu.id === item.unitId)
                        const base = (unitsMap[item.id] || []).find((uu: any) => uu.isBase)
                        if (u && base) {
                          const qty = Number(item.quantity) || 0
                          const baseQty = qty * Number(u.multiplier || 1)
                          return (
                            <div className="text-xs text-muted-foreground mt-1">≈ {baseQty} {base.code || base.name}</div>
                          )
                        }
                        return null
                      })()}
                    </div>

                    {/* Unit - Selectable */}
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={`unit-${item.id}`} className="text-xs mb-1 block">Đơn Vị</Label>
                      {item.unitId ? (
                        <select
                          id={`unit-${item.id}`}
                          value={item.unitId}
                          onChange={(e) => handleItemChange(item.id, "unitId", e.target.value)}
                          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm h-9 font-medium"
                        >
                          {(unitsMap[item.id] || []).map((unit: any) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.code || unit.name} {unit.isDefault ? '(mặc định)' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground text-sm h-9 flex items-center italic">
                          Chọn SP
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* notes removed per request */}

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
          Hủy
        </Button>
        <Button type="submit" disabled={!isFormValid || submitting} className="w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? (isEditing ? 'Đang lưu...' : 'Đang nhập...') : (isEditing ? `Lưu (${items.length} mặt hàng)` : `Nhập Hàng (${items.length} mặt hàng)`)}
        </Button>
      </div>
    </form>
  )
}
