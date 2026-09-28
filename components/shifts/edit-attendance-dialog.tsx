"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"
import { formatVietnamDate } from "@/lib/server-time"

/**
 * Dialog để chỉnh sửa giờ chấm công
 * 
 * Phân quyền:
 * - HR: Có thể sửa tất cả chấm công
 * - ADMIN: Có thể sửa tất cả chấm công
 * - MANAGER: Có thể sửa chấm công nhân viên trong kho của mình
 * - ATTENDANCE_STAFF: Không được sửa (chỉ xem)
 * 
 * Logic:
 * - Hiển thị CẢ 2 input (vào ca + tan ca) cùng lúc
 * - Chỉ cần nhập giờ (HH:mm), ngày lấy từ sessionDate
 * - Chỉ gửi những field thay đổi lên API
 */

interface EditAttendanceDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sessionId: string
    sessionDate: string // ISO date string (YYYY-MM-DD or full ISO)
    initialCheckInTime?: string | null // ISO datetime or null
    initialCheckOutTime?: string | null // ISO datetime or null
    employeeName?: string // Tên nhân viên để hiển thị
    onSuccess: () => void
}

interface GPSData {
    latitude: number
    longitude: number
    accuracy: number
    timestamp: string
}

// Helper: Extract HH:mm from ISO datetime string
function extractTimeFromISO(isoString: string | null | undefined): string {
    if (!isoString) return ""
    try {
        const date = new Date(isoString)
        // Database stores Vietnam time as UTC, so use getUTCHours
        const hours = String(date.getUTCHours()).padStart(2, '0')
        const minutes = String(date.getUTCMinutes()).padStart(2, '0')
        return `${hours}:${minutes}`
    } catch {
        return ""
    }
}

// Helper: Extract YYYY-MM-DD from ISO datetime string
function extractDateFromISO(isoString: string): string {
    if (!isoString) return ""
    // Handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss" formats
    return isoString.split('T')[0]
}

// Helper: Combine date (YYYY-MM-DD) + time (HH:mm) -> YYYY-MM-DDTHH:mm
function combineDateTime(datePart: string, timePart: string): string {
    return `${datePart}T${timePart}`
}

