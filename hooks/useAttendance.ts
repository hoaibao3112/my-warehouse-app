"use client"

import { useState, useEffect, useCallback } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"

interface AttendanceSession {
    id: string
    user_id: string
    warehouse_id: string
    session_date: string
    work_shift_id: string | null
    shift_assignment_id: string | null
    check_in_time: string | null
    check_out_time: string | null
    actual_duration: number | null
    is_late_checkin: boolean
    late_minutes: number | null
    is_early_checkout: boolean
    early_minutes: number | null
    status: "CHECKED_IN" | "COMPLETED" | "ABSENT" | "LATE"
    notes: string | null
    work_shifts?: {
        id: string
        shift_name: string
        shift_code: string
        start_time: string
        end_time: string
    } | null
    warehouses?: {
        id: string
        name: string
        code: string
    } | null
}

interface GPSLocation {
    latitude: number
    longitude: number
}

export function useAttendance() {
    const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastOperationError, setLastOperationError] = useState<string | null>(null)

    // Get current GPS location with retry mechanism
    const getGPSLocation = useCallback((): Promise<GPSLocation> => {
        return new Promise(async (resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("GPS không được hỗ trợ trên thiết bị này"))
                return
            }

            // Helper function to get position
            const tryGetPosition = (highAccuracy: boolean, timeout: number): Promise<GPSLocation> => {
                return new Promise((res, rej) => {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            res({
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude
                            })
                        },
                        (error) => {
                            rej(error)
                        },
                        {
                            enableHighAccuracy: highAccuracy,
                            timeout: timeout,
                            maximumAge: 0
                        }
                    )
                })
            }

            // Try high accuracy first (10s), then low accuracy (20s)
            try {
                const location = await tryGetPosition(true, 10000)
                resolve(location)
            } catch (highAccError) {
                console.log('[useAttendance] High accuracy GPS failed, trying low accuracy...')
                try {
                    const location = await tryGetPosition(false, 20000)
                    resolve(location)
                } catch (lowAccError: any) {
                    // Both attempts failed
                    if (lowAccError.code === lowAccError.PERMISSION_DENIED) {
                        reject(new Error("Vui lòng cấp quyền truy cập vị trí để chấm công"))
                    } else if (lowAccError.code === lowAccError.POSITION_UNAVAILABLE) {
                        reject(new Error("Không thể xác định vị trí. Vui lòng bật GPS."))
                    } else if (lowAccError.code === lowAccError.TIMEOUT) {
                        reject(new Error("Hết thời gian chờ lấy vị trí. Vui lòng bật GPS và thử lại."))
                    } else {
                        reject(new Error("Không thể lấy vị trí GPS. Vui lòng kiểm tra cài đặt định vị."))
                    }
                }
            }
        })
    }, [])

    // Fetch current attendance session
    const fetchCurrentSession = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            // Get today's date for the API call
            const today = new Date().toISOString().split('T')[0]

            const response = await mobileFetch(`/api/shifts/my-schedule?month=${today.substring(0, 7)}`)
            const data = await response.json()

            if (data.success && data.sessions?.length > 0) {
                // Find any checked-in session for today
                const activeSession = data.sessions.find((s: any) =>
                    s.status === "CHECKED_IN" || s.status === "LATE"
                )
                setCurrentSession(activeSession || null)
            } else {
                setCurrentSession(null)
            }
        } catch (err) {
            setError("Không thể tải thông tin chấm công")
            console.error("Error fetching attendance session:", err)
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Check-in for attendance
    const checkIn = useCallback(async (
        shift_assignment_id?: string,
        work_shift_id?: string,
        notes?: string
    ): Promise<boolean> => {
        try {
            setLastOperationError(null)

            // Get GPS location first
            const location = await getGPSLocation().catch((err) => {
                setLastOperationError(err.message)
                toast.error(err.message)
                return null
            })

            if (!location) return false

            const response = await mobileFetch("/api/attendance/check-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shift_assignment_id,
                    work_shift_id,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    notes
                })
            })

            const data = await response.json()

            if (data.success) {
                setCurrentSession(data.data)
                toast.success(data.message || "Chấm công vào thành công")
                return true
            } else {
                setLastOperationError(data.error)
                toast.error(data.error || "Không thể chấm công vào")
                return false
            }
        } catch (err) {
            const errorMsg = "Lỗi kết nối khi chấm công vào"
            setLastOperationError(errorMsg)
            toast.error(errorMsg)
            console.error("Error checking in:", err)
            return false
        }
    }, [getGPSLocation])

    // Check-out for attendance
    const checkOut = useCallback(async (notes?: string): Promise<boolean> => {
        try {
            setLastOperationError(null)

            // Get GPS location first
            const location = await getGPSLocation().catch((err) => {
                setLastOperationError(err.message)
                toast.error(err.message)
                return null
            })

            if (!location) return false

            const response = await mobileFetch("/api/attendance/check-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: currentSession?.id,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    notes
                })
            })

            const data = await response.json()

            if (data.success) {
                setCurrentSession(data.data)
                toast.success(data.message || "Chấm công ra thành công")
                return true
            } else {
                setLastOperationError(data.error)
                toast.error(data.error || "Không thể chấm công ra")
                return false
            }
        } catch (err) {
            const errorMsg = "Lỗi kết nối khi chấm công ra"
            setLastOperationError(errorMsg)
            toast.error(errorMsg)
            console.error("Error checking out:", err)
            return false
        }
    }, [currentSession?.id, getGPSLocation])

    // Refresh session data
    const refreshSession = useCallback(() => {
        fetchCurrentSession()
    }, [fetchCurrentSession])

    // Load on mount
    useEffect(() => {
        fetchCurrentSession()
    }, [fetchCurrentSession])

    return {
        currentSession,
        isLoading,
        error,
        lastOperationError,
        checkIn,
        checkOut,
        refreshSession,
        // Computed state
        isCheckedIn: currentSession?.status === "CHECKED_IN" || currentSession?.status === "LATE",
        isLate: currentSession?.is_late_checkin || false,
        lateMinutes: currentSession?.late_minutes || 0
    }
}
