"use client"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { HRSidebar } from "./sidebar"

interface HRSwipeableSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HRSwipeableSidebar({ open, onOpenChange }: HRSwipeableSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-64">
        <HRSidebar />
      </SheetContent>
    </Sheet>
  )
}
