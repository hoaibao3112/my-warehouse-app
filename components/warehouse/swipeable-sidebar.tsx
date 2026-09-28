"use client"

import React, { useRef, useState, useEffect } from "react"
import { WarehouseSidebar } from "@/components/warehouse/sidebar"
import { cn } from "@/lib/utils"

interface WarehouseSwipeableSidebarProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function WarehouseSwipeableSidebar({ open, onOpenChange }: WarehouseSwipeableSidebarProps) {
    const [translateX, setTranslateX] = useState(-100)
    const [isDragging, setIsDragging] = useState(false)

    const sidebarRef = useRef<HTMLDivElement>(null)
    const startXRef = useRef<number>(0)
    const startYRef = useRef<number>(0)
    const currentXRef = useRef<number>(0)
    const isTrackingRef = useRef<boolean>(false)
    const startTranslateXRef = useRef<number>(0)
    const isHorizontalRef = useRef<boolean | null>(null)

    const SIDEBAR_WIDTH = 256
    const DRAG_THRESHOLD = 0.25
    const MIN_DRAG_DISTANCE = 20
    const SNAP_POINT = 40
    const VERTICAL_THRESHOLD = 15

    useEffect(() => {
        if (!isDragging) {
            setTranslateX(open ? 0 : -100)
        }
    }, [open, isDragging])

    useEffect(() => {
        const isModalOpen = () => {
            const radixOverlay = document.querySelector('[data-radix-portal]')
            const dialogOpen = document.querySelector('[role="dialog"]')
            return !!(radixOverlay || dialogOpen)
        }

        const handleTouchStart = (e: TouchEvent) => {
            if (isModalOpen()) {
                isTrackingRef.current = false
                return
            }

            const touch = e.touches[0]
            const target = e.target as HTMLElement
            const startX = touch.clientX
            const startY = touch.clientY

            if (open && sidebarRef.current?.contains(target)) {
                isTrackingRef.current = false
                return
            }

            // Skip touch tracking for interactive elements (buttons, inputs, selects, etc.)
            const interactiveElements = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL']
            const isInteractive = interactiveElements.includes(target.tagName) ||
                target.closest('button, input, select, textarea, a, [role="button"], [data-radix-collection-item], [data-scroll-container], [data-table-container]')

            if (isInteractive) {
                isTrackingRef.current = false
                return
            }

            isTrackingRef.current = true
            startXRef.current = startX
            startYRef.current = startY
            currentXRef.current = startX
            isHorizontalRef.current = null
            startTranslateXRef.current = open ? 0 : -100
            setIsDragging(true)
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (!isTrackingRef.current) return

            const touch = e.touches[0]
            const currentX = touch.clientX
            const currentY = touch.clientY
            currentXRef.current = currentX

            const diffX = currentX - startXRef.current
            const diffY = currentY - startYRef.current
            const absDiffX = Math.abs(diffX)
            const absDiffY = Math.abs(diffY)

            if (isHorizontalRef.current === null) {
                if (absDiffX > VERTICAL_THRESHOLD || absDiffY > VERTICAL_THRESHOLD) {
                    if (absDiffY > absDiffX * 1.5) {
                        isHorizontalRef.current = false
                        isTrackingRef.current = false
                        setIsDragging(false)
                        return
                    } else {
                        isHorizontalRef.current = true
                    }
                } else {
                    return
                }
            }

            if (isHorizontalRef.current === false) return

            if (absDiffX >= MIN_DRAG_DISTANCE) {
                if (e.cancelable) e.preventDefault()
                const percentDiff = (diffX / SIDEBAR_WIDTH) * 100
                let percent = startTranslateXRef.current + percentDiff
                percent = Math.max(-100, Math.min(0, percent))
                setTranslateX(percent)
            }
        }

        const handleTouchEnd = () => {
            if (!isTrackingRef.current) return
            isTrackingRef.current = false
            setIsDragging(false)

            if (isHorizontalRef.current === false) return

            const diff = currentXRef.current - startXRef.current
            const dragDistance = Math.abs(diff)
            const dragPercent = dragDistance / SIDEBAR_WIDTH
            const currentPosition = Math.abs(translateX)

            if (diff > 0) {
                if (dragPercent >= DRAG_THRESHOLD || currentPosition > SNAP_POINT) {
                    onOpenChange(true)
                } else {
                    onOpenChange(false)
                }
            } else {
                if (dragPercent >= DRAG_THRESHOLD || currentPosition < SNAP_POINT) {
                    onOpenChange(false)
                } else {
                    onOpenChange(true)
                }
            }
        }

        document.addEventListener('touchstart', handleTouchStart, { passive: true })
        document.addEventListener('touchmove', handleTouchMove, { passive: false })
        document.addEventListener('touchend', handleTouchEnd)

        return () => {
            document.removeEventListener('touchstart', handleTouchStart)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
        }
    }, [open, onOpenChange, translateX])

    return (
        <>
            {open && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden"
                    onClick={() => onOpenChange(false)}
                />
            )}

            <div
                ref={sidebarRef}
                className={cn(
                    "fixed left-0 z-50 w-64 md:hidden shadow-xl",
                    !isDragging && "transition-transform duration-300 ease-out"
                )}
                style={{
                    top: 'env(safe-area-inset-top, 0px)',
                    bottom: 'env(safe-area-inset-bottom, 0px)',
                    transform: `translateX(${translateX}%)`,
                    willChange: 'transform'
                }}
            >
                <WarehouseSidebar onNavigate={() => onOpenChange(false)} />
            </div>
        </>
    )
}
