"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [showContent, setShowContent] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  // Hiển thị UI skeleton ngay lập tức, không chờ auth
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Don't redirect while still loading or already redirecting
    if (loading || redirecting) return

    console.log('[Home] Auth loaded, user:', user?.email, 'role:', user?.role)

    setRedirecting(true)

    if (user && user.role) {
      // Redirect based on role
      let targetPath = "/store" // default for store users

      if (user.role === "ADMIN" || user.role === "AdminKhoTong") {
        targetPath = "/admin"
      } else if (user.role === "MANAGER" || user.role === "WAREHOUSE_STAFF") {
        targetPath = "/admin"
      } else if (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon" || user.role === "STAFF") {
        targetPath = "/store"
      } else if (user.role === "ATTENDANCE_STAFF") {
        targetPath = "/attendance"
      }

      console.log('[Home] Redirecting to:', targetPath)
      window.location.href = targetPath
    } else {
      // No user - redirect to login
      console.log('[Home] No user, redirecting to login')
      window.location.href = "/login"
    }
  }, [user, loading, redirecting])

  // Always show loading state while determining redirect
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Express Cafe</h1>
        <div className="flex items-center justify-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    </div>
  )
}
