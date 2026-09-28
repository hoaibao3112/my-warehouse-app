'use client'

/**
 * Offline Context Provider
 * Global state management for offline/online status and sync progress
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { networkMonitor } from '@/lib/offline/network-monitor'
import { syncService } from '@/lib/offline/sync-service'
import { offlineDB } from '@/lib/offline/database'

interface OfflineContextValue {
  isOnline: boolean
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  pendingOrdersCount: number
  lastSyncTime: Date | null
  triggerManualSync: () => Promise<void>
  refreshPendingCount: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  /**
   * Update pending orders count
   */
  async function updatePendingCount() {
    try {
      const count = await offlineDB.getPendingOrdersCount()
      setPendingOrdersCount(count)
    } catch (error) {
      console.error('[OfflineContext] Error updating pending count:', error)
    }
  }

  /**
   * Trigger manual sync
   */
  async function triggerManualSync() {
    if (!isOnline) {
      console.log('[OfflineContext] Cannot sync - offline')
      return
    }

    if (syncStatus === 'syncing') {
      console.log('[OfflineContext] Sync already in progress')
      return
    }

    try {
      setSyncStatus('syncing')

      const result = await syncService.manualSync()

      if (result.failed === 0) {
        setSyncStatus('success')
        setLastSyncTime(new Date())
      } else {
        setSyncStatus('error')
      }

      // Update pending count
      await updatePendingCount()

      // Reset status after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch (error) {
      console.error('[OfflineContext] Manual sync error:', error)
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 5000)
    }
  }

  /**
   * Initialize on mount
   */
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    let unsubscribe: (() => void) | null = null

    async function initializeOfflineSystem() {
      console.log('[OfflineContext] Initializing...')

      // Check platform - only enable full offline system on native platforms
      const platform = Capacitor.getPlatform()
      const isNative = platform === 'android' || platform === 'ios'

      if (!isNative) {
        console.log('[OfflineContext] ⚠️ Running on web platform - offline features disabled')
        return
      }

      try {
        // Initialize database FIRST (sequential, most important)
        await offlineDB.initialize()
        console.log('[OfflineContext] ✅ Database initialized')

        // Initialize network monitor and sync service in parallel
        await Promise.all([
          networkMonitor.initialize(),
          syncService.initialize(),
        ])
        console.log('[OfflineContext] ✅ Network monitor and sync service initialized')

        // Get initial network status
        setIsOnline(networkMonitor.getStatus())

        // Subscribe to network changes
        unsubscribe = networkMonitor.subscribe((online) => {
          console.log('[OfflineContext] Network status changed:', online ? 'ONLINE' : 'OFFLINE')
          setIsOnline(online)
        })

        // Load initial pending count (now safe)
        await updatePendingCount()

        // Poll pending count every 30 seconds (only on native platforms)
        interval = setInterval(() => {
          updatePendingCount()
        }, 30000)

        console.log('[OfflineContext] ✅ Initialization complete')
      } catch (error) {
        console.error('[OfflineContext] ❌ Initialization failed:', error)
      }
    }

    initializeOfflineSystem()

    return () => {
      if (unsubscribe) unsubscribe()
      if (interval) clearInterval(interval)
    }
  }, [])

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        syncStatus,
        pendingOrdersCount,
        lastSyncTime,
        triggerManualSync,
        refreshPendingCount: updatePendingCount,
      }}
    >
      {children}
    </OfflineContext.Provider>
  )
}

/**
 * Hook to access offline context
 */
export function useOffline() {
  const context = useContext(OfflineContext)

  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider')
  }

  return context
}
