import { createContext, useContext, useEffect, useCallback, useState } from 'react'
import { mobileFetch } from '@/lib/mobile/api-client'

interface ShiftContextValue {
  currentShift: any | null
  isLoading: boolean
  error: string | null
  refreshShift: () => Promise<void>
  checkIn: (opening_cash: number, notes?: string) => Promise<any | null>
  checkOut: (closing_cash: number, notes?: string) => Promise<any>
}

// This is a global singleton to share shift state across components
let shiftStateListener: ((state: ShiftContextValue) => void) | null = null
let globalShiftState: ShiftContextValue | null = null

export function useShiftState(): ShiftContextValue {
  const [state, setState] = useState<ShiftContextValue>({
    currentShift: null,
    isLoading: false,
    error: null,
    refreshShift: async () => {},
    checkIn: async () => null,
    checkOut: async () => null,
  })

  useEffect(() => {
    // Subscribe to global state changes
    const handleStateChange = (newState: ShiftContextValue) => {
      setState(newState)
    }

    shiftStateListener = handleStateChange

    // If global state exists, use it
    if (globalShiftState) {
      setState(globalShiftState)
    }

    return () => {
      shiftStateListener = null
    }
  }, [])

  const refreshShift = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }))
      
      // For GENERAL_MANAGER, get selected warehouse from sessionStorage
      let url = '/api/shifts/current'
      try {
        const selectedWarehouseId = sessionStorage.getItem('selectedWarehouseId')
        if (selectedWarehouseId) {
          url = `/api/shifts/current?warehouseId=${encodeURIComponent(selectedWarehouseId)}`
        }
      } catch (e) {
        // sessionStorage not available (SSR or restricted context)
      }
      
      const res = await mobileFetch(url)
      const data = await res.json()

      if (data.success && data.data) {
        const newState = { ...state, currentShift: data.data, error: null, isLoading: false }
        globalShiftState = newState
        setState(newState)
        if (shiftStateListener) shiftStateListener(newState)
      } else {
        const newState = { ...state, currentShift: null, error: data.error || null, isLoading: false }
        globalShiftState = newState
        setState(newState)
        if (shiftStateListener) shiftStateListener(newState)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch shift'
      const newState = { ...state, error: errorMsg, isLoading: false }
      globalShiftState = newState
      setState(newState)
      if (shiftStateListener) shiftStateListener(newState)
    }
  }, [state])

  const checkIn = useCallback(
    async (opening_cash: number, notes?: string) => {
      try {
        setState(prev => ({ ...prev, isLoading: true }))
        const res = await mobileFetch('/api/shifts/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opening_cash, notes })
        })

        const data = await res.json()

        if (data.success) {
          const newState = { ...state, currentShift: data.data, error: null, isLoading: false }
          globalShiftState = newState
          setState(newState)
          if (shiftStateListener) shiftStateListener(newState)
          return data.data
        } else {
          const newState = { ...state, error: data.error, isLoading: false }
          globalShiftState = newState
          setState(newState)
          if (shiftStateListener) shiftStateListener(newState)
          return null
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Check-in failed'
        const newState = { ...state, error: errorMsg, isLoading: false }
        globalShiftState = newState
        setState(newState)
        if (shiftStateListener) shiftStateListener(newState)
        return null
      }
    },
    [state]
  )

  const checkOut = useCallback(
    async (closing_cash: number, notes?: string) => {
      try {
        setState(prev => ({ ...prev, isLoading: true }))
        const res = await mobileFetch('/api/shifts/check-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ closing_cash, notes })
        })

        const data = await res.json()

        if (data.success) {
          const newState = { ...state, currentShift: data.data, error: null, isLoading: false }
          globalShiftState = newState
          setState(newState)
          if (shiftStateListener) shiftStateListener(newState)
          return data
        } else {
          const newState = { ...state, error: data.error, isLoading: false }
          globalShiftState = newState
          setState(newState)
          if (shiftStateListener) shiftStateListener(newState)
          return null
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Check-out failed'
        const newState = { ...state, error: errorMsg, isLoading: false }
        globalShiftState = newState
        setState(newState)
        if (shiftStateListener) shiftStateListener(newState)
        return null
      }
    },
    [state]
  )

  return {
    currentShift: state.currentShift,
    isLoading: state.isLoading,
    error: state.error,
    refreshShift,
    checkIn,
    checkOut
  }
}