export function EditAttendanceDialog({
    open,
    onOpenChange,
    sessionId,
    sessionDate,
    initialCheckInTime,
    initialCheckOutTime,
    employeeName,
    onSuccess
}: EditAttendanceDialogProps) {
    // Form state
    const [checkInTime, setCheckInTime] = useState("")
    const [checkOutTime, setCheckOutTime] = useState("")
    const [saving, setSaving] = useState(false)

    // Original values to detect changes
    const [originalCheckInTime, setOriginalCheckInTime] = useState("")
    const [originalCheckOutTime, setOriginalCheckOutTime] = useState("")

    // Metadata for audit
    const [modificationIp, setModificationIp] = useState<string | null>(null)
    const [modificationGps, setModificationGps] = useState<GPSData | null>(null)

    // Initialize when dialog opens
    useEffect(() => {
        if (open) {
            // Extract time portions from initial values
            const checkIn = extractTimeFromISO(initialCheckInTime)
            const checkOut = extractTimeFromISO(initialCheckOutTime)

            setCheckInTime(checkIn)
            setCheckOutTime(checkOut)
            setOriginalCheckInTime(checkIn)
            setOriginalCheckOutTime(checkOut)

            // Capture IP address
            const fetchIp = async () => {
                try {
                    const res = await mobileFetch("/api/client-ip")
                    const data = await res.json()
                    if (data.success && data.ip) {
                        setModificationIp(data.ip)
                    }
                } catch (err) {
                    console.warn("Failed to get IP:", err)
                    setModificationIp(null)
                }
            }
            fetchIp()

            // Capture GPS
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setModificationGps({
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            timestamp: new Date().toISOString()
                        })
                    },
                    () => setModificationGps(null),
                    { timeout: 5000, enableHighAccuracy: false }
                )
            }
        }
    }, [open, initialCheckInTime, initialCheckOutTime])

    const handleSave = async () => {
        // Detect what changed
        const checkInChanged = checkInTime !== originalCheckInTime
        const checkOutChanged = checkOutTime !== originalCheckOutTime

        if (!checkInChanged && !checkOutChanged) {
            toast.info("Không có thay đổi nào")
            onOpenChange(false)
            return
        }

        // Validate GPS and IP
        if (!modificationGps) {
            toast.error("Không thể lấy vị trí GPS. Vui lòng bật dịch vụ vị trí.")
            return
        }

        if (!modificationIp) {
            toast.error("Không thể lấy thông tin mạng.")
            return
        }

        try {
            setSaving(true)

            // Extract date part from sessionDate
            const datePart = extractDateFromISO(sessionDate)

            // Build request body - only include changed values
            const body: any = {
                modification_ip: modificationIp,
                modification_gps: modificationGps,
            }

            if (checkInChanged) {
                // If time is empty, send null (clear the value)
                body.check_in_time = checkInTime
                    ? combineDateTime(datePart, checkInTime)
                    : null
            }

            if (checkOutChanged) {
                body.check_out_time = checkOutTime
                    ? combineDateTime(datePart, checkOutTime)
                    : null
            }

            const response = await mobileFetch(`/api/shifts/sessions/${sessionId}/edit-attendance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Không thể cập nhật")
            }

            toast.success("Đã cập nhật chấm công thành công")
            onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            console.error("Error updating attendance:", error)
            toast.error(error.message || "Không thể cập nhật chấm công")
        } finally {
            setSaving(false)
        }
    }

    // Format session date for display
    const displayDate = sessionDate
        ? formatVietnamDate(new Date(sessionDate))
        : ""

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle>Chỉnh Sửa Chấm Công</DialogTitle>
                    <DialogDescription>
                        {employeeName && <span className="font-medium">{employeeName}</span>}
                        {employeeName && displayDate && " - "}
                        {displayDate && <span>Ngày {displayDate}</span>}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Check-in time */}
                    <div className="space-y-2">
                        <Label htmlFor="check-in-time" className="text-sm font-medium">
                            Giờ Vào Ca
                        </Label>
                        <input
                            id="check-in-time"
                            type="time"
                            step="60"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={checkInTime}
                            onChange={(e) => setCheckInTime(e.target.value)}
                            placeholder="--:--"
                        />
                        <p className="text-xs text-muted-foreground">
                            Để trống nếu nhân viên chưa check-in
                        </p>
                    </div>

                    {/* Check-out time */}
                    <div className="space-y-2">
                        <Label htmlFor="check-out-time" className="text-sm font-medium">
                            Giờ Tan Ca
                        </Label>
                        <input
                            id="check-out-time"
                            type="time"
                            step="60"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={checkOutTime}
                            onChange={(e) => setCheckOutTime(e.target.value)}
                            placeholder="--:--"
                        />
                        <p className="text-xs text-muted-foreground">
                            Để trống nếu nhân viên chưa check-out
                        </p>
                    </div>

                    {/* Show what will change */}
                    {(checkInTime !== originalCheckInTime || checkOutTime !== originalCheckOutTime) && (
                        <div className="p-3 bg-amber-50 rounded-md border border-amber-200">
                            <p className="text-sm text-amber-800 font-medium mb-1">Thay đổi:</p>
                            <ul className="text-sm text-amber-700 list-disc list-inside">
                                {checkInTime !== originalCheckInTime && (
                                    <li>Giờ vào: {originalCheckInTime || "(trống)"} → {checkInTime || "(xóa)"}</li>
                                )}
                                {checkOutTime !== originalCheckOutTime && (
                                    <li>Giờ ra: {originalCheckOutTime || "(trống)"} → {checkOutTime || "(xóa)"}</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Hủy
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Đang lưu..." : "Lưu Thay Đổi"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
