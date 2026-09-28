"use client"

import { useState, useEffect, useCallback } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"

interface SalesSession {
    id: string
    user_id: string
    warehouse_id: string
    session_date: string
    work_shift_id: string | null
    shift_opened_at: string
    opening_cash: number
    closing_cash: number | null
    shift_closed_at: string | null
    expected_cash: number | null
    cash_difference: number | null
    total_orders: number
    total_revenue: number
    total_discount: number

    status: "IN_PROGRESS" | "PENDING_APPROVAL" | "COMPLETED" | "REJECTED"
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
    // Optional fields for compatibility or specific states
    check_in_time?: string
    check_out_time?: string
    shift_name?: string
    rejection_reason?: string

    total_vat?: number
    cash_orders?: number
    ewallet_orders?: number
    cash_revenue?: number
    ewallet_revenue?: number
    vouchers_used?: number
    promotions_used?: number
    promotion_names?: string[]
    voucher_programs?: string[]
    realtime_stats?: {
        total_orders: number
        total_revenue: number
        total_discount: number
    }
}

interface WorkShift {
    id: string
    shift_name: string
    shift_code: string
    start_time: string
    end_time: string
}

export function useSalesSession() {
    const [currentSession, setCurrentSession] = useState<SalesSession | null>(null)
    const [workShifts, setWorkShifts] = useState<WorkShift[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastOperationError, setLastOperationError] = useState<string | null>(null)

    // Fetch current session
    const fetchCurrentSession = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            const response = await mobileFetch("/api/sales-sessions/current")
            const data = await response.json()

            if (data.success) {
                setCurrentSession(data.data)
            } else {
                setError(data.error)
            }
        } catch (err) {
            setError("Không thể tải thông tin ca bán hàng")
            console.error("Error fetching sales session:", err)
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Open a new sales session
    const openSession = useCallback(async (
        opening_cash: number,
        work_shift_id?: string,
        warehouse_id?: string
    ): Promise<boolean> => {
        try {
            setLastOperationError(null)

            const response = await mobileFetch("/api/sales-sessions/open", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    opening_cash,
                    work_shift_id,
                    warehouse_id
                })
            })

            const data = await response.json()

            if (data.success) {
                setCurrentSession(data.data)
                toast.success(data.message || "Mở ca bán hàng thành công")
                return true
            } else {
                setLastOperationError(data.error)
                toast.error(data.error || "Không thể mở ca bán hàng")
                return false
            }
        } catch (err) {
            const errorMsg = "Lỗi kết nối khi mở ca bán hàng"
            setLastOperationError(errorMsg)
            toast.error(errorMsg)
            console.error("Error opening sales session:", err)
            return false
        }
    }, [])

    // Close current sales session
    const closeSession = useCallback(async (
        closing_cash: number,
        notes?: string
    ): Promise<boolean> => {
        try {
            setLastOperationError(null)

            const response = await mobileFetch("/api/sales-sessions/close", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: currentSession?.id,
                    closing_cash,
                    notes
                })
            })

            const data = await response.json()

            if (data.success) {
                setCurrentSession(null)
                toast.success(data.message || "Đóng ca bán hàng thành công")
                return true
            } else {
                setLastOperationError(data.error)
                toast.error(data.error || "Không thể đóng ca bán hàng")
                return false
            }
        } catch (err) {
            const errorMsg = "Lỗi kết nối khi đóng ca bán hàng"
            setLastOperationError(errorMsg)
            toast.error(errorMsg)
            console.error("Error closing sales session:", err)
            return false
        }
    }, [currentSession?.id])

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
        clearLastOperationError: () => setLastOperationError(null),
        openSession,
        closeSession,
        refreshSession,
        // Computed state
        hasActiveSession: currentSession?.status === "IN_PROGRESS",
        sessionStats: currentSession?.realtime_stats || {
            total_orders: currentSession?.total_orders || 0,
            total_revenue: Number(currentSession?.total_revenue) || 0,
            total_discount: Number(currentSession?.total_discount) || 0
        }
    }
}
