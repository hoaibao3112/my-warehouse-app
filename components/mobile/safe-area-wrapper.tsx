"use client"

import { cn } from "@/lib/utils"

interface SafeAreaWrapperProps {
  children: React.ReactNode
  className?: string
  applyTop?: boolean
  applyBottom?: boolean
}

/**
 * Wrapper component that applies safe area insets for mobile devices
 * Uses inline styles like the sidebar to ensure proper rendering in Capacitor
 */
export function SafeAreaWrapper({ 
  children, 
  className,
  applyTop = false,
  applyBottom = true 
}: SafeAreaWrapperProps) {
  const style: React.CSSProperties = {}
  
  if (applyTop) {
    style.paddingTop = 'env(safe-area-inset-top, 0)'
  }
  
  if (applyBottom) {
    style.paddingBottom = 'env(safe-area-inset-bottom, 0)'
  }

  return (
    <div 
      className={cn("min-h-screen bg-background", className)}
      style={style}
    >
      {children}
    </div>
  )
}
