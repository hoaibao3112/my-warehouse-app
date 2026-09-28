"use client"

import { useEffect, useRef } from "react"
import { useAuthContext } from "@/components/auth-provider"

/**
 * Hook to automatically trigger shift registration approval
 * This should be used in top-level layouts for managers/admins
 */
export function useAutoApproveShifts() {
    const { user } = useAuthContext()
    const hasChecked = useRef(false)

    useEffect(() => {
        const checkAutoApprove = async () => {
            // Prevent double checks in strict mode or re-renders
            if (hasChecked.current) return

            if (!user) return

            const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
            if (!allowedRoles.includes(user.role)) return

            try {
                hasChecked.current = true

                // We call the POST endpoint directly. 
                // It has internal checks to only run if past deadline (day 29)
                const response = await fetch("/api/shifts/registration-requests/auto-approve", {
                    method: "POST",
                })

                const data = await response.json()

                if (data.success && data.approvedCount > 0) {
                    console.log("Auto-approved shifts:", data)
                }
            } catch (error) {
                // Silently fail to avoid disrupting user experience
                console.error("Failed to check auto-approve shifts:", error)
            }
        }

        checkAutoApprove()
    }, [user])
}
