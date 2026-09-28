"use client"

import React, { useRef, useState, useEffect, ComponentType } from "react"
import { StoreSidebar } from "@/components/store/sidebar"
import { cn } from "@/lib/utils"

interface SwipeableSidebarProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    SidebarComponent?: ComponentType
}

export function SwipeableSidebar({ open, onOpenChange, SidebarComponent }: SwipeableSidebarProps) {
    const [translateX, setTranslateX] = useState(-100) // Start off-screen (percentage)
    const [isDragging, setIsDragging] = useState(false)

    const sidebarRef = useRef<HTMLDivElement>(null)
    const startXRef = useRef<number>(0)
    const startYRef = useRef<number>(0)
    const currentXRef = useRef<number>(0)
    const currentYRef = useRef<number>(0)
    const isTrackingRef = useRef<boolean>(false)
    const startTranslateXRef = useRef<number>(0)
    const isHorizontalRef = useRef<boolean | null>(null)

    // Constants
    const SIDEBAR_WIDTH = 256 // w-64 = 16rem = 256px
    const DRAG_THRESHOLD = 0.25 // 25% drag to snap open/close (increased from 15%)
    const MIN_DRAG_DISTANCE = 20 // Minimum pixels to be considered a swipe (increased from 5)
    const SNAP_POINT = 40 // Snap at 40% position (decreased from 50%)
    const VERTICAL_THRESHOLD = 15 // If vertical movement > 15px, cancel horizontal tracking (increased from 10)

    // Sync translateX with open state when not dragging
    useEffect(() => {
        if (!isDragging) {
            setTranslateX(open ? 0 : -100)
        }
    }, [open, isDragging])

    useEffect(() => {
        // Check if any modal/dialog is open
        const isModalOpen = () => {
            // Check for Radix dialog/modal portals
            const radixOverlay = document.querySelector('[data-radix-portal]')
            const dialogOpen = document.querySelector('[role="dialog"]')
            const alertDialogOpen = document.querySelector('[role="alertdialog"]')
            // Check for elements with aria-modal
            const ariaModal = document.querySelector('[aria-modal="true"]')
            return !!(radixOverlay || dialogOpen || alertDialogOpen || ariaModal)
        }

        const handleTouchStart = (e: TouchEvent) => {
            // Don't track swipe if modal is open
            if (isModalOpen()) {
                isTrackingRef.current = false
                return
            }

            const touch = e.touches[0]
            const startX = touch.clientX
            const startY = touch.clientY

            // Always start tracking - allow swipe from anywhere on screen
            isTrackingRef.current = true
            startXRef.current = startX
            startYRef.current = startY
            currentXRef.current = startX
            currentYRef.current = startY
            isHorizontalRef.current = null // Determine direction on first move
            startTranslateXRef.current = open ? 0 : -100
            setIsDragging(true)
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (!isTrackingRef.current) return

            const touch = e.touches[0]
            const currentX = touch.clientX
            const currentY = touch.clientY
            currentXRef.current = currentX
            currentYRef.current = currentY

            const diffX = currentX - startXRef.current
            const diffY = currentY - startYRef.current
            const absDiffX = Math.abs(diffX)
            const absDiffY = Math.abs(diffY)

            // Determine if movement is horizontal or vertical
            if (isHorizontalRef.current === null) {
                // First move - determine direction
                if (absDiffX > VERTICAL_THRESHOLD || absDiffY > VERTICAL_THRESHOLD) {
                    // If vertical movement is significantly more than horizontal, it's a vertical scroll
                    if (absDiffY > absDiffX * 1.5) {
                        isHorizontalRef.current = false
                        isTrackingRef.current = false // Stop tracking
                        return
                    } else {
                        isHorizontalRef.current = true
                    }
                } else {
                    return // Wait for more movement
                }
            }

            // If determined to be vertical movement, stop tracking
            if (isHorizontalRef.current === false) {
                isTrackingRef.current = false
                setIsDragging(false)
                // Auto close sidebar when scrolling vertically
                if (open) {
                    onOpenChange(false)
                }
                return
            }

            // Horizontal movement - update sidebar position
            if (absDiffX >= MIN_DRAG_DISTANCE) {
                // Only prevent default if event is cancelable (not during ongoing scroll)
                if (e.cancelable) {
                    e.preventDefault()
                }

                // Calculate new position based on drag distance
                const percentDiff = (diffX / SIDEBAR_WIDTH) * 100
                let percent = startTranslateXRef.current + percentDiff

                // Clamp between -100% and 0%
                percent = Math.max(-100, Math.min(0, percent))

                setTranslateX(percent)
            }
        }

        const handleTouchEnd = () => {
            if (!isTrackingRef.current) return

            isTrackingRef.current = false
            setIsDragging(false)

            // If vertical movement was detected, sidebar should already be closed
            if (isHorizontalRef.current === false) {
                return
            }

            const diff = currentXRef.current - startXRef.current
            const dragDistance = Math.abs(diff)
            const dragPercent = dragDistance / SIDEBAR_WIDTH
            const currentPosition = Math.abs(translateX)

            // Determine action based on:
            // 1. Swipe direction (right to open, left to close)
            // 2. Drag distance (if > 15% width, snap to target)
            // 3. Current position (if > 50%, snap open, else snap close)

            if (diff > 0) {
                // Swiped right - intent to open
                if (dragPercent >= DRAG_THRESHOLD || currentPosition > SNAP_POINT) {
                    onOpenChange(true)
                } else {
                    onOpenChange(false)
                }
            } else {
                // Swiped left - intent to close
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
    }, [open, onOpenChange])

    return (
        <>
            {/* Overlay */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden"
                    onClick={() => {
                        onOpenChange(false)
                    }}
                />
            )}

            {/* Sidebar Container */}
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
                {SidebarComponent ? <SidebarComponent /> : <StoreSidebar />}
            </div>
        </>
    )
}
