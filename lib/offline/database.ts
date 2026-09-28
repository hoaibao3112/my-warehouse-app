/**
 * SQLite Database Wrapper for Offline POS System
 * Using @capacitor-community/sqlite for cross-platform storage
 */

import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { Capacitor } from '@capacitor/core'
import { v4 as uuidv4 } from 'uuid'
import { getAllTableSchemas, TABLE_NAMES } from './sql-schema'
import type {
  OfflineRecipe,
  OfflineStock,
  OfflinePromotion,
  OfflineShift,
  PendingOrder,
  SyncMetadata,
  CachedReceipt,
  StorageQuota,
  DBResult,
  OrderItem,
} from './types'

const DB_NAME = 'warehouse_offline'
const DB_VERSION = 1

class OfflineDatabase {
  private sqliteConnection: SQLiteConnection | null = null
  private db: SQLiteDBConnection | null = null
  private initialized: boolean = false

  /**
   * Initialize SQLite database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[OfflineDB] Already initialized')
      return
    }

    try {
      // Check if running on native platform
      const platform = Capacitor.getPlatform()
      console.log('[OfflineDB] Platform:', platform)

      // SQLite only works on native platforms (iOS, Android)
      // For web, we'll use a mock/fallback (localStorage or skip)
      if (platform === 'web') {
        console.warn('[OfflineDB] ⚠️ Running on web - SQLite not available. Offline features disabled.')
        console.warn('[OfflineDB] ⚠️ Use mobile app (Android/iOS) for full offline support.')
        this.initialized = true // Mark as initialized to prevent errors
        return
      }

      console.log('[OfflineDB] Initializing SQLite database...')

      // Create SQLite connection
      this.sqliteConnection = new SQLiteConnection(CapacitorSQLite)

      // Open or create database
      this.db = await this.sqliteConnection.createConnection(
        DB_NAME,
        false, // encrypted
        'no-encryption',
        DB_VERSION,
        false // readonly
      )

      await this.db.open()
      console.log('[OfflineDB] Database opened successfully')

      // Create tables
      await this.createTables()

      this.initialized = true
      console.log('[OfflineDB] ✅ Initialization complete')
    } catch (error) {
      console.error('[OfflineDB] ❌ Initialization failed:', error)
      // Don't throw - just log and mark as initialized to prevent cascade errors
      this.initialized = true
    }
  }

  /**
   * Create all tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const schemas = getAllTableSchemas()

      for (const schema of schemas) {
        await this.db.execute(schema)
      }

      console.log('[OfflineDB] All tables created successfully')
    } catch (error) {
      console.error('[OfflineDB] Error creating tables:', error)
      throw error
    }
  }

  /**
   * Execute a query
   */
  private async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      // Silent on web - no need to spam console
      return []
    }

    try {
      const result = await this.db.query(sql, params)
      return result.values || []
    } catch (error) {
      console.error('[OfflineDB] Query error:', { sql, params, error })
      return []
    }
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   */
  private async execute(sql: string, params: any[] = []): Promise<any> {
    if (!this.db) {
      // Silent on web - no need to spam console
      return null
    }

    try {
      const result = await this.db.run(sql, params)
      return result
    } catch (error) {
      console.error('[OfflineDB] Execute error:', { sql, params, error })
      return null
    }
  }

  // ========================================
  // CACHE METHODS - RECIPES
  // ========================================

  /**
   * Cache recipes for a warehouse
   */
  async cacheRecipes(warehouseId: string, recipes: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const now = Date.now()

      // Clear existing recipes for this warehouse
      await this.execute(
        `DELETE FROM ${TABLE_NAMES.RECIPES} WHERE warehouse_id = ?`,
        [warehouseId]
      )

      // Insert new recipes
      for (const recipe of recipes) {
        await this.execute(
          `INSERT INTO ${TABLE_NAMES.RECIPES} (
            id, name, price, category_id, category_name, warehouse_id,
            recipe_ingredients, barcode, image_url, is_active, cached_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipe.id,
            recipe.name,
            recipe.price,
            recipe.category_id || null,
            recipe.category_name || null,
            warehouseId,
            JSON.stringify(recipe.recipe_ingredients || []),
            recipe.barcode || null,
            recipe.image_url || null,
            recipe.is_active ? 1 : 0,
            now,
          ]
        )
      }

      console.log(`[OfflineDB] Cached ${recipes.length} recipes for warehouse ${warehouseId}`)
    } catch (error) {
      console.error('[OfflineDB] Error caching recipes:', error)
      throw error
    }
  }

  /**
   * Get cached recipes for a warehouse
   */
  async getRecipes(warehouseId: string): Promise<OfflineRecipe[]> {
    try {
      const rows = await this.query<any>(
        `SELECT * FROM ${TABLE_NAMES.RECIPES} WHERE warehouse_id = ? AND is_active = 1`,
        [warehouseId]
      )

      return rows.map(row => ({
        id: row.id,
        name: row.name,
        price: row.price,
        category_id: row.category_id,
        category_name: row.category_name,
        warehouse_id: row.warehouse_id,
        recipe_ingredients: JSON.parse(row.recipe_ingredients || '[]'),
        barcode: row.barcode,
        image_url: row.image_url,
        is_active: row.is_active === 1,
        cached_at: row.cached_at,
      }))
    } catch (error) {
      console.error('[OfflineDB] Error getting recipes:', error)
      return []
    }
  }

  // ========================================
  // CACHE METHODS - STOCK
  // ========================================

  /**
   * Cache stock for a warehouse
   */
  async cacheStock(warehouseId: string, stock: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const now = Date.now()

      // Clear existing stock for this warehouse
      await this.execute(
        `DELETE FROM ${TABLE_NAMES.STOCK} WHERE warehouse_id = ?`,
        [warehouseId]
      )

      // Insert new stock
      for (const item of stock) {
        await this.execute(
          `INSERT INTO ${TABLE_NAMES.STOCK} (
            id, warehouse_id, product_id, quantity, product_name, unit, cached_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `${warehouseId}-${item.product_id}`,
            warehouseId,
            item.product_id,
            item.quantity,
            item.product_name || '',
            item.unit || '',
            now,
          ]
        )
      }

      console.log(`[OfflineDB] Cached ${stock.length} stock items for warehouse ${warehouseId}`)
    } catch (error) {
      console.error('[OfflineDB] Error caching stock:', error)
      throw error
    }
  }

  /**
   * Get cached stock for a warehouse
   */
  async getStock(warehouseId: string): Promise<OfflineStock[]> {
    try {
      const rows = await this.query<any>(
        `SELECT * FROM ${TABLE_NAMES.STOCK} WHERE warehouse_id = ?`,
        [warehouseId]
      )

      return rows.map(row => ({
        id: row.id,
        warehouse_id: row.warehouse_id,
        product_id: row.product_id,
        quantity: row.quantity,
        product_name: row.product_name,
        unit: row.unit,
        cached_at: row.cached_at,
      }))
    } catch (error) {
      console.error('[OfflineDB] Error getting stock:', error)
      return []
    }
  }

  // ========================================
  // CACHE METHODS - PROMOTIONS
  // ========================================

  /**
   * Cache promotions
   */
  async cachePromotions(promotions: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const now = Date.now()

      // Clear existing promotions
      await this.execute(`DELETE FROM ${TABLE_NAMES.PROMOTIONS}`)

      // Insert new promotions
      for (const promo of promotions) {
        await this.execute(
          `INSERT INTO ${TABLE_NAMES.PROMOTIONS} (
            id, name, type, discount_type, discount_value, min_order_value,
            start_date, end_date, data, cached_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            promo.id,
            promo.name,
            promo.type || 'PROMOTION',
            promo.discount_type,
            promo.discount_value || null,
            promo.min_order_value || null,
            promo.start_date ? new Date(promo.start_date).getTime() : null,
            promo.end_date ? new Date(promo.end_date).getTime() : null,
            JSON.stringify(promo.data || {}),
            now,
          ]
        )
      }

      console.log(`[OfflineDB] Cached ${promotions.length} promotions`)
    } catch (error) {
      console.error('[OfflineDB] Error caching promotions:', error)
      throw error
    }
  }

  /**
   * Get cached promotions
   */
  async getPromotions(): Promise<OfflinePromotion[]> {
    try {
      const rows = await this.query<any>(`SELECT * FROM ${TABLE_NAMES.PROMOTIONS}`)

      return rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        discount_type: row.discount_type,
        discount_value: row.discount_value,
        min_order_value: row.min_order_value,
        start_date: row.start_date,
        end_date: row.end_date,
        data: JSON.parse(row.data || '{}'),
        cached_at: row.cached_at,
      }))
    } catch (error) {
      console.error('[OfflineDB] Error getting promotions:', error)
      return []
    }
  }

  // ========================================
  // CACHE METHODS - SHIFTS
  // ========================================

  /**
   * Cache a shift session
   */
  async cacheShift(shift: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const now = Date.now()

      // Upsert shift
      await this.execute(
        `INSERT OR REPLACE INTO ${TABLE_NAMES.SHIFTS} (
          id, user_id, warehouse_id, session_date, status, initial_cash,
          total_orders, total_revenue, total_discount,
          cash_orders, transfer_orders, ewallet_orders,
          cash_total, transfer_total, ewallet_total,
          vouchers_used, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shift.id,
          shift.user_id,
          shift.warehouse_id,
          shift.session_date,
          shift.status,
          shift.initial_cash || 0,
          shift.total_orders || 0,
          shift.total_revenue || 0,
          shift.total_discount || 0,
          shift.cash_orders || 0,
          shift.transfer_orders || 0,
          shift.ewallet_orders || 0,
          shift.cash_total || 0,
          shift.transfer_total || 0,
          shift.ewallet_total || 0,
          shift.vouchers_used || 0,
          now,
        ]
      )

      console.log(`[OfflineDB] Cached shift ${shift.id}`)
    } catch (error) {
      console.error('[OfflineDB] Error caching shift:', error)
      throw error
    }
  }

  /**
   * Get cached shift
   */
  async getShift(shiftId: string): Promise<OfflineShift | null> {
    try {
      const rows = await this.query<any>(
        `SELECT * FROM ${TABLE_NAMES.SHIFTS} WHERE id = ?`,
        [shiftId]
      )

      if (rows.length === 0) return null

      const row = rows[0]
      return {
        id: row.id,
        user_id: row.user_id,
        warehouse_id: row.warehouse_id,
        session_date: row.session_date,
        status: row.status,
        initial_cash: row.initial_cash,
        total_orders: row.total_orders,
        total_revenue: row.total_revenue,
        total_discount: row.total_discount,
        cash_orders: row.cash_orders,
        transfer_orders: row.transfer_orders,
        ewallet_orders: row.ewallet_orders,
        cash_total: row.cash_total,
        transfer_total: row.transfer_total,
        ewallet_total: row.ewallet_total,
        vouchers_used: row.vouchers_used,
        cached_at: row.cached_at,
      }
    } catch (error) {
      console.error('[OfflineDB] Error getting shift:', error)
      return null
    }
  }

  /**
   * Update shift statistics (optimistic update while offline)
   */
  async updateShiftStats(shiftId: string, updates: Partial<OfflineShift>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const fields: string[] = []
      const values: any[] = []

      if (updates.total_orders !== undefined) {
        fields.push('total_orders = total_orders + ?')
        values.push(updates.total_orders)
      }
      if (updates.total_revenue !== undefined) {
        fields.push('total_revenue = total_revenue + ?')
        values.push(updates.total_revenue)
      }
      if (updates.total_discount !== undefined) {
        fields.push('total_discount = total_discount + ?')
        values.push(updates.total_discount)
      }
      if (updates.cash_orders !== undefined) {
        fields.push('cash_orders = cash_orders + ?')
        values.push(updates.cash_orders)
      }
      if (updates.transfer_orders !== undefined) {
        fields.push('transfer_orders = transfer_orders + ?')
        values.push(updates.transfer_orders)
      }
      if (updates.ewallet_orders !== undefined) {
        fields.push('ewallet_orders = ewallet_orders + ?')
        values.push(updates.ewallet_orders)
      }
      if (updates.cash_total !== undefined) {
        fields.push('cash_total = cash_total + ?')
        values.push(updates.cash_total)
      }
      if (updates.transfer_total !== undefined) {
        fields.push('transfer_total = transfer_total + ?')
        values.push(updates.transfer_total)
      }
      if (updates.ewallet_total !== undefined) {
        fields.push('ewallet_total = ewallet_total + ?')
        values.push(updates.ewallet_total)
      }
      if (updates.vouchers_used !== undefined) {
        fields.push('vouchers_used = vouchers_used + ?')
        values.push(updates.vouchers_used)
      }

      if (fields.length === 0) return

      values.push(shiftId)

      await this.execute(
        `UPDATE ${TABLE_NAMES.SHIFTS} SET ${fields.join(', ')} WHERE id = ?`,
        values
      )

      console.log(`[OfflineDB] Updated shift ${shiftId} stats`)
    } catch (error) {
      console.error('[OfflineDB] Error updating shift stats:', error)
      throw error
    }
  }

  // ========================================
  // PENDING ORDERS QUEUE
  // ========================================

  /**
   * Queue an order for sync
   */
  async queueOrder(orderData: Omit<PendingOrder, 'id' | 'created_at' | 'sync_status' | 'sync_attempts'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const orderId = uuidv4()
      const now = Date.now()

      await this.execute(
        `INSERT INTO ${TABLE_NAMES.PENDING_ORDERS} (
          id, temp_invoice_number, warehouse_id, shift_session_id,
          items, total_amount, discount_amount, customer_payment, change_amount,
          payment_method, ewallet_type, voucher_id, voucher_code,
          promotion_id, gift_promotion_id, notes, created_at, created_by,
          sync_status, sync_attempts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          orderData.temp_invoice_number,
          orderData.warehouse_id,
          orderData.shift_session_id || null,
          JSON.stringify(orderData.items),
          orderData.total_amount,
          orderData.discount_amount,
          orderData.customer_payment,
          orderData.change_amount,
          orderData.payment_method,
          orderData.ewallet_type || null,
          orderData.voucher_id || null,
          orderData.voucher_code || null,
          orderData.promotion_id || null,
          orderData.gift_promotion_id || null,
          orderData.notes || null,
          now,
          orderData.created_by,
          'pending',
          0,
        ]
      )

      console.log(`[OfflineDB] ✅ Queued order ${orderId} (${orderData.temp_invoice_number})`)
      return orderId
    } catch (error) {
      console.error('[OfflineDB] Error queuing order:', error)
      throw error
    }
  }

  /**
   * Get all pending orders
   */
  async getPendingOrders(): Promise<PendingOrder[]> {
    try {
      const rows = await this.query<any>(
        `SELECT * FROM ${TABLE_NAMES.PENDING_ORDERS} WHERE sync_status IN ('pending', 'failed') ORDER BY created_at ASC`
      )

      return rows.map(row => ({
        id: row.id,
        temp_invoice_number: row.temp_invoice_number,
        warehouse_id: row.warehouse_id,
        shift_session_id: row.shift_session_id,
        items: JSON.parse(row.items),
        total_amount: row.total_amount,
        discount_amount: row.discount_amount,
        customer_payment: row.customer_payment,
        change_amount: row.change_amount,
        payment_method: row.payment_method,
        ewallet_type: row.ewallet_type,
        voucher_id: row.voucher_id,
        voucher_code: row.voucher_code,
        promotion_id: row.promotion_id,
        gift_promotion_id: row.gift_promotion_id,
        notes: row.notes,
        created_at: row.created_at,
        created_by: row.created_by,
        sync_status: row.sync_status,
        sync_attempts: row.sync_attempts,
        sync_error: row.sync_error,
        last_sync_attempt: row.last_sync_attempt,
        server_invoice_id: row.server_invoice_id,
        server_invoice_number: row.server_invoice_number,
      }))
    } catch (error) {
      console.error('[OfflineDB] Error getting pending orders:', error)
      return []
    }
  }

  /**
   * Get pending orders count
   */
  async getPendingOrdersCount(): Promise<number> {
    try {
      const rows = await this.query<any>(
        `SELECT COUNT(*) as count FROM ${TABLE_NAMES.PENDING_ORDERS} WHERE sync_status IN ('pending', 'failed')`
      )

      return rows[0]?.count || 0
    } catch (error) {
      console.error('[OfflineDB] Error getting pending orders count:', error)
      return 0
    }
  }

  /**
   * Get all orders (for sync status modal)
   */
  async getAllPendingOrders(): Promise<PendingOrder[]> {
    try {
      const rows = await this.query<any>(
        `SELECT * FROM ${TABLE_NAMES.PENDING_ORDERS} ORDER BY created_at DESC`
      )

      return rows.map(row => ({
        id: row.id,
        temp_invoice_number: row.temp_invoice_number,
        warehouse_id: row.warehouse_id,
        shift_session_id: row.shift_session_id,
        items: JSON.parse(row.items),
        total_amount: row.total_amount,
        discount_amount: row.discount_amount,
        customer_payment: row.customer_payment,
        change_amount: row.change_amount,
        payment_method: row.payment_method,
        ewallet_type: row.ewallet_type,
        voucher_id: row.voucher_id,
        voucher_code: row.voucher_code,
        promotion_id: row.promotion_id,
        gift_promotion_id: row.gift_promotion_id,
        notes: row.notes,
        created_at: row.created_at,
        created_by: row.created_by,
        sync_status: row.sync_status,
        sync_attempts: row.sync_attempts,
        sync_error: row.sync_error,
        last_sync_attempt: row.last_sync_attempt,
        server_invoice_id: row.server_invoice_id,
        server_invoice_number: row.server_invoice_number,
      }))
    } catch (error) {
      console.error('[OfflineDB] Error getting all pending orders:', error)
      return []
    }
  }

  /**
   * Update order sync status
   */
  async updateOrderSyncStatus(
    orderId: string,
    status: 'pending' | 'syncing' | 'synced' | 'failed',
    details?: {
      sync_error?: string
      server_invoice_id?: string
      server_invoice_number?: string
    }
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const fields = ['sync_status = ?']
      const values: any[] = [status]

      if (status === 'syncing' || status === 'failed') {
        fields.push('last_sync_attempt = ?')
        values.push(Date.now())
      }

      if (details?.sync_error) {
        fields.push('sync_error = ?')
        values.push(details.sync_error)
      }

      if (details?.server_invoice_id) {
        fields.push('server_invoice_id = ?')
        values.push(details.server_invoice_id)
      }

      if (details?.server_invoice_number) {
        fields.push('server_invoice_number = ?')
        values.push(details.server_invoice_number)
      }

      values.push(orderId)

      await this.execute(
        `UPDATE ${TABLE_NAMES.PENDING_ORDERS} SET ${fields.join(', ')} WHERE id = ?`,
        values
      )

      console.log(`[OfflineDB] Updated order ${orderId} status to ${status}`)
    } catch (error) {
      console.error('[OfflineDB] Error updating order sync status:', error)
      throw error
    }
  }

  /**
   * Increment sync attempts
   */
  async incrementSyncAttempts(orderId: string, errorMessage: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      await this.execute(
        `UPDATE ${TABLE_NAMES.PENDING_ORDERS}
         SET sync_attempts = sync_attempts + 1,
             sync_error = ?,
             last_sync_attempt = ?,
             sync_status = CASE WHEN sync_attempts >= 4 THEN 'failed' ELSE 'pending' END
         WHERE id = ?`,
        [errorMessage, Date.now(), orderId]
      )

      console.log(`[OfflineDB] Incremented sync attempts for order ${orderId}`)
    } catch (error) {
      console.error('[OfflineDB] Error incrementing sync attempts:', error)
      throw error
    }
  }

  // ========================================
  // METADATA METHODS
  // ========================================

  /**
   * Get metadata value
   */
  async getMetadata(key: string): Promise<string | null> {
    try {
      const rows = await this.query<any>(
        `SELECT value FROM ${TABLE_NAMES.SYNC_METADATA} WHERE key = ?`,
        [key]
      )

      return rows[0]?.value || null
    } catch (error) {
      console.error('[OfflineDB] Error getting metadata:', error)
      return null
    }
  }

  /**
   * Set metadata value
   */
  async setMetadata(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      await this.execute(
        `INSERT OR REPLACE INTO ${TABLE_NAMES.SYNC_METADATA} (key, value, updated_at) VALUES (?, ?, ?)`,
        [key, value, Date.now()]
      )
    } catch (error) {
      console.error('[OfflineDB] Error setting metadata:', error)
      throw error
    }
  }

  // ========================================
  // STORAGE QUOTA & CLEANUP
  // ========================================

  /**
   * Check storage quota
   */
  async checkStorageQuota(): Promise<StorageQuota> {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate()
        const used = estimate.usage || 0
        const available = estimate.quota || Infinity
        const percentage = available > 0 ? (used / available) * 100 : 0

        return { used, available, percentage }
      }

      return { used: 0, available: Infinity, percentage: 0 }
    } catch (error) {
      console.error('[OfflineDB] Error checking storage quota:', error)
      return { used: 0, available: Infinity, percentage: 0 }
    }
  }

  /**
   * Cleanup old cached receipts (keep only latest 50)
   */
  async cleanupOldReceipts(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      await this.execute(
        `DELETE FROM ${TABLE_NAMES.CACHED_RECEIPTS}
         WHERE invoice_id NOT IN (
           SELECT invoice_id FROM ${TABLE_NAMES.CACHED_RECEIPTS}
           ORDER BY created_at DESC LIMIT 50
         )`
      )

      console.log('[OfflineDB] Cleaned up old cached receipts')
    } catch (error) {
      console.error('[OfflineDB] Error cleaning up receipts:', error)
    }
  }

  /**
   * Delete synced orders
   */
  async deleteSyncedOrders(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      await this.execute(
        `DELETE FROM ${TABLE_NAMES.PENDING_ORDERS} WHERE sync_status = 'synced'`
      )

      console.log('[OfflineDB] Deleted synced orders')
    } catch (error) {
      console.error('[OfflineDB] Error deleting synced orders:', error)
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      this.initialized = false
      console.log('[OfflineDB] Database closed')
    }
  }
}

// Export singleton instance
export const offlineDB = new OfflineDatabase()
