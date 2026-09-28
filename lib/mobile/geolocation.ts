import { Geolocation, Position } from '@capacitor/geolocation'
import { isNativePlatform } from './platform'

// Cache permission status to avoid repeated requests
let permissionGranted: boolean | null = null
let lastPermissionCheck = 0
const PERMISSION_CACHE_DURATION = 30000 // 30 seconds

// Mock GPS position for development (when real GPS is unavailable)
// In browser console, set localStorage.setItem('mockGpsLat', '10.xxx') and localStorage.setItem('mockGpsLng', '106.xxx')
const MOCK_GPS_ENABLED = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined'

/**
 * Get mock position from localStorage or use default
 */
function getMockPosition(): GeoPosition {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const lat = localStorage.getItem('mockGpsLat')
    const lng = localStorage.getItem('mockGpsLng')
    if (lat && lng) {
      console.log('[Geolocation] Using custom mock position from localStorage')
      return {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        accuracy: 10
      }
    }
  }
  // Default: Ho Chi Minh City center
  return {
    latitude: 10.762622,
    longitude: 106.660172,
    accuracy: 10
  }
}

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy: number
}

export interface GeoCheckResult {
  allowed: boolean
  distance: number // in meters
  position: GeoPosition | null
  error?: string
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Get current GPS position
 * Uses Capacitor Geolocation on mobile, browser API on web
 * In development mode, falls back to mock position if real GPS fails
 */
export async function getCurrentPosition(): Promise<GeoPosition> {
  if (isNativePlatform()) {
    // Mobile: Use Capacitor Geolocation
    // Check cached permission first to avoid repeated prompts
    const now = Date.now()
    if (permissionGranted !== true || now - lastPermissionCheck > PERMISSION_CACHE_DURATION) {
      try {
        const permission = await Geolocation.checkPermissions()

        if (permission.location === 'granted') {
          permissionGranted = true
          lastPermissionCheck = now
        } else if (permission.location === 'denied') {
          // Permission was explicitly denied - don't ask again
          permissionGranted = false
          throw new Error('Vui lòng cấp quyền truy cập vị trí trong cài đặt ứng dụng')
        } else {
          // Permission not determined yet - request it
          const request = await Geolocation.requestPermissions()
          if (request.location !== 'granted') {
            permissionGranted = false
            throw new Error('Vui lòng cấp quyền truy cập vị trí để chấm công')
          }
          permissionGranted = true
          lastPermissionCheck = now
        }
      } catch (permErr: any) {
        // Handle permission check errors gracefully
        console.error('[Geolocation] Permission check error:', permErr)
        throw new Error('Không thể kiểm tra quyền truy cập vị trí. Vui lòng thử lại.')
      }
    }

    // Try getting position with retry mechanism for better reliability
    let lastError: Error | null = null

    // First attempt: Low accuracy (faster, network-based)
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15000, // 15 seconds - increased for slower devices
      })
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }
    } catch (err: any) {
      console.log('[Geolocation] Low accuracy attempt failed:', err?.message)
      lastError = err
    }

    // Second attempt: High accuracy (GPS-based, may take longer)
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 25000, // 25 seconds for GPS
      })
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }
    } catch (err: any) {
      console.error('[Geolocation] High accuracy attempt failed:', err?.message)
      lastError = err
    }

    // Both attempts failed - throw a user-friendly error in Vietnamese
    const errMessage = lastError?.message || ''
    if (errMessage.toLowerCase().includes('timeout') || errMessage.toLowerCase().includes('time')) {
      throw new Error('Hết thời gian chờ lấy vị trí. Vui lòng đảm bảo GPS đang bật và thử lại.')
    } else if (errMessage.toLowerCase().includes('permission') || errMessage.toLowerCase().includes('denied')) {
      throw new Error('Vui lòng cấp quyền truy cập vị trí trong cài đặt ứng dụng')
    } else if (errMessage.toLowerCase().includes('unavailable') || errMessage.toLowerCase().includes('location')) {
      throw new Error('Không thể xác định vị trí. Vui lòng bật GPS và thử lại.')
    } else {
      throw new Error('Không thể lấy vị trí GPS. Vui lòng kiểm tra cài đặt định vị và thử lại.')
    }
  } else {
    // Web: Use browser Geolocation API
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Trình duyệt không hỗ trợ định vị GPS'))
        return
      }

      // Try with high accuracy first, then fallback to low accuracy if it fails or timeouts
      const getPosition = (highAccuracy: boolean) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            })
          },
          (error) => {
            // If high accuracy failed, try low accuracy
            if (highAccuracy && (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE)) {
              console.log('High accuracy GPS failed, converting to low accuracy...')
              getPosition(false)
              return
            }

            // In development mode, fall back to mock position if GPS is unavailable
            if (MOCK_GPS_ENABLED && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
              const mockPos = getMockPosition()
              console.warn('[Geolocation] GPS unavailable in dev mode, using mock position:', mockPos)
              resolve(mockPos)
              return
            }

            let errorMessage = 'Lỗi xác định vị trí'
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage = 'Vui lòng cấp quyền truy cập vị trí để chấm công'
                break
              case error.POSITION_UNAVAILABLE:
                errorMessage = 'Không thể xác định vị trí. Vui lòng kiểm tra GPS'
                break
              case error.TIMEOUT:
                errorMessage = 'Hết thời gian chờ xác định vị trí. Vui lòng thử lại'
                break
              default:
                errorMessage = `Lỗi GPS: ${error.message}`
            }
            reject(new Error(errorMessage))
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: highAccuracy ? 10000 : 20000, // 10s for high, 20s for low - increased for reliability
            maximumAge: 0 // Do not use cached position
          }
        )
      }

      // Start with high accuracy for better attendance validation
      // But if it fails, the error handler will fallback to low accuracy (or mock in dev)
      getPosition(true)
    })
  }
}

/**
 * Check if current position is within allowed radius of warehouse
 */
export async function checkGeoFence(
  warehouseLat: number | null | undefined,
  warehouseLng: number | null | undefined,
  allowedRadiusMeters: number = 3000
): Promise<GeoCheckResult> {
  // If warehouse has no GPS coordinates set, allow check-in (backward compatibility)
  // But still try to get current position because API might require it
  if (warehouseLat === null || warehouseLat === undefined ||
    warehouseLng === null || warehouseLng === undefined) {
    try {
      const position = await getCurrentPosition()
      return {
        allowed: true,
        distance: 0,
        position,
        error: undefined,
      }
    } catch (error) {
      // If we can't get position, return null position
      // The API will likely reject this if it requires GPS, but we can't do much else
      return {
        allowed: true,
        distance: 0,
        position: null,
        error: error instanceof Error ? error.message : 'Lỗi xác định vị trí',
      }
    }
  }

  try {
    const position = await getCurrentPosition()
    const distance = calculateDistance(
      position.latitude,
      position.longitude,
      warehouseLat,
      warehouseLng
    )

    return {
      allowed: distance <= allowedRadiusMeters,
      distance: Math.round(distance),
      position,
    }
  } catch (error) {
    return {
      allowed: false,
      distance: -1,
      position: null,
      error: error instanceof Error ? error.message : 'Lỗi xác định vị trí',
    }
  }
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 0) return 'Không xác định'
  if (meters < 1000) return `${meters}m`
  return `${(meters / 1000).toFixed(1)}km`
}
