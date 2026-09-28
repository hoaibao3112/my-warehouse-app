'use client'

import { ReactNode, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'

interface SwipeAction {
  label: string
  icon: ReactNode
  onClick: () => void
  color: 'blue' | 'red' | 'green' | 'yellow'
}

interface SwipeableCardProps {
  children: ReactNode
  actions?: SwipeAction[]
  onClick?: () => void
  className?: string
}

const colorClasses = {
  blue: 'bg-blue-500 hover:bg-blue-600',
  red: 'bg-red-500 hover:bg-red-600',
  green: 'bg-green-500 hover:bg-green-600',
  yellow: 'bg-yellow-500 hover:bg-yellow-600',
}

export function SwipeableCard({
  children,
  actions = [],
  onClick,
  className = '',
}: SwipeableCardProps) {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const currentX = useRef(0)

  const actionWidth = 80 // Width of each action button
  const maxOffset = actions.length * actionWidth

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    currentX.current = e.touches[0].clientX
    const diff = startX.current - currentX.current
    
    // Allow swipe left only (reveal actions)
    if (diff > 0 && diff <= maxOffset) {
      setOffset(diff)
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    
    // Snap to position
    if (offset > maxOffset / 2) {
      setOffset(maxOffset) // Fully reveal actions
    } else {
      setOffset(0) // Hide actions
    }
  }

  const handleActionClick = (action: SwipeAction) => {
    action.onClick()
    setOffset(0) // Close after action
  }

  return (
    <div className="relative overflow-hidden">
      {/* Action buttons (behind the card) */}
      {actions.length > 0 && (
        <div className="absolute right-0 top-0 h-full flex">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleActionClick(action)}
              className={`
                flex flex-col items-center justify-center gap-1 text-white
                ${colorClasses[action.color]}
              `}
              style={{ width: `${actionWidth}px` }}
            >
              {action.icon}
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main card content */}
      <div
        className={`relative transition-transform ${isDragging ? '' : 'duration-300'}`}
        style={{ transform: `translateX(-${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (offset === 0 && onClick) {
            onClick()
          } else {
            setOffset(0) // Close if swiped
          }
        }}
      >
        <Card className={`p-4 hover:shadow-md transition-shadow ${className}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">{children}</div>
            {onClick && offset === 0 && (
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
