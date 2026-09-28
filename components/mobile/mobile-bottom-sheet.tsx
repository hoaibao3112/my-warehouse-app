'use client'

import { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface BottomSheetAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive' | 'outline' | 'ghost'
  disabled?: boolean
}

interface MobileBottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  actions?: BottomSheetAction[]
  children?: ReactNode
}

export function MobileBottomSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
}: MobileBottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        {children ? (
          <div className="pb-4">{children}</div>
        ) : actions ? (
          <div className="space-y-2 pb-4">
            {actions.map((action, idx) => (
              <div key={idx}>
                <Button
                  variant={action.variant || 'outline'}
                  className="w-full justify-start h-12 text-base"
                  onClick={() => {
                    action.onClick()
                    onOpenChange(false)
                  }}
                  disabled={action.disabled}
                >
                  {action.icon && <span className="mr-3">{action.icon}</span>}
                  {action.label}
                </Button>
                {idx < actions.length - 1 && <Separator className="my-2" />}
              </div>
            ))}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
