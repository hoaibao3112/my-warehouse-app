/**
 * Hook for Offline Database Operations
 * Provides convenient access to offline database with React state
 */

import { useState, useEffect } from 'react'
import { offlineDB } from '@/lib/offline/database'
import type {
  OfflineRecipe,
  OfflineStock,
  OfflinePromotion,
  OfflineShift,
  PendingOrder,
} from '@/lib/offline/types'

/**
 * Hook to get cached recipes
 */
export function useOfflineRecipes(warehouseId: string | null) {
  const [recipes, setRecipes] = useState<OfflineRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!warehouseId) {
      setRecipes([])
      setLoading(false)
      return
    }

    let mounted = true

    async function loadRecipes() {
      try {
        setLoading(true)
        setError(null)

        const data = await offlineDB.getRecipes(warehouseId!)

        if (mounted) {
          setRecipes(data)
        }
      } catch (err) {
        console.error('[useOfflineRecipes] Error:', err)
        if (mounted) {
          setError(err as Error)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadRecipes()

    return () => {
      mounted = false
    }
  }, [warehouseId])

  return { recipes, loading, error }
}

/**
 * Hook to get cached stock
 */
export function useOfflineStock(warehouseId: string | null) {
  const [stock, setStock] = useState<OfflineStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!warehouseId) {
      setStock([])
      setLoading(false)
      return
    }

    let mounted = true

    async function loadStock() {
      try {
        setLoading(true)
        setError(null)

        const data = await offlineDB.getStock(warehouseId!)

        if (mounted) {
          setStock(data)
        }
      } catch (err) {
        console.error('[useOfflineStock] Error:', err)
        if (mounted) {
          setError(err as Error)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadStock()

    return () => {
      mounted = false
    }
  }, [warehouseId])

  return { stock, loading, error }
}

/**
 * Hook to get cached promotions
 */
export function useOfflinePromotions() {
  const [promotions, setPromotions] = useState<OfflinePromotion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadPromotions() {
      try {
        setLoading(true)
        setError(null)

        const data = await offlineDB.getPromotions()

        if (mounted) {
          setPromotions(data)
        }
      } catch (err) {
        console.error('[useOfflinePromotions] Error:', err)
        if (mounted) {
          setError(err as Error)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadPromotions()

    return () => {
      mounted = false
    }
  }, [])

  return { promotions, loading, error }
}

/**
 * Hook to get cached shift
 */
export function useOfflineShift(shiftId: string | null) {
  const [shift, setShift] = useState<OfflineShift | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!shiftId) {
      setShift(null)
      setLoading(false)
      return
    }

    let mounted = true

    async function loadShift() {
      try {
        setLoading(true)
        setError(null)

        const data = await offlineDB.getShift(shiftId!)

        if (mounted) {
          setShift(data)
        }
      } catch (err) {
        console.error('[useOfflineShift] Error:', err)
        if (mounted) {
          setError(err as Error)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadShift()

    return () => {
      mounted = false
    }
  }, [shiftId])

  return { shift, loading, error }
}

/**
 * Hook to get all pending orders
 */
export function useAllPendingOrders() {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await offlineDB.getAllPendingOrders()
      setOrders(data)
    } catch (err) {
      console.error('[useAllPendingOrders] Error:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return { orders, loading, error, refresh }
}
