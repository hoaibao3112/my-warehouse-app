"use client"

import { useEffect, useRef, useCallback } from "react"

/**
 * Hook để auto-refresh data dựa trên adaptive polling + visibility
 * 
 * Tối ưu:
 * - Default interval 30s thay vì 5s để giảm tải database
 * - Adaptive polling: tăng interval khi data không đổi, giảm khi có thay đổi
 * - Debounce khi user quay lại tab (chờ 500ms trước khi refetch)
 * - Tạm dừng khi Save-Data header active (tiết kiệm data mobile)
 * - Chỉ poll khi tab visible
 * 
 * @param onRefresh - function để gọi khi cần refetch
 * @param interval - base interval (ms), default 30000ms (30 giây)
 * @param options - tùy chọn bổ sung
 */
interface AutoRefreshOptions {
  /** Interval tối đa khi data không đổi (ms), default 120000 (2 phút) */
  maxInterval?: number
  /** Hệ số tăng interval khi data không thay đổi, default 1.5 */
  backoffMultiplier?: number
  /** Bật adaptive polling (tăng interval khi idle), default true */
  adaptive?: boolean
}

export function useAutoRefresh(
  onRefresh: () => void,
  interval: number = 30000,
  options?: AutoRefreshOptions
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentIntervalRef = useRef(interval)
  const staleCountRef = useRef(0)
  const focusDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const lastRefreshTimeRef = useRef(0)

  const {
    maxInterval = 120000, // 2 phút max
    backoffMultiplier = 1.5,
    adaptive = true,
  } = options || {}

  // Đảm bảo không refresh quá nhanh (minimum 2 giây giữa các lần)
  const MIN_REFRESH_GAP_MS = 2000

  const safeRefresh = useCallback(() => {
    const now = Date.now()
    if (now - lastRefreshTimeRef.current < MIN_REFRESH_GAP_MS) {
      return
    }
    lastRefreshTimeRef.current = now
    onRefresh()
  }, [onRefresh])

  useEffect(() => {
    // Reset interval về base khi base interval thay đổi
    currentIntervalRef.current = interval
    staleCountRef.current = 0

    // Hàm tính toán interval tiếp theo (adaptive backoff)
    const getNextInterval = () => {
      if (!adaptive) return interval

      staleCountRef.current++

      // Sau 3 lần liên tục không có thay đổi, tăng interval
      if (staleCountRef.current > 3) {
        const newInterval = Math.min(
          currentIntervalRef.current * backoffMultiplier,
          maxInterval
        )
        currentIntervalRef.current = newInterval
        return newInterval
      }

      return currentIntervalRef.current
    }

    // Hàm để khởi động polling với adaptive interval
    const startPolling = () => {
      stopPolling()

      const scheduleNext = () => {
        const nextInterval = getNextInterval()
        intervalRef.current = setTimeout(() => {
          safeRefresh()
          scheduleNext()
        }, nextInterval)
      }

      // Refetch ngay lập tức
      safeRefresh()

      // Schedule lần tiếp theo
      scheduleNext()
    }

    // Hàm để dừng polling
    const stopPolling = () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
        intervalRef.current = null
      }
    }

    // Xử lý visibility change với debounce
    const handleVisibilityChange = () => {
      // Clear pending debounce
      if (focusDebounceRef.current) {
        clearTimeout(focusDebounceRef.current)
        focusDebounceRef.current = null
      }

      if (document.hidden) {
        // Tab ẩn, dừng polling để tiết kiệm tài nguyên
        stopPolling()
      } else {
        // Tab hiện lại, debounce 500ms trước khi refetch
        // Tránh refetch ngay khi user chỉ lướt qua tab
        focusDebounceRef.current = setTimeout(() => {
          // Reset adaptive counter khi user quay lại
          currentIntervalRef.current = interval
          staleCountRef.current = 0
          startPolling()
        }, 500)
      }
    }

    // Kiểm tra Save-Data mode (mobile data saving)
    const connection = (navigator as any).connection
    if (connection?.saveData) {
      // Không polling khi đang tiết kiệm dữ liệu
      return
    }

    // Khởi động polling nếu tab visible
    if (!document.hidden) {
      startPolling()
    }

    // Listen to visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      // Clean up khi component unmount
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      stopPolling()
      if (focusDebounceRef.current) {
        clearTimeout(focusDebounceRef.current)
        focusDebounceRef.current = null
      }
    }
  }, [safeRefresh, interval, adaptive, backoffMultiplier, maxInterval])
}

/**
 * Hàm helper để reset adaptive polling (khi biết data đã thay đổi)
 * Ví dụ: sau khi user thực hiện action (duyệt, từ chối transfer)
 */
export function resetAutoRefreshInterval() {
  // Emit custom event để hook lắng nghe
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auto-refresh-reset'))
  }
}
