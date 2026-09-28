"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar as CalendarIcon, Check, X, Clock, Filter, History, User } from "lucide-react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { mobileFetch } from "@/lib/mobile/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface LeaveRequest {
  id: string
  leave_date: string
  reason: string | null
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  approved_at: string | null
  rejection_reason: string | null
  users_requester: {
    id: string
    full_name: string
    email: string | null
  }
  users_approver: {
    id: string
    full_name: string
  } | null
  work_shifts: {
    id: string
    shift_name: string
    shift_code: string
    start_time: string
    end_time: string
  } | null
  created_at?: string
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ duyệt", color: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "Đã duyệt", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Từ chối", color: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Đã hủy", color: "bg-gray-100 text-gray-800" },
}

export default function LeaveRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)

  // Dialog state
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [actionType, setActionType] = useState<"approve" | "reject">("approve")
  const [rejectionReason, setRejectionReason] = useState("")
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadRequests()
  }, [startDate, endDate, selectedStatus])

  const loadRequests = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: "all" })
      if (startDate) params.append("startDate", startDate.toISOString())
      if (endDate) params.append("endDate", endDate.toISOString())
      if (selectedStatus && selectedStatus !== "all") {
        params.append("status", selectedStatus)
      }

      const response = await mobileFetch(`/api/shifts/leave?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setRequests(data.data.requests || [])
      } else {
        toast.error(data.error || "Không thể tải danh sách nghỉ phép")
      }
    } catch (error) {
      toast.error("Không thể kết nối đến server")
    } finally {
      setLoading(false)
    }
  }

  const openActionDialog = (request: LeaveRequest, type: "approve" | "reject") => {
    setSelectedRequest(request)
    setActionType(type)
    setRejectionReason("")
    setActionDialogOpen(true)
  }

  const handleAction = async () => {
    if (!selectedRequest) return

    setProcessing(true)
    try {
      const response = await mobileFetch(`/api/shifts/leave/${selectedRequest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionType,
          rejection_reason: actionType === "reject" ? rejectionReason : undefined,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(data.message)
        setActionDialogOpen(false)
        loadRequests()
      } else {
        toast.error(data.error || "Không thể xử lý yêu cầu")
      }
    } catch (error) {
      toast.error("Không thể kết nối đến server")
    } finally {
      setProcessing(false)
    }
  }

  const pendingRequests = requests.filter((r) => r.status === "PENDING")
  const historyRequests = requests.filter((r) => r.status !== "PENDING")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Quản Lý Nghỉ Phép</h1>
          <p className="text-muted-foreground">Duyệt và quản lý yêu cầu nghỉ phép của nhân viên</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "dd/MM/yyyy") : "Từ ngày"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "dd/MM/yyyy") : "Đến ngày"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setStartDate(undefined)
                setEndDate(undefined)
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Chờ Duyệt
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Lịch Sử
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Không có yêu cầu nào đang chờ duyệt
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingRequests.map((request) => (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{request.users_requester.full_name}</span>
                          <Badge className={STATUS_MAP[request.status].color}>
                            {STATUS_MAP[request.status].label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="w-4 h-4" />
                            {format(new Date(request.leave_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                          </div>
                          {request.work_shifts && (
                            <span>Ca: {request.work_shifts.shift_name}</span>
                          )}
                        </div>
                        {request.reason && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Lý do:</span> {request.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => openActionDialog(request, "approve")}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Duyệt
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openActionDialog(request, "reject")}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Từ Chối
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="flex gap-2 mb-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="APPROVED">Đã duyệt</SelectItem>
                <SelectItem value="REJECTED">Từ chối</SelectItem>
                <SelectItem value="CANCELLED">Đã hủy</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : historyRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Không có lịch sử nghỉ phép
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {historyRequests.map((request) => (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{request.users_requester.full_name}</span>
                          <Badge className={STATUS_MAP[request.status].color}>
                            {STATUS_MAP[request.status].label}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(request.leave_date), "dd/MM/yyyy", { locale: vi })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {request.work_shifts && (
                          <span>Ca: {request.work_shifts.shift_name}</span>
                        )}
                      </div>
                      {request.reason && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Lý do:</span> {request.reason}
                        </p>
                      )}
                      {request.users_approver && request.approved_at && (
                        <div className="text-sm text-muted-foreground border-t pt-2 mt-2">
                          <span className="font-medium">
                            {request.status === "APPROVED" ? "Đã duyệt bởi" : "Xử lý bởi"}:
                          </span>{" "}
                          {request.users_approver.full_name} -{" "}
                          {format(new Date(request.approved_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                        </div>
                      )}
                      {request.rejection_reason && (
                        <p className="text-sm text-red-600">
                          <span className="font-medium">Lý do từ chối:</span> {request.rejection_reason}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Duyệt Nghỉ Phép" : "Từ Chối Nghỉ Phép"}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <>
                  <strong>{selectedRequest.users_requester.full_name}</strong> xin nghỉ ngày{" "}
                  <strong>
                    {format(new Date(selectedRequest.leave_date), "dd/MM/yyyy", { locale: vi })}
                  </strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {actionType === "reject" && (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Lý do từ chối</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Nhập lý do từ chối (tùy chọn)"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {processing
                ? "Đang xử lý..."
                : actionType === "approve"
                  ? "Xác nhận duyệt"
                  : "Xác nhận từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
