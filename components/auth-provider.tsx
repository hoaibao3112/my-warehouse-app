"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useAuth, type LoginMode } from "@/hooks/use-auth"
import type { User } from "@/lib/types"

interface AuthContextType {
  user: User | null
  loginMode: LoginMode | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<any>
  logout: () => Promise<void>
  setLoginMode: (mode: LoginMode) => void
  refreshUser: () => Promise<void>
  hasPermission: (permissionId: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider")
  }
  return context
}
