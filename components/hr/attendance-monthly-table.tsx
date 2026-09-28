"use client"

import { useState } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth } from "date-fns"
import { vi } from "date-fns/locale"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { formatTime, AttendanceStatus, determineAttendanceStatus } from "@/lib/shift-status"
import { formatVietnamTime, formatVietnamDate, getVietnamNow } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import { Edit2, Trash2, MapPin, CheckCircle, Edit, UserCog } from "lucide-react"
import { EditAttendanceDialog } from "@/components/shifts/edit-attendance-dialog"

interface AttendanceRecord {
  id: string
  sessionDate: string
  checkInTime: string | null
  checkOutTime: string | null
  duration: string | null
  status: string
  user: {
    id: string
    fullName: string
    email: string
    role: string
  }
  warehouse: {
    id: string
    code: string
    name: string
    type: string
  }
  workShift: {
    id: string
    code: string
    name: string
    startTime: string
    endTime: string
  } | null
  notes: string | null
  check_in_ip?: string | null
  check_out_ip?: string | null
  check_in_location?: any
  check_out_location?: any
  check_in_device_info?: any
  check_out_device_info?: any
}


interface AttendanceMonthlyTableProps {
  currentMonth: Date
  records: AttendanceRecord[]
  loading?: boolean
  currentTime?: Date
  startDate?: Date
  endDate?: Date
  onRefresh?: () => void
  reportMode?: "normal" | "late" | "summary" | "swap" | "proxy" | "leave"
  leaveRequests?: any[]
  swapRequests?: any[]
}

