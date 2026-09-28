/**
 * Network Monitor Service
 * Detects online/offline status using @capacitor/network
 */

import { Network, ConnectionStatus } from '@capacitor/network'

type NetworkListener = (isOnline: boolean) => void

class NetworkMonitor {
  private listeners: Set<NetworkListener> = new Set()
  private isOnline: boolean = true
  private initialized: boolean = false
  private lastStatus: boolean = true
  private debounceTimer: NodeJS.Timeout | null = null
  private readonly DEBOUNCE_DELAY = 5000 // 5 seconds

  /**
   * Initialize network monitoring
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[NetworkMonitor] Already initialized')
      return
    }

    try {
      console.log('[NetworkMonitor] Initializing network monitoring...')

      // Check initial status
      const status = await Network.getStatus()
      this.isOnline = status.connected
      this.lastStatus = status.connected

      console.log('[NetworkMonitor] Initial network status:', this.isOnline ? 'ONLINE' : 'OFFLINE')

      // Listen for network status changes
      Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
        this.handleNetworkChange(status)
      })

      this.initialized = true
      console.log('[NetworkMonitor] ✅ Network monitoring initialized')
    } catch (error) {
      console.error('[NetworkMonitor] ❌ Initialization failed:', error)
      // Fallback to navigator.onLine
      this.isOnline = navigator.onLine

      // Listen to browser events as fallback
      window.addEventListener('online', () => this.handleBrowserOnline())
      window.addEventListener('offline', () => this.handleBrowserOffline())

      this.initialized = true
      console.log('[NetworkMonitor] ✅ Using browser fallback for network monitoring')
    }
  }

  /**
   * Handle network status change from Capacitor
   */
  private handleNetworkChange(status: ConnectionStatus): void {
    const wasOnline = this.isOnline
    const isNowOnline = status.connected

    console.log('[NetworkMonitor] Network status changed:', {
      was: wasOnline ? 'ONLINE' : 'OFFLINE',
      now: isNowOnline ? 'ONLINE' : 'OFFLINE',
      connectionType: status.connectionType,
    })

    // Update status
    this.isOnline = isNowOnline

    // Only trigger callbacks if status actually changed
    if (wasOnline !== isNowOnline) {
      // If going online, debounce to ensure stable connection
      if (isNowOnline) {
        this.debouncedReconnection()
      } else {
        // If going offline, trigger immediately
        this.clearDebounce()
        this.notifyListeners(false)
      }
    }
  }

  /**
   * Handle browser online event (fallback)
   */
  private handleBrowserOnline(): void {
    console.log('[NetworkMonitor] Browser online event')
    const wasOnline = this.isOnline
    this.isOnline = true

    if (!wasOnline) {
      this.debouncedReconnection()
    }
  }

  /**
   * Handle browser offline event (fallback)
   */
  private handleBrowserOffline(): void {
    console.log('[NetworkMonitor] Browser offline event')
    this.isOnline = false
    this.clearDebounce()
    this.notifyListeners(false)
  }

  /**
   * Debounced reconnection to prevent flapping
   */
  private debouncedReconnection(): void {
    // Clear existing timer
    this.clearDebounce()

    console.log(`[NetworkMonitor] Debouncing reconnection (${this.DEBOUNCE_DELAY}ms)...`)

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      // Verify still online after debounce
      if (this.isOnline) {
        console.log('[NetworkMonitor] ✅ Connection stable - triggering reconnection handlers')
        this.notifyListeners(true)
        this.handleReconnection()
      }
    }, this.DEBOUNCE_DELAY)
  }

  /**
   * Clear debounce timer
   */
  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  /**
   * Handle reconnection (trigger sync)
   */
  private async handleReconnection(): Promise<void> {
    console.log('[NetworkMonitor] Handling reconnection - triggering sync...')

    try {
      // Dynamically import sync service to avoid circular dependencies
      const { syncService } = await import('./sync-service')
      await syncService.triggerSync()
    } catch (error) {
      console.error('[NetworkMonitor] Error triggering sync on reconnection:', error)
    }
  }

  /**
   * Notify all listeners of status change
   */
  private notifyListeners(isOnline: boolean): void {
    console.log(`[NetworkMonitor] Notifying ${this.listeners.size} listeners: ${isOnline ? 'ONLINE' : 'OFFLINE'}`)

    this.listeners.forEach(listener => {
      try {
        listener(isOnline)
      } catch (error) {
        console.error('[NetworkMonitor] Error in listener:', error)
      }
    })
  }

  /**
   * Subscribe to network status changes
   * @returns Unsubscribe function
   */
  subscribe(callback: NetworkListener): () => void {
    this.listeners.add(callback)
    console.log(`[NetworkMonitor] Added listener (total: ${this.listeners.size})`)

    // Immediately notify with current status
    callback(this.isOnline)

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback)
      console.log(`[NetworkMonitor] Removed listener (total: ${this.listeners.size})`)
    }
  }

  /**
   * Get current online status
   */
  getStatus(): boolean {
    return this.isOnline
  }

  /**
   * Check network status (async, queries device)
   */
  async checkStatus(): Promise<boolean> {
    try {
      const status = await Network.getStatus()
      this.isOnline = status.connected
      return this.isOnline
    } catch (error) {
      console.error('[NetworkMonitor] Error checking status:', error)
      return navigator.onLine
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearDebounce()
    this.listeners.clear()
    this.initialized = false
    console.log('[NetworkMonitor] Destroyed')
  }
}

// Export singleton instance
export const networkMonitor = new NetworkMonitor()
