/**
 * Cache Service
 * Manages data caching for offline usage with TTL
 */

import { offlineDB } from './database'
import { mobileFetch } from '@/lib/mobile/api-client'
import { CACHE_TTL, type CacheType } from './types'

class CacheService {
  private initialized: boolean = false

  /**
   * Initialize cache service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[CacheService] Already initialized')
      return
    }

    try {
      console.log('[CacheService] Initializing...')
      this.initialized = true
      console.log('[CacheService] ✅ Cache service initialized')
    } catch (error) {
      console.error('[CacheService] ❌ Initialization failed:', error)
    }
  }

  /**
   * Cache all data for a warehouse and shift
   */
  async cacheAll(warehouseId: string, shiftId?: string): Promise<void> {
    console.log('[CacheService] Caching all data...', { warehouseId, shiftId })

    try {
      // Cache in parallel for speed
      await Promise.all([
        this.cacheRecipes(warehouseId),
        this.cacheStock(warehouseId),
        this.cachePromotions(),
        shiftId ? this.cacheShiftSession(shiftId) : Promise.resolve(),
      ])

      console.log('[CacheService] ✅ All data cached successfully')
    } catch (error) {
      console.error('[CacheService] Error caching all data:', error)
      throw error
    }
  }

  /**
   * Cache recipes for a warehouse
   */
  async cacheRecipes(warehouseId: string): Promise<void> {
    try {
      console.log('[CacheService] Fetching recipes for warehouse:', warehouseId)

      // Fetch from API
      const response = await mobileFetch(`/api/recipes?warehouseId=${warehouseId}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch recipes')
      }

      // Transform and cache
      const recipes = result.data.map((recipe: any) => ({
        id: recipe.id,
        name: recipe.name,
        price: recipe.price,
        category_id: recipe.category_id,
        category_name: recipe.category?.name || null,
        warehouse_id: warehouseId,
        recipe_ingredients: recipe.recipe_ingredients || [],
        barcode: recipe.barcode,
        image_url: recipe.image_url,
        is_active: recipe.is_active ?? true,
      }))

      await offlineDB.cacheRecipes(warehouseId, recipes)

      // Update metadata
      await offlineDB.setMetadata('last_recipes_sync', Date.now().toString())
      await offlineDB.setMetadata('last_recipes_warehouse', warehouseId)

      console.log(`[CacheService] ✅ Cached ${recipes.length} recipes`)
    } catch (error) {
      console.error('[CacheService] Error caching recipes:', error)
      throw error
    }
  }

  /**
   * Cache stock for a warehouse
   */
  async cacheStock(warehouseId: string): Promise<void> {
    try {
      console.log('[CacheService] Fetching stock for warehouse:', warehouseId)

      // Fetch from API
      const response = await mobileFetch(`/api/stock?warehouseId=${warehouseId}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch stock')
      }

      // Transform and cache
      const stock = result.data.map((item: any) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        product_name: item.product?.name || '',
        unit: item.product?.unit?.name || '',
      }))

      await offlineDB.cacheStock(warehouseId, stock)

      // Update metadata
      await offlineDB.setMetadata('last_stock_sync', Date.now().toString())
      await offlineDB.setMetadata('last_stock_warehouse', warehouseId)

