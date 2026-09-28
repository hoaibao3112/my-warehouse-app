import type React from "react"
import { HRLayoutWrapper } from "@/components/hr/layout-wrapper"

export default function HRLayout({ children }: { children: React.ReactNode }) {
  // HRLayoutWrapper will show loading screen until auth is fully loaded
  return <HRLayoutWrapper>{children}</HRLayoutWrapper>
}
