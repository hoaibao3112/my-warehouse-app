import type { Metadata } from "next"
import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = {
  title: "Đăng nhập - Hệ thống Quản lý Kho",
  description: "Đăng nhập vào tài khoản quản lý kho của bạn",
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-y-auto"
      style={{
        minHeight: '100dvh',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Background Image */}
      <div
        className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/background_login.png)' }}
      />
      {/* Overlay - Darker for better contrast */}
      <div className="absolute inset-0 bg-black/40" />

      {/* LoginForm handles its own dynamic width card container */}
      <LoginForm />
    </div>
  )
}
