"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import type { User } from "@/lib/types"
import { isNativePlatform } from "@/lib/mobile/platform"
import {
  getUserData,
  getAuthToken,
  saveAuthToken,
  saveUserData,
  logout as mobileLogout
} from "@/lib/mobile/auth-service"
import { mobileFetch } from "@/lib/mobile/api-client"
import { getCookie, setCookie } from "@/lib/utils"

export type LoginMode = "full" | "reports"

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loginMode, setLoginModeState] = useState<LoginMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMobile = isNativePlatform()
  const initializedRef = useRef(false)

  // Memoized fetch user function
  const fetchUser = useCallback(async () => {
    // Prevent double initialization
    if (initializedRef.current) {
      console.log('[FETCH_USER] Already initialized, skipping')
      return
    }
    initializedRef.current = true

    try {
      console.log('[FETCH_USER] Starting, isMobile:', isMobile)

      // MOBILE: Always use secure storage for tokens
      if (isMobile) {
        const storedUser = await getUserData()
        const storedToken = await getAuthToken()

        console.log('[FETCH_USER] Mobile - storedUser:', !!storedUser, 'storedToken:', !!storedToken)

        if (storedUser && storedToken) {
          // Set user immediately for instant UI
          setUser(storedUser)
          setLoading(false)

          // Validate token in background (non-blocking, no redirect)
          try {
            const validateResponse = await mobileFetch("/api/auth/me", {
              method: "GET"
            })

            if (validateResponse.ok) {
              const data = await validateResponse.json()
              if (data.success && data.data) {
                // Update user with fresh data from server
                const freshUser = parseUserData(data.data)
                setUser(freshUser)
                await saveUserData(freshUser)
                console.log('[FETCH_USER] Mobile - Token validated, user updated')
              } else {
                console.log('[FETCH_USER] Mobile - Token invalid (success=false), clearing session')
                await mobileLogout()
                setUser(null)
              }
            } else if (validateResponse.status === 401) {
              // Only clear on explicit 401 (unauthorized)
              console.log('[FETCH_USER] Mobile - Token invalid (401), clearing session')
              await mobileLogout()
              setUser(null)
            }
            // Don't clear on network errors or other status codes
          } catch (validationError) {
            // Network error - keep using cached session (offline mode)
            console.log('[FETCH_USER] Mobile - Network error, keeping cached session:', validationError)
          }

          return
        }

        // No stored session on mobile
        console.log('[FETCH_USER] Mobile - No stored session')
        setUser(null)
        setLoading(false)
        return
      }

      // WEB: Use cookie-based auth
      console.log('[FETCH_USER] Web - Checking cookie auth')
      const response = await mobileFetch("/api/auth/me", {
        method: "GET"
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          const mappedUser = parseUserData(data.data)

          // Get login mode from cookie
          const savedMode = getCookie("login-mode") as LoginMode
          if (savedMode) {
            mappedUser.loginMode = savedMode
            setLoginModeState(savedMode)
          }

          setUser(mappedUser)
          console.log('[FETCH_USER] Web - Cookie auth successful, mode:', savedMode)
        } else {
          setUser(null)
          setLoginModeState(null)
        }
      } else {
        console.log('[FETCH_USER] Web - No valid cookie auth')
        setUser(null)
        setLoginModeState(null)
      }
    } catch (err) {
      console.error("[FETCH_USER] Error:", err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [isMobile])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // Parse user data from API response
  const parseUserData = (userData: any): User => {
    let permissions: string[] = []
    try {
      if (userData.permissions) {
        if (typeof userData.permissions === 'string') {
          permissions = JSON.parse(userData.permissions)
        } else if (Array.isArray(userData.permissions)) {
          permissions = userData.permissions
        }
      }
    } catch (e) {
      console.error("[PARSE_USER] Error parsing permissions:", e)
      permissions = []
    }

    // Parse warehouseIds for GENERAL_MANAGER
    let warehouseIds: string[] | undefined = undefined
    if (userData.role === 'GENERAL_MANAGER') {
      try {
        if (userData.warehouseIds) {
          if (typeof userData.warehouseIds === 'string') {
            warehouseIds = JSON.parse(userData.warehouseIds)
          } else if (Array.isArray(userData.warehouseIds)) {
            warehouseIds = userData.warehouseIds
          }
        }
      } catch (e) {
        console.error("[PARSE_USER] Error parsing warehouseIds:", e)
        warehouseIds = undefined
      }
    }

    return {
      id: userData.id,
      email: userData.email,
      fullName: userData.fullName || userData.fullname || userData.full_name,
      role: userData.role,
      warehouseId: userData.warehouseId || userData.warehouseid || userData.warehouse_id,
      warehouseIds: warehouseIds,
      isActive: userData.isActive || userData.isactive || userData.is_active,
      permissions: permissions,
      createdAt: userData.createdAt || userData.createdat || userData.created_at,
      updatedAt: userData.updatedAt || userData.updatedat || userData.updated_at,
    } as User
  }

  const login = async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await mobileFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage = data.error || "Login failed"
        throw new Error(errorMessage)
      }

      // API returns: { success: true, data: { user: {...}, token: "...", expiresAt: "..." } }
      const sessionData = data.data
      const userData = sessionData?.user || sessionData
      const token = sessionData?.token

      console.log('[LOGIN] Session data received, token:', !!token, 'isMobile:', isMobile)

      if (!userData || !userData.id) {
        throw new Error("Invalid response from server")
      }

      const mappedUser = parseUserData(userData)
      console.log('[LOGIN] Mapped user:', mappedUser.email, 'role:', mappedUser.role, 'warehouseId:', mappedUser.warehouseId)

      // Save to storage (mobile) or rely on cookie (web)
      if (isMobile && token) {
        await saveAuthToken(token)
        await saveUserData(mappedUser)
        console.log('[LOGIN] Saved to secure storage (mobile)')
      }

      setUser(mappedUser)
      initializedRef.current = true // Mark as initialized after successful login

      return { user: mappedUser, token }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed"
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const setLoginMode = (mode: LoginMode) => {
    setLoginModeState(mode)
    setCookie("login-mode", mode, 7) // Save for 7 days
    if (user) {
      setUser({ ...user, loginMode: mode })
    }
  }

  const logout = async () => {
    try {
      // Clear mobile storage first
      if (isMobile) {
        await mobileLogout()
        console.log('[LOGOUT] Cleared secure storage (mobile)')
      }

      // Call logout API (clears cookie for web)
      try {
        await mobileFetch("/api/auth/logout", { method: "POST" })
      } catch (e) {
        // Ignore network errors on logout
      }

      setUser(null)
      initializedRef.current = false // Allow re-initialization after logout

      // Redirect to login page
      window.location.href = "/login"
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed")
      window.location.href = "/login"
    }
  }

  // Helper to check if user has a specific permission
  const hasPermission = (permissionId: string): boolean => {
    if (!user) return false

    // ADMIN has all permissions by default
    if (user.role === "ADMIN" || user.role === "AdminKhoTong") {
      return true
    }

    // WAREHOUSE_MANAGER and GENERAL_MANAGER have all permissions by default
    if (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon" || user.role === "GENERAL_MANAGER") {
      return true
    }

    // HR has specific permissions
    if (user.role === "HR") {
      const hrPermissions = [
        'view_users', 'manage_users',
        'view_attendance', 'manage_attendance', 'edit_attendance',
        'view_shifts', 'manage_shifts',
        'view_leave_requests', 'manage_leave_requests',
        'view_shift_swaps', 'approve_shift_swaps',
        'view_reports', 'export_reports'
      ]
      return hrPermissions.includes(permissionId)
    }

    // MANAGER, WAREHOUSE_STAFF, and STAFF need explicit permission
    if (user.role === "MANAGER" || user.role === "WAREHOUSE_STAFF" || user.role === "STAFF") {
      let perms = user.permissions
      if (!perms) return false

      if (typeof perms === 'string') {
        try {
          perms = JSON.parse(perms)
        } catch {
          return false
        }
      }

      return Array.isArray(perms) && perms.includes(permissionId)
    }

    return false
  }

  // Force refresh user data
  const refreshUser = useCallback(async () => {
    initializedRef.current = false
    setLoading(true)
    await fetchUser()
  }, [fetchUser])

  return { user, loading, error, login, logout, hasPermission, refreshUser, loginMode, setLoginMode }
}
