import type React from "react"
import { StoreLayoutWrapper } from "@/components/store/layout-wrapper"

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  // StoreLayoutWrapper will show loading screen until auth is fully loaded
  return <StoreLayoutWrapper>{children}</StoreLayoutWrapper>
}
