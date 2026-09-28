import { useState, useEffect, useCallback } from 'react'
import { mobileFetch } from '@/lib/mobile/api-client'

export interface ShiftSession {
  id: string
  warehouse_id: string
  user_id: string
  session_date: string
  shift_name?: string
  check_in_time?: string
  check_out_time?: string
  shift_opened_at?: string
  shift_closed_at?: string
  actual_duration?: number
  total_orders: number
  total_revenue: number
  total_discount: number
  opening_cash?: number
  closing_cash?: number
  expected_cash?: number
  cash_difference?: number
  cash_orders: number
  transfer_orders: number
  ewallet_orders: number
  transfer_total: number
  ewallet_total: number
  cash_revenue?: number
  ewallet_revenue?: number
  vouchers_used?: number
  voucher_programs?: string[]
  promotions_used?: number
  promotion_names?: string[]
  status: 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED' | 'REJECTED'
  notes?: string
  approved_by?: string
  approved_at?: string
  rejection_reason?: string
  created_at: string
  updated_at: string
  isClosedSession?: boolean // Flag to indicate session is already closed
  isVirtualShift?: boolean // Flag for virtual shift (manager/admin without actual session)
}

interface UseShiftReturn {
  currentShift: ShiftSession | null
  isLoading: boolean
  error: string | null
  lastOperationError: string | null
  clearLastOperationError: () => void
  refreshShift: () => Promise<void>
  checkIn: (opening_cash: number, notes?: string, workShiftId?: string) => Promise<ShiftSession | null>
  checkOut: (closing_cash: number, notes?: string) => Promise<any>
}

export function useShift(): UseShiftReturn {
  const [currentShift, setCurrentShift] = useState<ShiftSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOperationError, setLastOperationError] = useState<string | null>(null)

  const refreshShift = useCallback(async () => {
    try {
      setIsLoading(true)

      // CRITICAL FIX: DO NOT use sessionStorage - it causes wrong warehouse for staff
      // API will handle warehouse logic based on user role
      const url = '/api/shifts/current'

      const res = await mobileFetch(url)
      const data = await res.json()

      if (data.success && data.data) {
        setCurrentShift(data.data)
        setError(null)
      } else {
        setCurrentShift(null)
        // If success is false, there's an error message from the API
        if (data.error) {
          setError(data.error)
        } else {
          setError(null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch shift')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const checkIn = useCallback(
    async (opening_cash: number, notes?: string, workShiftId?: string): Promise<ShiftSession | null> => {
      try {
        setIsLoading(true)
        setLastOperationError(null)

        // Get GPS location - REQUIRED to verify staff is within store geofence
        let latitude, longitude, accuracy
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            })
          })
          latitude = position.coords.latitude
          longitude = position.coords.longitude
          accuracy = position.coords.accuracy
        } catch (geoErr) {
          setLastOperationError('Không thể lấy vị trí GPS. Vui lòng bật định vị và cấp quyền truy cập.')
          setIsLoading(false)
          return null
        }

        const res = await mobileFetch('/api/shifts/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opening_cash, notes, latitude, longitude, accuracy, work_shift_id: workShiftId })
        })

        const data = await res.json()

        if (data.success) {
          setCurrentShift(data.data)
          setLastOperationError(null)
          return data.data
        } else {
          setLastOperationError(data.error)
          return null
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Mở ca thất bại'
        setLastOperationError(errorMsg)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const checkOut = useCallback(
    async (closing_cash: number, notes?: string) => {
      try {
        setIsLoading(true)
        setLastOperationError(null)

        // Get GPS location - REQUIRED to verify staff is within store geofence
        let latitude, longitude, accuracy
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            })
          })
          latitude = position.coords.latitude
          longitude = position.coords.longitude
          accuracy = position.coords.accuracy
        } catch (geoErr) {
          setLastOperationError('Không thể lấy vị trí GPS. Vui lòng bật định vị và cấp quyền truy cập.')
          setIsLoading(false)
          return null
        }

        const res = await mobileFetch('/api/shifts/check-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ closing_cash, notes, latitude, longitude, accuracy })
        })

        const data = await res.json()

        if (data.success) {
          setCurrentShift(data.data)
          setLastOperationError(null)
          return data
        } else {
          setLastOperationError(data.error)
          return null
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Đóng ca thất bại'
        setLastOperationError(errorMsg)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const clearLastOperationError = useCallback(() => {
    setLastOperationError(null)
  }, [])

  useEffect(() => {
    // Load shift data once on mount
    refreshShift()

    // Auto-refresh when user returns to the page (e.g. after opening shift in another tab/page)
    const handleFocus = () => {
      console.log('[useShift] Window focused - refreshing shift data')
      refreshShift()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshShift])

  return {
    currentShift,
    isLoading,
    error,
    lastOperationError,
    clearLastOperationError,
    refreshShift,
    checkIn,
    checkOut
  }
}

