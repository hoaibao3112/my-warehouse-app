"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Building2, Star } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

interface Warehouse {
  id: string
  code: string
  name: string
  type: string
  location?: string
  isActive: boolean
}

interface UserWarehouseAssignment {
  id: string
  userId: string
  warehouseId: string
  isPrimary: boolean
  warehouse: Warehouse
}

interface WarehouseAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  onAssignmentComplete?: () => void
}

export function WarehouseAssignmentDialog({
  open,
  onOpenChange,
  userId,
  userName,
  onAssignmentComplete,
}: WarehouseAssignmentDialogProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [currentAssignments, setCurrentAssignments] = useState<UserWarehouseAssignment[]>([])
  const [selectedWarehouses, setSelectedWarehouses] = useState<Set<string>>(new Set())
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && userId) {
      loadData()
    }
  }, [open, userId])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load all warehouses
      const warehousesResponse = await mobileFetch('/api/warehouses')
      const warehousesData = await warehousesResponse.json()

      if (warehousesData.success) {
        setWarehouses(warehousesData.data || [])
      }

      // Load current assignments
      const assignmentsResponse = await mobileFetch(`/api/user-warehouse-assignments?userId=${userId}`)
      const assignmentsData = await assignmentsResponse.json()

      if (assignmentsData.success) {
        const assignments = assignmentsData.data || []
        setCurrentAssignments(assignments)

        // Set selected warehouses
        const selected = new Set(assignments.map((a: UserWarehouseAssignment) => a.warehouseId))
        setSelectedWarehouses(selected)

        // Set primary warehouse
        const primary = assignments.find((a: UserWarehouseAssignment) => a.isPrimary)
        if (primary) {
          setPrimaryWarehouseId(primary.warehouseId)
        } else if (selected.size > 0) {
          setPrimaryWarehouseId(Array.from(selected)[0])
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error("Không thể tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }

  const toggleWarehouse = (warehouseId: string) => {
    const newSelected = new Set(selectedWarehouses)

    if (newSelected.has(warehouseId)) {
      newSelected.delete(warehouseId)
      // If removing the primary warehouse, select another one
      if (primaryWarehouseId === warehouseId && newSelected.size > 0) {
        setPrimaryWarehouseId(Array.from(newSelected)[0])
      }
    } else {
      newSelected.add(warehouseId)
      // If this is the first warehouse, make it primary
      if (newSelected.size === 1) {
        setPrimaryWarehouseId(warehouseId)
      }
    }

    setSelectedWarehouses(newSelected)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedWarehouses.size === 0) {
      toast.error("Vui lòng chọn ít nhất một kho")
      return
    }

    if (!primaryWarehouseId) {
      toast.error("Vui lòng chọn kho chính")
      return
    }

    setSubmitting(true)

    try {
      const response = await mobileFetch('/api/user-warehouse-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          warehouseIds: Array.from(selectedWarehouses),
          primaryWarehouseId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Đã gán ${selectedWarehouses.size} kho cho ${userName}`)
        onOpenChange(false)
        onAssignmentComplete?.()
      } else {
        toast.error(data.error || "Không thể gán kho")
      }
    } catch (error) {
      toast.error("Không thể kết nối đến server")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gán Kho Cho Quản Lý</DialogTitle>
          <DialogDescription>
            Chọn các kho mà {userName} sẽ quản lý. Có thể chọn nhiều kho và đặt kho chính làm mặc định.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="h-10 flex-1" />
                  </div>
                ))}
              </div>
            ) : warehouses.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Không có kho nào
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Chọn kho ({selectedWarehouses.size} đã chọn)</Label>
                  <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
                    {warehouses.map((warehouse) => {
                      const isSelected = selectedWarehouses.has(warehouse.id)
                      const isPrimary = primaryWarehouseId === warehouse.id

                      return (
                        <div
                          key={warehouse.id}
                          className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${isSelected
                              ? "bg-primary/5 border-primary"
                              : "hover:bg-accent"
                            }`}
                        >
                          <Checkbox
                            id={`warehouse-${warehouse.id}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleWarehouse(warehouse.id)}
                          />
                          <label
                            htmlFor={`warehouse-${warehouse.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">
                                  {warehouse.code} - {warehouse.name}
                                </div>
                                {warehouse.location && (
                                  <div className="text-xs text-muted-foreground">
                                    {warehouse.location}
                                  </div>
                                )}
                              </div>
                              <div className="ml-auto flex items-center gap-2">
                                <Badge variant={warehouse.type === "MAIN" ? "default" : "outline"}>
                                  {warehouse.type === "MAIN" ? "Kho Tổng" : "Cửa Hàng"}
                                </Badge>
                                {!warehouse.isActive && (
                                  <Badge variant="destructive">Tạm ngưng</Badge>
                                )}
                              </div>
                            </div>
                          </label>
                          {isSelected && (
                            <Button
                              type="button"
                              variant={isPrimary ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPrimaryWarehouseId(warehouse.id)}
                              className="ml-2"
                            >
                              <Star className={`w-4 h-4 ${isPrimary ? "fill-current" : ""}`} />
                              {isPrimary ? "Kho Chính" : "Đặt Chính"}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {selectedWarehouses.size > 0 && (
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <div className="text-sm font-medium mb-2">Tóm tắt:</div>
                    <div className="text-sm text-muted-foreground">
                      • Đã chọn: {selectedWarehouses.size} kho
                      <br />
                      • Kho chính:{" "}
                      {warehouses.find((w) => w.id === primaryWarehouseId)?.name || "Chưa chọn"}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || loading || selectedWarehouses.size === 0}>
              {submitting ? "Đang xử lý..." : "Gán Kho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
