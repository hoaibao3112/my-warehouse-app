import type React from "react"
import { AdminLayoutWrapper } from "@/components/admin/layout-wrapper"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // AdminLayoutWrapper will show loading screen until auth is fully loaded
  return <AdminLayoutWrapper>{children}</AdminLayoutWrapper>
}
