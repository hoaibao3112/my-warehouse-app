'use client'

import { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'

interface MobileOnlyProps {
  children: ReactNode
  fallback?: ReactNode
}

export function MobileOnly({ children, fallback = null }: MobileOnlyProps) {
  const isMobile = useIsMobile()
  return isMobile ? <>{children}</> : <>{fallback}</>
}

interface DesktopOnlyProps {
  children: ReactNode
  fallback?: ReactNode
}

export function DesktopOnly({ children, fallback = null }: DesktopOnlyProps) {
  const isMobile = useIsMobile()
  return !isMobile ? <>{children}</> : <>{fallback}</>
}

interface ResponsiveProps {
  mobile: ReactNode
  desktop: ReactNode
}

export function Responsive({ mobile, desktop }: ResponsiveProps) {
  const isMobile = useIsMobile()
  return isMobile ? <>{mobile}</> : <>{desktop}</>
}
