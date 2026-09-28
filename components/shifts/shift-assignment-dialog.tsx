import { useState, useEffect } from "react"
// Force refresh
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { formatTime } from "@/lib/shift-status"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { mobileFetch } from "@/lib/mobile/api-client"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface ShiftAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: string; full_name: string } | null
  date: Date | null
  currentAssignment: any | null // Unused but kept for prop compat
  shifts: any[]
  onSave: (assignment?: any, createAttendance?: boolean) => void
}

export function ShiftAssignmentDialog({
  open,
  onOpenChange,
  user,
  date,
  shifts,
  onSave,
}: ShiftAssignmentDialogProps) {
  // State
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [existingAssignments, setExistingAssignments] = useState<any[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [createAttendance, setCreateAttendance] = useState(false)

  useEffect(() => {
    if (open && user && date) {
      setLoading(true)
      mobileFetch(`/api/shifts/assignments?user_id=${user.id}&date=${format(date, 'yyyy-MM-dd')}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setExistingAssignments(Array.isArray(data.data) ? data.data : [data.data])
            setSelectedShiftId("") // Reset selection
          } else {
            setExistingAssignments([])
            setSelectedShiftId("")
          }
        })
        .catch(err => {
          console.error('Failed to fetch assignments:', err)
          toast.error("Không thể tải danh sách gán ca")
          setExistingAssignments([])
        })
        .finally(() => setLoading(false))
    } else {
      setExistingAssignments([])
      setSelectedShiftId("")
      setNotes("")
      setCreateAttendance(false)
    }
  }, [open, user, date])


  const handleSave = async () => {
    if (!user || !date || !selectedShiftId) {
      toast.error("Vui lòng chọn ca làm việc")
      return
    }

    setSaving(true)
    try {
      // Use legacy SINGLE assignment logic to APPEND a new shift
      const res = await mobileFetch("/api/shifts/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_shift_id: selectedShiftId, // Legacy single ID
          user_id: user.id,
          assigned_date: format(date, "yyyy-MM-dd"),
          notes,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || "Failed to save assignment")
      }

      toast.success("Đã thêm ca làm việc")
      onSave(json.data, createAttendance)
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error.message || "Không thể lưu thay đổi")
    } finally {
      setSaving(false)
    }
  }

  // Filter out shifts that are already assigned
  const availableShifts = shifts.filter(
    s => !existingAssignments.some(ea => ea.work_shift_id === s.id)
  )

  if (!user || !date) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-zinc-50 dark:bg-zinc-900 gap-0">
        <DialogHeader className="p-4 bg-white dark:bg-zinc-950 border-b">
          <DialogTitle>Xếp Ca Làm Việc</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{user.full_name}</span>
            {" - "}
            {format(date, "EEEE, dd/MM/yyyy", { locale: vi })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[60vh] p-4">
          <div className="space-y-4">
            <label className="text-sm font-medium text-muted-foreground ml-1">
              Chọn ca làm việc
            </label>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableShifts.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground bg-white dark:bg-zinc-950 rounded-lg border border-dashed">
                Không còn ca nào để xếp cho ngày này (hoặc chưa cấu hình ca)
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {availableShifts.map((shift) => {
                  const isSelected = selectedShiftId === shift.id
                  return (
                    <div
                      key={shift.id}
                      onClick={() => setSelectedShiftId(shift.id)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-white hover:shadow-sm",
                        isSelected
                          ? "bg-primary/5 border-primary shadow-sm"
                          : "bg-white dark:bg-zinc-950 border-transparent hover:border-gray-200"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          isSelected ? "border-primary" : "border-muted-foreground/30"
                        )}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div className="grid gap-0.5">
                          <span className={cn("font-semibold text-sm", isSelected && "text-primary")}>
                            {shift.shift_name} ({shift.shift_code})
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nhập ghi chú (tùy chọn)"
              className="bg-white dark:bg-zinc-950"
            />
          </div>

          {/* "Create Attendance" option for past dates and today */}
          {date && new Date(date) <= new Date() && (
            <div className="flex items-center space-x-2 mt-4 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
              <Checkbox
                id="createAttendance"
                checked={createAttendance}
                onCheckedChange={(c) => setCreateAttendance(!!c)}
                className="border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:text-white"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="createAttendance"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Chấm công giùm ngay
                </label>
                <p className="text-[0.8rem] text-muted-foreground">
                  Mở hộp thoại chấm công sau khi xếp ca xong
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-white dark:bg-zinc-950 mt-auto">
          <Button
            className="w-full h-11 text-base font-semibold shadow-lg shadow-primary/20"
            onClick={handleSave}
            disabled={saving || !selectedShiftId}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang lưu...
              </>
            ) : (
              "Lưu thay đổi"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
