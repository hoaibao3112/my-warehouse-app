"use client"

import { useEffect, useState } from "react"
import { WeeklyShiftCalendar } from "@/components/shifts/weekly-shift-calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Calendar, Users, Clock, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { mobileFetch } from "@/lib/mobile/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

export default function HRShiftsPage() {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [loading, setLoading] = useState(true)
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await mobileFetch("/api/warehouses?pageSize=1000")
        const json = await res.json()

        if (json.success) {
          const warehouseList = json.data || []
          setWarehouses(warehouseList)

          // Auto-select first warehouse
          if (warehouseList.length > 0 && !selectedWarehouseId) {
            setSelectedWarehouseId(warehouseList[0].id)
          }
        } else {
          toast.error(json.error || "Không thể tải danh sách kho")
        }
      } catch (error) {
        console.error("Error fetching warehouses:", error)
        toast.error("Không thể tải danh sách kho")
      } finally {
        setLoading(false)
      }
    }

    fetchWarehouses()
  }, [toast])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (warehouses.length === 0) {
    return (
      <div className="p-6">
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Không tìm thấy kho nào trong hệ thống</p>
          </div>
        </Card>
      </div>
    )
  }

  // Legend items with colors
  const legendItems = [
    { color: "bg-muted border-muted-foreground/20", label: "Chưa xếp ca", icon: null },
    { color: "bg-purple-100 border-purple-300 dark:bg-purple-950 dark:border-purple-800", label: "Chờ duyệt", icon: Loader2 },
    { color: "bg-blue-100 border-blue-300 dark:bg-blue-950 dark:border-blue-800", label: "Đã xếp ca", icon: Clock },
    { color: "bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-800", label: "Đúng giờ", icon: CheckCircle2 },
    { color: "bg-orange-100 border-orange-300 dark:bg-orange-950 dark:border-orange-800", label: "Đi muộn/Ra sớm", icon: AlertTriangle },
    { color: "bg-amber-100 border-amber-300 dark:bg-amber-950 dark:border-amber-800", label: "Chưa chấm công", icon: XCircle },
    { color: "bg-red-100 border-red-300 dark:bg-red-950 dark:border-red-800", label: "Vắng mặt", icon: XCircle },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="bg-primary text-primary-foreground p-4 rounded-b-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Xếp Ca Làm Việc</h1>
              <p className="text-sm opacity-80">Quản lý lịch làm việc nhân viên</p>
            </div>
          </div>
        </div>
      )}

      <div className={cn("p-4 space-y-4", !isMobile && "max-w-full p-6")}>
        {/* Desktop Header */}
        {!isMobile && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                <Calendar className="w-8 h-8 text-primary" />
                Xếp Ca Làm Việc
              </h1>
              <p className="text-muted-foreground mt-1">
                Quản lý lịch làm việc và chấm công của nhân viên
              </p>
            </div>
          </div>
        )}

        {/* Warehouse Selector */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <Label htmlFor="warehouse-select" className="font-medium whitespace-nowrap">
              Chọn kho/cửa hàng:
            </Label>
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger id="warehouse-select" className="md:w-[300px]">
                <SelectValue placeholder="Chọn kho" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Legend - Mobile: Compact horizontal scroll, Desktop: Full width */}
        <Card className={cn(isMobile ? "p-3" : "p-4")}>
          <div className={cn(
            "flex items-center gap-2",
            isMobile ? "overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" : "flex-wrap gap-4"
          )}>
            <span className={cn(
              "text-muted-foreground font-medium whitespace-nowrap",
              isMobile ? "text-xs" : "text-sm"
            )}>
              Chú thích:
            </span>
            {legendItems.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap",
                  isMobile ? "flex-shrink-0" : ""
                )}
              >
                <div className={cn(
                  "rounded border",
                  item.color,
                  isMobile ? "w-4 h-4" : "w-5 h-5"
                )}>
                  {item.icon && (
                    <item.icon className={cn(
                      "w-full h-full p-0.5",
                      item.color.includes("green") ? "text-green-600" :
                        item.color.includes("yellow") ? "text-yellow-600" :
                          item.color.includes("red") ? "text-red-600" :
                            item.color.includes("blue") ? "text-blue-600" :
                              item.color.includes("purple") ? "text-purple-600" : "text-muted-foreground",
                      item.label === "Chờ duyệt" && "animate-spin"
                    )} />
                  )}
                </div>
                <span className={cn(isMobile ? "text-xs" : "text-sm")}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Calendar Component */}
        {selectedWarehouseId && (
          <WeeklyShiftCalendar warehouseId={selectedWarehouseId} />
        )}
      </div>
    </div>
  )
}
