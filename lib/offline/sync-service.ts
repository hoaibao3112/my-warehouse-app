/**
 * Sync Service for Offline Orders
 * Automatically syncs pending orders when online
 */

import { networkMonitor } from './network-monitor'
import { offlineDB } from './database'
import { mobileFetch } from '@/lib/mobile/api-client'
import { toast } from 'sonner'
import type { PendingOrder, SyncResult, SyncError, ConflictType } from './types'

const MAX_SYNC_ATTEMPTS = 5
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] // Exponential backoff in ms
const BACKGROUND_SYNC_INTERVAL = 2 * 60 * 1000 // 2 minutes
const MIN_SYNC_INTERVAL = 10 * 1000 // 10 seconds (rate limit)

class SyncService {
  private syncInProgress: boolean = false
  private syncTimer: NodeJS.Timeout | null = null
  private lastSyncTime: number = 0
  private initialized: boolean = false

  /**
   * Initialize sync service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[SyncService] Already initialized')
      return
    }

    try {
      console.log('[SyncService] Initializing sync service...')

      // Subscribe to network status changes
      networkMonitor.subscribe((isOnline) => {
        if (isOnline) {
          console.log('[SyncService] Network online - starting background sync')
          this.startBackgroundSync()
        } else {
          console.log('[SyncService] Network offline - stopping background sync')
          this.stopBackgroundSync()
        }
      })

      // Start background sync if already online
      if (networkMonitor.getStatus()) {
        this.startBackgroundSync()
      }

      this.initialized = true
      console.log('[SyncService] ✅ Sync service initialized')
    } catch (error) {
      console.error('[SyncService] ❌ Initialization failed:', error)
    }
  }

  /**
   * Start background sync timer
   */
  private startBackgroundSync(): void {
    // Stop existing timer
    this.stopBackgroundSync()

    console.log(`[SyncService] Starting background sync (interval: ${BACKGROUND_SYNC_INTERVAL / 1000}s)`)

    // Sync immediately
    this.triggerSync()

    // Set up recurring sync
    this.syncTimer = setInterval(() => {
      this.triggerSync()
    }, BACKGROUND_SYNC_INTERVAL)
  }

