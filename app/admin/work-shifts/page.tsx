"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Trash2, Clock, CalendarClock } from "lucide-react"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { toast } from "sonner"
import { formatTime } from "@/lib/shift-status"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { TimePicker24h } from "@/components/ui/time-picker-24h"
import { mobileFetch } from "@/lib/mobile/api-client"

interface WorkShift {
  id: string
  warehouse_id: string
  shift_name: string
  shift_code: string
  start_time: string | Date
  end_time: string | Date
  description?: string
  is_active: boolean
  warehouses?: {
    id: string
    code: string
    name: string
    type: string
  }
}

interface Warehouse {
  id: string
  code: string
  name: string
  type: string
}

export default function WorkShiftsPage() {
  const [shifts, setShifts] = useState<WorkShift[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<WorkShift | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })

  // Form state
  const [shiftName, setShiftName] = useState("")
  const [shiftCode, setShiftCode] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [description, setDescription] = useState("")
  const [isActive, setIsActive] = useState(true)

  // Fetch warehouses
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await mobileFetch("/api/warehouses?page=1&pageSize=100")
        const json = await res.json()
        if (json.success) {
          setWarehouses(json.data || [])
        }
      } catch (error) {
        console.error("Error fetching warehouses:", error)
        toast.error("Không thể tải danh sách kho")
      }
    }
    fetchWarehouses()
  }, [])

  // Fetch shifts
  const fetchShifts = async () => {
    setLoading(true)
    try {
      const res = await mobileFetch("/api/admin/work-shifts?page=1&limit=100")
      const json = await res.json()
      if (json.success) {
        setShifts(json.data || [])
      } else {
        toast.error(json.error || "Không thể tải danh sách ca làm việc")
      }
    } catch (error) {
      console.error("Error fetching shifts:", error)
      toast.error("Không thể tải danh sách ca làm việc")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShifts()
  }, [])

  const resetForm = () => {
    setShiftName("")
    setShiftCode("")
    setStartTime("")
    setEndTime("")
    setDescription("")
    setIsActive(true)
    setEditingShift(null)
  }

  const openCreateDialog = () => {
    resetForm()
    setOpen(true)
  }

  const openEditDialog = (shift: WorkShift) => {
    setEditingShift(shift)
    setShiftName(shift.shift_name)
    setShiftCode(shift.shift_code)
    setStartTime(formatTime(shift.start_time))
    setEndTime(formatTime(shift.end_time))
    setDescription(shift.description || "")
    setIsActive(shift.is_active)
    setOpen(true)
  }

  const handleSubmit = async () => {
    // Validate
    if (!shiftName || !startTime || !endTime) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc")
      return
    }

    setSubmitting(true)
    try {
      // Get first warehouse ID (any warehouse since shifts apply to all)
      const defaultWarehouseId = warehouses.length > 0 ? warehouses[0].id : null

      if (!defaultWarehouseId) {
        toast.error("Không tìm thấy kho trong hệ thống")
        setSubmitting(false)
        return
      }

      // Auto-generate shift code from shift name if not provided
      let finalShiftCode = shiftCode
      if (!shiftCode) {
        // Generate code from name: "Ca Sáng" -> "CA_SANG"
        finalShiftCode = shiftName
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // Remove Vietnamese accents
          .replace(/Đ/g, "D")
          .replace(/[^A-Z0-9\s]/g, "")
          .trim()
          .replace(/\s+/g, "_")
      }

      const body = {
        warehouse_id: defaultWarehouseId, // Use default warehouse
        shift_name: shiftName,
        shift_code: finalShiftCode.toUpperCase(),
        start_time: startTime + ":00", // Add seconds
        end_time: endTime + ":00",
        description,
        is_active: isActive,
      }

      const url = editingShift
        ? `/api/admin/work-shifts/${editingShift.id}`
        : "/api/admin/work-shifts"
      const method = editingShift ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(editingShift
            ? "Cập nhật ca làm việc thành công"
            : "Tạo ca làm việc thành công")
        setOpen(false)
        resetForm()
        fetchShifts()
      } else {
        toast.error(json.error || "Không thể lưu ca làm việc")
      }
    } catch (error) {
      console.error("Error saving shift:", error)
      toast.error("Không thể lưu ca làm việc")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa ca làm việc",
      description: "Bạn có chắc chắn muốn xóa ca làm việc này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await mobileFetch(`/api/admin/work-shifts/${id}`, {
            method: "DELETE",
          })

          const json = await res.json()

          if (json.success) {
            toast.success(json.message || "Xóa ca làm việc thành công")
            fetchShifts()
          } else {
            toast.error(json.error || "Không thể xóa ca làm việc")
          }
        } catch (error) {
          console.error("Error deleting shift:", error)
          toast.error("Không thể xóa ca làm việc")
        }
      }
    })
  }

  const columns: TableColumn<WorkShift>[] = [
    {
      key: "shift_code",
      label: "Mã ca",
      className: "font-medium",
    },
    {
      key: "shift_name",
      label: "Tên ca",
    },
    {
      key: "time",
      label: "Giờ làm việc",
      render: (shift) => (
        <div className="flex items-center gap-1 text-sm">
          <Clock className="h-3 w-3" />
          {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
        </div>
      ),
      mobilePrimary: true,
    },
    {
      key: "is_active",
      label: "Trạng thái",
      render: (shift) => (
        <Badge variant={shift.is_active ? "default" : "secondary"}>
          {shift.is_active ? "Hoạt động" : "Không hoạt động"}
        </Badge>
      ),
    },
  ]

  const actions: TableAction<WorkShift>[] = [
    {
      label: "Chỉnh sửa",
      icon: <Edit className="h-4 w-4" />,
      onClick: openEditDialog,
    },
    {
      label: "Xóa",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (shift) => handleDelete(shift.id),
      variant: "destructive",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={CalendarClock}
        title="Quản Lý Ca"
        subtitle="Tạo và quản lý ca làm việc"
        gradient="indigo"
      />

      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold">Quản Lý Ca</h1>
            <p className="text-muted-foreground mt-1">
              Tạo và quản lý các ca làm việc áp dụng cho tất cả cửa hàng
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden md:inline">Tạo Ca Mới</span>
                <span className="md:hidden">Tạo</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingShift ? "Chỉnh Sửa Ca Làm Việc" : "Tạo Ca Làm Việc Mới"}
                </DialogTitle>
                <DialogDescription>
                  {editingShift
                    ? "Cập nhật thông tin ca làm việc"
                    : "Nhập thông tin ca làm việc mới"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="shift_name">
                    Tên ca <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="shift_name"
                    value={shiftName}
                    onChange={(e) => setShiftName(e.target.value)}
                    placeholder="VD: Ca Sáng, Ca Chiều, Ca Đêm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_time">
                      Giờ bắt đầu <span className="text-red-500">*</span>
                    </Label>
                    <TimePicker24h
                      value={startTime}
                      onChange={setStartTime}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end_time">
                      Giờ kết thúc <span className="text-red-500">*</span>
                    </Label>
                    <TimePicker24h
                      value={endTime}
                      onChange={setEndTime}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Mô tả</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mô tả về ca làm việc"
                    rows={3}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Hoạt động
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false)
                    resetForm()
                  }}
                  disabled={submitting}
                >
                  Hủy
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting
                    ? "Đang lưu..."
                    : editingShift
                      ? "Cập nhật"
                      : "Tạo mới"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-6">
        <ResponsiveTable
          data={shifts}
          columns={columns}
          actions={actions}
          keyExtractor={(shift) => shift.id}
          loading={loading}
          emptyMessage="Chưa có ca làm việc nào"
          mobileCardTitle={(shift) => shift.shift_name}
          mobileCardSubtitle={(shift) => shift.shift_code}
          mobileCardBadge={(shift) => (
            <Badge variant={shift.is_active ? "default" : "secondary"}>
              {shift.is_active ? "Hoạt động" : "Tắt"}
            </Badge>
          )}
          mobileCardMeta={(shift) => [
            <span key="time" className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
            </span>,
          ]}
        />
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-[340px] rounded-lg">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={confirmDialog.onConfirm}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
