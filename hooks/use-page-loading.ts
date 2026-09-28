"use client"

import { useTransition } from "react"

/**
 * Hook để track khi navigation đang xảy ra
 * Dùng để show loading screen trong quá trình page navigation
 */
export function usePageLoading() {
  const [isPending] = useTransition()
  return isPending
}
