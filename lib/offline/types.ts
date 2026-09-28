/**
 * TypeScript Types for Offline POS System
 */

// ========================================
// Recipe & Product Types
// ========================================

export interface RecipeIngredient {
  ingredient_id: string
  ingredient_name: string
  quantity_required: number
  unit: string
}

export interface OfflineRecipe {
  id: string
  name: string
  price: number
  category_id: string | null
  category_name: string | null
  warehouse_id: string
  recipe_ingredients: RecipeIngredient[]
  barcode: string | null
  image_url: string | null
  is_active: boolean
  cached_at: number
}

export interface OfflineStock {
  id: string
  warehouse_id: string
  product_id: string
  quantity: number
  product_name: string
  unit: string
  cached_at: number
}

// ========================================
// Promotion & Voucher Types
// ========================================

export type PromotionType = 'PROMOTION' | 'VOUCHER'
export type DiscountType = 'PERCENTAGE' | 'FIXED' | 'GIFT'

export interface OfflinePromotion {
  id: string
  name: string
  type: PromotionType
  discount_type: DiscountType
  discount_value: number | null
  min_order_value: number | null
  start_date: number | null
  end_date: number | null
  data: any // JSON data for gifts, voucher info, etc.
  cached_at: number
}

// ========================================
// Shift Session Types
// ========================================

export type ShiftStatus = 'IN_PROGRESS' | 'COMPLETED'

export interface OfflineShift {
  id: string
  user_id: string
  warehouse_id: string
  session_date: string
  status: ShiftStatus
  initial_cash: number
  total_orders: number
  total_revenue: number
  total_discount: number
  cash_orders: number
  transfer_orders: number
  ewallet_orders: number
  cash_total: number
  transfer_total: number
  ewallet_total: number
  vouchers_used: number
  cached_at: number
}

// ========================================
// Order Types
// ========================================

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'EWALLET'
export type EwalletType = 'MOMO' | 'ZALOPAY' | 'VIETTELPAY' | 'VIETTEL_PAY' | 'VNPAY'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface OrderItem {
  product_id: string // recipe_id
  product_name: string
  quantity: number
  unit_price: number
}

export interface PendingOrder {
  id: string // UUID
  temp_invoice_number: string // TEMP-{timestamp}-{random}
  warehouse_id: string
  shift_session_id: string | null
  items: OrderItem[]
  total_amount: number
  discount_amount: number
  customer_payment: number
  change_amount: number
  payment_method: PaymentMethod
  ewallet_type?: EwalletType
  voucher_id?: string
  voucher_code?: string
  promotion_id?: string
  gift_promotion_id?: string
  notes?: string
  created_at: number // Unix timestamp
  created_by: string
  sync_status: SyncStatus
  sync_attempts: number
  sync_error?: string
  last_sync_attempt?: number
  server_invoice_id?: string
  server_invoice_number?: string
}

// ========================================
// Sync Metadata Types
// ========================================

export interface SyncMetadata {
  key: string
  value: string
  updated_at: number
}

export type CacheType = 'recipes' | 'stock' | 'promotions' | 'shifts'

export const CACHE_TTL: Record<CacheType, number> = {
  recipes: 24 * 60 * 60 * 1000, // 24 hours
  stock: 1 * 60 * 60 * 1000,    // 1 hour (critical)
  promotions: 12 * 60 * 60 * 1000, // 12 hours
  shifts: 1 * 60 * 60 * 1000,   // 1 hour
}

// ========================================
// Receipt Types
// ========================================

export interface CachedReceipt {
  invoice_id: string
  invoice_number: string
  receipt_data: any // JSON
  created_at: number
}

// ========================================
// Sync Result Types
// ========================================

export interface SyncResult {
  success: number
  failed: number
  errors: SyncError[]
}

export interface SyncError {
  order_id: string
  temp_invoice_number: string
  error_type: ConflictType
  error_message: string
  details?: any
}

export type ConflictType = 'INVENTORY_SHORTAGE' | 'SHIFT_CLOSED' | 'VOUCHER_USED' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'

// ========================================
// Storage Quota Types
// ========================================

export interface StorageQuota {
  used: number
  available: number
  percentage: number
}

// ========================================
// Database Result Types
// ========================================

export interface DBResult {
  success: boolean
  data?: any
  error?: string
}
