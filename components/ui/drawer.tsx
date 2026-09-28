'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  side?: 'left' | 'right'
  className?: string
}

function Drawer({ open, onOpenChange, children, side = 'left', className }: DrawerProps) {
  const drawerRef = React.useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = React.useState(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const touchStartX = React.useRef(0)
  const touchStartY = React.useRef(0)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const DRAG_THRESHOLD = 10
  const OPEN_THRESHOLD = 0.3

  React.useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (!open && e.touches[0].clientX > 50) return
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return

      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const distX = currentX - touchStartX.current
      const distY = Math.abs(currentY - touchStartY.current)

      if (Math.abs(distX) > DRAG_THRESHOLD && distY < DRAG_THRESHOLD * 2) {
        setIsDragging(true)
        e.preventDefault()
        e.stopPropagation()

        if (side === 'left') {
          if (!open && distX > 0) {
            setDragOffset(Math.min(distX, 288))
          } else if (open && distX < 0) {
            const drawerWidth = drawerRef.current?.offsetWidth || 288
            setDragOffset(Math.max(distX, -drawerWidth))
          }
        }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDragging) return

      e.preventDefault()
      e.stopPropagation()

      const drawerWidth = drawerRef.current?.offsetWidth || 288

      if (side === 'left') {
        if (!open && dragOffset > drawerWidth * OPEN_THRESHOLD) {
          onOpenChange(true)
        } else if (open && Math.abs(dragOffset) > drawerWidth * OPEN_THRESHOLD) {
          onOpenChange(false)
        }
      }

      setDragOffset(0)
      setIsDragging(false)
    }

    const root = document.documentElement
    root.addEventListener('touchstart', handleTouchStart, { passive: false })
    root.addEventListener('touchmove', handleTouchMove, { passive: false })
    root.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      root.removeEventListener('touchstart', handleTouchStart)
      root.removeEventListener('touchmove', handleTouchMove)
      root.removeEventListener('touchend', handleTouchEnd)
    }
  }, [open, onOpenChange, isDragging, dragOffset, side])

  const drawerTranslateX = open ? 0 : -288
  const displayTranslateX = isDragging ? dragOffset : drawerTranslateX

  if (!mounted) {
    return null
  }

  return createPortal(
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => onOpenChange(false)}
        style={{ touchAction: 'none' }}
      />

      <div
        ref={drawerRef}
        className={cn(
          'fixed z-50 h-screen w-72 bg-sidebar text-sidebar-foreground overflow-y-auto',
          'transition-transform duration-300 ease-out',
          side === 'left' ? 'left-0' : 'right-0',
          className
        )}
        style={{
          top: 'env(safe-area-inset-top, 0)',
          height: 'calc(100vh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0))',
          transform: `translateX(${displayTranslateX}px)`,
          transitionDuration: isDragging ? '0ms' : '300ms',
          touchAction: 'none'
        }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

export { Drawer }