      console.log(`[CacheService] ✅ Cached ${stock.length} stock items`)
    } catch (error) {
      console.error('[CacheService] Error caching stock:', error)
      throw error
    }
  }

  /**
   * Cache active promotions
   */
  async cachePromotions(): Promise<void> {
    try {
      console.log('[CacheService] Fetching promotions...')

      // Fetch from API
      const response = await mobileFetch('/api/promotions?status=active')
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch promotions')
      }

      // Transform and cache
      const promotions = result.data.map((promo: any) => ({
        id: promo.id,
        name: promo.name,
        type: 'PROMOTION',
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        min_order_value: promo.min_order_value,
        start_date: promo.start_date,
        end_date: promo.end_date,
        data: {
          products: promo.promotion_products || [],
          gifts: promo.promotion_gifts || [],
          warehouses: promo.promotion_warehouses || [],
        },
      }))

      await offlineDB.cachePromotions(promotions)

      // Update metadata
      await offlineDB.setMetadata('last_promotions_sync', Date.now().toString())

      console.log(`[CacheService] ✅ Cached ${promotions.length} promotions`)
    } catch (error) {
      console.error('[CacheService] Error caching promotions:', error)
      throw error
    }
  }

  /**
   * Cache a shift session
   */
  async cacheShiftSession(shiftId: string): Promise<void> {
    try {
      console.log('[CacheService] Fetching shift session:', shiftId)

      // Fetch from API
      const response = await mobileFetch(`/api/shifts/${shiftId}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch shift')
      }

      // Cache shift
      await offlineDB.cacheShift(result.data)

      // Update metadata
      await offlineDB.setMetadata('last_shift_sync', Date.now().toString())
      await offlineDB.setMetadata('last_shift_id', shiftId)

      console.log('[CacheService] ✅ Cached shift session')
    } catch (error) {
      console.error('[CacheService] Error caching shift:', error)
      throw error
    }
  }

  /**
   * Check if cache is expired for a given type
   */
  async isCacheExpired(type: CacheType): Promise<boolean> {
    try {
      const lastSyncKey = `last_${type}_sync`
      const lastSyncStr = await offlineDB.getMetadata(lastSyncKey)

      if (!lastSyncStr) {
        // Never synced
        return true
      }

      const lastSync = parseInt(lastSyncStr)
      const now = Date.now()
      const ttl = CACHE_TTL[type]

      const isExpired = (now - lastSync) > ttl

      if (isExpired) {
        console.log(`[CacheService] Cache expired for ${type}: ${((now - lastSync) / 1000 / 60).toFixed(1)} minutes old`)
      }

      return isExpired
    } catch (error) {
      console.error('[CacheService] Error checking cache expiry:', error)
      return true // Assume expired on error
    }
  }

  /**
   * Refresh expired caches
   */
  async refreshExpiredCaches(warehouseId: string, shiftId?: string): Promise<void> {
    console.log('[CacheService] Checking for expired caches...')

    const tasks: Promise<void>[] = []

    // Check and refresh recipes
    if (await this.isCacheExpired('recipes')) {
      console.log('[CacheService] Recipes cache expired - refreshing')
      tasks.push(this.cacheRecipes(warehouseId))
    }

    // Check and refresh stock
    if (await this.isCacheExpired('stock')) {
      console.log('[CacheService] Stock cache expired - refreshing')
      tasks.push(this.cacheStock(warehouseId))
    }

    // Check and refresh promotions
    if (await this.isCacheExpired('promotions')) {
      console.log('[CacheService] Promotions cache expired - refreshing')
      tasks.push(this.cachePromotions())
    }

    // Check and refresh shift
    if (shiftId && await this.isCacheExpired('shifts')) {
      console.log('[CacheService] Shift cache expired - refreshing')
      tasks.push(this.cacheShiftSession(shiftId))
    }

    if (tasks.length === 0) {
      console.log('[CacheService] All caches are fresh')
      return
    }

    // Refresh in parallel
    await Promise.all(tasks)
    console.log('[CacheService] ✅ Expired caches refreshed')
  }

  /**
   * Get cache status for all types
   */
  async getCacheStatus(): Promise<{
    recipes: { synced: boolean; lastSync: Date | null; expired: boolean }
    stock: { synced: boolean; lastSync: Date | null; expired: boolean }
    promotions: { synced: boolean; lastSync: Date | null; expired: boolean }
    shifts: { synced: boolean; lastSync: Date | null; expired: boolean }
  }> {
    const getCacheInfo = async (type: CacheType) => {
      const lastSyncStr = await offlineDB.getMetadata(`last_${type}_sync`)
      const lastSync = lastSyncStr ? new Date(parseInt(lastSyncStr)) : null
      const expired = await this.isCacheExpired(type)

      return {
        synced: !!lastSyncStr,
        lastSync,
        expired,
      }
    }

    const [recipes, stock, promotions, shifts] = await Promise.all([
      getCacheInfo('recipes'),
      getCacheInfo('stock'),
      getCacheInfo('promotions'),
      getCacheInfo('shifts'),
    ])

    return { recipes, stock, promotions, shifts }
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    console.log('[CacheService] Clearing all caches...')

    try {
      // This would require adding clearAll methods to database
      // For now, just clear metadata
      await offlineDB.setMetadata('last_recipes_sync', '0')
      await offlineDB.setMetadata('last_stock_sync', '0')
      await offlineDB.setMetadata('last_promotions_sync', '0')
      await offlineDB.setMetadata('last_shift_sync', '0')

      console.log('[CacheService] ✅ All caches cleared')
    } catch (error) {
      console.error('[CacheService] Error clearing caches:', error)
      throw error
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService()