  /**
   * Stop background sync timer
   */
  private stopBackgroundSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
      console.log('[SyncService] Stopped background sync')
    }
  }

  /**
   * Trigger sync (with rate limiting)
   */
  async triggerSync(): Promise<void> {
    // Check if sync already in progress
    if (this.syncInProgress) {
      console.log('[SyncService] Sync already in progress - skipping')
      return
    }

    // Rate limiting: prevent sync spam
    const now = Date.now()
    const timeSinceLastSync = now - this.lastSyncTime

    if (timeSinceLastSync < MIN_SYNC_INTERVAL) {
      console.log(`[SyncService] Rate limited - last sync was ${timeSinceLastSync}ms ago`)
      return
    }

    // Check if online
    if (!networkMonitor.getStatus()) {
      console.log('[SyncService] Offline - skipping sync')
      return
    }

    // Check if there are pending orders
    const pendingCount = await offlineDB.getPendingOrdersCount()

    if (pendingCount === 0) {
      console.log('[SyncService] No pending orders to sync')
      return
    }

    console.log(`[SyncService] Triggering sync for ${pendingCount} pending orders`)

    // Execute sync
    await this.syncAll()
  }

  /**
   * Sync all pending orders
   */
  async syncAll(): Promise<SyncResult> {
    if (!networkMonitor.getStatus()) {
      throw new Error('No network connection')
    }

    this.syncInProgress = true
    this.lastSyncTime = Date.now()

    let successCount = 0
    let failCount = 0
    const errors: SyncError[] = []

    try {
      const pendingOrders = await offlineDB.getPendingOrders()

      if (pendingOrders.length === 0) {
        console.log('[SyncService] No pending orders to sync')
        this.syncInProgress = false
        return { success: 0, failed: 0, errors: [] }
      }

      console.log(`[SyncService] 🔄 Syncing ${pendingOrders.length} orders...`)
      toast.loading(`Đang đồng bộ ${pendingOrders.length} đơn hàng...`, { id: 'sync' })

      // Sync orders sequentially
      for (const order of pendingOrders) {
        try {
          // Mark as syncing
          await offlineDB.updateOrderSyncStatus(order.id, 'syncing')

          // Sync order
          const result = await this.syncOrder(order)

          if (result.success) {
            // Mark as synced
            await offlineDB.updateOrderSyncStatus(order.id, 'synced', {
              server_invoice_id: result.data.invoice_id,
              server_invoice_number: result.data.invoice_number,
            })

            successCount++
            console.log(`[SyncService] ✅ Synced order ${order.temp_invoice_number} → ${result.data.invoice_number}`)
          } else {
            throw new Error(result.error || 'Unknown error')
          }
        } catch (error: any) {
          console.error(`[SyncService] ❌ Failed to sync order ${order.temp_invoice_number}:`, error)

          // Determine conflict type
          const conflictType = this.getConflictType(error)

          // Increment sync attempts
          await offlineDB.incrementSyncAttempts(order.id, error.message)

          failCount++
          errors.push({
            order_id: order.id,
            temp_invoice_number: order.temp_invoice_number,
            error_type: conflictType,
            error_message: error.message,
            details: error.details,
          })

          // Schedule retry if not max attempts
          if (order.sync_attempts + 1 < MAX_SYNC_ATTEMPTS) {
            const delay = RETRY_DELAYS[order.sync_attempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
            console.log(`[SyncService] Scheduling retry for order ${order.id} in ${delay}ms`)
            setTimeout(() => this.triggerSync(), delay)
          }
        }
      }

      // Show results
      if (successCount > 0 && failCount === 0) {
        toast.success(`Đã đồng bộ thành công ${successCount} đơn hàng`, { id: 'sync' })
      } else if (failCount > 0) {
        const errorMessages = errors.slice(0, 3).map(e => `${e.temp_invoice_number}: ${this.getErrorMessage(e.error_type)}`).join('\n')

        toast.error(`Đồng bộ: ${successCount} thành công, ${failCount} thất bại`, {
          id: 'sync',
          description: errorMessages,
          duration: 10000,
        })
      }

      console.log(`[SyncService] Sync complete: ${successCount} success, ${failCount} failed`)

      return { success: successCount, failed: failCount, errors }
    } catch (error) {
      console.error('[SyncService] Sync error:', error)
      toast.error('Lỗi đồng bộ', { id: 'sync' })
      return { success: successCount, failed: failCount, errors }
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Sync a single order
   */
  private async syncOrder(order: PendingOrder): Promise<any> {
    try {
      // Prepare payload
      const payload = {
        items: order.items,
        voucher_id: order.voucher_id,
        promotion_id: order.promotion_id,
        gift_promotion_id: order.gift_promotion_id,
        discount_amount: order.discount_amount,
        total_amount: order.total_amount,
        customer_payment: order.customer_payment,
        change: order.change_amount,
        payment_method: order.payment_method,
        ewallet_type: order.ewallet_type,
        offline_order_id: order.id, // Track original offline order
        offline_created_at: order.created_at,
      }

      // Send to server
      const response = await mobileFetch('/api/sales/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      // Handle conflicts (HTTP 409)
      if (response.status === 409) {
        const errorData = await response.json()
        const error: any = new Error(errorData.error)
        error.details = errorData.details
        error.status = 409
        throw error
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      // Parse result
      const result = await response.json()

      return result
    } catch (error: any) {
      // Re-throw with additional context
      throw error
    }
  }

  /**
   * Get conflict type from error
   */
  private getConflictType(error: any): ConflictType {
    if (error.status === 409) {
      // Server returned a conflict
      if (error.message.includes('INVENTORY_SHORTAGE')) return 'INVENTORY_SHORTAGE'
      if (error.message.includes('SHIFT_CLOSED')) return 'SHIFT_CLOSED'
      if (error.message.includes('VOUCHER_USED')) return 'VOUCHER_USED'
    }

    if (error.message.includes('Network') || error.message.includes('fetch')) {
      return 'NETWORK_ERROR'
    }

    return 'UNKNOWN_ERROR'
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(errorType: ConflictType): string {
    const messages: Record<ConflictType, string> = {
      INVENTORY_SHORTAGE: 'Không đủ tồn kho',
      SHIFT_CLOSED: 'Ca làm việc đã đóng',
      VOUCHER_USED: 'Voucher đã được sử dụng',
      NETWORK_ERROR: 'Lỗi kết nối mạng',
      UNKNOWN_ERROR: 'Lỗi không xác định',
    }

    return messages[errorType] || 'Lỗi không xác định'
  }

  /**
   * Manual sync trigger (for user button)
   */
  async manualSync(): Promise<SyncResult> {
    console.log('[SyncService] Manual sync triggered by user')

    if (!networkMonitor.getStatus()) {
      toast.error('Không có kết nối mạng')
      throw new Error('No network connection')
    }

    return this.syncAll()
  }

  /**
   * Get sync status
   */
  isSyncing(): boolean {
    return this.syncInProgress
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopBackgroundSync()
    this.initialized = false
    console.log('[SyncService] Destroyed')
  }
}

// Export singleton instance
export const syncService = new SyncService()
