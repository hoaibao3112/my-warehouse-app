"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthContext } from "@/components/auth-provider"
import { isNativePlatform } from "@/lib/mobile/platform"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { ModeSelection } from "./login/mode-selection"
import { type LoginMode } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

export function LoginForm() {
  const router = useRouter()
  const auth = useAuthContext()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<"login" | "mode-selection">("login")
  const [tempUser, setTempUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const isMobile = isNativePlatform()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await auth.login(email, password)
      const user = result?.user

      if (!user || !user.role) {
        throw new Error('Đăng nhập thành công nhưng không lấy được thông tin người dùng')
      }

      const managementRoles = ["ADMIN", "AdminKhoTong", "GENERAL_MANAGER", "MANAGER"]
      if (managementRoles.includes(user.role)) {
        setTempUser(user)
        setStep("mode-selection")
        setLoading(false)
      } else {
        performRedirect(user)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Đăng nhập thất bại"
      setError(errorMessage)
      toast.error("Đăng nhập thất bại", { description: errorMessage })
      setLoading(false)
    }
  }

  const performRedirect = async (user: any) => {
    let redirectPath = "/store"
    if (user.role === "ADMIN" || user.role === "AdminKhoTong") {
      redirectPath = "/admin"
    } else if (user.role === "MANAGER") {
      redirectPath = "/warehouse"
    } else if (user.role === "WAREHOUSE_STAFF") {
      redirectPath = "/warehouse"
    } else if (user.role === "HR") {
      redirectPath = "/hr"
    } else if (user.role === "ATTENDANCE_STAFF") {
      redirectPath = "/attendance"
    } else if (user.role === "GENERAL_MANAGER") {
      redirectPath = "/store"
    } else if (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon") {
      redirectPath = "/store"
    }

    if (isMobile) {
      try {
        if (typeof window !== 'undefined' && (window as any).Capacitor) {
          const { Device } = await import('@capacitor/device')
          const info = await Device.getInfo()
          const id = await Device.getId()
          await fetch('/api/capacitor/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: info.platform, model: info.model, uuid: id.identifier })
          })
        }
      } catch (e) {
        console.error('Capacitor Error:', e)
      }
      await new Promise(resolve => setTimeout(resolve, 300))
      window.location.href = redirectPath
    } else {
      router.push(redirectPath)
    }
  }

  const handleModeSelect = (mode: LoginMode) => {
    auth.setLoginMode(mode)
    performRedirect({ ...tempUser, loginMode: mode })
  }

  return (
    <div className={cn(
      "w-full relative z-10 transition-all duration-500 ease-in-out mx-auto",
      step === "login" ? "max-w-[400px]" : "max-w-5xl"
    )}>
      <div className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 border border-white/30">
        {/* Header with Logo */}
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            <Image
              src="/logo_login.png"
              alt="Express Cafe Logo"
              width={200}
              height={80}
              className="w-auto h-16 sm:h-20 object-contain drop-shadow-lg"
              priority
            />
          </div>
          <p className="text-gray-600 font-medium text-xs sm:text-sm">Quản lý Kho hàng & Bán hàng</p>
        </div>

        {step === "login" ? (
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-500 px-1 sm:px-2">
            {/* Email/Phone Input */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700">
                Email hoặc Số Điện Thoại
              </label>
              <Input
                id="email"
                type="text"
                placeholder="Nhập email hoặc số điện thoại"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="w-full !border-2 !border-gray-100 !rounded-lg !py-3 !px-4 !text-sm !text-gray-800 !placeholder-gray-400 !bg-gray-50/50 !focus:border-orange-500 !focus:ring-0 !transition-all"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                Mật khẩu
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu của bạn"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="w-full !border-2 !border-gray-100 !rounded-lg !py-3 !px-4 !pr-10 !text-sm !text-gray-800 !placeholder-gray-400 !bg-gray-50/50 !focus:border-orange-500 !focus:ring-0 !transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[12px] bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full !h-11 !bg-gradient-to-r !from-orange-500 !to-amber-500 hover:!from-orange-600 hover:!to-amber-600 !text-white !font-bold !text-sm !rounded-lg !transition-all !duration-300 !shadow-lg hover:!shadow-orange-200"
            >
              {loading ? "⏳ Đang kết nối..." : "🚀 Đăng nhập ngay"}
            </Button>

            {process.env.NODE_ENV === "development" && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <p className="text-center text-[11px] text-gray-500 mb-2 font-medium">💡 Tài khoản dùng thử:</p>
                <div className="space-y-1 text-[10px] font-mono text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <div className="flex justify-between">
                    <span>Admin:</span>
                    <span>admin@example.com / password</span>
                  </div>
                  <div className="flex justify-between opacity-80 pt-1 border-t border-gray-100/50">
                    <span>Store:</span>
                    <span>store1@example.com / storepass</span>
                  </div>
                </div>
              </div>
            )}
          </form>
        ) : (
          <ModeSelection
            onSelect={handleModeSelect}
            userName={tempUser?.fullName || tempUser?.fullname || "Quản lý"}
          />
        )}
      </div>
    </div>
  )
}
