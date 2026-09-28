"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { format, addMonths } from "date-fns"
import { vi } from "date-fns/locale"
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertCircle,
  Loader2,
  CheckSquare,
  Filter,
  ArrowRightLeft
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { mobileFetch } from "@/lib/mobile/api-client"

interface WorkShift {
  id: string
  shift_name: string
  shift_code: string
  start_time: string
  end_time: string
}

interface RegistrationRequest {
  id: string
  user_id: string
  work_shift_id: string
  warehouse_id: string
  requested_date: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  notes: string | null
  rejection_reason: string | null
  created_at: string
  users_requester: {
    id: string
    full_name: string
    email: string
    employment_type: string | null
  }
  work_shifts: {
    id: string
    shift_name: string
    shift_code: string
    start_time: string
    end_time: string
  }
  warehouses: {
    id: string
    name: string
    code: string
  }
}

export default function ShiftRegistrationRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<RegistrationRequest[]>([])
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const next = addMonths(new Date(), 1)
    return format(next, "yyyy-MM")
  })
  const [statusFilter, setStatusFilter] = useState("PENDING")
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // Reassign dialog state
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
  const [selectedForReassign, setSelectedForReassign] = useState<RegistrationRequest | null>(null)
  const [availableShifts, setAvailableShifts] = useState<WorkShift[]>([])
  const [selectedNewShiftId, setSelectedNewShiftId] = useState<string>("")
  const [reassignNotes, setReassignNotes] = useState("")
  const [loadingShifts, setLoadingShifts] = useState(false)

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedMonth) params.append("month", selectedMonth)
      if (statusFilter && statusFilter !== "ALL") params.append("status", statusFilter)

      const res = await mobileFetch(`/api/shifts/registration-requests?${params.toString()}`)
      const json = await res.json()

      if (json.success) {
        setRequests(json.data)
        setStats(json.stats)
      } else {
        toast.error(json.error || "Không thể tải danh sách yêu cầu")
      }
    } catch (error) {
      console.error("Error fetching requests:", error)
      toast.error("Không thể tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, statusFilter, toast])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const handleApprove = async (requestId: string) => {
    try {
      setSubmitting(true)
      const res = await mobileFetch(`/api/shifts/registration-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message)
        fetchRequests()
        setSelectedRequests(prev => {
          const next = new Set(prev)
          next.delete(requestId)
          return next
        })
      } else {
        toast.error(json.error)
      }
    } catch (error) {
      toast.error("Không thể phê duyệt")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!selectedForReassign) return

    try {
      setSubmitting(true)
      const res = await mobileFetch(`/api/shifts/registration-requests/${selectedForReassign.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: "" }),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã từ chối")
        fetchRequests()
        setReassignDialogOpen(false)
        setSelectedForReassign(null)
        setSelectedRequests(prev => {
          const next = new Set(prev)
          next.delete(selectedForReassign.id)
          return next
        })
      } else {
        toast.error(json.error)
      }
    } catch (error) {
      toast.error("Không thể từ chối")
    } finally {
      setSubmitting(false)
    }
  }

  // Fetch available shifts for reassign dialog
  const fetchAvailableShifts = async (warehouseId: string, date: string) => {
    try {
      setLoadingShifts(true)
      const res = await mobileFetch(`/api/shifts/available-shifts?date=${date}&warehouse_id=${warehouseId}`)
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

  // Open reassign dialog
  const openReassignDialog = (request: RegistrationRequest) => {
    setSelectedForReassign(request)
    setSelectedNewShiftId("")
    setReassignNotes("")
    setReassignDialogOpen(true)
    fetchAvailableShifts(request.warehouse_id, format(new Date(request.requested_date), "yyyy-MM-dd"))
  }

  // Handle reassign shift
  const handleReassign = async () => {
    if (!selectedForReassign || !selectedNewShiftId) {
      toast.error("Vui lòng chọn ca mới")
      return
    }

    try {
      setSubmitting(true)
      const res = await mobileFetch(`/api/shifts/registration-requests/${selectedForReassign.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_work_shift_id: selectedNewShiftId,
          notes: reassignNotes
        }),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message)
        fetchRequests()
        setReassignDialogOpen(false)
        setSelectedForReassign(null)
        setSelectedNewShiftId("")
        setReassignNotes("")
        setSelectedRequests(prev => {
          const next = new Set(prev)
          next.delete(selectedForReassign.id)
          return next
        })
      } else {
        toast.error(json.error)
      }
    } catch (error) {
      toast.error("Không thể xếp ca")
    } finally {
      setSubmitting(false)
    }
  }

  const handleBulkApprove = async () => {
    if (selectedRequests.size === 0) {
      toast.error("Vui lòng chọn ít nhất một yêu cầu để phê duyệt")
      return
    }

    try {
      setSubmitting(true)
      const res = await mobileFetch("/api/shifts/registration-requests/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_ids: Array.from(selectedRequests) }),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã xử lý")
        if (json.data.failed.length > 0) {
          toast.error(`Một số yêu cầu không thể duyệt: ${json.data.failed.map((f: any) => `${f.name}: ${f.reason}`).join("; ")}`)
        }
        fetchRequests()
        setSelectedRequests(new Set())
      } else {
        toast.error(json.error)
      }
    } catch (error) {
      toast.error("Không thể phê duyệt hàng loạt")
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelectRequest = (id: string) => {
    setSelectedRequests(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    const pendingRequests = requests.filter(r => r.status === "PENDING")
    if (selectedRequests.size === pendingRequests.length) {
      setSelectedRequests(new Set())
    } else {
      setSelectedRequests(new Set(pendingRequests.map(r => r.id)))
    }
  }

  const formatShiftTime = (timeStr: string) => {
    if (!timeStr) return ""
    // Handle both "HH:mm:ss" and Date ISO strings
    if (timeStr.includes("T")) {
      return format(new Date(timeStr), "HH:mm")
    }
    return timeStr.substring(0, 5)
  }

  // Group requests by date
  const groupedRequests = requests.reduce((acc, req) => {
    const dateKey = format(new Date(req.requested_date), "yyyy-MM-dd")
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(req)
    return acc
  }, {} as Record<string, RegistrationRequest[]>)

  const sortedDates = Object.keys(groupedRequests).sort()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Duyệt đăng ký ca làm việc</h1>
        <p className="text-muted-foreground">Xem và phê duyệt yêu cầu đăng ký ca của nhân viên</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-muted">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Tổng yêu cầu</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-yellow-500 text-white">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Chờ duyệt</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500 text-white">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.approved}</p>
              <p className="text-sm text-muted-foreground">Đã duyệt</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500 text-white">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.rejected}</p>
              <p className="text-sm text-muted-foreground">Đã từ chối</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Lọc:</span>
              </div>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Chọn tháng" />
                </SelectTrigger>
                <SelectContent>
                  {[-1, 0, 1, 2].map(offset => {
                    const date = addMonths(new Date(), offset)
                    const value = format(date, "yyyy-MM")
                    return (
                      <SelectItem key={value} value={value}>
                        Tháng {format(date, "MM/yyyy")}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  <SelectItem value="PENDING">Chờ duyệt</SelectItem>
                  <SelectItem value="APPROVED">Đã duyệt</SelectItem>
                  <SelectItem value="REJECTED">Đã từ chối</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedRequests.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Đã chọn {selectedRequests.size} yêu cầu
                </span>
                <Button
                  onClick={handleBulkApprove}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckSquare className="w-4 h-4 mr-2" />
                  )}
                  Duyệt tất cả
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Không có yêu cầu nào</h3>
            <p className="text-muted-foreground">
              Không tìm thấy yêu cầu đăng ký ca nào cho bộ lọc đã chọn
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Select All */}
          {requests.filter(r => r.status === "PENDING").length > 0 && (
            <div className="flex items-center gap-2 p-2">
              <Checkbox
                checked={selectedRequests.size === requests.filter(r => r.status === "PENDING").length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm">Chọn tất cả đang chờ duyệt</span>
            </div>
          )}

          {sortedDates.map(dateKey => (
            <Card key={dateKey}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {format(new Date(dateKey), "EEEE, dd/MM/yyyy", { locale: vi })}
                  <Badge variant="outline" className="ml-2">
                    {groupedRequests[dateKey].length} yêu cầu
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {groupedRequests[dateKey].map(request => (
                  <div
                    key={request.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border",
                      request.status === "PENDING" && "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200",
                      request.status === "APPROVED" && "bg-green-50 dark:bg-green-950/20 border-green-200",
                      request.status === "REJECTED" && "bg-red-50 dark:bg-red-950/20 border-red-200",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {request.status === "PENDING" && (
                        <Checkbox
                          checked={selectedRequests.has(request.id)}
                          onCheckedChange={() => toggleSelectRequest(request.id)}
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{request.users_requester.full_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {request.users_requester.employment_type === "PARTTIME" ? "Part-time" : "Fulltime"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {request.work_shifts.shift_name} ({formatShiftTime(request.work_shifts.start_time)} - {formatShiftTime(request.work_shifts.end_time)})
                          </span>
                        </div>
                        {request.notes && (
                          <p className="text-sm text-muted-foreground mt-1 italic">
                            Ghi chú: {request.notes}
                          </p>
                        )}
                        {request.rejection_reason && (
                          <p className="text-sm text-red-600 mt-1">
                            Lý do từ chối: {request.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {request.status === "PENDING" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => openReassignDialog(request)}
                            disabled={submitting}
                          >
                            <ArrowRightLeft className="w-4 h-4 mr-1" />
                            Xếp ca khác
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleApprove(request.id)}
                            disabled={submitting}
                          >
                            {submitting ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                            )}
                            Duyệt
                          </Button>
                        </>
                      ) : request.status === "APPROVED" ? (
                        <Badge className="bg-green-500">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Đã duyệt
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="w-3 h-3 mr-1" />
                          Đã từ chối
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reassign Shift Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xếp ca khác cho nhân viên</DialogTitle>
            <DialogDescription>
              {selectedForReassign && (
                <>
                  Nhân viên <strong>{selectedForReassign.users_requester.full_name}</strong> đã đăng ký ca{" "}
                  <strong>{selectedForReassign.work_shifts.shift_name}</strong> ({formatShiftTime(selectedForReassign.work_shifts.start_time)} - {formatShiftTime(selectedForReassign.work_shifts.end_time)}).
                  <br />
                  Chọn ca khác phù hợp hơn cho nhân viên này.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Chọn ca mới</Label>
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
                      .filter(shift => shift.id !== selectedForReassign?.work_shift_id)
                      .map(shift => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {shift.shift_name} ({formatShiftTime(shift.start_time)} - {formatShiftTime(shift.end_time)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ghi chú (không bắt buộc)</Label>
              <Textarea
                placeholder="Lý do xếp ca khác..."
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleReassign}
              disabled={submitting || !selectedNewShiftId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-4 h-4 mr-2" />
              )}
              Xếp ca này
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