export function AttendanceMonthlyTable({
  currentMonth,
  records,
  loading,
  currentTime = getVietnamNow(),
  startDate,
  endDate,
  onRefresh,
  reportMode = "normal",
  leaveRequests = [],
  swapRequests = []
}: AttendanceMonthlyTableProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showEditAttendanceDialog, setShowEditAttendanceDialog] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)
  const [deletingAuditLog, setDeletingAuditLog] = useState(false)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)

  // Determine date range to display based on filters
  let displayStart = monthStart
  let displayEnd = monthEnd

  // If both startDate and endDate are provided and within current month, use filtered range
  if (startDate && endDate) {
    const filterStart = new Date(startDate)
    const filterEnd = new Date(endDate)

    // Only filter if dates are in the current month
    if (isSameMonth(filterStart, currentMonth) || isSameMonth(filterEnd, currentMonth)) {
      displayStart = filterStart > monthStart ? filterStart : monthStart
      displayEnd = filterEnd < monthEnd ? filterEnd : monthEnd
    }
  }

  const daysInMonth = eachDayOfInterval({ start: displayStart, end: displayEnd })

  // Get unique employees from records
  const employees = Array.from(
    new Map(
      records.map(record => [
        record.user.id,
        {
          id: record.user.id,
          fullName: record.user.fullName,
          email: record.user.email
        }
      ])
    ).values()
  ).sort((a, b) => a.fullName.localeCompare(b.fullName))

  // Get records for a specific employee and day
  const getRecordsForEmployeeAndDay = (employeeId: string, date: Date) => {
    return records.filter(record =>
      record.user.id === employeeId &&
      record.sessionDate &&
      isSameDay(new Date(record.sessionDate), date)
    )
  }

  // Helper to check if a date is today
  const isTodayByServer = (date: Date): boolean => {
    return isSameDay(date, currentTime)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return <Badge className="bg-blue-500">Đang làm</Badge>
      case "PENDING_APPROVAL":
        return <Badge className="bg-yellow-500">Chờ duyệt</Badge>
      case "COMPLETED":
        return <Badge className="bg-green-500">Hoàn thành</Badge>
      case "REJECTED":
        return <Badge variant="destructive">Từ chối</Badge>
      case "NO_RECORD":
        return <Badge className="bg-gray-400">Chưa có dữ liệu</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }



  const handleDeleteLatestAuditLog = async () => {
    if (!selectedRecord || auditLogs.length === 0) {
      toast.error('Không có lịch sử sửa để xóa')
      return
    }

    // Find the latest manager edit (not original check-in/out)
    const latestLog = [...auditLogs]
      .reverse()
      .find(log => ['EDIT_CHECKIN', 'EDIT_CHECKOUT', 'EDIT_BOTH', 'CREATE_FROM_ABSENT'].includes(log.action_type))

    if (!latestLog || !latestLog.id) {
      toast.error('Không tìm thấy bản sửa để xóa')
      return
    }

    try {
      setDeletingAuditLog(true)
      const res = await mobileFetch(`/api/shifts/sessions/${selectedRecord.id}/audit-logs?auditLogId=${latestLog.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Đã xóa sửa gần nhất')
        // Reload audit logs
        await handleOpenDetails(selectedRecord)
        if (onRefresh) onRefresh()
      } else {
        toast.error(data.error || 'Xóa thất bại')
      }
    } catch (err) {
      toast.error('Lỗi xóa sửa gần nhất')
    } finally {
      setDeletingAuditLog(false)
    }
  }

  const handleOpenDetails = async (record: AttendanceRecord) => {
    setSelectedRecord(record)
    setDetailsOpen(true)

    // Load audit logs
    try {
      setLoadingAuditLogs(true)
      const res = await mobileFetch(`/api/shifts/sessions/${record.id}/audit-logs`)
      const data = await res.json()
      if (data.success) {
        setAuditLogs(data.data || [])
      } else {
        setAuditLogs([])
      }
    } catch (error) {
      console.error('Error loading audit logs:', error)
      setAuditLogs([])
    } finally {
      setLoadingAuditLogs(false)
    }
  }

  const handleCloseDetails = () => {
    setDetailsOpen(false)
    setSelectedRecord(null)
    setAuditLogs([])
  }

  const getDeviceName = (deviceInfo: any): string => {
    if (!deviceInfo) return "Máy tính"
    try {
      const parsed = typeof deviceInfo === "string" ? JSON.parse(deviceInfo) : deviceInfo
      return parsed.isMobile ? "Điện thoại" : "Máy tính"
    } catch {
      return "Máy tính"
    }
  }

  const handleDeleteCheckIn = async () => {
    if (!selectedRecord) return

    try {
      setIsSubmitting(true)
      const res = await mobileFetch(`/api/shifts/sessions/${selectedRecord.id}/edit-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_in_time: null })
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Xóa giờ vào ca thành công')
        if (onRefresh) onRefresh()
      } else {
        toast.error(data.error || 'Xóa thất bại')
      }
    } catch (err) {
      toast.error('Lỗi xóa giờ vào ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCheckOut = async () => {
    if (!selectedRecord) return

    try {
      setIsSubmitting(true)
      const res = await mobileFetch(`/api/shifts/sessions/${selectedRecord.id}/edit-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_out_time: null })
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Xóa giờ tan ca thành công')
        if (onRefresh) onRefresh()
      } else {
        toast.error(data.error || 'Xóa thất bại')
      }
    } catch (err) {
      toast.error('Lỗi xóa giờ tan ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card className="bg-white rounded-lg border shadow-sm">
        <CardContent className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              {/* Header row: Weekday and date */}
              <tr className="bg-gray-50 border-b">
                <th className="sticky left-0 z-20 bg-gray-50 border-r p-2 text-left font-semibold text-xs text-gray-700 min-w-[180px]">
                  Nhân viên
                </th>
                {daysInMonth.map((day) => {
                  const isToday = isTodayByServer(day)
                  return (
                    <th
                      key={day.toISOString()}
                      className={cn(
                        "border-r p-2 text-center font-semibold text-xs min-w-[80px]",
                        isToday ? "bg-blue-50/50 text-blue-600" : "text-gray-700"
                      )}
                    >
                      <div>{format(day, "EEE", { locale: vi }).toUpperCase()}</div>
                      <div className={cn("text-base font-bold mt-0.5", isToday && "text-blue-600")}>
                        {format(day, "d")}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth.length + 1} className="text-center p-8 text-muted-foreground">
                    Không có dữ liệu chấm công
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50/30 border-b">
                    <td className="sticky left-0 z-10 bg-white hover:bg-gray-50/30 border-r p-2">
                      <div className="font-medium text-sm">{employee.fullName}</div>
                      <div className="text-xs text-gray-500 truncate">{employee.email}</div>
                    </td>
                    {daysInMonth.map((day) => {
                      const dayRecords = getRecordsForEmployeeAndDay(employee.id, day)
                      const isToday = isTodayByServer(day)
                      const isCurrentMonth = isSameMonth(day, currentMonth)

                      if (dayRecords.length === 0) {
                        // Even without attendance record, check for leave/swap requests
                        const dayStr = format(day, 'yyyy-MM-dd')

                        // Check for leave request
                        const leaveReq = leaveRequests.find((l: any) => {
                          const leaveDate = format(new Date(l.leave_date), 'yyyy-MM-dd')
                          return l.user_id === employee.id && leaveDate === dayStr
                        })

                        // Check for swap request  
                        const swapReq = swapRequests.find((s: any) => {
                          const reqDate = format(new Date(s.requester_date), 'yyyy-MM-dd')
                          return (s.requester_user_id === employee.id || s.target_user_id === employee.id)
                            && reqDate === dayStr
                            && s.status === 'APPROVED'
                        })

                        // Show leave/swap info if found, otherwise show '-'
                        if ((reportMode === 'leave' && leaveReq) || (reportMode === 'swap' && swapReq)) {
                          return (
                            <td
                              key={day.toISOString()}
                              className={cn(
                                "border-r p-1 text-center align-top",
                                isToday && "bg-blue-50/50 ring-1 ring-inset ring-blue-200",
                                !isCurrentMonth && "bg-gray-50/30"
                              )}
                            >
                              <div className="h-full min-h-[5rem] flex flex-col items-center justify-center">
                                {reportMode === 'leave' && leaveReq && (
                                  <span className={cn(
                                    "text-[8px] font-medium",
                                    leaveReq.status === 'APPROVED' ? "text-green-600" :
                                      leaveReq.status === 'PENDING' ? "text-orange-600" :
                                        leaveReq.status === 'REJECTED' ? "text-red-600" : "text-gray-500"
                                  )}>
                                    {leaveReq.status === 'APPROVED' ? "Nghỉ phép" :
                                      leaveReq.status === 'PENDING' ? "Chờ duyệt" :
                                        leaveReq.status === 'REJECTED' ? "Bị từ chối" : leaveReq.status}
                                  </span>
                                )}
                                {reportMode === 'swap' && swapReq && (
                                  <span className={cn(
                                    "text-[8px] font-medium",
                                    swapReq.swap_type === 'REPLACE' ? "text-indigo-600" : "text-purple-600"
                                  )}>
                                    {swapReq.swap_type === 'REPLACE'
                                      ? `Làm thay: ${swapReq.requester_user_id === employee.id
                                        ? swapReq.users_target?.full_name || 'N/A'
                                        : swapReq.users_requester?.full_name || 'N/A'}`
                                      : `Đổi ca`}
                                  </span>
                                )}
                              </div>
                            </td>
                          )
                        }

                        return (
                          <td
                            key={day.toISOString()}
                            className={cn(
                              "border-r p-1 text-center align-top",
                              isToday && "bg-blue-50/50 ring-1 ring-inset ring-blue-200",
                              !isCurrentMonth && "bg-gray-50/30"
                            )}
                          >
                            <div className="h-full min-h-[5rem] flex items-center justify-center">
                              <span className="text-gray-300 text-xs">-</span>
                            </div>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={day.toISOString()}
                          className={cn(
                            "border-r p-1 align-top",
                            isToday && "bg-blue-50/50 ring-1 ring-inset ring-blue-200"
                          )}
                        >
                          <div className="flex flex-col gap-1 min-h-[5rem]">
                            {dayRecords.map(record => {
                              // Determine status using the same logic as shifts calendar
                              const shift = record.workShift
                              let status: AttendanceStatus

                              if (record.status === 'ABSENT' && !record.checkInTime && !record.checkOutTime) {
                                status = AttendanceStatus.ABSENT
                              } else {
                                const session = {
                                  check_in_time: record.checkInTime,
                                  check_out_time: record.checkOutTime
                                }
                                const assignment = { work_shift_id: shift?.id, assigned_date: record.sessionDate }
                                status = determineAttendanceStatus(assignment, session, shift, currentTime)
                              }

                              const isLateFromDB = (record as any).isLateCheckin === true
                              const isEarlyFromDB = (record as any).isEarlyCheckout === true
                              const hasLateOrEarly = isLateFromDB || isEarlyFromDB

                              let colorClass = ""
                              if (hasLateOrEarly && record.checkInTime && record.checkOutTime) {
                                colorClass = "bg-orange-100 text-orange-700"
                              } else if (status === AttendanceStatus.COMPLETED_ON_TIME || status === AttendanceStatus.ON_TIME) {
                                colorClass = "bg-green-100 text-green-700"
                              } else if (status === AttendanceStatus.LATE_CHECKIN || status === AttendanceStatus.EARLY_CHECKOUT) {
                                colorClass = "bg-orange-100 text-orange-700"
                              } else if (status === AttendanceStatus.SCHEDULED_PENDING) {
                                // FIX: If we have check times but status is still pending (calculation delay or timezone drift), show green
                                if (record.checkInTime) {
                                  colorClass = "bg-green-100 text-green-700"
                                } else {
                                  colorClass = "bg-yellow-100 text-yellow-700"
                                }
                              } else if (status === AttendanceStatus.SCHEDULED_FUTURE) {
                                colorClass = "bg-blue-100 text-blue-700"
                              } else if (status === AttendanceStatus.INCOMPLETE) {
                                // FIX: If we have check-in time but it's incomplete (missing checkout), show as 'Chờ tan ca' (yellow) if today
                                if (record.checkInTime && !record.checkOutTime) {
                                  colorClass = "bg-yellow-100 text-yellow-700"
                                } else {
                                  colorClass = "bg-amber-100 text-amber-700"
                                }
                              } else if (status === AttendanceStatus.ABSENT) {
                                colorClass = "bg-red-100 text-red-700"
                              }

                              return (
                                <div
                                  key={record.id}
                                  onClick={() => handleOpenDetails(record)}
                                  className={cn(
                                    "cursor-pointer flex flex-col items-center justify-start p-1 hover:opacity-80 hover:bg-gray-50/50 transition-all rounded border border-transparent hover:border-gray-200"
                                  )}
                                >
                                  {/* Shift code badge */}
                                  <div className={cn(
                                    "text-[10px] font-bold px-1 py-0.5 rounded text-center w-full",
                                    colorClass
                                  )}>
                                    {shift?.code || "N/A"}
                                  </div>

                                  {/* Shift time */}
                                  {shift && (
                                    <div className="text-[8px] text-gray-500 mt-0.5 leading-tight">
                                      {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
                                    </div>
                                  )}

                                  {/* Check-in/Check-out times */}
                                  {(record.checkInTime || record.checkOutTime) && reportMode === 'normal' && (
                                    <div className="flex flex-col items-center">
                                      <div className={cn(
                                        "text-[8px] font-medium mt-0.5 leading-tight",
                                        (record.checkInTime && record.checkOutTime) ? "text-green-600" : "text-amber-600"
                                      )}>
                                        {record.checkInTime && record.checkOutTime ? (
                                          <>✓ {formatTime(record.checkInTime)} - {formatTime(record.checkOutTime)}</>
                                        ) : record.checkInTime && !record.checkOutTime ? (
                                          <>✓ {formatTime(record.checkInTime)} - —</>
                                        ) : !record.checkInTime && record.checkOutTime ? (
                                          <>— - {formatTime(record.checkOutTime)}</>
                                        ) : null}
                                      </div>
                                      {(record as any).proxyBy && (
                                        <div className="flex items-center gap-0.5 mt-0.5" title={`Chấm công bởi: ${(record as any).proxyBy}`}>
                                          <UserCog className="w-2.5 h-2.5 text-purple-500" />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Report Mode: LATE/EARLY */}
                                  {reportMode === 'late' && (
                                    <div className="text-[8px] font-medium mt-0.5 leading-tight flex flex-col gap-0.5">
                                      {(status === AttendanceStatus.LATE_CHECKIN) && (
                                        <span className="text-orange-600">
                                          Muộn: {(() => {
                                            if (!shift || !record.checkInTime) return '?'
                                            const shiftStart = new Date(`${format(currentTime, 'yyyy-MM-dd')}T${shift.startTime}`)
                                            const checkIn = new Date(record.checkInTime)
                                            shiftStart.setFullYear(2000, 0, 1)
                                            checkIn.setFullYear(2000, 0, 1)
                                            const lateMins = Math.round((checkIn.getTime() - shiftStart.getTime()) / 60000)
                                            return lateMins > 0 ? `${lateMins}p` : ''
                                          })()}
                                        </span>
                                      )}
                                      {(status === AttendanceStatus.EARLY_CHECKOUT) && (
                                        <span className="text-orange-600">
                                          Sớm: {(() => {
                                            if (!shift || !record.checkOutTime) return '?'
                                            const shiftEnd = new Date(`${format(currentTime, 'yyyy-MM-dd')}T${shift.endTime}`)
                                            const checkOut = new Date(record.checkOutTime)
                                            shiftEnd.setFullYear(2000, 0, 1)
                                            checkOut.setFullYear(2000, 0, 1)
                                            const earlyMins = Math.round((shiftEnd.getTime() - checkOut.getTime()) / 60000)
                                            return earlyMins > 0 ? `${earlyMins}p` : ''
                                          })()}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Report Mode: SUMMARY (Total Hours) */}
                                  {reportMode === 'summary' && (
                                    <div className="text-[9px] font-bold text-blue-600 mt-1 leading-tight">
                                      {(() => {
                                        if (!record.checkInTime || !record.checkOutTime) {
                                          return '-'
                                        }
                                        try {
                                          const checkIn = new Date(record.checkInTime)
                                          const checkOut = new Date(record.checkOutTime)
                                          if (!shift || !shift.startTime || !shift.endTime) {
                                            const rawDurationMs = checkOut.getTime() - checkIn.getTime()
                                            const rawHours = rawDurationMs / (1000 * 60 * 60)
                                            return rawHours > 0 ? `${rawHours.toFixed(2)}h` : '0.00h'
                                          }
                                          const sessionDate = new Date(record.sessionDate)
                                          const shiftStartDate = new Date(shift.startTime)
                                          const shiftEndDate = new Date(shift.endTime)
                                          const shiftStart = new Date(sessionDate)
                                          shiftStart.setUTCHours(shiftStartDate.getUTCHours(), shiftStartDate.getUTCMinutes(), 0, 0)
                                          const shiftEnd = new Date(sessionDate)
                                          shiftEnd.setUTCHours(shiftEndDate.getUTCHours(), shiftEndDate.getUTCMinutes(), 0, 0)
                                          if (shiftEnd <= shiftStart) {
                                            shiftEnd.setDate(shiftEnd.getDate() + 1)
                                          }
                                          const effectiveStart = checkIn > shiftStart ? checkIn : shiftStart
                                          const effectiveEnd = checkOut < shiftEnd ? checkOut : shiftEnd
                                          const durationMs = effectiveEnd.getTime() - effectiveStart.getTime()
                                          const hours = durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0
                                          return hours > 0 ? `${hours.toFixed(2)}h` : '0.00h'
                                        } catch (error) {
                                          return record.duration ? `${record.duration}h` : '-'
                                        }
                                      })()}
                                    </div>
                                  )}

                                  {/* Report Mode: PROXY */}
                                  {reportMode === 'proxy' && (
                                    <div className="text-[8px] font-medium mt-0.5 leading-tight flex flex-col gap-0.5">
                                      {(record as any).proxyBy ? (
                                        <>
                                          <span className="text-purple-600">
                                            <UserCog className="w-2.5 h-2.5 inline mr-0.5" />
                                            Chấm hộ
                                          </span>
                                          <span className="text-purple-500 text-[7px] truncate max-w-[60px]">
                                            {(record as any).proxyBy}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Report Mode: LEAVE */}
                                  {reportMode === 'leave' && (() => {
                                    // Find leave request for this user and date
                                    const dayStr = format(day, 'yyyy-MM-dd')
                                    const leaveReq = leaveRequests.find((l: any) => {
                                      const leaveDate = format(new Date(l.leave_date), 'yyyy-MM-dd')
                                      return l.user_id === record.user.id && leaveDate === dayStr
                                    })

                                    return (
                                      <div className="text-[8px] font-medium mt-0.5 leading-tight flex flex-col gap-0.5">
                                        {leaveReq ? (
                                          <span className={cn(
                                            leaveReq.status === 'APPROVED' ? "text-green-600" :
                                              leaveReq.status === 'PENDING' ? "text-orange-600" :
                                                leaveReq.status === 'REJECTED' ? "text-red-600" : "text-gray-500"
                                          )}>
                                            {leaveReq.status === 'APPROVED' ? "Nghỉ phép" :
                                              leaveReq.status === 'PENDING' ? "Chờ duyệt" :
                                                leaveReq.status === 'REJECTED' ? "Bị từ chối" : leaveReq.status}
                                          </span>
                                        ) : status === AttendanceStatus.ABSENT ? (
                                          <span className="text-red-600">Vắng</span>
                                        ) : (
                                          <span className="text-gray-400">-</span>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Legend - matching staff calendar style */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-50 border-t text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-700">Đúng giờ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-gray-700">Đi muộn/Ra sớm</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-700">Vắng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-gray-700">Chưa chấm công</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-700">Đã xếp ca</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-gray-700">Chờ chấm công</span>
          </div>
        </div>
      </CardContent>

      {/* Unified Edit Attendance Dialog */}
      <EditAttendanceDialog
        open={showEditAttendanceDialog}
        onOpenChange={setShowEditAttendanceDialog}
        sessionId={selectedRecord?.id || ""}
        sessionDate={selectedRecord?.sessionDate || new Date().toISOString()}
        initialCheckInTime={selectedRecord?.checkInTime}
        initialCheckOutTime={selectedRecord?.checkOutTime}
        employeeName={selectedRecord?.user?.fullName || "Nhân viên"}
        onSuccess={() => {
          if (onRefresh) onRefresh()
          // Close details dialog to force data refresh when reopened
          setDetailsOpen(false)
        }}
      />

      {/* Details Dialog - COPY Y NGUYÊN TỪ SHIFT-DETAIL-DIALOG.TSX */}
      <Dialog open={detailsOpen} onOpenChange={handleCloseDetails}>
        <DialogContent className="max-w-4xl max-h-screen flex flex-col p-0 gap-0">
          <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
            <DialogTitle className="text-2xl">Chi Tiết Ca Làm Việc</DialogTitle>
            {selectedRecord && (
              <DialogDescription className="text-base pt-2">
                {selectedRecord.user.fullName} - {format(new Date(selectedRecord.sessionDate), "dd/MM/yyyy")}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4 space-y-4">
              {selectedRecord && (
                <div className="space-y-6">
                  {/* Header Summary Card */}
                  <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase font-semibold">Ca làm việc</Label>
                          <p className="font-bold text-lg mt-1">{selectedRecord.workShift?.name || "N/A"}</p>
                          <p className="text-sm text-muted-foreground">{selectedRecord.workShift?.code || ""}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase font-semibold">Giờ Vào</Label>
                          <p className="font-bold text-lg mt-1">{formatTime(selectedRecord.checkInTime)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase font-semibold">Giờ Ra</Label>
                          <p className="font-bold text-lg mt-1">{formatTime(selectedRecord.checkOutTime)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase font-semibold">Trạng Thái</Label>
                          <p className="mt-2">{getStatusBadge(selectedRecord.status)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Date Header and Edit Button */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800">
                      Ngày {format(new Date(selectedRecord.sessionDate), "dd/MM/yyyy")}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                        onClick={() => setShowEditAttendanceDialog(true)}
                      >
                        <Edit2 className="h-4 w-4" />
                        Chỉnh sửa thời gian
                      </Button>
                      {auditLogs.length > 0 && (
                        <Button
                          variant="outline"
                          className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={handleDeleteLatestAuditLog}
                          disabled={deletingAuditLog}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingAuditLog ? "Đang xóa..." : "Xóa sửa gần nhất"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* UNIFIED HISTORY Section */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-semibold text-slate-500 uppercase">LỊCH SỬ CHẤM CÔNG</h4>
                    </div>

                    <div className="w-full overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="w-12 font-semibold text-slate-600">STT</TableHead>
                            <TableHead className="font-semibold text-slate-600">Thời gian</TableHead>
                            <TableHead className="font-semibold text-slate-600">Thiết bị</TableHead>
                            <TableHead className="font-semibold text-slate-600">Giá trị</TableHead>
                            <TableHead className="font-semibold text-slate-600">IP</TableHead>
                            <TableHead className="font-semibold text-slate-600">GPS</TableHead>
                            <TableHead className="font-semibold text-slate-600">Người thực hiện</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const allEvents: any[] = [];

                            const getDeviceName = (deviceInfo: string | null) => {
                              if (!deviceInfo) return 'Máy tính';
                              if (deviceInfo === 'Manager Edit') return 'Máy tính';
                              if (deviceInfo.toLowerCase().includes('mobile')) return 'Điện thoại';
                              return 'Máy tính';
                            };

                            // Check if this session was created from absent by manager
                            const createFromAbsentLog = auditLogs.find(l => l.action_type === 'CREATE_FROM_ABSENT');

                            // Helper to find the earliest audit log for a specific action type
                            const firstCheckInEdit = auditLogs.find(l => l.action_type === 'EDIT_CHECKIN' || l.action_type === 'EDIT_BOTH');
                            const firstCheckOutEdit = auditLogs.find(l => l.action_type === 'EDIT_CHECKOUT' || l.action_type === 'EDIT_BOTH');

                            if (createFromAbsentLog) {
                              // For CREATE_FROM_ABSENT: Show separate rows for check-in and check-out with manager name
                              if (createFromAbsentLog.new_check_in_time) {
                                allEvents.push({
                                  id: 'manager-checkin',
                                  type: 'original',
                                  device: 'Máy tính',
                                  actionType: 'Vào ca',
                                  time: createFromAbsentLog.new_check_in_time,
                                  value: 'Vào ca',
                                  ip: createFromAbsentLog.modification_ip,
                                  location: createFromAbsentLog.modification_gps,
                                  performer: createFromAbsentLog.modified_by_name || 'Quản lý',
                                  performerEmail: createFromAbsentLog.modified_by_email,
                                  isVerified: true
                                });
                              }

                              if (createFromAbsentLog.new_check_out_time) {
                                allEvents.push({
                                  id: 'manager-checkout',
                                  type: 'original',
                                  device: 'Máy tính',
                                  actionType: 'Tan ca',
                                  time: createFromAbsentLog.new_check_out_time,
                                  value: 'Tan ca',
                                  ip: createFromAbsentLog.modification_ip,
                                  location: createFromAbsentLog.modification_gps,
                                  performer: createFromAbsentLog.modified_by_name || 'Quản lý',
                                  performerEmail: createFromAbsentLog.modified_by_email,
                                  isVerified: true
                                });
                              }
                            } else {
                              // Normal case: Show original check-in/check-out by employee
                              const originalCheckInTime = firstCheckInEdit ? firstCheckInEdit.old_check_in_time : selectedRecord.checkInTime;

                              if (originalCheckInTime) {
                                allEvents.push({
                                  id: 'original-checkin',
                                  type: 'original',
                                  device: getDeviceName((selectedRecord as any).check_in_device_info),
                                  actionType: 'Vào ca',
                                  time: originalCheckInTime,
                                  value: 'Vào ca',
                                  ip: (selectedRecord as any).check_in_ip,
                                  location: (selectedRecord as any).check_in_location,
                                  performer: selectedRecord.user.fullName || 'Nhân viên',
                                  performerEmail: selectedRecord.user.email,
                                  isVerified: true
                                });
                              }

                              const originalCheckOutTime = firstCheckOutEdit ? firstCheckOutEdit.old_check_out_time : selectedRecord.checkOutTime;

                              if (originalCheckOutTime) {
                                allEvents.push({
                                  id: 'original-checkout',
                                  type: 'original',
                                  device: getDeviceName((selectedRecord as any).check_out_device_info),
                                  actionType: 'Tan ca',
                                  time: originalCheckOutTime,
                                  value: 'Tan ca',
                                  ip: (selectedRecord as any).check_out_ip,
                                  location: (selectedRecord as any).check_out_location,
                                  performer: selectedRecord.user.fullName || 'Nhân viên',
                                  performerEmail: selectedRecord.user.email,
                                  isVerified: true
                                });
                              }
                            }

                            // 3. Audit Logs (The Edits) - skip CREATE_FROM_ABSENT as it's already handled above
                            auditLogs.forEach((log) => {
                              if (log.action_type === 'CREATE_FROM_ABSENT') return;

                              if (log.action_type === 'EDIT_CHECKIN' && log.new_check_in_time) {
                                allEvents.push({
                                  id: log.id + '-checkin',
                                  type: 'edit',
                                  device: 'Máy tính',
                                  actionType: 'Sửa giờ vào',
                                  time: log.new_check_in_time,
                                  value: 'Vào ca',
                                  ip: log.modification_ip,
                                  location: log.modification_gps,
                                  performer: log.modified_by_name,
                                  performerEmail: log.modified_by_email,
                                  isVerified: false
                                });
                              } else if (log.action_type === 'EDIT_CHECKOUT' && log.new_check_out_time) {
                                allEvents.push({
                                  id: log.id + '-checkout',
                                  type: 'edit',
                                  device: 'Máy tính',
                                  actionType: 'Sửa giờ ra',
                                  time: log.new_check_out_time,
                                  value: 'Tan ca',
                                  ip: log.modification_ip,
                                  location: log.modification_gps,
                                  performer: log.modified_by_name,
                                  performerEmail: log.modified_by_email,
                                  isVerified: false
                                });
                              } else if (log.action_type === 'EDIT_BOTH') {
                                if (log.new_check_in_time) {
                                  allEvents.push({
                                    id: log.id + '-checkin',
                                    type: 'edit',
                                    device: 'Máy tính',
                                    actionType: 'Sửa giờ vào',
                                    time: log.new_check_in_time,
                                    value: 'Vào ca',
                                    ip: log.modification_ip,
                                    location: log.modification_gps,
                                    performer: log.modified_by_name,
                                    performerEmail: log.modified_by_email,
                                    isVerified: false
                                  });
                                }
                                if (log.new_check_out_time) {
                                  allEvents.push({
                                    id: log.id + '-checkout',
                                    type: 'edit',
                                    device: 'Máy tính',
                                    actionType: 'Sửa giờ ra',
                                    time: log.new_check_out_time,
                                    value: 'Tan ca',
                                    ip: log.modification_ip,
                                    location: log.modification_gps,
                                    performer: log.modified_by_name,
                                    performerEmail: log.modified_by_email,
                                    isVerified: false
                                  });
                                }
                              }
                            });

                            // Sort all events by time
                            allEvents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

                            const sortedEvents = allEvents;

                            if (sortedEvents.length === 0) {
                              return (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    Chưa có dữ liệu lịch sử
                                  </TableCell>
                                </TableRow>
                              );
                            }

                            return sortedEvents.map((event, index) => (
                              <TableRow key={event.id || index} className={index % 2 === 0 ? "bg-slate-50/50" : ""}>
                                <TableCell className="font-medium text-sm">{index + 1}</TableCell>
                                <TableCell className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{formatVietnamTime(new Date(event.time))}</span>
                                    {event.isVerified && <CheckCircle className="h-4 w-4 text-green-500" />}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{formatVietnamDate(new Date(event.time))}</div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <span className="text-xs">{event.device}</span>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <span className="text-xs">{event.value}</span>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <span className="font-mono text-xs">{event.ip || "—"}</span>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {event.location ? (
                                    <a
                                      href={`https://www.google.com/maps?q=${event.location.lat !== undefined
                                        ? event.location.lat
                                        : event.location.latitude
                                        },${event.location.lng !== undefined
                                          ? event.location.lng
                                          : event.location.longitude
                                        }`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <MapPin className="h-3 w-3" />
                                      Xem bản đồ
                                    </a>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                      {event.performer?.charAt(0) || "?"}
                                    </div>
                                    <div className="text-xs font-medium truncate">{event.performer}</div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ));
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
