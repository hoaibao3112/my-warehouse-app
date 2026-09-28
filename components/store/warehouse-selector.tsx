"use client"

import { useState, useEffect } from "react"
import { Building2, Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useAuth } from "@/hooks/use-auth"
import { Skeleton } from "@/components/ui/skeleton"

interface WarehouseAssignment {
  id: string
  userId: string
  warehouseId: string
  isPrimary: boolean
  assignedAt: Date
  warehouse: {
    id: string
    code: string
    name: string
    type: string
    location?: string
    isActive: boolean
  }
}

interface WarehouseSelectorProps {
  onWarehouseChange?: (warehouseId: string) => void
}

// Custom event for warehouse changes
export const WAREHOUSE_CHANGE_EVENT = "warehouseChanged"

export function WarehouseSelector({ onWarehouseChange }: WarehouseSelectorProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<WarehouseAssignment[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")

  // Show for roles that can manage multiple warehouses
  const isMultiWarehouseRole = user?.role === "GENERAL_MANAGER" || user?.role === "WAREHOUSE_MANAGER"

  useEffect(() => {
    if (!isMultiWarehouseRole || !user?.id) {
      setLoading(false)
      return
    }

    // Load warehouse assignments
    const loadAssignments = async () => {
      try {
        // Both GENERAL_MANAGER and WAREHOUSE_MANAGER: Fetch only assigned warehouses
        const response = await mobileFetch(`/api/users/${user.id}/warehouse-assignments`)
        const data = await response.json()

        let allWarehouses: WarehouseAssignment[] = []
        if (data.success && Array.isArray(data.data)) {
          allWarehouses = data.data.map((a: any) => ({
            id: `assignment-${a.warehouseId}`,
            userId: user.id,
            warehouseId: a.warehouseId,
            isPrimary: false,
            assignedAt: new Date(),
            warehouse: {
              id: a.warehouseId,
              code: a.warehouseCode,
              name: a.warehouseName,
              type: '',
              location: '',
              isActive: true
            }
          }))
        }

        setAssignments(allWarehouses)

        // Get stored selection or use first warehouse
        let storedWarehouseId: string | null = null
        try {
          storedWarehouseId = sessionStorage.getItem("selectedWarehouseId")
        } catch (e) {
          console.error("Failed to access sessionStorage:", e)
        }

        if (storedWarehouseId && allWarehouses.some(a => a.warehouseId === storedWarehouseId)) {
          setSelectedWarehouseId(storedWarehouseId)
        } else {
          // Find main warehouse or use first one
          const mainWarehouse = allWarehouses.find(a => a.warehouse.type === "MAIN")
          const defaultWarehouseId = mainWarehouse?.warehouseId || allWarehouses[0]?.warehouseId || ""
          setSelectedWarehouseId(defaultWarehouseId)

          if (defaultWarehouseId) {
            try {
              sessionStorage.setItem("selectedWarehouseId", defaultWarehouseId)
            } catch (e) {
              console.error("Failed to save to sessionStorage:", e)
            }
          }
        }
      } catch (error) {
        console.error("Failed to load warehouse assignments:", error)
      } finally {
        setLoading(false)
      }
    }

    loadAssignments()
  }, [user?.id, isMultiWarehouseRole])

  // Handle warehouse selection change
  const handleWarehouseChange = (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId)
    setOpen(false)

    // Save to sessionStorage
    try {
      sessionStorage.setItem("selectedWarehouseId", warehouseId)
    } catch (e) {
      console.error("Failed to save to sessionStorage:", e)
    }

    // Call callback
    onWarehouseChange?.(warehouseId)

    // Dispatch custom event for other components to listen
    window.dispatchEvent(
      new CustomEvent(WAREHOUSE_CHANGE_EVENT, {
        detail: { warehouseId }
      })
    )
  }

  // Don't render for non-multi-warehouse users
  if (!isMultiWarehouseRole) {
    return null
  }

  // Show loading skeleton
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <Skeleton className="h-9 w-[200px]" />
      </div>
    )
  }

  // Don't show if user has no assignments or only one warehouse
  if (assignments.length <= 1) {
    return null
  }

  const selectedWarehouse = assignments.find(a => a.warehouseId === selectedWarehouseId)

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-muted-foreground hidden md:block" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[200px] justify-between"
          >
            <span className="truncate">
              {selectedWarehouse
                ? `${selectedWarehouse.warehouse.code} - ${selectedWarehouse.warehouse.name}`
                : "Chọn kho..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Tìm kho..." />
            <CommandEmpty>Không tìm thấy kho.</CommandEmpty>
            <CommandGroup>
              {assignments.map((assignment) => (
                <CommandItem
                  key={assignment.warehouseId}
                  value={`${assignment.warehouse.code} ${assignment.warehouse.name}`}
                  onSelect={() => handleWarehouseChange(assignment.warehouseId)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedWarehouseId === assignment.warehouseId ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {assignment.warehouse.code} - {assignment.warehouse.name}
                      {assignment.isPrimary && (
                        <span className="ml-2 text-xs text-muted-foreground">(Chính)</span>
                      )}
                    </span>
                    {assignment.warehouse.location && (
                      <span className="text-xs text-muted-foreground">
                        {assignment.warehouse.location}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Hook to get current selected warehouse ID
export function useSelectedWarehouse(): string | null {
  const { user } = useAuth()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null)

  useEffect(() => {
    // Initialization: Try session storage first, then fallback to user's assigned warehouse
    const initWarehouse = () => {
      try {
        const stored = sessionStorage.getItem("selectedWarehouseId")
        if (stored) {
          setSelectedWarehouseId(stored)
          return
        }
      } catch (e) {
        console.error("Failed to access sessionStorage:", e)
      }
      // Fallback
      setSelectedWarehouseId(user?.warehouseId || null)
    }

    initWarehouse()

    // Listen for warehouse changes
    const handleWarehouseChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ warehouseId: string }>
      setSelectedWarehouseId(customEvent.detail.warehouseId)
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [user?.warehouseId])

  return selectedWarehouseId
}
