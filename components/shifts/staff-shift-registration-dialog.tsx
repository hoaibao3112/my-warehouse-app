"use client"

import { useState } from "react"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatDateLongNoTz } from "@/lib/server-time"
import { vi } from "date-fns/locale"
import { formatTime } from "@/lib/shift-status"
import { toast } from "sonner"

const VIETNAM_TZ = 'Asia/Ho_Chi_Minh'

interface StaffShiftRegistrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: Date | null
  shifts: any[]
  onRegister: (shiftId: string, notes: string) => Promise<void>
}

export function StaffShiftRegistrationDialog({
  open,
  onOpenChange,
  date,
  shifts,
  onRegister,
}: StaffShiftRegistrationDialogProps) {
  const [selectedShiftId, setSelectedShiftId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!selectedShiftId) {
      toast.error("Vui lòng chọn ca làm việc")
      return
    }

    setSubmitting(true)
    try {
      await onRegister(selectedShiftId, notes)
      setSelectedShiftId("")
      setNotes("")
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error.message || "Không thể đăng ký ca")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đăng ký ca làm việc</DialogTitle>
          <DialogDescription>
            {date && formatDateLongNoTz(date, 'vi')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Chọn ca làm việc *</Label>
            <RadioGroup
              value={selectedShiftId}
              onValueChange={setSelectedShiftId}
            >
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer"
                  onClick={() => setSelectedShiftId(shift.id)}
                >
                  <RadioGroupItem
                    value={shift.id}
                    id={shift.id}
                  />
                  <Label
                    htmlFor={shift.id}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-semibold">{shift.shift_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {shifts.length === 0 && (
              <p className="text-sm text-muted-foreground">Không có ca làm việc nào khả dụng</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú (tùy chọn)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Thêm ghi chú nếu cần..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedShiftId}
          >
            {submitting ? "Đang đăng ký..." : "Đăng ký"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
