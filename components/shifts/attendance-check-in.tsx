"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Clock, CheckCircle2, Circle, Banknote } from "lucide-react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { formatTimeNoTz, formatVietnamTime, formatDateLongNoTz } from "@/lib/server-time"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { mobileFetch } from "@/lib/mobile/api-client"

interface AttendanceCheckInProps {
  todaySession?: any
  todayAssignment?: any
  onCheckInOut: () => void
  requireCashManagement?: boolean // If true, require opening/closing cash input
}

export function AttendanceCheckIn({
  todaySession,
  todayAssignment,
  onCheckInOut,
  requireCashManagement = false
}: AttendanceCheckInProps) {
  const { user } = useAuth()
  // CRITICAL: Use server time, NOT browser time
  const [serverTime, setServerTime] = useState<Date | null>(null)
  const [displayTime, setDisplayTime] = useState<Date>(new Date())
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  // Dialog states
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false)
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false)
  const [openingCash, setOpeningCash] = useState("")
  const [closingCash, setClosingCash] = useState("")
  const [notes, setNotes] = useState("")

  const [gpsAvailable, setGpsAvailable] = useState<boolean | null>(null)
  const [gpsError, setGpsError] = useState<string>("")

  // Fetch server time and sync
  const fetchServerTime = async () => {
    try {
      const res = await mobileFetch('/api/server-time')
      const data = await res.json()

      if (data.success) {
        const serverDateTime = new Date(data.data.currentTime)
        const clientNow = new Date()

        // Calculate offset between server and client
        const offset = serverDateTime.getTime() - clientNow.getTime()

        setServerTime(serverDateTime)
        setDisplayTime(serverDateTime)
        setServerTimeOffset(offset)

        console.log('[SERVER TIME SYNC]', {
          serverTime: serverDateTime.toISOString(),
          clientTime: clientNow.toISOString(),
          offset: offset,
          offsetMinutes: Math.round(offset / (1000 * 60))
        })
      }
    } catch (error) {
      console.error('Failed to fetch server time:', error)
      // Fallback to client time if server time fetch fails
      setDisplayTime(new Date())
    }
  }

  // Initial server time fetch
  useEffect(() => {
    // Fetch server time immediately
    fetchServerTime()
    // No periodic re-sync needed as we use offset
  }, [])

  // Update display time every second (smooth UI with offset correction)
  useEffect(() => {
    const displayTimer = setInterval(() => {
      // Update display time using offset
      const now = new Date()
      setDisplayTime(new Date(now.getTime() + serverTimeOffset))
    }, 1000)

    return () => clearInterval(displayTimer)
  }, [serverTimeOffset])

  useEffect(() => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setGpsAvailable(false)
      setGpsError("Thiết bị không hỗ trợ GPS")
      return
    }

    // Test GPS by attempting to get position with a quick timeout
    let testTimeoutId: NodeJS.Timeout | null = null
    let positionReceived = false

    const testGps = () => {
      testTimeoutId = setTimeout(() => {
        if (!positionReceived) {
          setGpsAvailable(false)
          setGpsError("Thiết bị này không có khả năng GPS (máy tính)")
        }
      }, 2000) // Quick test - if no GPS in 2 seconds, mark as unavailable

      navigator.geolocation.getCurrentPosition(
        () => {
          positionReceived = true
          if (testTimeoutId) clearTimeout(testTimeoutId)
          setGpsAvailable(true)
          setGpsError("")
        },
        (error) => {
          if (testTimeoutId) clearTimeout(testTimeoutId)

          if (error.code === error.PERMISSION_DENIED) {
            setGpsAvailable(false)
            setGpsError("Vui lòng cho phép truy cập vị trị trong cài đặt trình duyệt")
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setGpsAvailable(false)
            setGpsError("Thiết bị này không có khả năng GPS (máy tính)")
          } else {
            setGpsAvailable(false)
            setGpsError("Không thể kết nối GPS")
          }
        },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 0 }
      )
    }

    // Start GPS test immediately
    testGps()
  }, [])

  const formatCurrency = (value: string) => {
    const num = value.replace(/\D/g, '')
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }

  const parseCurrency = (value: string) => {
    return parseInt(value.replace(/\./g, ''), 10) || 0
  }

  const handleCheckInClick = () => {
    if (!gpsAvailable) {
      toast.error(gpsError || "Vui lòng bật định vị để chấm công")
      return
    }

    if (!todayAssignment) {
      toast.error("Bạn chưa được xếp ca làm việc hôm nay")
      return
    }

    if (requireCashManagement) {
      setCheckInDialogOpen(true)
    } else {
      handleCheckIn()
    }
  }

  const handleCheckIn = async () => {
    if (!todayAssignment) {
      toast.error("Bạn chưa được xếp ca làm việc hôm nay")
      return
    }

    // Validate GPS is available BEFORE setting submitting
    if (!navigator.geolocation) {
      toast.error("Thiết bị của bạn không hỗ trợ GPS. Vui lòng sử dụng thiết bị khác.")
      return
    }

    try {
      // Get GPS location with retry mechanism
      let latitude: number | null = null
      let longitude: number | null = null
      let accuracy: number | null = null

      const getPosition = (highAccuracy: boolean): Promise<void> => {
        return new Promise((resolve, reject) => {
          let timeoutId: NodeJS.Timeout | null = null

          // Timeout: 10s for high accuracy, 20s for low accuracy - increased for reliability
          const timeoutDuration = highAccuracy ? 10000 : 20000

          timeoutId = setTimeout(() => {
            reject(new Error("Timeout"))
          }, timeoutDuration)

          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (timeoutId) clearTimeout(timeoutId)
              latitude = position.coords.latitude
              longitude = position.coords.longitude
              accuracy = position.coords.accuracy
              resolve()
            },
            (error) => {
              if (timeoutId) clearTimeout(timeoutId)
              reject(error)
            },
            { enableHighAccuracy: highAccuracy, timeout: timeoutDuration, maximumAge: 0 }
          )
        })
      }

      try {
        // Try high accuracy first
        await getPosition(true)
      } catch (error) {
        console.log("High accuracy GPS failed, trying low accuracy...", error)
        // If failed, try low accuracy
        try {
          await getPosition(false)
        } catch (lowAccError: any) {
          let errorMessage = "Không thể lấy vị trí GPS. Vui lòng kiểm tra cài đặt định vị."
          if (lowAccError.code === lowAccError.PERMISSION_DENIED) {
            errorMessage = "Vui lòng cho phép truy cập vị trí trong cài đặt trình duyệt"
            setGpsAvailable(false)
            setGpsError("Vui lòng cho phép truy cập vị trí")
          } else if (lowAccError.code === lowAccError.POSITION_UNAVAILABLE) {
            errorMessage = "Không thể xác định vị trí. Vui lòng kiểm tra GPS."
          } else if (lowAccError.message === "Timeout") {
            errorMessage = "Hết thời gian chờ lấy vị trí. Vui lòng bật GPS và thử lại."
          }
          throw new Error(errorMessage)
        }
      }

      if (latitude === null || longitude === null) {
        toast.error("Không thể lấy vị trí GPS. Vui lòng bật dịch vụ vị trị và thử lại.")
        return
      }

      setSubmitting(true)

      const body: any = {
        shift_assignment_id: todayAssignment.id,
        latitude,
        longitude,
        accuracy,
      }

      // Add opening cash if provided (even if not required)
      if (openingCash) {
        body.opening_cash = parseCurrency(openingCash)
      }
      if (notes) {
        body.notes = notes
      }

      const res = await mobileFetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã chấm công vào ca")
        setCheckInDialogOpen(false)
        setOpeningCash("")
        setNotes("")
        onCheckInOut()
      } else {
        toast.error(json.error || "Không thể chấm công")
      }
    } catch (error: any) {
      console.error("Error checking in:", error)
      toast.error(error.message || "Không thể chấm công")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckOutClick = () => {
    if (!gpsAvailable) {
      toast.error(gpsError || "Vui lòng bật định vị để chấm công")
      return
    }

    if (!todaySession) {
      toast.error("Chưa có phiên làm việc để kết thúc")
      return
    }

    if (requireCashManagement) {
      setCheckOutDialogOpen(true)
    } else {
      handleCheckOut()
    }
  }

  const handleCheckOut = async () => {
    if (!todaySession) {
      toast.error("Chưa có phiên làm việc để kết thúc")
      return
    }

    // Validate GPS is available
    if (!navigator.geolocation) {
      toast.error("Thiết bị của bạn không hỗ trợ GPS. Vui lòng sử dụng thiết bị khác.")
      return
    }

    setSubmitting(true)
    try {
      // Get GPS location with retry mechanism
      let latitude: number | null = null
      let longitude: number | null = null
      let accuracy: number | null = null

      const getPosition = (highAccuracy: boolean): Promise<void> => {
        return new Promise((resolve, reject) => {
          let timeoutId: NodeJS.Timeout | null = null

          // Timeout: 10s for high accuracy, 20s for low accuracy - increased for reliability
          const timeoutDuration = highAccuracy ? 10000 : 20000

          timeoutId = setTimeout(() => {
            reject(new Error("Timeout"))
          }, timeoutDuration)

          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (timeoutId) clearTimeout(timeoutId)
              latitude = position.coords.latitude
              longitude = position.coords.longitude
              accuracy = position.coords.accuracy
              resolve()
            },
            (error) => {
              if (timeoutId) clearTimeout(timeoutId)
              reject(error)
            },
            { enableHighAccuracy: highAccuracy, timeout: timeoutDuration, maximumAge: 0 }
          )
        })
      }

      try {
        // Try high accuracy first
        await getPosition(true)
      } catch (error) {
        console.log("High accuracy GPS failed, trying low accuracy...", error)
        // If failed, try low accuracy
        try {
          await getPosition(false)
        } catch (lowAccError: any) {
          let errorMessage = "Không thể lấy vị trí GPS. Vui lòng kiểm tra cài đặt định vị."
          if (lowAccError.code === lowAccError.PERMISSION_DENIED) {
            errorMessage = "Vui lòng cho phép truy cập vị trí trong cài đặt trình duyệt"
            setGpsAvailable(false)
            setGpsError("Vui lòng cho phép truy cập vị trí")
          } else if (lowAccError.code === lowAccError.POSITION_UNAVAILABLE) {
            errorMessage = "Không thể xác định vị trí. Vui lòng kiểm tra GPS."
          } else if (lowAccError.message === "Timeout") {
            errorMessage = "Hết thời gian chờ lấy vị trí. Vui lòng bật GPS và thử lại."
          }
          throw new Error(errorMessage)
        }
      }

      if (latitude === null || longitude === null) {
        toast.error("Không thể lấy vị trí GPS. Vui lòng bật dịch vụ vị trị và thử lại.")
        return
      }

      setSubmitting(true)

      const body: any = {
        session_id: todaySession.id,
        latitude,
        longitude,
        accuracy,
      }

      // Add closing_cash if provided
      if (closingCash) {
        body.closing_cash = parseCurrency(closingCash)
      }

      // Add notes if provided
      if (notes.trim()) {
        body.notes = notes.trim()
      }

      const res = await mobileFetch("/api/shifts/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã chấm công ra ca")
        setCheckOutDialogOpen(false)
        setClosingCash("")
        setNotes("")
        onCheckInOut()
      } else {
        toast.error(json.error || "Không thể chấm công")
      }
    } catch (error: any) {
      console.error("Error checking out:", error)
      toast.error(error.message || "Không thể chấm công")
    } finally {
      setSubmitting(false)
    }
  }

  const hasCheckedIn = todaySession && todaySession.check_in_time
  const hasCheckedOut = todaySession && todaySession.check_out_time

  // Calculate if check-in/check-out buttons should be shown based on shift time
  const canCheckIn = (() => {
    if (!todayAssignment || hasCheckedIn) return false

    const shiftStart = todayAssignment.work_shifts?.start_time
    if (!shiftStart) return true // If no shift time, allow check-in

    // Parse shift start time
    const [startHour, startMin] = shiftStart.split(':').map(Number)

    // Create shift start datetime
    const now = displayTime
    const shiftStartTime = new Date(now)
    shiftStartTime.setHours(startHour, startMin, 0, 0)

    // Allow check-in within 30 minutes after shift start
    const checkInWindowEnd = new Date(shiftStartTime)
    checkInWindowEnd.setMinutes(checkInWindowEnd.getMinutes() + 30)

    return now <= checkInWindowEnd
  })()

  const canCheckOut = (() => {
    if (!hasCheckedIn || hasCheckedOut) return false

    const shiftEnd = todayAssignment?.work_shifts?.end_time
    if (!shiftEnd) return true // If no shift time, allow check-out

    // Parse shift end time
    const [endHour, endMin] = shiftEnd.split(':').map(Number)

    // Create shift end datetime
    const now = displayTime
    const shiftEndTime = new Date(now)
    shiftEndTime.setHours(endHour, endMin, 0, 0)

    // Allow check-out within 30 minutes after shift end (grace period)
    const checkOutWindowEnd = new Date(shiftEndTime)
    checkOutWindowEnd.setMinutes(checkOutWindowEnd.getMinutes() + 30)

    return now <= checkOutWindowEnd
  })()

  return (
    <Card className="p-6 md:p-8 flex flex-col items-center justify-center min-h-[400px] md:min-h-[500px] space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg md:text-xl font-semibold text-muted-foreground">
          Xin chào, {user?.fullName}
        </h2>
      </div>

      {/* Week Status - Mini Calendar */}
      <div className="flex gap-2 md:gap-3">
        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day, idx) => {
          // This is simplified - you can enhance with real data
          const status = idx === new Date().getDay()
            ? 'today'
            : idx < new Date().getDay()
              ? 'completed'
              : 'upcoming'

          return (
            <div key={day} className="flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">{day}</span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status === 'today' ? 'bg-blue-500 text-white' :
                status === 'completed' ? 'bg-green-500 text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                {status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : status === 'today' ? (
                  <Circle className="w-3 h-3 fill-current" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Check-in/out Button */}
      <div className="flex flex-col items-center gap-4">
        {/* GPS Warning */}
        {gpsAvailable === false && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pin-off"><path d="M12.75 7.01a3.005 3.005 0 0 1 2.237 2.238" /><path d="M5.444 5.444l13.112 13.112" /><path d="M9.83 9.83a3 3 0 1 0 4.34 4.34" /><path d="M2 12c0 5.523 4.477 10 10 10 2.455 0 4.708-.885 6.47-2.352" /><path d="M19.978 15.022A10 10 0 0 0 12 2c-2.455 0-4.708.885-6.47 2.352" /></svg>
            {gpsError || "Vui lòng bật GPS để chấm công"}
          </div>
        )}

        {/* GPS Testing Loading State */}
        {gpsAvailable === null && (
          <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-loader animate-spin"><path d="M12 2v20m10-10H2" /></svg>
            Đang kiểm tra GPS...
          </div>
        )}

        {canCheckIn && gpsAvailable === true && (
          <Button
            size="lg"
            onClick={handleCheckInClick}
            disabled={submitting || gpsAvailable !== true}
            className={cn(
              "rounded-full w-32 h-32 md:w-40 md:h-40 text-lg font-semibold shadow-lg",
              gpsAvailable !== true && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex flex-col items-center gap-2">
              <Circle className="w-12 h-12 md:w-16 md:h-16" />
              <span className="text-xs md:text-sm">NHẤN ĐỂ CHẤM</span>
            </div>
          </Button>
        )}

        {canCheckOut && gpsAvailable === true && (
          <Button
            size="lg"
            onClick={handleCheckOutClick}
            disabled={submitting || gpsAvailable !== true}
            variant="secondary"
            className={cn(
              "rounded-full w-32 h-32 md:w-40 md:h-40 text-lg font-semibold shadow-lg",
              gpsAvailable !== true && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-12 h-12 md:w-16 md:h-16" />
              <span className="text-xs md:text-sm">CHẤM RA CA</span>
            </div>
          </Button>
        )}

        {hasCheckedOut && (
          <div className="text-center">
            <CheckCircle2 className="w-16 h-16 md:w-20 md:h-20 text-green-500 mx-auto mb-2" />
            <p className="text-sm md:text-base font-semibold text-green-600">
              Đã hoàn thành ca làm việc
            </p>
          </div>
        )}

        {!todayAssignment && !hasCheckedIn && (
          <div className="text-center text-muted-foreground">
            <Circle className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-2 opacity-50" />
            <p className="text-sm md:text-base">
              Chưa có ca làm việc hôm nay
            </p>
          </div>
        )}
      </div>

      {/* Current Time */}
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">Giờ hiện tại {serverTime && '(Server)'}</p>
        <p className="text-3xl md:text-4xl font-bold tabular-nums">
          {formatVietnamTime(displayTime)}
        </p>
        <p className="text-xs md:text-sm text-muted-foreground">
          {formatDateLongNoTz(displayTime, 'vi')}
        </p>
      </div>

      {/* Today's Schedule Info */}
      {todayAssignment && (
        <Card className="p-4 bg-muted/50 w-full max-w-sm">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">Ca làm việc hôm nay</p>
            <p className="text-lg font-bold">{todayAssignment.work_shifts?.shift_name}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                {format(new Date(`1970-01-01T${todayAssignment.work_shifts?.start_time}`), "HH:mm")} -
                {format(new Date(`1970-01-01T${todayAssignment.work_shifts?.end_time}`), "HH:mm")}
              </span>
            </div>
            {todaySession && (
              <div className="pt-2 border-t border-border space-y-1">
                {todaySession.check_in_time && (
                  <p className="text-xs">
                    <span className="text-green-600">✓</span> Vào: {formatTimeNoTz(todaySession.check_in_time)}
                  </p>
                )}
                {todaySession.check_out_time && (
                  <p className="text-xs">
                    <span className="text-green-600">✓</span> Ra: {formatTimeNoTz(todaySession.check_out_time)}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Check-in Dialog for Cash Management */}
      <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Chấm công vào ca
            </DialogTitle>
            <DialogDescription>
              Nhập số tiền mặt đầu ca (nếu có)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="opening-cash">Tiền mặt đầu ca (VNĐ)</Label>
              <Input
                id="opening-cash"
                placeholder="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(formatCurrency(e.target.value))}
                className="text-right"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="check-in-notes">Ghi chú</Label>
              <Textarea
                id="check-in-notes"
                placeholder="Ghi chú thêm (không bắt buộc)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleCheckIn} disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Xác nhận vào ca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-out Dialog for Cash Management */}
      <Dialog open={checkOutDialogOpen} onOpenChange={setCheckOutDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Chấm công ra ca
            </DialogTitle>
            <DialogDescription>
              Nhập số tiền mặt cuối ca (nếu có)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="closing-cash">Tiền mặt cuối ca (VNĐ)</Label>
              <Input
                id="closing-cash"
                placeholder="0"
                value={closingCash}
                onChange={(e) => setClosingCash(formatCurrency(e.target.value))}
                className="text-right"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="check-out-notes">Ghi chú</Label>
              <Textarea
                id="check-out-notes"
                placeholder="Ghi chú thêm (không bắt buộc)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOutDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleCheckOut} disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Xác nhận ra ca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
