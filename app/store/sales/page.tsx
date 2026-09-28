"use client"

import { mobileFetch } from "@/lib/mobile/api-client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, Minus, Search, ShoppingCart, X, ScanLine } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { useShift } from "@/hooks/useShift"
import { BarcodeScanner } from "@/components/barcode-scanner"
import { useProductScanner } from "@/hooks/use-scanner"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"
import { useAuth } from "@/hooks/use-auth"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"

interface MenuItem {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
  menu_type_id: string | null
}

interface Product {
  id: string
  name: string
  price: number
  category_id: string
}

interface CartItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  selected: boolean
}

export default function SalesPage() {
  const router = useRouter()
  const { user } = useAuth()

  // Get shift info (for display only)
  const { currentShift, isLoading: shiftLoading, error: shiftError, checkIn, checkOut, refreshShift } = useShift()

  // Check if user has opened a shift with shift_opened_at AND not closed yet
  // shift_opened_at is set when user enters opening_cash (sales shift opened)
  // shift_closed_at is set when user enters closing_cash (sales shift closed)
  // If no shift_opened_at, they must open shift first
  // If shift_closed_at is set, they already closed their shift and cannot sell
  const hasOpenedShift = currentShift?.id && currentShift?.shift_opened_at
  const hasClosedShift = currentShift?.shift_closed_at || currentShift?.status === "COMPLETED"
  const canCreateOrder = hasOpenedShift && !hasClosedShift

  // Helper function to get the correct warehouse ID for current user
  const getWarehouseId = (): string | null => {
    // For GENERAL_MANAGER, use selected warehouse from sessionStorage
    if (user?.role === 'GENERAL_MANAGER') {
      try {
        return sessionStorage.getItem('selectedWarehouseId')
      } catch (e) {
        console.error('Failed to access sessionStorage:', e)
        return null
      }
    }
    // For other roles, use warehouse from current shift
    return currentShift?.warehouse_id || null
  }

  // Barcode scanner for products
  const { scannerOpen, openScanner, closeScanner, handleScan } = useProductScanner(
    async (productCode) => {
      console.log('Scanned product code:', productCode)

      // Prevent scanning if no active shift
      if (!canCreateOrder) {
        toast.error("Vui lòng mở ca trước khi quét sản phẩm")
        return
      }

      try {
        // Fetch product by barcode
        const response = await mobileFetch(`/api/products/by-code/${encodeURIComponent(productCode)}`)
        const result = await response.json()

        if (result.success && result.data) {
          const product = result.data

          // Add product to cart
          addToCart({
            id: product.id,
            name: product.name,
            price: product.price,
            category_id: product.category_id
          })

          toast.success(`Đã thêm: ${product.name}`)
        } else {
          toast.error('Không tìm thấy sản phẩm với mã này')
        }
      } catch (error) {
        console.error('Error fetching product:', error)
        toast.error('Lỗi khi tìm sản phẩm')
      }
    }
  )

  const [menuTypes, setMenuTypes] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allAllowedProducts, setAllAllowedProducts] = useState<Product[]>([]) // All products allowed for this warehouse
  const [cart, setCart] = useState<CartItem[]>([])
  const [promotions, setPromotions] = useState<any[]>([])
  const [manualPromotions, setManualPromotions] = useState<any[]>([])
  const [selectedManualPromotion, setSelectedManualPromotion] = useState<any>(null)

  const [selectedMenuTypeId, setSelectedMenuTypeId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [showAllProducts, setShowAllProducts] = useState(true)
  const [searchProduct, setSearchProduct] = useState("")
  const [voucherCode, setVoucherCode] = useState("")
  const [appliedVoucher, setAppliedVoucher] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showCartModal, setShowCartModal] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [customerPayment, setCustomerPayment] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'EWALLET' | 'TRANSFER'>('CASH')
  const [eWalletType, setEWalletType] = useState<'MOMO' | 'ZALOPAY' | 'VIETTELPAY' | null>(null)
  const [hasVAT, setHasVAT] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Pagination state for lazy loading
  const itemsPerPage = 24 // Items per page
  const [currentProductsPage, setCurrentProductsPage] = useState(1)
  const [currentRecipesPage, setCurrentRecipesPage] = useState(1)
  const [hasMoreProducts, setHasMoreProducts] = useState(false)
  const [hasMoreRecipes, setHasMoreRecipes] = useState(false)
  const [recipes, setRecipes] = useState<any[]>([])

  // Refs for performance optimization
  const scrollPositionRef = useRef(0)
  const lastWarehouseIdRef = useRef<string | null>(null)
  const isInitialLoadRef = useRef(true)

  // Format number with thousand separator
  const formatCurrency = (value: string): string => {
    // Remove all non-digit characters
    const numbers = value.replace(/\D/g, '')
    if (!numbers) return ''
    // Add thousand separator
    return Number(numbers).toLocaleString('vi-VN')
  }

  // Get raw number from formatted string
  const parseFormattedNumber = (value: string): number => {
    const numbers = value.replace(/\D/g, '')
    return numbers ? parseInt(numbers, 10) : 0
  }

  const handleCustomerPaymentChange = (value: string) => {
    const formatted = formatCurrency(value)
    setCustomerPayment(formatted)
  }

  const handleCartModalOpenChange = (open: boolean) => {
    setShowCartModal(open)
    // Clear voucher and promotion when closing cart modal
    if (!open) {
      setAppliedVoucher(null)
      setSelectedManualPromotion(null)
      setVoucherCode("")
      setPaymentMethod('CASH')
      setEWalletType(null)
    }
  }


  useEffect(() => {
    fetchPromotions()
  }, [])

  // Fetch menu types, products and recipes when shift/warehouse changes
  // CRITICAL: Use stable dependencies (IDs) not objects to prevent re-render loop
  useEffect(() => {
    const warehouseId = getWarehouseId()
    const shiftId = currentShift?.id

    // Skip if no essential data
    if (!shiftId || !warehouseId) {
      console.log('[Sales] No shift or warehouse - clearing data')
      setMenuTypes([])
      setCategories([])
      setProducts([])
      setAllAllowedProducts([])
      setRecipes([])
      return
    }

    // Detect warehouse change (different from last known warehouse)
    const warehouseChanged = lastWarehouseIdRef.current && lastWarehouseIdRef.current !== warehouseId
    lastWarehouseIdRef.current = warehouseId

    // On warehouse change, clear filters but preserve scroll
    if (warehouseChanged) {
      console.log('[Sales] Warehouse changed - reloading data')
      scrollPositionRef.current = window.scrollY // Preserve scroll
      setSelectedMenuTypeId(null)
      setSelectedCategoryId(null)
      setCart([]) // Clear cart on warehouse change
    }

    // Fetch data (will be debounced by fetch functions)
    if (isInitialLoadRef.current || warehouseChanged) {
      console.log('[Sales] Loading data for warehouse:', warehouseId)
      fetchMenuTypes()
      setCurrentProductsPage(1)
      setCurrentRecipesPage(1)
      fetchAllowedProducts(1, false)
      fetchRecipes(1, undefined, false)
      isInitialLoadRef.current = false

      // Restore scroll position after data loads
      setTimeout(() => {
        if (warehouseChanged && scrollPositionRef.current > 0) {
          window.scrollTo(0, scrollPositionRef.current)
          scrollPositionRef.current = 0
        }
      }, 500)
    }
  }, [currentShift?.id, currentShift?.warehouse_id, user?.role]) // STABLE dependencies

  // Separate listener for warehouse selector changes (GM only)
  useEffect(() => {
    if (user?.role !== 'GENERAL_MANAGER') return

    let debounceTimer: NodeJS.Timeout

    const handleWarehouseChange = () => {
      console.log('[Sales] External warehouse change event')
      // Debounce to prevent rapid-fire changes
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        // Force re-check by updating a dummy state
        // The main effect above will handle the actual reload
        const newWarehouseId = getWarehouseId()
        if (newWarehouseId && newWarehouseId !== lastWarehouseIdRef.current) {
          lastWarehouseIdRef.current = newWarehouseId
          scrollPositionRef.current = window.scrollY

          setMenuTypes([])
          setCategories([])
          setProducts([])
          setAllAllowedProducts([])
          setRecipes([])
          setSelectedMenuTypeId(null)
          setSelectedCategoryId(null)
          setCart([])

          fetchMenuTypes()
          setCurrentProductsPage(1)
          setCurrentRecipesPage(1)
          fetchAllowedProducts(1, false)
          fetchRecipes(1, undefined, false)

          setTimeout(() => {
            if (scrollPositionRef.current > 0) {
              window.scrollTo(0, scrollPositionRef.current)
              scrollPositionRef.current = 0
            }
          }, 500)
        }
      }, 300) // 300ms debounce
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    return () => {
      clearTimeout(debounceTimer)
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [user?.role])

  useEffect(() => {
    if (selectedMenuTypeId) {
      fetchCategories(selectedMenuTypeId)
      setSelectedCategoryId(null)
      setShowAllProducts(false)
      // Reset pagination
      setCurrentProductsPage(1)
      setCurrentRecipesPage(1)
    }
  }, [selectedMenuTypeId])

  useEffect(() => {
    if (selectedCategoryId) {
      // Reset and fetch BOTH products AND recipes for this category
      setCurrentProductsPage(1)
      setCurrentRecipesPage(1)

      // Fetch products for this category
      fetchProductsByCategory(selectedCategoryId)

      // Fetch recipes for this category
      fetchRecipes(1, selectedCategoryId, false)
    }
  }, [selectedCategoryId])

  const fetchMenuTypes = async () => {
    try {
      // Get allowed categories for this warehouse first
      const warehouseId = getWarehouseId()
      if (warehouseId) {
        console.log('[Sales] fetchMenuTypes - warehouse_id:', warehouseId)
        const allowedResponse = await mobileFetch(`/api/admin/warehouse-category-permissions/allowed-categories?warehouseId=${warehouseId}`
        )
        const allowedResult = await allowedResponse.json()
        console.log('[Sales] allowedResult:', allowedResult)

        // Get all menu types
        const response = await mobileFetch("/api/menu-types")
        const result = await response.json()
        console.log('[Sales] all menu types:', result.data?.length)
        if (result.success) {
          // If we have allowed categories, filter menu types to only show those with allowed categories
          if (allowedResult.categories && allowedResult.categories.length > 0) {
            const allowedCategoryIds = new Set(allowedResult.categories.map((c: any) => c.id))
            console.log('[Sales] allowedCategoryIds:', [...allowedCategoryIds])

            // Get all categories to check which menu types have allowed categories
            const categoriesResponse = await mobileFetch("/api/categories")
            const categoriesResult = await categoriesResponse.json()
            const allCategories = categoriesResult.success ? categoriesResult.data || [] : []
            console.log('[Sales] allCategories count:', allCategories.length)

            // Find menu types that have at least one allowed category
            const menuTypesWithAllowedCategories = new Set(
              allCategories
                .filter((cat: any) => allowedCategoryIds.has(cat.id))
                .map((cat: any) => cat.menu_type_id)
                .filter(Boolean)
            )
            console.log('[Sales] menuTypesWithAllowedCategories:', [...menuTypesWithAllowedCategories])

            const filteredMenuTypes = (result.data || []).filter((mt: any) =>
              menuTypesWithAllowedCategories.has(mt.id)
            )
            console.log('[Sales] filteredMenuTypes:', filteredMenuTypes.length, filteredMenuTypes.map((m: any) => m.name))
            setMenuTypes(filteredMenuTypes)
          } else {
            // No allowed categories - show no menu types
            console.log('[Sales] No allowed categories - showing no menu types')
            setMenuTypes([])
          }
        }
      } else {
        console.log('[Sales] No warehouse_id - showing no menu types (require active shift)')
        // No warehouse context means no active shift - show nothing
        setMenuTypes([])
      }
    } catch (error) {
      console.error("Error fetching menu types:", error)
      toast.error("Không thể tải danh sách thực đơn")
      // Fallback: show no menu types on error (safer than showing all)
      setMenuTypes([])
    }
  }

  const fetchCategories = async (menuTypeId: string) => {
    try {
      // Get allowed categories for this warehouse
      let allowedCategoryIds: Set<string> | null = null
      if (currentShift?.warehouse_id) {
        const allowedResponse = await mobileFetch(`/api/admin/warehouse-category-permissions/allowed-categories?warehouseId=${currentShift.warehouse_id}`
        )
        const allowedResult = await allowedResponse.json()
        allowedCategoryIds = new Set(allowedResult.categories.map((c: any) => c.id))
      }

      const response = await mobileFetch(`/api/categories?menu_type_id=${menuTypeId}`)
      const result = await response.json()
      if (result.success) {
        // Filter to only allowed categories if permissions are set
        const filtered = allowedCategoryIds
          ? result.data?.filter((c: any) => allowedCategoryIds!.has(c.id)) || []
          : result.data || []
        setCategories(filtered)
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
      toast.error("Không thể tải danh sách danh mục")
    }
  }

  const fetchProducts = async (categoryId: string) => {
    try {
      const response = await mobileFetch(`/api/products?categoryId=${categoryId}`)
      const result = await response.json()
      if (result.success) {
        setProducts(result.data || [])
      }
    } catch (error) {
      console.error("Error fetching products:", error)
      toast.error("Không thể tải danh sách sản phẩm")
    } finally {
      setLoading(false)
    }
  }

  const fetchProductsByCategory = async (categoryId: string) => {
    try {
      setLoading(true)

      // Get allowed categories first
      const warehouseId = getWarehouseId()
      if (!warehouseId) {
        console.log('[Sales] No warehouse_id - cannot fetch products')
        setProducts([])
        return
      }

      const allowedResponse = await mobileFetch(`/api/admin/warehouse-category-permissions/allowed-categories?warehouseId=${warehouseId}`)
      const allowedResult = await allowedResponse.json()

      // Check if this category is allowed
      if (allowedResult.categories && allowedResult.categories.length > 0) {
        const allowedCategoryIds = allowedResult.categories.map((c: any) => c.id)

        if (!allowedCategoryIds.includes(categoryId)) {
          console.log('[Sales] Category not allowed:', categoryId)
          setProducts([])
          return
        }
      }

      // Fetch products for this specific category
      const response = await mobileFetch(`/api/products?categoryId=${categoryId}`)
      const result = await response.json()

      if (result.success) {
        console.log('[Sales] Fetched products for category:', categoryId, result.data?.length)
        setProducts(result.data || [])
      }
    } catch (error) {
      console.error("Error fetching products by category:", error)
      toast.error("Không thể tải danh sách sản phẩm")
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const fetchPromotions = async () => {
    try {
      const response = await mobileFetch("/api/promotions/active?withDetails=true")
      const result = await response.json()
      if (result.success) {
        console.log('✅ Loaded promotions:', result.data)
        setPromotions(result.data || [])
      }
    } catch (error) {
      console.error("Error fetching promotions:", error)
      toast.error("Không thể tải chương trình khuyến mãi")
    }
  }

  const fetchManualPromotions = async () => {
    try {
      // Fetch all active promotions with details
      const response = await mobileFetch("/api/promotions?pageSize=100&withDetails=true")
      const result = await response.json()
      if (result.success) {
        const now = new Date()
        const currentDayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        const currentHour = now.getHours()
        const currentMinute = now.getMinutes()
        const currentTimeInMinutes = currentHour * 60 + currentMinute

        // Map day string to day of week number
        const dayStringToNumber: Record<string, number> = {
          'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3,
          'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6,
          'CN': 0, 'T2': 1, 'T3': 2, 'T4': 3, 'T5': 4, 'T6': 5, 'T7': 6,
        }

        // Filter ALL promotion types (DISCOUNT, COMBO, GIFT, BUY_X_GET_Y) - all require manual selection
        const manual = (result.data || []).filter((p: any) => {
          // Check if active
          if (!p.is_active) return false

          // Check promotion type - include all types that require manual selection
          if (!['GIFT', 'BUY_X_GET_Y', 'DISCOUNT', 'COMBO'].includes(p.promotion_type)) return false

          // Check start date
          if (p.start_date && new Date(p.start_date) > now) {
            console.log(`⏰ Promotion ${p.name} not started yet (start: ${p.start_date})`)
            return false
          }

          // Check end date
          if (p.end_date && new Date(p.end_date) < now) {
            console.log(`⏱️ Promotion ${p.name} has expired (end: ${p.end_date})`)
            return false
          }

          // Check apply_time_type and apply_days
          if (p.apply_time_type && p.apply_time_type !== 'ALWAYS') {
            // Check apply_days for DAY or DAY_TIME type
            if (p.apply_time_type === 'DAY' || p.apply_time_type === 'DAY_TIME') {
              let applyDays: string[] = []
              if (p.apply_days) {
                if (typeof p.apply_days === 'string') {
                  try {
                    applyDays = JSON.parse(p.apply_days)
                  } catch {
                    applyDays = []
                  }
                } else if (Array.isArray(p.apply_days)) {
                  applyDays = p.apply_days
                }
              }

              // If apply_days is specified, check if today is included
              if (applyDays.length > 0) {
                const allowedDays = applyDays.map(d => dayStringToNumber[d.toUpperCase()] ?? -1).filter(d => d >= 0)
                if (!allowedDays.includes(currentDayOfWeek)) {
                  console.log(`⏰ Promotion ${p.name} not applicable today (day: ${currentDayOfWeek}, allowed: ${allowedDays.join(',')})`)
                  return false
                }
              }
            }

            // Check time range for TIME or DAY_TIME type
            if (p.apply_time_type === 'TIME' || p.apply_time_type === 'DAY_TIME') {
              const timeStart = p.time_start // Format: "HH:MM:SS" or null
              const timeEnd = p.time_end // Format: "HH:MM:SS" or null

              if (timeStart || timeEnd) {
                // Parse time_start
                let startInMinutes = 0
                if (timeStart) {
                  const [h, m] = timeStart.split(':').map(Number)
                  startInMinutes = (h || 0) * 60 + (m || 0)
                }

                // Parse time_end
                let endInMinutes = 24 * 60 - 1 // End of day
                if (timeEnd) {
                  const [h, m] = timeEnd.split(':').map(Number)
                  endInMinutes = (h || 0) * 60 + (m || 0)
                }

                // Check if current time is within range
                if (currentTimeInMinutes < startInMinutes || currentTimeInMinutes > endInMinutes) {
                  console.log(`⏰ Promotion ${p.name} not applicable at this time (current: ${currentHour}:${currentMinute}, allowed: ${timeStart || '00:00'}-${timeEnd || '23:59'})`)
                  return false
                }
              }
            }
          }

          return true
        })
        console.log('🎁 Manual promotions available:', manual)
        setManualPromotions(manual)
      }
    } catch (error) {
      console.error("Error fetching manual promotions:", error)
      toast.error("Không thể tải danh sách khuyến mãi")
    }
  }

  // Check if promotion meets requirements
  const checkPromotionEligibility = (promotion: any, currentSubtotal: number, currentItemCount: number, cartItems: CartItem[] = []) => {
    const meetsMinAmount = !promotion.min_amount || currentSubtotal >= Number(promotion.min_amount)
    const meetsMinQuantity = !promotion.min_quantity || currentItemCount >= Number(promotion.min_quantity)

    // Check date expiration
    const now = new Date()
    if (promotion.start_date && new Date(promotion.start_date) > now) {
      return false // Not started yet
    }
    if (promotion.end_date && new Date(promotion.end_date) < now) {
      return false // Expired
    }

    // Check apply_time_type and apply_days
    if (promotion.apply_time_type && promotion.apply_time_type !== 'ALWAYS') {
      const currentDayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      const dayStringToNumber: Record<string, number> = {
        'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3,
        'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6,
        'CN': 0, 'T2': 1, 'T3': 2, 'T4': 3, 'T5': 4, 'T6': 5, 'T7': 6,
      }

      // Check apply_days for DAY or DAY_TIME type
      if (promotion.apply_time_type === 'DAY' || promotion.apply_time_type === 'DAY_TIME') {
        let applyDays: string[] = []
        if (promotion.apply_days) {
          if (typeof promotion.apply_days === 'string') {
            try {
              applyDays = JSON.parse(promotion.apply_days)
            } catch {
              applyDays = []
            }
          } else if (Array.isArray(promotion.apply_days)) {
            applyDays = promotion.apply_days
          }
        }

        if (applyDays.length > 0) {
          const allowedDays = applyDays.map(d => dayStringToNumber[d.toUpperCase()] ?? -1).filter(d => d >= 0)
          if (!allowedDays.includes(currentDayOfWeek)) {
            return false
          }
        }
      }

      // Check time range for TIME or DAY_TIME type
      if (promotion.apply_time_type === 'TIME' || promotion.apply_time_type === 'DAY_TIME') {
        const timeStart = promotion.time_start
        const timeEnd = promotion.time_end

        if (timeStart || timeEnd) {
          let startInMinutes = 0
          if (timeStart) {
            const [h, m] = timeStart.split(':').map(Number)
            startInMinutes = (h || 0) * 60 + (m || 0)
          }

          let endInMinutes = 24 * 60 - 1
          if (timeEnd) {
            const [h, m] = timeEnd.split(':').map(Number)
            endInMinutes = (h || 0) * 60 + (m || 0)
          }

          if (currentTimeInMinutes < startInMinutes || currentTimeInMinutes > endInMinutes) {
            return false
          }
        }
      }
    }

    // For GIFT/BUY_X_GET_Y promotions, check if cart contains at least one eligible product
    if (promotion.promotion_type === 'GIFT' || promotion.promotion_type === 'BUY_X_GET_Y') {
      const eligibleProductIds: string[] = (promotion.buyProducts || []).map((p: any) => p.item_id || p.product_id)

      // If no buyProducts specified, promotion doesn't apply
      if (eligibleProductIds.length === 0) {
        return false
      }

      // Check if ANY cart item is in the eligible list
      const hasEligibleProduct = cartItems.some(item => eligibleProductIds.includes(item.product_id))

      if (!hasEligibleProduct) {
        return false
      }
    }

    return meetsMinAmount && meetsMinQuantity
  }


  // Calculate Buy 1 Get 1 discount for GIFT promotion
  // NOTE: For "Mua 1 Tặng 1" - there is NO DISCOUNT!
  // Customer pays full price, but gets bonus items added to order
  // This function returns 0 because we don't reduce the cart total
  const calculateBogoDiscount = (promotion: any, cartItems: CartItem[]) => {
    // GIFT promotions do NOT apply any discount
    // They only add bonus items to the order
    // So we always return 0 for discount
    console.log('🎁 GIFT promotion - No discount, bonus items will be added to order')
    return 0
  }

  // Calculate bonus items for GIFT promotion (for display and order)
  const calculateBonusItems = (promotion: any, cartItems: CartItem[]) => {
    if (promotion.promotion_type !== 'GIFT') return []

    // Get eligible product codes from buyProducts
    const eligibleProductCodes: string[] = (promotion.buyProducts || []).map((p: any) =>
      p.item_id || p.product_id
    )

    if (eligibleProductCodes.length === 0) {
      console.log('🚫 GIFT promotion has no eligible products')
      return []
    }

    const bonusItems: Array<{
      product_id: string
      product_name: string
      quantity: number
      unit_price: number
    }> = []

    // For each eligible item in cart, add same quantity as bonus
    for (const item of cartItems) {
      if (!eligibleProductCodes.includes(item.product_id)) continue

      // Buy 1 Get 1: For every item you buy, you get 1 free
      bonusItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity, // Same quantity as purchased
        unit_price: 0 // Free!
      })

      console.log(`✅ BOGO Bonus: ${item.product_name} x${item.quantity} (FREE)`)
    }

    return bonusItems
  }

  const fetchAllowedProducts = async (page: number = 1, append: boolean = false) => {
    try {
      // ALWAYS require warehouse context for sales page
      const warehouseId = getWarehouseId()
      if (!warehouseId) {
        console.log('[Sales] No warehouse_id - showing no products')
        setProducts([])
        setAllAllowedProducts([])
        setLoading(false)
        return
      }

      setLoading(true)

      // Get allowed categories for this warehouse
      const allowedResponse = await mobileFetch(`/api/admin/warehouse-category-permissions/allowed-categories?warehouseId=${warehouseId}`
      )
      const allowedResult = await allowedResponse.json()

      if (allowedResult.categories && allowedResult.categories.length > 0) {
        const allowedCategoryIds = allowedResult.categories.map((c: any) => c.id)

        console.log('[Sales] Allowed category IDs:', allowedCategoryIds)

        // Fetch products with pagination
        const response = await mobileFetch(`/api/products?page=${page}&pageSize=${itemsPerPage}`)
        const result = await response.json()
        if (result.success) {
          const filteredProducts = (result.data || []).filter((p: Product) =>
            allowedCategoryIds.includes(p.category_id)
          )
          console.log(`[Sales] Page ${page} - Filtered products:`, filteredProducts.length, 'of', result.data.length)

          // Check if there's more data
          const totalPages = Math.ceil((result.pagination?.total || 0) / itemsPerPage)
          setHasMoreProducts(page < totalPages)

          if (append) {
            // Append to existing products
            setAllAllowedProducts(prev => [...prev, ...filteredProducts])
            setProducts(prev => [...prev, ...filteredProducts])
          } else {
            // Replace products (initial load or filter change)
            setAllAllowedProducts(filteredProducts)
            setProducts(filteredProducts)
          }

          setCurrentProductsPage(page)
        }
      } else {
        // No allowed categories - show no products
        console.log('[Sales] No allowed categories - showing no products')
        setProducts([])
        setAllAllowedProducts([])
        setHasMoreProducts(false)
      }
    } catch (error) {
      console.error("Error fetching allowed products:", error)
      toast.error("Không thể tải danh sách hàng hóa")
      setProducts([])
      setAllAllowedProducts([])
      setHasMoreProducts(false)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecipes = async (page: number = 1, categoryId?: string, append: boolean = false) => {
    try {
      setLoading(true)

      const url = categoryId
        ? `/api/product-recipes?categoryId=${categoryId}&page=${page}&limit=${itemsPerPage}`
        : `/api/product-recipes?page=${page}&limit=${itemsPerPage}`
      const response = await mobileFetch(url)
      const result = await response.json()
      if (result.data) {
        // Filter recipes by allowed categories if warehouse context exists
        const warehouseId = getWarehouseId()
        if (warehouseId) {
          const allowedResponse = await mobileFetch(`/api/admin/warehouse-category-permissions/allowed-categories?warehouseId=${warehouseId}`
          )
          const allowedResult = await allowedResponse.json()

          if (allowedResult.categories && allowedResult.categories.length > 0) {
            const allowedCategoryIds = allowedResult.categories.map((c: any) => c.id)
            const filteredRecipes = (result.data || []).filter((r: any) =>
              r.category_id && allowedCategoryIds.includes(r.category_id)
            )
            console.log(`[Sales] Page ${page} - Filtered recipes:`, filteredRecipes.length, 'of', result.data.length)

            // Check if there's more data
            const totalPages = Math.ceil((result.pagination?.total || 0) / itemsPerPage)
            setHasMoreRecipes(page < totalPages)

            if (append) {
              setRecipes(prev => [...prev, ...filteredRecipes])
            } else {
              setRecipes(filteredRecipes)
            }

            setCurrentRecipesPage(page)
          } else {
            setRecipes([])
            setHasMoreRecipes(false)
          }
        } else {
          const totalPages = Math.ceil((result.pagination?.total || 0) / itemsPerPage)
          setHasMoreRecipes(page < totalPages)

          if (append) {
            setRecipes(prev => [...prev, ...(result.data || [])])
          } else {
            setRecipes(result.data || [])
          }

          setCurrentRecipesPage(page)
        }
      }
    } catch (error) {
      console.error("Error fetching recipes:", error)
      setHasMoreRecipes(false)
    } finally {
      setLoading(false)
    }
  }

  const addToCart = useCallback((product: Product) => {
    // Prevent adding to cart if no active shift or shift closed
    if (!canCreateOrder) {
      if (hasClosedShift) {
        toast.error("Ca làm việc đã đóng. Không thể thêm sản phẩm.")
      } else {
        toast.error("Vui lòng mở ca trước khi tạo đơn hàng")
      }
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [
        ...prev,
        {
          id: `cart-${Date.now()}`,
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: product.price,
          selected: true,
        },
      ]
    })
  }, [canCreateOrder, hasClosedShift])

  const addRecipeToCart = useCallback((recipe: any) => {
    // Prevent adding to cart if no active shift or shift closed
    if (!canCreateOrder) {
      if (hasClosedShift) {
        toast.error("Ca làm việc đã đóng. Không thể thêm sản phẩm.")
      } else {
        toast.error("Vui lòng mở ca trước khi tạo đơn hàng")
      }
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === recipe.id)
      if (existing) {
        return prev.map((item) =>
          item.product_id === recipe.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [
        ...prev,
        {
          id: `cart-${Date.now()}`,
          product_id: recipe.id,
          product_code: recipe.code || null, // For BOGO discount matching
          product_name: recipe.name,
          quantity: 1,
          unit_price: recipe.price || 0,
          selected: true,
          category_id: recipe.category_id || null, // For BOGO discount calculation
        },
      ]
    })
  }, [canCreateOrder, hasClosedShift])

  const updateQuantity = (cartId: string, quantity: number) => {
    if (quantity < 1) {
      // Remove item from cart when quantity becomes 0 or less
      setCart((prev) => {
        const newCart = prev.filter((item) => item.id !== cartId)
        if (newCart.length === 0) {
          setAppliedVoucher(null)
          setSelectedManualPromotion(null)
          setVoucherCode("")
        }
        return newCart
      })
      return
    }
    setCart((prev) =>
      prev.map((item) =>
        item.id === cartId ? { ...item, quantity } : item
      )
    )
  }

  const removeFromCart = (cartId: string) => {
    setCart((prev) => {
      const newCart = prev.filter((item) => item.id !== cartId)
      // Clear voucher and promotions if cart becomes empty
      if (newCart.length === 0) {
        setAppliedVoucher(null)
        setSelectedManualPromotion(null)
        setVoucherCode("")
      }
      return newCart
    })
  }

  const toggleItemSelection = (cartId: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === cartId)
      if (item && item.selected) {
        // Nếu bỏ chọn, xóa khỏi giỏ
        return prev.filter((i) => i.id !== cartId)
      }
      // Nếu chọn lại, cập nhật selected
      return prev.map((i) =>
        i.id === cartId ? { ...i, selected: !i.selected } : i
      )
    })
  }

  const validateVoucher = async () => {
    if (!voucherCode.trim()) {
      toast.error("Vui lòng nhập mã giảm giá")
      return
    }

    if (selectedItems.length === 0) {
      toast.error("Vui lòng chọn sản phẩm trước khi áp dụng voucher")
      return
    }

    console.log('Validating voucher with subtotal:', subtotal)

    try {
      const response = await mobileFetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: voucherCode,
          total_amount: subtotal,
          cart_items: selectedItems.map(item => ({
            recipe_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price
          })),
        }),
      })

      const result = await response.json()
      console.log('Voucher validation result:', result)

      if (result.success) {
        setAppliedVoucher(result.data)
        setVoucherCode("") // Clear input after successful validation
        toast.success(result.data.message || "Mã giảm giá hợp lệ")
      } else {
        toast.error(result.error || "Mã giảm giá không hợp lệ")
      }
    } catch (error) {
      console.error("Error validating voucher:", error)
      toast.error("Lỗi xác thực mã giảm giá")
    }
  }

  const selectedItems = cart.filter((item) => item.selected)
  const subtotal = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )

  let totalDiscount = 0
  let appliedPromotion: any = null

  // Calculate discount with support for all promotion types
  const calcDiscount = (promo: any) => {
    if (promo.promotion_type === 'GIFT' || promo.promotion_type === 'BUY_X_GET_Y') {
      return calculateBogoDiscount(promo, selectedItems)
    }
    let applicableSubtotal = subtotal
    // If promotion has specific discount products, only apply to those
    if (promo.discountProducts && promo.discountProducts.length > 0) {
      const discountProductIds = promo.discountProducts.map((dp: any) => dp.productId || dp.item_id)
      applicableSubtotal = selectedItems
        .filter(item => discountProductIds.includes(item.product_id))
        .reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
    }

    if (promo.discount_type === "PERCENTAGE") {
      return (applicableSubtotal * promo.discount_value) / 100
    }
    return promo.discount_value
  }

  // Apply manually selected promotion (ALL promotion types now require manual selection)
  if (selectedManualPromotion && !appliedVoucher) {
    const promo = selectedManualPromotion

    // For GIFT/BUY_X_GET_Y promotions, there is NO discount - only bonus items are added
    if (promo.promotion_type === 'GIFT' || promo.promotion_type === 'BUY_X_GET_Y') {
      console.log('🎁 GIFT/BOGO promotion selected:', promo.name, '- No discount, bonus items will be added')
      appliedPromotion = promo
      // totalDiscount stays 0 for GIFT promotions
    } else if (promo.promotion_type === 'DISCOUNT' || promo.promotion_type === 'COMBO') {
      // Calculate discount for DISCOUNT/COMBO type promotions
      appliedPromotion = promo

      let applicableSubtotal = subtotal
      if (promo.discountProducts && promo.discountProducts.length > 0) {
        const discountProductIds = promo.discountProducts.map((dp: any) => dp.productId || dp.item_id)
        applicableSubtotal = selectedItems
          .filter(item => discountProductIds.includes(item.product_id))
          .reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

        console.log('🎯 Promotion applies to specific products:', {
          promotionName: promo.name,
          discountProductIds,
          applicableSubtotal,
          totalSubtotal: subtotal
        })
      }

      if (promo.discount_type === "PERCENTAGE") {
        totalDiscount = (applicableSubtotal * promo.discount_value) / 100
        if (promo.max_discount_amount && totalDiscount > promo.max_discount_amount) {
          totalDiscount = promo.max_discount_amount
        }
      } else {
        totalDiscount = promo.discount_value || 0
      }
      console.log('🎉 Applied manual DISCOUNT promotion:', promo.name, 'Discount:', totalDiscount)
    }
  }

  // Apply voucher if exists (overrides promotion)
  if (appliedVoucher) {
    appliedPromotion = null

    if (appliedVoucher.discount_type === "GIFT") {
      // Gift voucher - discount for matched items, free items for non-matched
      totalDiscount = appliedVoucher.discount_amount || 0
      console.log('🎁 Gift voucher applied:', {
        gift_items: appliedVoucher.gift_items,
        discount_amount: appliedVoucher.discount_amount,
        totalDiscount
      })
    } else if (appliedVoucher.discount_type === "PRODUCT_DISCOUNT") {
      // Product-specific discount - use pre-calculated amount from API
      totalDiscount = appliedVoucher.discount_amount || 0
      console.log('🎯 Product discount applied:', totalDiscount)
    } else if (appliedVoucher.discount_type === "PERCENTAGE") {
      totalDiscount = (subtotal * appliedVoucher.discount_value) / 100
      console.log('💯 Percentage voucher applied:', totalDiscount)
    } else if (appliedVoucher.discount_type === "FIXED_AMOUNT") {
      totalDiscount = appliedVoucher.discount_value
      console.log('💰 Fixed amount voucher applied:', totalDiscount)
    }
  }

  const subtotalAfterDiscount = subtotal - totalDiscount
  const vatAmount = hasVAT ? Math.round(subtotalAfterDiscount * 0.08) : 0
  const totalAmount = subtotalAfterDiscount + vatAmount
  let customerPaymentValue = parseFormattedNumber(customerPayment)
  let change = customerPaymentValue - totalAmount

  // Auto-fill customer payment when payment dialog opens
  useEffect(() => {
    if (showPaymentDialog && totalAmount > 0) {
      setCustomerPayment(formatCurrency(totalAmount.toString()))
    }
  }, [showPaymentDialog, totalAmount])

  // If payment method is e-wallet, we don't require customer to enter cash.
  // Treat customer payment as full amount and no change.
  if (paymentMethod === 'EWALLET') {
    customerPaymentValue = totalAmount
    change = 0
  }

  const completeOrder = async () => {
    // Prevent order creation if no active shift
    if (!canCreateOrder) {
      toast.error("Vui lòng mở ca trước khi tạo đơn hàng")
      return
    }

    if (selectedItems.length === 0) {
      toast.error("Vui lòng chọn sản phẩm")
      return
    }

    if (paymentMethod === 'CASH') {
      if (!customerPayment || customerPaymentValue < totalAmount) {
        toast.error("Tiền khách không đủ")
        return
      }
    }

    if (paymentMethod === 'EWALLET') {
      if (!eWalletType) {
        toast.error("Vui lòng chọn loại ví điện tử")
        return
      }
    }

    try {
      setProcessing(true)

      // Calculate bonus items for GIFT promotions
      let bonusItems: Array<{
        product_id: string
        product_name: string
        quantity: number
        unit_price: number
      }> = []

      if (selectedManualPromotion && selectedManualPromotion.promotion_type === 'GIFT') {
        bonusItems = calculateBonusItems(selectedManualPromotion, selectedItems)
        console.log('🎁 Bonus items to add to order:', bonusItems)
      }

      const response = await mobileFetch("/api/sales/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          // Include bonus items (gift items) - these will be added to order with price 0
          bonus_items: bonusItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: 0, // Free!
            is_gift: true
          })),
          voucher_id: appliedVoucher?.id || null,
          promotion_id: appliedPromotion?.id || null,
          gift_promotion_id: selectedManualPromotion?.id || null,
          discount_amount: totalDiscount,
          total_amount: totalAmount,
          customer_payment: customerPaymentValue,
          change: change,
          payment_method: paymentMethod,
          ewallet_type: eWalletType || null,
          has_vat: hasVAT,
          vat_amount: vatAmount,
        }),
      })

      const result = await response.json()
      if (result.success) {
        const invoiceNumber = result.data?.invoiceNumber || result.data?.invoice_number || "N/A"
        let message = `Đơn hàng #${invoiceNumber} đã tạo thành công. Tổng: ${totalAmount.toLocaleString('vi-VN')}₫`
        if (appliedPromotion || selectedManualPromotion) {
          message += ` (Đã giảm ${totalDiscount.toLocaleString('vi-VN')}₫)`
        }

        // Verify voucher was marked as used
        if (appliedVoucher?.id) {
          try {
            const voucherCheckRes = await mobileFetch(`/api/vouchers/${appliedVoucher.id}/usage`)
            const voucherData = await voucherCheckRes.json()
            if (voucherData.success && voucherData.data?.is_used) {
              console.log(`✅ Voucher ${voucherData.data.code} confirmed as used at ${voucherData.data.used_at}`)
            } else {
              console.warn(`⚠️ Voucher ${appliedVoucher.id} may not have been marked as used`)
            }
          } catch (checkError) {
            console.error('Could not verify voucher usage:', checkError)
          }
        }

        toast.success(message)
        setCart([])
        setVoucherCode("")
        setAppliedVoucher(null)
        setSelectedManualPromotion(null)
        setCustomerPayment("")
        setPaymentMethod('CASH')
        setShowPaymentDialog(false)
        setShowCartModal(false)

        // Refresh shift data immediately to update statistics
        await refreshShift()
      } else {
        toast.error(result.error || "Lỗi tạo đơn hàng")
      }
    } catch (error) {
      console.error("Error completing order:", error)
      toast.error("Lỗi tạo đơn hàng")
    } finally {
      setProcessing(false)
    }
  }


  const categoriesForMenuType = categories.filter(
    (cat) => cat.menu_type_id === selectedMenuTypeId
  )

  // Lazy loading logic for desktop
  const filteredProducts = showAllProducts
    ? allAllowedProducts.filter(
      (prod) =>
        searchProduct === "" ||
        prod.name.toLowerCase().includes(searchProduct.toLowerCase())
    )
    : selectedCategoryId
      ? products.filter(
        (prod) =>
          searchProduct === "" ||
          prod.name.toLowerCase().includes(searchProduct.toLowerCase())
      )
      : []

  const filteredRecipes = searchProduct === ""
    ? recipes
    : recipes.filter((r: any) => r.name.toLowerCase().includes(searchProduct.toLowerCase()))

  const allItems = [...filteredProducts, ...filteredRecipes] // Combine products and recipes
  const hasMore = hasMoreProducts || hasMoreRecipes

  // Load more callback for infinite scroll
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return
    console.log('[SalesPage] Loading more items...')

    // Load more products if available
    if (hasMoreProducts) {
      await fetchAllowedProducts(currentProductsPage + 1, true)
    }

    // Load more recipes if available
    if (hasMoreRecipes) {
      await fetchRecipes(currentRecipesPage + 1, selectedCategoryId || undefined, true)
    }
  }, [hasMore, loading, hasMoreProducts, hasMoreRecipes, currentProductsPage, currentRecipesPage, selectedCategoryId])

  // Infinite scroll hook
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loading,
    threshold: 200, // Trigger 200px before reaching bottom
  })

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentProductsPage(1)
    setCurrentRecipesPage(1)
  }, [selectedMenuTypeId, selectedCategoryId, showAllProducts, searchProduct])

  // Render cart content as a reusable component
  const CartContent = ({ isMobile = false }) => (
    <>
      {cart.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Giỏ hàng trống
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div className={`space-y-3 ${isMobile ? "" : ""}`}>
            {cart.map((item) => (
              <div
                key={item.id}
                className="bg-background p-3 rounded-lg space-y-2 border border-border"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItemSelection(item.id)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium flex-1">{item.product_name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFromCart(item.id)}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="h-6 w-6 p-0"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="h-6 w-6 p-0"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold">
                    {Number(item.quantity * item.unit_price).toLocaleString("vi-VN")}đ
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="border-t pt-4 space-y-2 bg-blue-50 p-3 rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Tạm Tính:</span>
              <span className="font-semibold">
                {Number(subtotal).toLocaleString("vi-VN")}đ
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Tổng Tiền:</span>
              <span className="text-blue-600">
                {Number(subtotal).toLocaleString("vi-VN")}đ
              </span>
            </div>
          </div>

          {/* Payment Button */}
          <Button
            onClick={() => {
              fetchManualPromotions()
              setShowPaymentDialog(true)
            }}
            disabled={selectedItems.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            Thanh Toán
          </Button>
        </>
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ShoppingCart}
        title="Bán Hàng"
        subtitle="Quản lý bán hàng và thanh toán"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Bán Hàng</h1>
          <p className="text-muted-foreground mt-2">Quản lý bán hàng và thanh toán</p>
        </div>

        {/* Alert: Chưa Mở Ca */}
        {!canCreateOrder && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="font-semibold text-red-900 text-lg">Chưa Mở Ca Làm Việc</p>
                <p className="text-sm text-red-700 mt-1">
                  Bạn phải mở ca và nhập tiền đầu ca trước khi có thể bán hàng
                </p>
                <button
                  onClick={() => router.push('/store/shifts/my-shift')}
                  className="mt-3 inline-block bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  👉 Đi Mở Ca Làm Việc
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Layout */}
        <div className="md:hidden space-y-4">
          {/* Menu Types Tabs - Mobile */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              onClick={() => {
                setShowAllProducts(true)
                setSelectedMenuTypeId(null)
                setSelectedCategoryId(null)
                setSearchProduct("")
                // Reset pagination and reload data
                setCurrentProductsPage(1)
                setCurrentRecipesPage(1)
                if (currentShift) {
                  fetchAllowedProducts(1, false)
                  fetchRecipes(1, undefined, false)
                }
              }}
              variant={showAllProducts ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap text-xs"
            >
              Tất Cả
            </Button>
            {menuTypes.map((menuType) => (
              <Button
                key={menuType.id}
                onClick={() => setSelectedMenuTypeId(menuType.id)}
                variant={selectedMenuTypeId === menuType.id ? "default" : "outline"}
                size="sm"
                className="whitespace-nowrap text-xs"
              >
                {menuType.name}
              </Button>
            ))}
          </div>

          {/* Categories Subtabs - Mobile */}
          {selectedMenuTypeId && categoriesForMenuType.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 border-b">
              {categoriesForMenuType.map((category) => (
                <Button
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  size="sm"
                  variant={selectedCategoryId === category.id ? "default" : "outline"}
                  className="whitespace-nowrap text-xs"
                >
                  {category.name}
                </Button>
              ))}
            </div>
          )}

          {/* Search Box - Mobile */}
          {(showAllProducts || selectedCategoryId) && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm sản phẩm..."
                  className="pl-10"
                  value={searchProduct}
                  onChange={(e) => {
                    setSearchProduct(e.target.value)
                  }}
                />
              </div>
              <Button
                onClick={openScanner}
                variant="outline"
                size="icon"
                className="flex-shrink-0"
                disabled={!canCreateOrder}
                title="Quét mã vạch sản phẩm"
              >
                <ScanLine className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Products List - Mobile */}
          {(showAllProducts || selectedCategoryId) && filteredProducts.length > 0 && !loading && (
            <div className="space-y-2">
              {filteredProducts.map((product) => {
                const cartItem = cart.find((item) => item.product_id === product.id)
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 p-3 bg-white border border-border rounded-lg"
                  >
                    {/* Image Container */}
                    <div className="flex-shrink-0 relative">
                      <div
                        className={`w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-3xl relative cursor-pointer hover:bg-gray-200 transition ${cartItem?.selected ? "opacity-40" : "opacity-100"
                          }`}
                        onClick={() => {
                          if (cartItem) {
                            toggleItemSelection(cartItem.id)
                          } else {
                            addToCart(product)
                          }
                        }}
                      >
                        🍽️
                      </div>
                      {/* Checkbox - Outside the image div */}
                      {cartItem?.selected && (
                        <div className="absolute -inset-1 flex items-center justify-center pointer-events-none">
                          <div className="w-7 h-7 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg">
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">(PHẦN)</p>
                      <p className="text-sm font-bold text-blue-600 mt-1">
                        {Number(product.price).toLocaleString("vi-VN")}đ
                      </p>
                    </div>

                    {/* Quantity Controls */}
                    {cartItem ? (
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)}
                          className="h-6 w-6 p-0 hover:bg-gray-200"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-5 text-center text-xs font-bold">
                          {cartItem.quantity}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
                          className="h-6 w-6 p-0 hover:bg-gray-200"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => addToCart(product)}
                        className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white h-8"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Recipes List - Mobile */}
          {(showAllProducts || selectedCategoryId) && filteredRecipes.length > 0 && !loading && (
            <div className="space-y-2 pb-24">
              {filteredRecipes.map((recipe) => {
                const cartItem = cart.find((item) => item.product_id === recipe.id)
                return (
                  <div
                    key={recipe.id}
                    className="flex items-center gap-3 p-3 bg-white border border-border rounded-lg"
                  >
                    <div className="flex-shrink-0 relative">
                      <div
                        className={`w-20 h-20 rounded-lg flex items-center justify-center relative cursor-pointer hover:opacity-80 transition overflow-hidden ${recipe.image_url ? 'bg-gray-100' : 'bg-gradient-to-br from-orange-100 to-amber-100'
                          } ${cartItem?.selected ? "opacity-40" : "opacity-100"}`}
                        onClick={() => {
                          if (cartItem) {
                            toggleItemSelection(cartItem.id)
                          } else {
                            addRecipeToCart(recipe)
                          }
                        }}
                      >
                        {recipe.image_url ? (
                          <img
                            src={recipe.image_url}
                            alt={recipe.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.classList.add('bg-gradient-to-br', 'from-orange-100', 'to-amber-100');
                                parent.innerHTML = '<span class="text-3xl">👨‍🍳</span>';
                              }
                            }}
                          />
                        ) : (
                          <span className="text-3xl">👨‍🍳</span>
                        )}
                      </div>
                      {cartItem?.selected && (
                        <div className="absolute -inset-1 flex items-center justify-center pointer-events-none">
                          <div className="w-7 h-7 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg">
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <p className="font-semibold text-sm">{recipe.name}</p>
                      <p className="text-xs text-gray-500">
                        {recipe.categories ? recipe.categories.name : "Không có nhóm"}
                      </p>
                      <p className="text-sm font-bold text-blue-600 mt-1">
                        {recipe.price ? `${Number(recipe.price).toLocaleString("vi-VN")}đ` : "Không có giá"}
                      </p>
                    </div>

                    {cartItem ? (
                      <div className="flex items-center gap-1 bg-gray-200 rounded-lg px-2 py-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)}
                          className="h-6 w-6 p-0 hover:bg-gray-300"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-5 text-center text-xs font-bold">
                          {cartItem.quantity}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
                          className="h-6 w-6 p-0 hover:bg-gray-300"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => addRecipeToCart(recipe)}
                        className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white h-8"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Cart Button - Mobile (Floating) */}
          {cart.length > 0 && (
            <button
              onClick={() => setShowCartModal(true)}
              className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg flex items-center gap-2 z-40"
            >
              <ShoppingCart className="w-6 h-6" />
              <span className="font-bold text-lg">{cart.length}</span>
            </button>
          )}

          {/* Cart Modal - Mobile */}
          <Dialog open={showCartModal} onOpenChange={handleCartModalOpenChange}>
            <DialogContent className="w-full max-w-md h-[95vh] flex flex-col overflow-hidden">
              <DialogHeader className="flex flex-row items-center justify-between space-y-0 pr-0 pb-4 border-b">
                <DialogTitle className="text-xl font-bold">Giỏ Hàng ({cart.length})</DialogTitle>
                <button
                  onClick={() => handleCartModalOpenChange(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-4 py-4">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Giỏ hàng trống
                  </div>
                ) : (
                  <>
                    {/* Cart Items */}
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div
                          key={item.id}
                          className="bg-background p-3 rounded-lg space-y-2 border border-border"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleItemSelection(item.id)}
                              className="w-4 h-4"
                            />
                            <span className="text-sm font-medium flex-1">{item.product_name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromCart(item.id)}
                              className="h-6 w-6 p-0"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="h-6 w-6 p-0"
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-6 text-center text-sm">{item.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="h-6 w-6 p-0"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                            <span className="text-sm font-semibold">
                              {Number(item.quantity * item.unit_price).toLocaleString("vi-VN")}đ
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Summary - Simple version, no promotion details */}
                    <div className="border rounded-lg p-3 bg-blue-50 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Tạm Tính:</span>
                        <span className="font-semibold">
                          {Number(subtotal).toLocaleString("vi-VN")}đ
                        </span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Tổng Tiền:</span>
                        <span className="text-blue-600">
                          {Number(subtotal).toLocaleString("vi-VN")}đ
                        </span>
                      </div>
                    </div>

                    {/* Payment Button */}
                    <Button
                      onClick={() => {
                        fetchManualPromotions()
                        setShowCartModal(false)
                        setShowPaymentDialog(true)
                      }}
                      disabled={selectedItems.length === 0}
                      className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-lg font-semibold"
                    >
                      Thanh Toán ({selectedItems.length})
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Desktop/Tablet Layout */}
        {/* Desktop Layout - Hidden if no active shift */}
        <div className={`hidden md:grid md:grid-cols-5 gap-6 h-[calc(100vh-250px)] ${!canCreateOrder ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="col-span-3 space-y-4 overflow-y-auto">
            {/* Menu Types Tabs - Desktop */}
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => {
                  setShowAllProducts(true)
                  setSelectedMenuTypeId(null)
                  setSelectedCategoryId(null)
                  setSearchProduct("")
                  // Reset pagination and reload data
                  setCurrentProductsPage(1)
                  setCurrentRecipesPage(1)
                  if (currentShift) {
                    fetchAllowedProducts(1, false)
                    fetchRecipes(1, undefined, false)
                  }
                }}
                variant={showAllProducts ? "default" : "outline"}
              >
                Tất Cả
              </Button>
              {menuTypes.map((menuType) => (
                <Button
                  key={menuType.id}
                  onClick={() => setSelectedMenuTypeId(menuType.id)}
                  variant={selectedMenuTypeId === menuType.id ? "default" : "outline"}
                >
                  {menuType.name}
                </Button>
              ))}
            </div>

            {/* Categories Subtabs - Desktop */}
            {selectedMenuTypeId && categoriesForMenuType.length > 0 && (
              <div className="flex gap-2 flex-wrap border-b pb-4">
                {categoriesForMenuType.map((category) => (
                  <Button
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                    size="sm"
                    variant={selectedCategoryId === category.id ? "default" : "outline"}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            )}

            {/* Products + Recipes Grid */}
            {(showAllProducts || selectedCategoryId) && (
              <>
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm sản phẩm..."
                    className="pl-10"
                    value={searchProduct}
                    onChange={(e) => {
                      setSearchProduct(e.target.value)
                    }}
                  />
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
                ) : filteredProducts.length === 0 && recipes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Không có sản phẩm nào
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                    {allItems.map((item) => {
                      // Check if it's a recipe (has product_id field) or regular product
                      const isRecipe = 'product_id' in item && 'output_quantity' in item

                      if (isRecipe) {
                        // Render recipe
                        const recipe = item as any
                        return (
                          <Card
                            key={`recipe-${recipe.id}`}
                            className="p-2 cursor-pointer hover:shadow-lg transition-shadow flex flex-col justify-between h-full overflow-hidden"
                            onClick={() => addRecipeToCart(recipe)}
                          >
                            <div className="flex flex-col items-center">
                              {recipe.image_url ? (
                                <div className="w-full aspect-square mb-1.5 rounded-lg overflow-hidden bg-gray-100">
                                  <img
                                    src={recipe.image_url}
                                    alt={recipe.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      target.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center text-3xl">👨‍🍳</div>';
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-full aspect-square mb-1.5 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                                  <span className="text-3xl">👨‍🍳</span>
                                </div>
                              )}
                              <p className="font-semibold text-xs text-center line-clamp-2 min-h-[2rem]">{recipe.name}</p>
                              <p className="text-[10px] text-muted-foreground text-center line-clamp-1">
                                {recipe.categories ? recipe.categories.name : "Không có nhóm"}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-blue-600 text-center mt-1">
                              {recipe.price ? `${Number(recipe.price).toLocaleString("vi-VN")}đ` : "Không có giá"}
                            </p>
                          </Card>
                        )
                      } else {
                        // Render regular product
                        const product = item as Product
                        return (
                          <Card
                            key={`product-${product.id}`}
                            className="p-2 cursor-pointer hover:shadow-lg transition-shadow flex flex-col justify-between h-full"
                            onClick={() => addToCart(product)}
                          >
                            <div>
                              <div className="text-2xl mb-1.5 text-center">🍽️</div>
                              <p className="font-semibold text-xs text-center line-clamp-2 min-h-[2rem]">{product.name}</p>
                              <p className="text-[10px] text-muted-foreground text-center">(PHẦN)</p>
                            </div>
                            <p className="text-sm font-bold text-blue-600 text-center mt-1">
                              {Number(product.price).toLocaleString("vi-VN")}đ
                            </p>
                          </Card>
                        )
                      }
                    })}
                  </div>
                )}

                {/* Infinite Scroll Sentinel & Loading Indicator */}
                {allItems.length > 0 && (
                  <div className="mt-6">
                    {hasMore && (
                      <div ref={sentinelRef} className="flex items-center justify-center py-4">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                          <p className="text-sm">Đang tải thêm sản phẩm...</p>
                        </div>
                      </div>
                    )}
                    {!hasMore && allItems.length > 24 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        Đã hiển thị tất cả {allItems.length} sản phẩm
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cart Sidebar - Desktop/Tablet */}
          <div className="col-span-2 bg-muted rounded-lg p-4 flex flex-col gap-4 overflow-y-auto">
            <div className="font-semibold text-lg flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Giỏ Hàng ({cart.length})
            </div>
            <CartContent isMobile={false} />
          </div>
        </div>

        {/* Payment Dialog */}
        <Dialog
          open={showPaymentDialog}
          onOpenChange={(open) => {
            setShowPaymentDialog(open)
            if (!open) {
              // Reset when closing
              setAppliedVoucher(null)
              setSelectedManualPromotion(null)
              setVoucherCode("")
              setCustomerPayment("")
              setPaymentMethod('CASH')
              setEWalletType(null)
              setHasVAT(false)
            }
            // Auto-fill will be handled by useEffect
          }}
        >
          <DialogContent className="w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden p-0">
            <DialogHeader className="px-4 pt-4 pb-2">
              <DialogTitle className="text-xl font-bold">Xác Nhận Thanh Toán</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 px-4">
              {/* Products Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Danh Sách Sản Phẩm ({selectedItems.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase w-8">STT</th>
                        <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Sản Phẩm</th>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase w-10">SL</th>
                        <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase w-20">Giá</th>
                        <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase w-24">T.Tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedItems.map((item, index) => {
                        // Calculate discount for this item if voucher/promotion applies
                        let itemDiscount = 0
                        let itemDiscountPercent = 0

                        if (appliedVoucher && totalDiscount > 0) {
                          // Proportional discount based on item value
                          const itemTotal = item.quantity * item.unit_price
                          itemDiscount = (itemTotal / subtotal) * totalDiscount
                          itemDiscountPercent = (itemDiscount / itemTotal) * 100
                        } else if (appliedPromotion && totalDiscount > 0) {
                          // Check if this item is eligible for discount
                          let isEligible = true

                          // If promotion has specific discount products, check if this item is in the list
                          if (appliedPromotion.discountProducts && appliedPromotion.discountProducts.length > 0) {
                            const discountProductIds = appliedPromotion.discountProducts.map((dp: any) => dp.productId || dp.item_id)
                            isEligible = discountProductIds.includes(item.product_id)
                          }

                          // Only apply discount if eligible
                          if (isEligible && appliedPromotion.discount_type === 'PERCENTAGE') {
                            itemDiscountPercent = Number(appliedPromotion.discount_value)
                            itemDiscount = (item.quantity * item.unit_price * itemDiscountPercent) / 100
                          }
                        }

                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-gray-600">{index + 1}</td>
                            <td className="px-2 py-2">
                              <p className="font-medium">{item.product_name}</p>
                            </td>
                            <td className="px-2 py-2 text-center font-medium">{item.quantity}</td>
                            <td className="px-2 py-2 text-right">
                              {Number(item.unit_price).toLocaleString("vi-VN")}đ
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-blue-600">
                              {Number(item.quantity * item.unit_price).toLocaleString("vi-VN")}đ
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="bg-blue-50 font-semibold">
                        <td colSpan={4} className="px-2 py-2 text-right">Tạm Tính:</td>
                        <td className="px-2 py-2 text-right text-blue-700">
                          {Number(subtotal).toLocaleString("vi-VN")}đ
                        </td>
                      </tr>
                      {totalDiscount > 0 && (
                        <tr className="bg-red-50 font-semibold">
                          <td colSpan={4} className="px-2 py-2 text-right text-red-700">
                            Giảm Giá:
                          </td>
                          <td className="px-2 py-2 text-right text-red-700">
                            -{Number(totalDiscount).toLocaleString("vi-VN")}đ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Voucher Input Section */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <label className="text-sm font-semibold mb-2 block">Mã Giảm Giá / Voucher</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nhập mã voucher (nếu có)"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value)}
                    disabled={appliedVoucher !== null}
                    className="flex-1"
                  />
                  {appliedVoucher ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setAppliedVoucher(null)
                        setVoucherCode("")
                      }}
                    >
                      Xóa
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={validateVoucher}
                      disabled={!voucherCode.trim()}
                    >
                      Áp Dụng
                    </Button>
                  )}
                </div>
              </div>

              {/* Manual Promotion Selection */}
              {manualPromotions.length > 0 && (
                <div className="border rounded-lg p-3 bg-amber-50">
                  <label className="text-sm font-semibold mb-2 block text-amber-900">
                    🎁 Chương Trình Khuyến Mãi Đặc Biệt
                  </label>
                  <div className="space-y-2">
                    {manualPromotions.map((promo) => {
                      const totalItemCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0)
                      const isEligible = checkPromotionEligibility(promo, subtotal, totalItemCount, selectedItems)

                      return (
                        <div
                          key={promo.id}
                          className={`p-3 rounded-lg border-2 transition-all ${!isEligible
                            ? 'border-gray-300 bg-gray-100 opacity-50 cursor-not-allowed'
                            : selectedManualPromotion?.id === promo.id
                              ? 'border-amber-500 bg-amber-100 cursor-pointer'
                              : 'border-gray-200 bg-white hover:border-amber-300 cursor-pointer'
                            }`}
                          onClick={() => {
                            if (!isEligible) return
                            if (selectedManualPromotion?.id === promo.id) {
                              setSelectedManualPromotion(null)
                            } else {
                              setSelectedManualPromotion(promo)
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className={`font-semibold ${isEligible ? 'text-amber-900' : 'text-gray-500'}`}>
                                  {promo.name}
                                </p>
                                <Badge variant="outline" className="text-xs">
                                  {promo.promotion_type === 'GIFT' ? 'Tặng Quà'
                                    : promo.promotion_type === 'BUY_X_GET_Y' ? 'Mua X Tặng Y'
                                      : promo.promotion_type === 'DISCOUNT' ? 'Giảm Giá'
                                        : promo.promotion_type === 'COMBO' ? 'Combo'
                                          : 'Khuyến Mãi'}
                                </Badge>
                              </div>
                              {promo.description && (
                                <p className="text-xs text-gray-600 mb-1">{promo.description}</p>
                              )}
                              {/* Show requirements */}
                              <div className="text-xs mt-2 space-y-1">
                                {promo.min_amount && (
                                  <p className={Number(subtotal) >= Number(promo.min_amount) ? 'text-green-600' : 'text-red-600'}>
                                    {Number(subtotal) >= Number(promo.min_amount) ? '✓' : '✗'} Tối thiểu: {Number(promo.min_amount).toLocaleString('vi-VN')}đ
                                    {Number(subtotal) < Number(promo.min_amount) && ` (Còn thiếu ${(Number(promo.min_amount) - Number(subtotal)).toLocaleString('vi-VN')}đ)`}
                                  </p>
                                )}
                                {promo.min_quantity && (
                                  <p className={totalItemCount >= Number(promo.min_quantity) ? 'text-green-600' : 'text-red-600'}>
                                    {totalItemCount >= Number(promo.min_quantity) ? '✓' : '✗'} Số lượng tối thiểu: {promo.min_quantity} sản phẩm
                                    {totalItemCount < Number(promo.min_quantity) && ` (Còn thiếu ${Number(promo.min_quantity) - totalItemCount} sản phẩm)`}
                                  </p>
                                )}
                                {/* Show eligible products requirement for GIFT promotions */}
                                {(promo.promotion_type === 'GIFT' || promo.promotion_type === 'BUY_X_GET_Y') && promo.buyProducts && promo.buyProducts.length > 0 && (() => {
                                  const eligibleProductIds = promo.buyProducts.map((p: any) => p.item_id || p.product_id)
                                  const hasEligibleProduct = selectedItems.some(item => eligibleProductIds.includes(item.product_id))
                                  const eligibleProductNames = promo.buyProducts.map((p: any) => p.product_name || 'Sản phẩm').join(', ')
                                  return (
                                    <p className={hasEligibleProduct ? 'text-green-600' : 'text-red-600'}>
                                      {hasEligibleProduct ? '✓' : '✗'} Sản phẩm áp dụng: {eligibleProductNames.length > 50 ? eligibleProductNames.slice(0, 50) + '...' : eligibleProductNames}
                                    </p>
                                  )
                                })()}
                                {/* Show discount value for DISCOUNT/COMBO promotions */}
                                {(promo.promotion_type === 'DISCOUNT' || promo.promotion_type === 'COMBO') && (
                                  <p className="text-green-600 font-medium">
                                    💰 {promo.discount_type === 'PERCENTAGE'
                                      ? `Giảm ${promo.discount_value}%${promo.max_discount_amount ? ` (tối đa ${Number(promo.max_discount_amount).toLocaleString('vi-VN')}đ)` : ''}`
                                      : `Giảm ${Number(promo.discount_value).toLocaleString('vi-VN')}đ`}
                                  </p>
                                )}
                                {/* Show applicable products for DISCOUNT promotions */}
                                {(promo.promotion_type === 'DISCOUNT' || promo.promotion_type === 'COMBO') && promo.discountProducts && promo.discountProducts.length > 0 && (() => {
                                  const discountProductIds = promo.discountProducts.map((dp: any) => dp.productId || dp.item_id)
                                  const hasApplicableProduct = selectedItems.some(item => discountProductIds.includes(item.product_id))
                                  const productNames = promo.discountProducts.map((p: any) => p.product_name || 'Sản phẩm').join(', ')
                                  return (
                                    <p className={hasApplicableProduct ? 'text-green-600' : 'text-orange-600'}>
                                      {hasApplicableProduct ? '✓' : 'ℹ️'} Áp dụng cho: {productNames.length > 50 ? productNames.slice(0, 50) + '...' : productNames}
                                    </p>
                                  )
                                })()}
                              </div>
                            </div>
                            {selectedManualPromotion?.id === promo.id && isEligible && (
                              <span className="text-amber-600 ml-2">✓</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {selectedManualPromotion && (
                    <p className="text-xs text-amber-700 mt-2">
                      ℹ️ Khuyến mãi thủ công đã chọn sẽ được áp dụng cho đơn hàng này
                    </p>
                  )}
                </div>
              )}

              {/* Gift Products Table - Show when manual promotion is selected */}
              {selectedManualPromotion && (selectedManualPromotion.promotion_type === 'GIFT' || selectedManualPromotion.promotion_type === 'BUY_X_GET_Y') && (() => {
                // Use calculateBonusItems to get the free items
                const bonusItems = calculateBonusItems(selectedManualPromotion, selectedItems)

                if (bonusItems.length === 0) return null

                // Calculate total bonus value for display
                const totalBonusValue = bonusItems.reduce((sum, item) => {
                  // Find the original price from cart
                  const cartItem = selectedItems.find(ci => ci.product_id === item.product_id)
                  return sum + (item.quantity * (cartItem?.unit_price || 0))
                }, 0)

                return (
                  <div className="border rounded-lg overflow-hidden bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="bg-green-100 px-3 py-2 border-b border-green-200">
                      <h3 className="font-semibold flex items-center gap-2 text-green-900 text-sm">
                        🎁 Mua 1 Tặng 1 - Sản Phẩm TẶNG THÊM ({bonusItems.length})
                      </h3>
                      <p className="text-xs text-green-700 mt-1">Bạn sẽ nhận THÊM các sản phẩm sau (miễn phí)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-green-50 border-b border-green-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-green-900 uppercase">STT</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-green-900 uppercase">Sản Phẩm Tặng</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-green-900 uppercase">SL Tặng</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-green-900 uppercase">Giá Trị</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-green-100">
                          {bonusItems.map((bonusItem: any, index: number) => {
                            const cartItem = selectedItems.find(ci => ci.product_id === bonusItem.product_id)
                            const itemValue = bonusItem.quantity * (cartItem?.unit_price || 0)
                            return (
                              <tr key={bonusItem.product_id || index} className="hover:bg-green-50">
                                <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-sm text-green-900">{bonusItem.product_name}</p>
                                  <p className="text-xs text-gray-500">🎁 TẶNG thêm (không tính tiền)</p>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-green-700 text-lg">
                                  +{bonusItem.quantity}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-green-600">
                                  MIỄN PHÍ
                                  <p className="text-xs text-gray-500 font-normal">({itemValue.toLocaleString('vi-VN')}đ)</p>
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="bg-green-100 font-semibold">
                            <td colSpan={3} className="px-4 py-2 text-right text-green-900">Tổng giá trị được tặng:</td>
                            <td className="px-4 py-2 text-right text-green-700">{totalBonusValue.toLocaleString('vi-VN')}đ</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* Voucher Gift Products Table - Show when gift voucher is applied */}
              {appliedVoucher && appliedVoucher.discount_type === 'GIFT' && appliedVoucher.gift_items && appliedVoucher.gift_items.length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-gradient-to-r from-pink-50 to-rose-50">
                  <div className="bg-pink-100 px-3 py-2 border-b border-pink-200">
                    <h3 className="font-semibold flex items-center gap-2 text-pink-900 text-sm">
                      🎁 Sản Phẩm Tặng Kèm Voucher ({appliedVoucher.gift_items.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-pink-50 border-b border-pink-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-pink-900 uppercase">STT</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-pink-900 uppercase">Tên Sản Phẩm</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-pink-900 uppercase">SL Tặng</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-pink-900 uppercase">Giảm Giá</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-pink-100">
                        {appliedVoucher.gift_items.map((gift: any, index: number) => {
                          // Check if this gift item is in the cart
                          const cartItem = selectedItems.find((item: any) => item.product_id === gift.item_id)

                          if (!cartItem) {
                            // Not in cart - show as pure gift
                            return (
                              <tr key={gift.id || index} className="hover:bg-pink-50">
                                <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-sm text-pink-900">{gift.item_name || 'Sản phẩm'}</p>
                                  <p className="text-xs text-gray-500">
                                    {gift.item_type === 'RECIPE' ? 'Món ăn' : 'Hàng hóa'}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-center font-medium text-pink-700">
                                  {gift.quantity || 1}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-green-600">
                                  MIỄN PHÍ
                                </td>
                              </tr>
                            )
                          }

                          // In cart - calculate discount %
                          const discountPercent = cartItem.quantity > 0
                            ? Math.round(((gift.quantity || 1) / cartItem.quantity) * 100)
                            : 0

                          return (
                            <tr key={gift.id || index} className="hover:bg-blue-50 bg-blue-50/50">
                              <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-sm text-blue-900">{gift.item_name || 'Sản phẩm'} ✓</p>
                                <p className="text-xs text-gray-500">
                                  {cartItem.quantity} cái được tặng {gift.quantity || 1} cái
                                </p>
                              </td>
                              <td className="px-4 py-3 text-center font-medium text-blue-700">
                                {gift.quantity || 1}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-orange-600">
                                Giảm {discountPercent}%
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Voucher Product Discount Table - Show when product discount voucher is applied */}
              {appliedVoucher && appliedVoucher.discount_type === 'PRODUCT_DISCOUNT' && appliedVoucher.product_items && appliedVoucher.product_items.length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-gradient-to-r from-blue-50 to-cyan-50">
                  <div className="bg-blue-100 px-3 py-2 border-b border-blue-200">
                    <h3 className="font-semibold flex items-center gap-2 text-blue-900 text-sm">
                      🏷️ Sản Phẩm Áp Dụng Giảm Giá ({appliedVoucher.product_items.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-blue-50 border-b border-blue-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-blue-900 uppercase">STT</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-blue-900 uppercase">Tên Sản Phẩm</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-blue-900 uppercase">SL Tối Thiểu</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-blue-900 uppercase">% Giảm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        {appliedVoucher.product_items.map((product: any, index: number) => (
                          <tr key={product.id || index} className="hover:bg-blue-50">
                            <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm text-blue-900">{product.item_name || 'Sản phẩm'}</p>
                              <p className="text-xs text-gray-500">
                                {product.item_type === 'RECIPE' ? 'Món ăn' : 'Hàng hóa'}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center font-medium text-blue-700">
                              {product.quantity_required || 1}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-orange-600">
                              {appliedVoucher.discount_value}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Promotion/Voucher Display */}
              <div className="space-y-3">
                {/* Auto Promotion */}
                {appliedPromotion && !appliedVoucher && totalDiscount > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-300">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🎉</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-bold text-green-800">{appliedPromotion.name}</p>
                          <Badge className="bg-green-600">Đã chọn</Badge>
                        </div>
                        <p className="text-sm text-green-700 mb-1">
                          {appliedPromotion.discount_type === 'PERCENTAGE'
                            ? `Giảm ${appliedPromotion.discount_value}%${appliedPromotion.max_discount_amount ? ` (tối đa ${Number(appliedPromotion.max_discount_amount).toLocaleString('vi-VN')}đ)` : ''}`
                            : `Giảm ${Number(appliedPromotion.discount_value).toLocaleString('vi-VN')}đ`}
                        </p>
                        {appliedPromotion.description && (
                          <p className="text-xs text-gray-600">{appliedPromotion.description}</p>
                        )}
                        <div className="mt-3 pt-3 border-t border-green-200 flex justify-between items-center">
                          <span className="text-sm font-semibold text-green-800">Tiết kiệm được:</span>
                          <span className="text-xl font-bold text-green-700">
                            -{Number(totalDiscount).toLocaleString("vi-VN")}đ
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Voucher Info */}
                {appliedVoucher && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-xl">🎟️</span>
                        <div className="flex-1">
                          <p className="font-semibold text-purple-700">{appliedVoucher.code}</p>
                          <p className="text-xs text-purple-600 mt-1">
                            {appliedVoucher.discount_type === 'PERCENTAGE'
                              ? `Giảm ${appliedVoucher.discount_value}%`
                              : appliedVoucher.discount_type === 'PRODUCT_DISCOUNT'
                                ? `Giảm sản phẩm cụ thể ${appliedVoucher.discount_value}%`
                                : appliedVoucher.discount_type === 'GIFT'
                                  ? 'Quà tặng'
                                  : `Giảm ${Number(appliedVoucher.discount_value).toLocaleString('vi-VN')}đ`}
                          </p>
                          {appliedVoucher.description && (
                            <p className="text-xs text-gray-600 mt-1">{appliedVoucher.description}</p>
                          )}
                        </div>
                      </div>
                      {totalDiscount > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                          <span className="text-sm font-medium text-purple-700">Số tiền được giảm:</span>
                          <span className="text-lg font-bold text-purple-700">
                            -{Number(totalDiscount).toLocaleString("vi-VN")}đ
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Gift Items Summary */}
                    {appliedVoucher.discount_type === 'GIFT' && (
                      <>
                        {/* Show discount for matched gift items */}
                        {appliedVoucher.discount_amount && appliedVoucher.discount_amount > 0 && (
                          <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                            <p className="text-xs font-medium text-blue-700 mb-1">✓ Sản phẩm trong giỏ được tặng:</p>
                            <div className="space-y-1">
                              {selectedItems.map((item: any, idx: number) => {
                                // Find matching gift
                                const matchingGift = appliedVoucher.gift_items &&
                                  appliedVoucher.gift_items.find((g: any) => g.item_id === item.product_id)

                                if (!matchingGift) return null

                                const discountPercent = Math.round((matchingGift.quantity / item.quantity) * 100)
                                return (
                                  <div key={idx} className="flex justify-between items-center text-xs text-blue-600">
                                    <span>{item.product_name}</span>
                                    <span className="font-medium text-orange-600">
                                      {item.quantity} cái được tặng {matchingGift.quantity} cái (-{discountPercent}%)
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Show pure gift items (not in cart) */}
                        {appliedVoucher.gift_items && appliedVoucher.gift_items.length > 0 && (
                          <div className="bg-pink-50 p-2 rounded-lg border border-pink-200">
                            <p className="text-xs font-medium text-pink-700 mb-1">🎁 Quà tặng kèm:</p>
                            <div className="space-y-1">
                              {appliedVoucher.gift_items.map((gift: any, idx: number) => {
                                // Check if this gift is also a matched item
                                const cartItem = selectedItems.find((item: any) => item.product_id === gift.item_id)

                                // If it's matched, skip (already shown in blue section above)
                                if (cartItem) {
                                  return null
                                }

                                return (
                                  <div key={idx} className="flex justify-between items-center text-xs text-pink-600">
                                    <span>{gift.item_name || 'Sản phẩm'}</span>
                                    <span className="font-medium">x{gift.quantity} (Miễn phí)</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Product Discount Summary */}
                    {appliedVoucher.discount_type === 'PRODUCT_DISCOUNT' && appliedVoucher.product_items && appliedVoucher.product_items.length > 0 && (
                      <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                        <p className="text-xs font-medium text-blue-700 mb-1">🏷️ Sản phẩm được giảm giá:</p>
                        <div className="space-y-1">
                          {appliedVoucher.product_items.map((product: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs text-blue-600">
                              <span>{product.item_name || 'Sản phẩm'} (SL ≥ {product.quantity_required})</span>
                              <span className="font-medium text-orange-600">-{appliedVoucher.discount_value}%</span>
                            </div>
                          ))}
                        </div>
                        {totalDiscount > 0 && (
                          <div className="flex justify-between items-center pt-2 border-t border-blue-200 mt-2">
                            <span className="text-sm font-medium text-blue-700">Tiết kiệm:</span>
                            <span className="font-bold text-blue-700">-{Number(totalDiscount).toLocaleString("vi-VN")}đ</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* No Promotion Message */}
                {!appliedPromotion && !appliedVoucher && (
                  <div className="border-t pt-3">
                    <div className="bg-gray-50 p-2 rounded text-center">
                      <p className="text-xs text-muted-foreground">Không có khuyến mãi áp dụng</p>
                    </div>
                  </div>
                )}
              </div>

              {/* VAT Checkbox */}
              <div className="flex items-center space-x-2 px-1 pb-2">
                <input
                  type="checkbox"
                  id="vat-checkbox"
                  checked={hasVAT}
                  onChange={(e) => setHasVAT(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label
                  htmlFor="vat-checkbox"
                  className="text-base font-medium leading-none cursor-pointer select-none"
                >
                  Xuất hóa đơn VAT (8%)
                </label>
              </div>

              {/* Total Summary */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border-2 border-blue-300">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-gray-600">Tạm tính:</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {Number(subtotalAfterDiscount).toLocaleString("vi-VN")}đ
                  </span>
                </div>

                {hasVAT && (
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-gray-600">VAT (8%):</span>
                    <span className="text-sm font-semibold text-red-600">
                      +{Number(vatAmount).toLocaleString("vi-VN")}đ
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center border-t border-blue-200 pt-2 mt-1">
                  <span className="text-base font-bold text-gray-700">Tổng Thanh Toán:</span>
                  <span className="text-3xl font-bold text-blue-600">
                    {Number(totalAmount).toLocaleString("vi-VN")}đ
                  </span>
                </div>
                {totalDiscount > 0 && (
                  <p className="text-xs text-gray-600 mt-1 text-right">
                    (Đã giảm {Number(totalDiscount).toLocaleString("vi-VN")}đ từ {Number(subtotal).toLocaleString("vi-VN")}đ)
                  </p>
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-3 border-t pt-3">
                <label className="text-sm font-semibold">Phương thức thanh toán</label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={paymentMethod === 'CASH' ? 'default' : 'outline'}
                    onClick={() => {
                      setPaymentMethod('CASH')
                      setEWalletType(null)
                    }}
                    className="flex-1"
                  >
                    💵 Tiền mặt
                  </Button>
                  <Button
                    size="sm"
                    variant={paymentMethod === 'EWALLET' ? 'default' : 'outline'}
                    onClick={() => {
                      setPaymentMethod('EWALLET')
                      setEWalletType('MOMO')
                    }}
                    className="flex-1"
                  >
                    🔴 Momo
                  </Button>
                </div>

                {/* If cash, show amount input and quick buttons. If transfer or e-wallet, no input required. */}
                {paymentMethod === 'CASH' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Tiền Khách Đưa</label>
                    <Input
                      type="text"
                      placeholder="Nhập số tiền (mặc định: vừa đủ)"
                      value={customerPayment}
                      onChange={(e) => handleCustomerPaymentChange(e.target.value)}
                      className="text-lg h-12"
                      autoFocus
                    />

                    {/* Quick Amount Buttons */}
                    <div className="grid grid-cols-5 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCustomerPayment(formatCurrency(totalAmount.toString()))}
                        className="text-xs bg-blue-100 hover:bg-blue-200 font-semibold"
                      >
                        Vừa đủ
                      </Button>
                      {[50000, 100000, 200000, 500000].map((amount) => (
                        <Button
                          key={amount}
                          variant="outline"
                          size="sm"
                          onClick={() => setCustomerPayment(formatCurrency(amount.toString()))}
                          className="text-xs"
                        >
                          {(amount / 1000).toLocaleString('vi-VN')}k
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-pink-50 border border-pink-200">
                    <p className="text-sm text-pink-700 text-center">🔴 Thanh toán qua <strong>Momo</strong> — xác nhận khi đã nhận tiền</p>
                  </div>
                )}

                {/* Change Display (only for cash) */}
                {paymentMethod === 'CASH' && customerPayment && customerPaymentValue >= totalAmount && (
                  <div className="bg-gradient-to-r from-green-100 to-emerald-100 p-4 rounded-lg border-2 border-green-400">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-green-800">Tiền Thối Lại:</span>
                      <span className="text-2xl font-bold text-green-600">
                        {Number(change).toLocaleString("vi-VN")}đ
                      </span>
                    </div>
                  </div>
                )}

                {/* Warning if not enough (only for cash) */}
                {paymentMethod === 'CASH' && customerPayment && customerPaymentValue < totalAmount && (
                  <div className="bg-red-50 p-3 rounded-lg border-2 border-red-300">
                    <p className="text-xs text-red-700 text-center font-semibold">
                      ⚠️ Tiền khách đưa chưa đủ (thiếu {Number(totalAmount - customerPaymentValue).toLocaleString("vi-VN")}đ)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div className="flex gap-3 justify-end pt-3 border-t px-4 pb-4 bg-white">
              <DialogClose asChild>
                <Button variant="outline" disabled={processing} size="lg">
                  Hủy
                </Button>
              </DialogClose>
              <Button
                onClick={completeOrder}
                disabled={processing || (paymentMethod === 'CASH' && customerPaymentValue < totalAmount)}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                {processing ? "Đang Xử Lý..." : "Xác Nhận Thanh Toán"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Barcode Scanner */}
        <BarcodeScanner
          open={scannerOpen}
          onClose={closeScanner}
          onScan={handleScan}
          title="Quét mã sản phẩm"
          description="Đưa camera đến mã vạch sản phẩm để thêm vào giỏ hàng"
          allowManualInput
        />
      </div>
    </div >
  )
}
