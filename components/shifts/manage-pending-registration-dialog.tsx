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
import { formatTime } from "@/lib/shift-status"
import { Pencil, Trash2, Loader2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ManagePendingRegistrationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    date: Date | null
    currentShift: any // Current pending shift info
    shifts: any[] // Available shifts for editing
    onEdit: (shiftId: string, notes: string) => Promise<void>
    onDelete: () => Promise<void>
}

export function ManagePendingRegistrationDialog({
    open,
    onOpenChange,
    date,
    currentShift,
    shifts,
    onEdit,
    onDelete,
}: ManagePendingRegistrationDialogProps) {
    const [mode, setMode] = useState<"view" | "edit">("view")
    const [selectedShiftId, setSelectedShiftId] = useState<string>("")
    const [notes, setNotes] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            setMode("view")
            setSelectedShiftId("")
            setNotes("")
        }
        onOpenChange(isOpen)
    }

    const handleStartEdit = () => {
        setSelectedShiftId(currentShift?.id || "")
        setNotes("")
        setMode("edit")
    }

    const handleSaveEdit = async () => {
        if (!selectedShiftId) return

        setSubmitting(true)
        try {
            await onEdit(selectedShiftId, notes)
            handleOpenChange(false)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async () => {
        setSubmitting(true)
        try {
            await onDelete()
            setShowDeleteConfirm(false)
            handleOpenChange(false)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {mode === "view" ? "🗓️ Đăng ký đang chờ duyệt" : "✏️ Đổi ca đăng ký"}
                        </DialogTitle>
                        <DialogDescription>
                            {date && formatDateLongNoTz(date, 'vi')}
                        </DialogDescription>
                    </DialogHeader>

                    {mode === "view" ? (
                        <>
                            {/* View mode - show current registration info */}
                            <div className="py-4">
                                <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div className="font-semibold text-lg">{currentShift?.shift_name || "Ca đã đăng ký"}</div>
                                    {currentShift?.start_time && currentShift?.end_time && (
                                        <div className="text-muted-foreground">
                                            {formatTime(currentShift.start_time)} - {formatTime(currentShift.end_time)}
                                        </div>
                                    )}
                                    <div className="mt-2 text-sm text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Đang chờ quản lý phê duyệt
                                    </div>
                                </div>
                            </div>

                            <DialogFooter className="flex-col sm:flex-row gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => handleOpenChange(false)}
                                    className="w-full sm:w-auto"
                                >
                                    Đóng
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleStartEdit}
                                    className="w-full sm:w-auto"
                                >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Đổi ca
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full sm:w-auto"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Xóa đăng ký
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            {/* Edit mode - show shift selection */}
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Chọn ca mới *</Label>
                                    <RadioGroup
                                        value={selectedShiftId}
                                        onValueChange={setSelectedShiftId}
                                    >
                                        {shifts.map((shift) => (
                                            <div
                                                key={shift.id}
                                                className={`flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer ${shift.id === currentShift?.id ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20" : ""
                                                    }`}
                                                onClick={() => setSelectedShiftId(shift.id)}
                                            >
                                                <RadioGroupItem value={shift.id} id={`edit-${shift.id}`} />
                                                <Label htmlFor={`edit-${shift.id}`} className="flex-1 cursor-pointer">
                                                    <div className="font-semibold">
                                                        {shift.shift_name}
                                                        {shift.id === currentShift?.id && (
                                                            <span className="text-xs text-purple-600 ml-2">(hiện tại)</span>
                                                        )}
                                                    </div>
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
                                    <Label htmlFor="edit-notes">Ghi chú (tùy chọn)</Label>
                                    <Textarea
                                        id="edit-notes"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Thêm ghi chú nếu cần..."
                                        rows={2}
                                    />
                                </div>
                            </div>

                            <DialogFooter className="flex-col sm:flex-row gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setMode("view")}
                                    disabled={submitting}
                                    className="w-full sm:w-auto"
                                >
                                    Quay lại
                                </Button>
                                <Button
                                    onClick={handleSaveEdit}
                                    disabled={submitting || !selectedShiftId || selectedShiftId === currentShift?.id}
                                    className="w-full sm:w-auto"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Đang lưu...
                                        </>
                                    ) : (
                                        "Lưu thay đổi"
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Xác nhận xóa đăng ký?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Bạn có chắc muốn xóa đăng ký ca này? Hành động này không thể hoàn tác.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={submitting}>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={submitting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Đang xóa...
                                </>
                            ) : (
                                "Xóa"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
