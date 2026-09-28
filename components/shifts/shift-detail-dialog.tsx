"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { formatTimeNoTz, formatVietnamTime, formatVietnamTimeShort, formatVietnamDate, formatDateLongNoTz } from "@/lib/server-time"
import { formatTime } from "@/lib/shift-status"
import { formatCurrency } from "@/lib/utils"
import { Edit, Trash2, CheckCircle, XCircle, AlertTriangle, Clock, MapPin, Smartphone, Monitor, ArrowRightLeft, Loader2, Package } from "lucide-react"
import { toast } from "sonner"
import { EditAttendanceDialog } from "./edit-attendance-dialog"
import { mobileFetch } from "@/lib/mobile/api-client"
import { ShiftProductsDialog } from "./shift-products-dialog"

interface WorkShift {
  id: string
  shift_name: string
  shift_code: string
  start_time: string
  end_time: string
}

interface ShiftDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: any | null
  shiftSession: any | null
  shiftTemplate: any | null
  user: any | null
  date: Date | null
  pendingRequest?: any | null
  onEdit?: () => void
  onDelete?: () => void
  defaultOpenCreate?: boolean // NEW: Auto-open create session dialog
}

export function ShiftDetailDialog({
  open,
  onOpenChange,
  assignment,
  shiftSession,
  shiftTemplate,
  user,
  date,
  pendingRequest,
  onEdit,
  onDelete,
  defaultOpenCreate = false
}: ShiftDetailDialogProps) {
  const [detailData, setDetailData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [detailTab, setDetailTab] = useState("attendance")
  const [deleting, setDeleting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [showReassignDialog, setShowReassignDialog] = useState(false)
  const [availableShifts, setAvailableShifts] = useState<WorkShift[]>([])
  const [selectedNewShiftId, setSelectedNewShiftId] = useState("")
  const [reassignNotes, setReassignNotes] = useState("")
  const [loadingShifts, setLoadingShifts] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showEditAttendanceDialog, setShowEditAttendanceDialog] = useState(false)
  const [editCheckInTime, setEditCheckInTime] = useState("")
  const [editCheckOutTime, setEditCheckOutTime] = useState("")
  const [editReason, setEditReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [lastLoadedSessionId, setLastLoadedSessionId] = useState<string | null>(null)
  const [deletingAuditLog, setDeletingAuditLog] = useState(false)
  const [showCreateSessionDialog, setShowCreateSessionDialog] = useState(false)
  const [createCheckInTime, setCreateCheckInTime] = useState("")
  const [createCheckOutTime, setCreateCheckOutTime] = useState("")
  const [creatingSession, setCreatingSession] = useState(false)
  const [showProductsDialog, setShowProductsDialog] = useState(false)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })

  // Use detailData if available (fresh from API), otherwise fallback to prop
  // Note: Upstream strict filtering in WeeklyShiftCalendar now matches ShiftCell logic (Exact ID or Work Shift ID).
  // We trust the passed shiftSession is correct.
  const currentSession = detailData || shiftSession

  // Kiểm tra xem user hiện tại có phải là người nhập tiền (opening_cash_user hoặc closing_cash_user)
  // Nếu có thì hiển thị đầy đủ chi tiết bán hàng và phân tích, nếu không chỉ hiển thị chấm công
  const isCashHandler = (() => {
    if (!currentSession || !user) return false
    const openingCashUserId = currentSession.opening_cash_user_id || currentSession.opening_cash_user?.id
    const closingCashUserId = currentSession.closing_cash_user_id || currentSession.closing_cash_user?.id
    // Người này được coi là "cash handler" nếu họ là người nhập tiền đầu ca HOẶC tiền cuối ca
    return user.id === openingCashUserId || user.id === closingCashUserId
  })()

  useEffect(() => {
    // RESET LOGIC:
    // If dialog is NOT open, do nothing (or we could clear)
    // If dialog IS open:
    // 1. If we have a session ID, and it's different from the loaded one -> Load it.
    // 2. If we do NOT have a session ID (Absent), but we have old data loaded from a previous session -> Clear it.
    // 3. If assignment ID changed, we should probably clear too.

    if (open) {
      if (shiftSession?.id) {
        // Only load if the session ID has changed or this is the first load
        if (shiftSession.id !== lastLoadedSessionId) {
          // Clear old data when switching to a new shift
          setDetailData(null)
          setAuditLogs([])
          loadShiftDetail(shiftSession.id)
          setLastLoadedSessionId(shiftSession.id)
        }
      } else {
        // NO session ID (Absent or creating)
        // If we previously had data loaded, we MUST clear it now
        if (lastLoadedSessionId !== null || detailData !== null) {
          setDetailData(null)
          setAuditLogs([])
          setLastLoadedSessionId(null)
        }
      }

      // Auto-open create dialog if requested and no session exists
      if (defaultOpenCreate && !shiftSession && shiftTemplate) {
        setCreateCheckInTime(shiftTemplate.start_time?.substring(0, 5) || "08:00")
        setCreateCheckOutTime(shiftTemplate.end_time?.substring(0, 5) || "17:00")
        setShowCreateSessionDialog(true)
      }
    } else {
      // Dialog closed - clear everything
      setDetailData(null)
      setAuditLogs([])
      setLastLoadedSessionId(null)
      setShowCreateSessionDialog(false)
    }
  }, [open, shiftSession?.id, assignment?.id, lastLoadedSessionId, defaultOpenCreate, shiftTemplate])

  const loadShiftDetail = async (sessionId: string) => {
    try {
      setLoading(true)

      // Fetch shift detail, analytics, and audit logs in parallel
      const [detailRes, analyticsRes, auditLogsRes] = await Promise.all([
        mobileFetch(`/api/shifts/${sessionId}`),
        mobileFetch(`/api/shifts/${sessionId}/analytics`),
        mobileFetch(`/api/shifts/sessions/${sessionId}/audit-logs`)
      ])

      const detailJson = await detailRes.json()
      const analyticsJson = await analyticsRes.json()
      const auditLogsJson = await auditLogsRes.json()

      if (detailJson.success) {
        // Update shiftSession with fresh data
        const freshSession = detailJson.data

        // Merge analytics data into detail data
        setDetailData({
          ...freshSession,
          analytics: analyticsJson.success ? analyticsJson.data.analytics : null,
          invoiceCount: analyticsJson.success ? analyticsJson.data.invoiceCount : 0
        })

        // Load audit logs
        if (auditLogsJson.success) {
          setAuditLogs(auditLogsJson.data)
        }

        // IMPORTANT: Update the shiftSession prop to reflect changes
        // This ensures the UI shows updated data including modified_by
        // if (onUpdate) {
        //   onUpdate(freshSession)
        // }
      }
    } catch (error) {
      console.error("Error loading shift detail:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!shiftSession?.id) return
    setApproving(true)
    try {
      const res = await mobileFetch(`/api/shifts/sessions/${shiftSession.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success("Đã duyệt chấm công")
        onOpenChange(false)
        if (onDelete) onDelete() // Refresh data
      } else {
        toast.error(json.error || "Không thể duyệt chấm công")
      }
    } catch (error) {
      toast.error("Không thể duyệt chấm công")
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!shiftSession?.id || !rejectReason.trim()) {
      toast.error("Vui lòng nhập lý do từ chối")
      return
    }
    setRejecting(true)
    try {
      const res = await mobileFetch(`/api/shifts/sessions/${shiftSession.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success("Đã từ chối chấm công")
        setShowRejectDialog(false)
        setRejectReason("")
        onOpenChange(false)
        if (onDelete) onDelete() // Refresh data
      } else {
        toast.error(json.error || "Không thể từ chối chấm công")
      }
    } catch (error) {
      toast.error("Không thể từ chối chấm công")
    } finally {
      setRejecting(false)
    }
  }

  // Check if session has late/early notes
  const hasLateNote = shiftSession?.notes?.includes("Đi muộn")
  const hasEarlyNote = shiftSession?.notes?.includes("Về sớm")

  // Handle approve pending registration request
  const handleApprovePendingRequest = async () => {
    if (!pendingRequest?.id) return
    setApproving(true)
    try {
      const res = await mobileFetch(`/api/shifts/registration-requests/${pendingRequest.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (json.success) {
        toast.success("Đã duyệt yêu cầu đăng ký ca")
        onOpenChange(false)
        if (onDelete) onDelete() // Refresh data
      } else {
        toast.error(json.error || "Không thể duyệt yêu cầu")
      }
    } catch (error) {
      toast.error("Không thể duyệt yêu cầu")
    } finally {
      setApproving(false)
    }
  }

  // Fetch available shifts for reassign
  const fetchAvailableShifts = async (warehouseId: string, dateStr: string) => {
    try {
      setLoadingShifts(true)
      const res = await mobileFetch(`/api/shifts/available-shifts?date=${dateStr}&warehouse_id=${warehouseId}`)
      const json = await res.json()

      if (json.success) {
        setAvailableShifts(json.data)
      } else {
        toast.error("Không thể tải danh sách ca")
      }
    } catch (error) {
      toast.error("Không thể tải danh sách ca")
    } finally {
      setLoadingShifts(false)
    }
  }

  // Open reassign dialog for pending request
  const openReassignDialog = () => {
    if (!pendingRequest) return
    setSelectedNewShiftId("")
    setReassignNotes("")
    setShowReassignDialog(true)
    const dateStr = format(new Date(pendingRequest.requested_date), "yyyy-MM-dd")
    fetchAvailableShifts(pendingRequest.warehouse_id, dateStr)
  }

  // Handle reassign shift for pending request
  const handleReassignPendingRequest = async () => {
    if (!pendingRequest?.id || !selectedNewShiftId) {
      toast.error("Vui lòng chọn ca mới")
      return
    }
    setRejecting(true)
    try {
      const res = await mobileFetch(`/api/shifts/registration-requests/${pendingRequest.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_work_shift_id: selectedNewShiftId,
          notes: reassignNotes
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || "Đã xếp ca khác cho nhân viên")
        setShowReassignDialog(false)
        setSelectedNewShiftId("")
        setReassignNotes("")
        onOpenChange(false)
        if (onDelete) onDelete() // Refresh data
      } else {
        toast.error(json.error || "Không thể xếp ca")
      }
    } catch (error) {
      toast.error("Không thể xếp ca")
    } finally {
      setRejecting(false)
    }
  }

  // Handle create session for absent employee
  const handleCreateSessionForAbsent = async () => {
    if (!assignment?.id || !createCheckInTime || !createCheckOutTime) {
      toast.error("Vui lòng nhập đầy đủ giờ vào và giờ ra")
      return
    }

    setCreatingSession(true)
    try {
      // Get GPS and IP info
      let gpsLocation = null
      let ipAddress = null

      // Try to get GPS location
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            })
          })
          gpsLocation = `${position.coords.latitude},${position.coords.longitude}`
        } catch (gpsError) {
          console.log("Could not get GPS location:", gpsError)
        }
      }

      // Get IP address
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json")
        const ipData = await ipRes.json()
        ipAddress = ipData.ip
      } catch (ipError) {
        console.log("Could not get IP address:", ipError)
      }

      // Build the check_in_time and check_out_time with proper date format
      // assignment.assigned_date is a Date object or ISO string
      const assignedDate = new Date(assignment.assigned_date)
      const dateStr = assignedDate.toISOString().split('T')[0] // YYYY-MM-DD format

      // Use the assignment ID as a placeholder session ID, but pass is_absent_session flag
      const res = await mobileFetch(`/api/shifts/sessions/${assignment.id}/edit-attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_in_time: `${dateStr}T${createCheckInTime}`,
          check_out_time: `${dateStr}T${createCheckOutTime}`,
          reason: "Quản lý tạo chấm công cho nhân viên vắng mặt",
          is_absent_session: true,
          assignment_id: assignment.id,
          modification_gps: gpsLocation ? { lat: parseFloat(gpsLocation.split(',')[0]), lon: parseFloat(gpsLocation.split(',')[1]) } : null,
          modification_ip: ipAddress,
        }),
      })

      const json = await res.json()
      if (json.success) {
        toast.success("Đã tạo chấm công cho nhân viên")
        setShowCreateSessionDialog(false)
        setCreateCheckInTime("")
        setCreateCheckOutTime("")
        onOpenChange(false)
        if (onDelete) onDelete() // Refresh calendar data
      } else {
        toast.error(json.error || "Không thể tạo chấm công")
      }
    } catch (error) {
      console.error("Error creating session:", error)
      toast.error("Không thể tạo chấm công")
    } finally {
      setCreatingSession(false)
    }
  }

  // Get the last manager edit (EDIT_CHECKIN, EDIT_CHECKOUT, or EDIT_BOTH)
  // Get the last manager edit (EDIT_CHECKIN, EDIT_CHECKOUT, or EDIT_BOTH)
  const lastManagerEdit = auditLogs.length > 0
    ? [...auditLogs]
      .reverse()
      .find(log =>
        ['EDIT_CHECKIN', 'EDIT_CHECKOUT', 'EDIT_BOTH', 'CREATE_FROM_ABSENT'].includes(log.action_type)
      )
    : null

  // Determine if user can delete the last edit
  // HR and ADMIN can delete any edit
  // WAREHOUSE_MANAGER can only delete their own edits
  const isHROrAdmin = user?.role === 'HR' || user?.role === 'ADMIN'
  const canDeleteLastEdit = lastManagerEdit && (isHROrAdmin || lastManagerEdit.modified_by === user?.id)

  // Handle delete audit log (undo last edit)
  const handleDeleteAuditLog = async () => {
    if (!lastManagerEdit || !lastManagerEdit.id || !shiftSession?.id) {
      toast.error("Không tìm thấy bản sửa để xóa")
      return
    }

    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa sửa",
      description: "Bạn có chắc muốn xóa sửa gần nhất này? Dữ liệu sẽ được khôi phục về giá trị trước đó.",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeletingAuditLog(true)
        try {
          const res = await mobileFetch(`/api/shifts/sessions/${shiftSession.id}/audit-logs?auditLogId=${lastManagerEdit.id}`, {
            method: "DELETE",
          })
          const json = await res.json()

          if (json.success) {
            toast.success("Đã xóa sửa và khôi phục dữ liệu")
            // Reload shift detail after successful delete
            if (shiftSession?.id) {
              loadShiftDetail(shiftSession.id)
            }
            // Notify parent component (calendar) to refresh data
            if (onDelete) onDelete()
          } else {
            toast.error(json.error || "Không thể xóa sửa")
          }
        } catch (error) {
          toast.error("Không thể xóa sửa")
        } finally {
          setDeletingAuditLog(false)
        }
      }
    })
  }

  // If we only have a pending request (no assignment), show pending request UI
  const isPendingRequestOnly = !assignment && pendingRequest?.status === "PENDING"

  if (!shiftTemplate || !user || !date) {
    return null
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      IN_PROGRESS: { variant: "secondary", label: "Đang làm" },
      PENDING_APPROVAL: { variant: "outline", label: "Chờ duyệt" },
      COMPLETED: { variant: "default", label: "Hoàn thành" },
      REJECTED: { variant: "destructive", label: "Từ chối" },
    }
    const config = variants[status] || variants.IN_PROGRESS
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-screen flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
          <DialogTitle className="text-2xl">
            {isPendingRequestOnly ? "Yêu Cầu Đăng Ký Ca" : "Chi Tiết Ca Làm Việc"}
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            {user.full_name} - {format(date, "dd/MM/yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-4">
            {/* Pending Registration Request UI */}
            {isPendingRequestOnly ? (
              <div className="space-y-6">
                <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 bg-amber-100">
                        <Clock className="h-3 w-3" />
                        Chờ duyệt
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Nhân Viên</Label>
                        <p className="font-bold text-lg mt-1">{user.full_name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Ca Đăng Ký</Label>
                        <p className="font-bold text-lg mt-1">{shiftTemplate.shift_name}</p>
                        <p className="text-sm text-muted-foreground">{shiftTemplate.shift_code}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Thời Gian Ca</Label>
                        <p className="font-bold text-lg mt-1">
                          {formatTime(shiftTemplate.start_time)} - {formatTime(shiftTemplate.end_time)}
                        </p>
                      </div>
                    </div>
                    {pendingRequest?.notes && (
                      <div className="mt-4 p-3 bg-white rounded-lg border">
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Ghi Chú</Label>
                        <p className="text-sm mt-1">{pendingRequest.notes}</p>
                      </div>
                    )}
                    <div className="mt-4 text-sm text-muted-foreground">
                      <span>Ngày yêu cầu: </span>
                      <span className="font-medium">
                        {pendingRequest?.created_at
                          ? `${formatVietnamDate(new Date(pendingRequest.created_at))} ${formatVietnamTimeShort(new Date(pendingRequest.created_at))}`
                          : "N/A"
                        }
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : loading ? (
              <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
            ) : !currentSession ? (
              <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950">
                <CardContent className="p-6">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:bg-amber-900">
                      <AlertTriangle className="h-3 w-3" />
                      Vắng mặt
                    </Badge>
                  </div>
                  <div className="text-center mb-6">
                    <p className="text-muted-foreground">Nhân viên chưa chấm công cho ca này</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ca: <span className="font-medium text-slate-700 dark:text-slate-300">{shiftTemplate.shift_name}</span>
                      ({formatTime(shiftTemplate.start_time)} - {formatTime(shiftTemplate.end_time)})
                    </p>
                  </div>
                  {assignment && (
                    <div className="flex justify-center">
                      <Button
                        onClick={() => {
                          // Set default times from shift template
                          setCreateCheckInTime(shiftTemplate.start_time?.substring(0, 5) || "08:00")
                          setCreateCheckOutTime(shiftTemplate.end_time?.substring(0, 5) || "17:00")
                          setShowCreateSessionDialog(true)
                        }}
                        className="gap-2 bg-blue-600 hover:bg-blue-700"
                      >
                        <Edit className="h-4 w-4" />
                        Tạo chấm công cho nhân viên
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Header Summary Card */}
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                  <CardContent className="pt-6">
                    {/* Alert badges for late/early */}
                    {(() => {
                      // Logic to determine late/early status using both structured fields and legacy notes
                      const lateMinutes = currentSession.late_minutes || 0;
                      const earlyMinutes = currentSession.early_minutes || 0;

                      const isLate = currentSession.is_late_checkin || lateMinutes > 0 || currentSession.notes?.includes("Đi muộn");
                      const isEarly = currentSession.is_early_checkout || earlyMinutes > 0 || currentSession.notes?.includes("Về sớm");

                      if (!isLate && !isEarly) return null;

                      return (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {isLate && (
                            <Badge variant="destructive" className="gap-1">
                              <Clock className="h-3 w-3" />
                              {lateMinutes > 0 ? `Đi muộn ${lateMinutes} phút` : (currentSession.notes?.match(/Đi muộn \d+ phút/)?.[0] || "Đi muộn")}
                            </Badge>
                          )}
                          {isEarly && (
                            <Badge variant="outline" className="gap-1 border-orange-300 text-orange-700 bg-orange-50">
                              <AlertTriangle className="h-3 w-3" />
                              {earlyMinutes > 0 ? `Về sớm ${earlyMinutes} phút` : (currentSession.notes?.match(/Về sớm \d+ phút/)?.[0] || "Về sớm")}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Ca làm việc</Label>
                        <p className="font-bold text-lg mt-1">{shiftTemplate.shift_name}</p>
                        <p className="text-sm text-muted-foreground">{shiftTemplate.shift_code}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Giờ Vào</Label>
                        <p className="font-bold text-lg mt-1">{formatTime(currentSession.check_in_time)}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Giờ Ra</Label>
                        <p className="font-bold text-lg mt-1">{formatTime(currentSession.check_out_time)}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase font-semibold">Trạng Thái</Label>
                        <p className="mt-2">{getStatusBadge(currentSession.status)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs for Attendance and Sales */}
                <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full">
                  <TabsList className={`grid w-full mb-6 ${isCashHandler ? 'grid-cols-3' : 'grid-cols-1'}`}>
                    <TabsTrigger value="attendance">Chấm Công</TabsTrigger>
                    {isCashHandler && <TabsTrigger value="sales">Bán Hàng</TabsTrigger>}
                    {isCashHandler && <TabsTrigger value="insights">Phân Tích Chuyên Sâu</TabsTrigger>}
                  </TabsList>

                  <TabsContent value="attendance" className="space-y-8 mt-0">
                    {/* Date Header and Edit Button */}
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold text-slate-800">
                        Ngày {format(new Date(currentSession.date || date || new Date()), "dd/MM/yyyy")}
                      </h3>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                          onClick={() => setShowEditAttendanceDialog(true)}
                        >
                          <Edit className="h-4 w-4" />
                          Chỉnh sửa thời gian
                        </Button>
                        {canDeleteLastEdit && (
                          <Button
                            variant="outline"
                            className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                            onClick={handleDeleteAuditLog}
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
                              // This helps us find the "Original" time before any edits
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
                                // 1. Original Check-in Event
                                const originalCheckInTime = firstCheckInEdit ? firstCheckInEdit.old_check_in_time : currentSession.check_in_time;

                                if (originalCheckInTime) {
                                  const originalCheckInPerformer = (currentSession.users_shift_sessions_user_idTousers?.full_name || 'Nhân viên');
                                  const originalCheckInPerformerEmail = currentSession.users_shift_sessions_user_idTousers?.email;

                                  allEvents.push({
                                    id: 'original-checkin',
                                    type: 'original',
                                    device: getDeviceName(currentSession.check_in_device_info),
                                    actionType: 'Vào ca',
                                    time: originalCheckInTime,
                                    value: 'Vào ca',
                                    ip: currentSession.check_in_ip,
                                    location: currentSession.check_in_location,
                                    performer: originalCheckInPerformer,
                                    performerEmail: originalCheckInPerformerEmail,
                                    isVerified: true
                                  });
                                }

                                // 2. Original Check-out Event
                                const originalCheckOutTime = firstCheckOutEdit ? firstCheckOutEdit.old_check_out_time : currentSession.check_out_time;

                                if (originalCheckOutTime) {
                                  const originalCheckOutPerformer = (currentSession.users_shift_sessions_user_idTousers?.full_name || 'Nhân viên');
                                  const originalCheckOutPerformerEmail = currentSession.users_shift_sessions_user_idTousers?.email;

                                  allEvents.push({
                                    id: 'original-checkout',
                                    type: 'original',
                                    device: getDeviceName(currentSession.check_out_device_info),
                                    actionType: 'Tan ca',
                                    time: originalCheckOutTime,
                                    value: 'Tan ca',
                                    ip: currentSession.check_out_ip,
                                    location: currentSession.check_out_location,
                                    performer: originalCheckOutPerformer,
                                    performerEmail: originalCheckOutPerformerEmail,
                                    isVerified: true
                                  });
                                }
                              }

                              // 3. Audit Logs (The Edits) - skip CREATE_FROM_ABSENT as it's already handled above
                              auditLogs.forEach((log) => {
                                // Skip CREATE_FROM_ABSENT as we already show its rows above
                                if (log.action_type === 'CREATE_FROM_ABSENT') return;

                                // For other edits, show them as edit rows
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
                                  // Show two rows for EDIT_BOTH
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
                  </TabsContent>

                  {isCashHandler && (
                    <TabsContent value="sales" className="space-y-6 mt-0">
                      {/* Sales Statistics */}
                      <Card className="border-2 border-slate-200">
                        <CardHeader className="bg-slate-50 border-b rounded-t-lg flex flex-row items-center justify-between">
                          <CardTitle className="text-lg font-bold">📊 Thống Kê Bán Hàng</CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setShowProductsDialog(true)}
                          >
                            <Package className="h-4 w-4" />
                            Xem chi tiết sản phẩm
                          </Button>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="text-center p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200">
                              <p className="text-xs text-muted-foreground uppercase font-semibold">Tổng Đơn</p>
                              <p className="text-2xl font-bold mt-2">{currentSession.total_orders || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                              <p className="text-xs text-green-700 uppercase font-semibold">Tiền Mặt</p>
                              <p className="text-2xl font-bold text-green-600 mt-2">{currentSession.cash_orders || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                              <p className="text-xs text-blue-700 uppercase font-semibold">Chuyển Khoản</p>
                              <p className="text-2xl font-bold text-blue-600 mt-2">{currentSession.transfer_orders || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                              <p className="text-xs text-purple-700 uppercase font-semibold">E-Wallet</p>
                              <p className="text-2xl font-bold text-purple-600 mt-2">{currentSession.ewallet_orders || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg border border-orange-200">
                              <p className="text-xs text-orange-700 uppercase font-semibold">Tổng TT</p>
                              <p className="text-2xl font-bold text-orange-600 mt-2">
                                {formatCurrency(currentSession.total_revenue || 0)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Cash Management */}
                      <Card className="border-2 border-emerald-200">
                        <CardHeader className="bg-emerald-50 border-b rounded-t-lg">
                          <CardTitle className="text-lg font-bold">💰 Quản Lý Tiền Mặt</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                              <Label className="text-xs text-muted-foreground uppercase font-semibold">Tiền Đầu Ca</Label>
                              <p className="text-xl font-bold text-emerald-600 mt-2">
                                {(currentSession?.opening_cash !== null && currentSession?.opening_cash !== undefined)
                                  ? formatCurrency(currentSession.opening_cash)
                                  : <span className="text-gray-400 text-sm">Chưa nhập</span>
                                }
                              </p>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                              <Label className="text-xs text-muted-foreground uppercase font-semibold">Tiền Cuối Ca</Label>
                              <p className="text-xl font-bold text-emerald-600 mt-2">
                                {(currentSession?.closing_cash !== null && currentSession?.closing_cash !== undefined)
                                  ? formatCurrency(currentSession.closing_cash)
                                  : <span className="text-gray-400 text-sm">Chưa nhập</span>
                                }
                              </p>
                            </div>
                            <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                              <Label className="text-xs text-muted-foreground uppercase font-semibold">Hệ Thống (Kỳ Vọng)</Label>
                              <p className="text-xl font-bold text-sky-600 mt-2">
                                {(currentSession?.expected_cash !== null && currentSession?.expected_cash !== undefined)
                                  ? formatCurrency(currentSession.expected_cash)
                                  : <span className="text-gray-400 text-sm">Chưa tính</span>
                                }
                              </p>
                            </div>
                            <div className={`p-4 rounded-lg border-2 ${(currentSession?.cash_difference) !== null && (currentSession?.cash_difference) !== undefined
                              ? ((currentSession?.cash_difference ?? 0) >= 0
                                ? 'bg-green-50 border-green-300'
                                : 'bg-red-50 border-red-300')
                              : 'bg-gray-50 border-gray-200'
                              }`}>
                              <Label className="text-xs text-muted-foreground uppercase font-semibold">Chênh Lệch</Label>
                              <p className={`text-xl font-bold mt-2 ${(currentSession?.cash_difference) !== null && (currentSession?.cash_difference) !== undefined
                                ? ((currentSession?.cash_difference ?? 0) >= 0 ? 'text-green-600' : 'text-red-600')
                                : 'text-gray-400'
                                }`}>
                                {(currentSession?.cash_difference !== null && currentSession?.cash_difference !== undefined)
                                  ? formatCurrency(currentSession.cash_difference)
                                  : <span className="text-sm">Chưa tính</span>
                                }
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Discount Breakdown */}
                      {detailData?.analytics?.discountBreakdown && (
                        <Card className="border-2 border-amber-200">
                          <CardHeader className="bg-amber-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🎁 Giảm Giá & Khuyến Mãi</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Tổng Giảm</Label>
                                <p className="text-xl font-bold text-amber-600 mt-2">
                                  {formatCurrency(detailData.analytics.discountBreakdown.totalDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Giảm Thường</Label>
                                <p className="text-xl font-bold text-yellow-600 mt-2">
                                  {formatCurrency(detailData.analytics.discountBreakdown.regularDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">KM</Label>
                                <p className="text-xl font-bold text-orange-600 mt-2">
                                  {formatCurrency(detailData.analytics.discountBreakdown.promotionDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-pink-50 rounded-lg border border-pink-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Voucher</Label>
                                <p className="text-xl font-bold text-pink-600 mt-2">
                                  {formatCurrency(detailData.analytics.discountBreakdown.voucherDiscount)}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  )}

                  {isCashHandler && (
                    <TabsContent value="insights" className="space-y-6 mt-0">
                      {/* Top Products */}
                      {detailData?.analytics?.topProducts && detailData.analytics.topProducts.length > 0 && (
                        <Card className="border-2 border-violet-200">
                          <CardHeader className="bg-violet-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🏆 Top 5 Sản Phẩm Bán Chạy</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">#</TableHead>
                                  <TableHead>Sản Phẩm</TableHead>
                                  <TableHead className="text-right">SL</TableHead>
                                  <TableHead className="text-right">Doanh Thu</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detailData.analytics.topProducts.map((product: any, idx: number) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-bold">{idx + 1}</TableCell>
                                    <TableCell className="font-medium">{product.name || product.product_name}</TableCell>
                                    <TableCell className="text-right">{product.quantity}</TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {formatCurrency(product.revenue)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}

                      {/* Peak Hours */}
                      {detailData?.analytics?.peakHours && detailData.analytics.peakHours.length > 0 && (
                        <Card className="border-2 border-cyan-200">
                          <CardHeader className="bg-cyan-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">⏰ Giờ Cao Điểm</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              {detailData.analytics.peakHours.map((hour: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-cyan-50 rounded-lg">
                                  <span className="font-semibold">{hour.hour}:00 - {hour.hour}:59</span>
                                  <div className="flex gap-4">
                                    <span className="text-sm">
                                      <span className="text-muted-foreground">Đơn:</span>{" "}
                                      <span className="font-bold">{hour.count || hour.orders}</span>
                                    </span>
                                    <span className="text-sm font-bold text-cyan-700">
                                      {formatCurrency(hour.total || hour.revenue)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Vouchers Used */}
                      {detailData?.analytics?.vouchersUsed && detailData.analytics.vouchersUsed.length > 0 && (
                        <Card className="border-2 border-violet-200">
                          <CardHeader className="bg-violet-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🎟️ Voucher Đã Sử Dụng</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-violet-50">
                                  <TableHead>Mã Voucher</TableHead>
                                  <TableHead className="text-right">Số Lần</TableHead>
                                  <TableHead className="text-right">Tổng Giảm</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detailData.analytics.vouchersUsed.map((voucher: any, idx: number) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-medium font-mono">{voucher.code}</TableCell>
                                    <TableCell className="text-right">{voucher.count}</TableCell>
                                    <TableCell className="text-right font-semibold text-violet-700">
                                      {formatCurrency(voucher.totalDiscount)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}

                      {/* Promotions Used */}
                      {detailData?.analytics?.promotionsUsed && detailData.analytics.promotionsUsed.length > 0 && (
                        <Card className="border-2 border-rose-200">
                          <CardHeader className="bg-rose-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🏷️ Khuyến Mãi Đã Áp Dụng</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-rose-50">
                                  <TableHead>Tên Khuyến Mãi</TableHead>
                                  <TableHead className="text-right">Số Lần</TableHead>
                                  <TableHead className="text-right">Tổng Giảm</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detailData.analytics.promotionsUsed.map((promo: any, idx: number) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-medium">{promo.name}</TableCell>
                                    <TableCell className="text-right">{promo.count}</TableCell>
                                    <TableCell className="text-right font-semibold text-rose-700">
                                      {formatCurrency(promo.totalDiscount)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  )}

                </Tabs>
              </div>
            )}
          </div>
        </div>

        {/* Footer for pending registration request */}
        {
          isPendingRequestOnly && (
            <DialogFooter className="border-t border-border px-6 py-4 flex-shrink-0">
              {showReassignDialog ? (
                <div className="w-full space-y-4">
                  <div className="space-y-2">
                    <Label>Chọn ca mới cho nhân viên:</Label>
                    {loadingShifts ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Đang tải danh sách ca...</span>
                      </div>
                    ) : (
                      <Select value={selectedNewShiftId} onValueChange={setSelectedNewShiftId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn ca làm việc mới" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableShifts
                            .filter(shift => shift.id !== pendingRequest?.work_shift_id)
                            .map(shift => (
                              <SelectItem key={shift.id} value={shift.id}>
                                {shift.shift_name} ({formatTime(shift.start_time)} - {formatTime(shift.end_time)})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Ghi chú (không bắt buộc):</Label>
                    <Textarea
                      value={reassignNotes}
                      onChange={(e) => setReassignNotes(e.target.value)}
                      placeholder="Lý do xếp ca khác..."
                      className="min-h-[60px]"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowReassignDialog(false)
                        setSelectedNewShiftId("")
                        setReassignNotes("")
                      }}
                    >
                      Hủy
                    </Button>
                    <Button
                      onClick={handleReassignPendingRequest}
                      disabled={rejecting || !selectedNewShiftId}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {rejecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Đang xử lý...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          Xếp ca này
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 w-full justify-end">
                  <Button
                    variant="outline"
                    onClick={openReassignDialog}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Xếp Ca Khác
                  </Button>
                  <Button
                    onClick={handleApprovePendingRequest}
                    disabled={approving}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {approving ? "Đang duyệt..." : "Duyệt Ca"}
                  </Button>
                </div>
              )}
            </DialogFooter>
          )
        }

        {/* Footer with actions */}
        {
          assignment && !shiftSession && !isPendingRequestOnly && (
            <DialogFooter className="border-t border-border px-6 py-4 flex-shrink-0">
              <div className="flex gap-2 w-full justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false)
                    if (onEdit) onEdit()
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Sửa Ca
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: "Xác nhận xóa ca",
                      description: "Bạn có chắc muốn xóa ca này?",
                      onConfirm: async () => {
                        setConfirmDialog(prev => ({ ...prev, open: false }))
                        setDeleting(true)
                        try {
                          const res = await mobileFetch(`/api/shifts/assignments/${assignment.id}`, {
                            method: "DELETE",
                          })
                          const json = await res.json()

                          if (json.success) {
                            toast.success("Đã xóa ca làm việc")
                            onOpenChange(false)
                            if (onDelete) onDelete()
                          } else {
                            toast.error(json.error || "Không thể xóa ca")
                          }
                        } catch (error) {
                          toast.error("Không thể xóa ca")
                        } finally {
                          setDeleting(false)
                        }
                      }
                    })
                  }}
                  disabled={deleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleting ? "Đang xóa..." : "Xóa Ca"}
                </Button>
              </div>
            </DialogFooter>
          )
        }

        {/* Approval actions for completed sessions */}
        {
          shiftSession && shiftSession.check_out_time && shiftSession.status !== "REJECTED" && (
            <DialogFooter className="border-t border-border px-6 py-4 flex-shrink-0">
              {showRejectDialog ? (
                <div className="w-full space-y-3">
                  <Label>Lý do từ chối:</Label>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Nhập lý do từ chối chấm công..."
                    className="min-h-[80px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRejectDialog(false)
                        setRejectReason("")
                      }}
                    >
                      Hủy
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleReject}
                      disabled={rejecting || !rejectReason.trim()}
                    >
                      {rejecting ? "Đang xử lý..." : "Xác nhận từ chối"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 w-full justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    {shiftSession.status === "COMPLETED" && (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Đã duyệt
                      </Badge>
                    )}
                    {shiftSession.status === "PENDING_APPROVAL" && (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        Chờ duyệt
                      </Badge>
                    )}
                    {shiftSession.status === "IN_PROGRESS" && (
                      <Badge variant="outline" className="gap-1">
                        Chưa checkout
                      </Badge>
                    )}
                  </div>
                  {(shiftSession.status === "PENDING_APPROVAL" || shiftSession.status === "IN_PROGRESS") && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowRejectDialog(true)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Từ chối
                      </Button>
                      <Button
                        onClick={handleApprove}
                        disabled={approving}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {approving ? "Đang duyệt..." : "Duyệt chấm công"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </DialogFooter>
          )
        }
      </DialogContent >

      {/* Edit Attendance Dialog */}
      <EditAttendanceDialog
        open={showEditAttendanceDialog}
        onOpenChange={setShowEditAttendanceDialog}
        sessionId={shiftSession?.id || ""}
        sessionDate={shiftSession?.date || shiftSession?.session_date || date?.toISOString() || new Date().toISOString()}
        initialCheckInTime={shiftSession?.check_in_time}
        initialCheckOutTime={shiftSession?.check_out_time}
        employeeName={shiftSession?.users_shift_sessions_user_idTousers?.full_name || assignment?.user?.full_name || "Nhân viên"}
        onSuccess={() => {
          // Reload shift detail after successful edit
          if (shiftSession?.id) {
            loadShiftDetail(shiftSession.id)
            setShowEditAttendanceDialog(false)
          }
          // Notify parent component (calendar) to refresh data
          if (onDelete) onDelete()
        }}
      />

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

      {/* Create Session Dialog for Absent Employee */}
      <Dialog open={showCreateSessionDialog} onOpenChange={setShowCreateSessionDialog}>
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Tạo Chấm Công</DialogTitle>
            <DialogDescription>
              Nhập giờ vào và giờ ra cho nhân viên <strong>{user?.full_name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Ca làm việc</Label>
              <p className="text-sm text-muted-foreground">
                {shiftTemplate?.shift_name} ({formatTime(shiftTemplate?.start_time)} - {formatTime(shiftTemplate?.end_time)})
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="createCheckInTime">Giờ vào</Label>
                <Input
                  id="createCheckInTime"
                  type="time"
                  value={createCheckInTime}
                  onChange={(e) => setCreateCheckInTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="createCheckOutTime">Giờ ra</Label>
                <Input
                  id="createCheckOutTime"
                  type="time"
                  value={createCheckOutTime}
                  onChange={(e) => setCreateCheckOutTime(e.target.value)}
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950 p-3 rounded-md border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 inline-block mr-2 text-amber-600 dark:text-amber-400" />
              Lưu ý: Thao tác này sẽ tạo chấm công mới cho nhân viên với trạng thái "Hoàn thành" và ghi lại audit log.
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCreateSessionDialog(false)}
              disabled={creatingSession}
            >
              Hủy
            </Button>
            <Button
              onClick={handleCreateSessionForAbsent}
              disabled={creatingSession || !createCheckInTime || !createCheckOutTime}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingSession ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                "Tạo chấm công"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Products Dialog */}
      <ShiftProductsDialog
        open={showProductsDialog}
        onOpenChange={setShowProductsDialog}
        sessionId={currentSession?.id || null}
        sessionDate={currentSession ? format(new Date(currentSession.date || date || new Date()), "dd/MM/yyyy") : undefined}
      />
    </Dialog >
  )
}
