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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, addDays } from "date-fns"
import { vi } from "date-fns/locale"
import { toast } from "sonner"
import { CalendarIcon, ArrowRightLeft, AlertCircle, ArrowRight } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { mobileFetch } from "@/lib/mobile/api-client"

interface WorkShift {
  id: string
  shift_name: string
  shift_code: string
  start_time: string | Date
  end_time: string | Date
}

interface ShiftAssignment {
  id: string
  assigned_date: Date
  work_shift_id: string
  work_shifts: WorkShift
}

interface ShiftSwapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  myShifts: ShiftAssignment[]
  onSwapRequest: (data: {
    requesterDate: Date
    workShiftId: string
    targetDate: Date
    targetWorkShiftId: string
    swapType: 'SWAP' | 'REPLACE'
    reason: string
  }) => Promise<void>
}

export function ShiftSwapDialog({
  open,
  onOpenChange,
  myShifts,
  onSwapRequest,
}: ShiftSwapDialogProps) {
  // Swap type selection
  const [swapType, setSwapType] = useState<'SWAP' | 'REPLACE'>('SWAP')

  // Selected date (same date for both source and target)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Source shift (my shift I want to give away)
  const [sourceShiftId, setSourceShiftId] = useState<string>("")

  // Target shift (shift I want to receive on the same day)
  const [targetShiftId, setTargetShiftId] = useState<string>("")

  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [availableTargetShifts, setAvailableTargetShifts] = useState<WorkShift[]>([])
  const [loadingTargetShifts, setLoadingTargetShifts] = useState(false)

  // Get today without time for comparison
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Max date (30 days from now)
  const maxDate = addDays(today, 30)

  // Filter only future shifts (tomorrow or later - cannot swap today)
  const futureShifts = myShifts.filter((shift) => {
    const shiftDate = new Date(shift.assigned_date)
    shiftDate.setHours(0, 0, 0, 0)
    return shiftDate >= tomorrow
  })

  // Group shifts by date string (yyyy-MM-dd format)
  const shiftsByDate: Record<string, ShiftAssignment[]> = {}
  const datesWithShiftsSet = new Set<string>()

  futureShifts.forEach((shift) => {
    const shiftDate = new Date(shift.assigned_date)
    const dateKey = format(shiftDate, 'yyyy-MM-dd')
    if (!shiftsByDate[dateKey]) {
      shiftsByDate[dateKey] = []
    }
    shiftsByDate[dateKey].push(shift)
    datesWithShiftsSet.add(dateKey)
  })

  // Get shifts for selected date (my shifts)
  const shiftsForSelectedDate = selectedDate
    ? shiftsByDate[format(selectedDate, 'yyyy-MM-dd')] || []
    : []

  // Create array of dates with shifts for calendar highlighting
  const datesWithShifts = Array.from(datesWithShiftsSet).map(dateStr => {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
  })

  // Check if a date has shifts (for source calendar)
  const hasShifts = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return datesWithShiftsSet.has(dateKey)
  }

  // Fetch all available shifts in system when date is selected
  useEffect(() => {
    if (!selectedDate) {
      setAvailableTargetShifts([])
      return
    }

    const fetchTargetShifts = async () => {
      setLoadingTargetShifts(true)
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd')
        const res = await mobileFetch(`/api/shifts/available`)
        const json = await res.json()

        if (json.success) {
          setAvailableTargetShifts(json.data || [])
        }
      } catch (error) {
        console.error("Error fetching target shifts:", error)
        toast.error("Không thể tải danh sách ca làm việc")
      } finally {
        setLoadingTargetShifts(false)
      }
    }

    fetchTargetShifts()
  }, [selectedDate])

  // Reset selections when dialog closes
  useEffect(() => {
    if (!open) {
      setSwapType('SWAP')
      setSelectedDate(undefined)
      setSourceShiftId("")
      setTargetShiftId("")
      setReason("")
    }
  }, [open])

  // Reset shifts when date changes
  useEffect(() => {
    setSourceShiftId("")
    setTargetShiftId("")
  }, [selectedDate])

  // Reset target shift when source shift changes (to prevent same selection)
  useEffect(() => {
    if (sourceShiftId && targetShiftId === sourceShiftId) {
      setTargetShiftId("")
    }
  }, [sourceShiftId])

  const handleSubmit = async () => {
    if (!selectedDate || !sourceShiftId) {
      toast.error("Vui lòng chọn đầy đủ ngày và ca muốn đổi")
      return
    }

    // For SWAP type, need target shift
    if (swapType === 'SWAP' && !targetShiftId) {
      toast.error("Vui lòng chọn ca muốn nhận")
      return
    }

    if (swapType === 'SWAP' && sourceShiftId === targetShiftId) {
      toast.error("Không thể đổi cùng một ca")
      return
    }

    // Validate reason is required
    if (!reason || reason.trim().length === 0) {
      toast.error("Vui lòng nhập lý do đổi ca")
      return
    }

    setSubmitting(true)
    try {
      await onSwapRequest({
        requesterDate: selectedDate,
        workShiftId: sourceShiftId,
        targetDate: selectedDate, // Same date
        targetWorkShiftId: swapType === 'REPLACE' ? '' : targetShiftId, // For REPLACE, send empty string
        swapType: swapType,
        reason: reason.trim(),
      })

      onOpenChange(false)
    } catch (error: any) {
      toast.error(error.message || "Không thể gửi yêu cầu đổi ca")
    } finally {
      setSubmitting(false)
    }
  }

  const formatShiftTime = (shift: WorkShift) => {
    const formatTime = (time: string | Date | undefined | null) => {
      if (!time) return "--:--"

      // If it's a string (from API or database) like "17:00:00"
      if (typeof time === 'string') {
        // Check if it's a simple time string (HH:MM:SS or HH:MM)
        if (/^\d{2}:\d{2}/.test(time)) {
          return time.substring(0, 5)
        }
        // If it's an ISO string with date
        if (time.includes('T')) {
          const date = new Date(time)
          return date.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh'
          }).substring(0, 5)
        }
        return "--:--"
      }

      // If it's a Date object
      if (time instanceof Date) {
        const localTime = time.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Ho_Chi_Minh'
        })
        return localTime.substring(0, 5)
      }

      return "--:--"
    }
    return `${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}`
  }

  // Filter out the source shift from target options
  const filteredTargetShifts = availableTargetShifts.filter(
    shift => shift.id !== sourceShiftId
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Tạo yêu cầu đổi ca
          </DialogTitle>
          <DialogDescription>
            {swapType === 'SWAP'
              ? "Chọn ca muốn đổi với đồng nghiệp trong cùng ngày."
              : "Chọn ca muốn người khác làm thay. Yêu cầu cần được quản lý duyệt."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Swap Type Selection */}
          <div className="space-y-2">
            <Label className="font-semibold">Loại đổi ca *</Label>
            <Select value={swapType} onValueChange={(value: 'SWAP' | 'REPLACE') => setSwapType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SWAP">
                  <div className="flex flex-col">
                    <span className="font-medium">Đổi ca cho nhau</span>
                    <span className="text-xs text-muted-foreground">
                      Tìm đồng nghiệp để đổi ca với bạn
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="REPLACE">
                  <div className="flex flex-col">
                    <span className="font-medium">Người khác làm thay</span>
                    <span className="text-xs text-muted-foreground">
                      Tìm người làm thay ca của bạn (cần quản lý duyệt)
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Warning if no shifts available */}
          {futureShifts.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Bạn chưa có ca làm việc nào trong tương lai. Chỉ có thể tạo yêu cầu đổi ca
                khi bạn đã được xếp ca.
              </AlertDescription>
            </Alert>
          )}

          {/* Date Selection */}
          <div className="space-y-2">
            <Label className="font-semibold">Ngày muốn đổi ca *</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={futureShifts.length === 0}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "EEEE, dd/MM/yyyy", { locale: vi }) : "Chọn ngày có ca của bạn"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date)
                    setCalendarOpen(false)
                  }}
                  locale={vi}
                  disabled={(date) => {
                    // Disable dates without shifts (show but greyed out)
                    return !hasShifts(date)
                  }}
                  modifiers={{
                    hasShift: datesWithShifts
                  }}
                  modifiersStyles={{
                    hasShift: {
                      fontWeight: "bold",
                      backgroundColor: "rgb(59 130 246 / 0.15)",
                      borderRadius: "4px"
                    }
                  }}
                />
                <div className="p-2 border-t text-xs text-muted-foreground text-center">
                  Các ngày được tô màu là ngày bạn có ca
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Shift Selection Row */}
          {selectedDate && shiftsForSelectedDate.length > 0 && (
            <div className="space-y-3">
              <Label className="font-semibold">Chọn ca {swapType === 'REPLACE' ? 'cần người làm thay' : 'đổi'}</Label>

              <div className="flex items-center gap-2">
                {/* Source Shift (My shift to give away) */}
                <div className={cn("space-y-1", swapType === 'REPLACE' ? 'flex-1' : 'flex-1')}>
                  <Label className="text-xs text-orange-600 dark:text-orange-400">
                    {swapType === 'REPLACE' ? 'Ca cần người làm thay *' : 'Ca hiện tại *'}
                  </Label>
                  <Select value={sourceShiftId} onValueChange={setSourceShiftId}>
                    <SelectTrigger className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                      <SelectValue placeholder="Chọn ca của bạn" />
                    </SelectTrigger>
                    <SelectContent>
                      {shiftsForSelectedDate.filter(s => s.work_shifts?.id).map((shift) => (
                        <SelectItem key={shift.id} value={shift.work_shifts.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{shift.work_shifts.shift_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatShiftTime(shift.work_shifts)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Only show arrow and target shift for SWAP type */}
                {swapType === 'SWAP' && (
                  <>
                    {/* Arrow */}
                    <div className="pt-5">
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Target Shift (Shift I want) */}
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-green-600 dark:text-green-400">Ca muốn đổi sang *</Label>
                      <Select
                        value={targetShiftId}
                        onValueChange={setTargetShiftId}
                        disabled={loadingTargetShifts || !sourceShiftId}
                      >
                        <SelectTrigger className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                          <SelectValue placeholder={
                            loadingTargetShifts ? "Đang tải..." :
                              !sourceShiftId ? "Chọn ca hiện tại trước" :
                                "Chọn ca muốn đổi"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredTargetShifts.length === 0 && !loadingTargetShifts ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              Không có ca khác để đổi
                            </div>
                          ) : (
                            filteredTargetShifts.map((shift) => (
                              <SelectItem key={shift.id} value={shift.id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{shift.shift_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatShiftTime(shift)}
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Reason - REQUIRED */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="font-semibold text-red-600 dark:text-red-400">
              Lý do đổi ca * (bắt buộc)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do bạn muốn đổi ca..."
              rows={3}
              className="border-red-200 dark:border-red-800 focus-visible:ring-red-500"
              required
            />
            {reason.trim().length === 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Bạn phải nhập lý do để gửi yêu cầu đổi ca
              </p>
            )}
          </div>

          {/* Info box */}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="text-muted-foreground">
              {swapType === 'SWAP' ? (
                <>
                  💡 <strong>Lưu ý:</strong> Yêu cầu đổi ca sẽ được gửi đến đồng nghiệp đang làm ca bạn muốn đổi sang.
                  Khi có người chấp nhận, cả hai sẽ được thông báo.
                </>
              ) : (
                <>
                  ⚠️ <strong>Lưu ý:</strong> Yêu cầu này sẽ được gửi đến quản lý cửa hàng hoặc HR để duyệt.
                  Sau khi duyệt, hệ thống sẽ tìm người làm thay ca của bạn.
                </>
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !selectedDate ||
              !sourceShiftId ||
              (swapType === 'SWAP' && !targetShiftId) ||
              !reason.trim() ||
              futureShifts.length === 0
            }
          >
            {submitting ? "Đang gửi..." : "Tạo yêu cầu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
