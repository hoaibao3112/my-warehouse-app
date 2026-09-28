"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { CheckCircle2, XCircle, Calendar, User, MessageSquare, CalendarDays } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { useAuth } from "@/hooks/use-auth"
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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useMediaQuery } from "@/hooks/use-media-query"
import { mobileFetch } from "@/lib/mobile/api-client"

interface LeaveRequest {
  id: string
  user_id: string
  leave_date: string
  reason?: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  created_at: string
  approved_by?: string
  approved_at?: string
  rejection_reason?: string
  users_requester: {
    full_name: string
    email: string
  }
  users_approver?: {
    full_name: string
  }
}

export default function LeaveApprovalPage() {
  const { user } = useAuth()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [dialogAction, setDialogAction] = useState<"approve" | "reject" | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchRequests = async () => {
    try {
      setLoading(true)
      // Get all leave requests for warehouse (manager view)
      const res = await mobileFetch("/api/shifts/leave?type=all")
      const json = await res.json()

      if (json.success) {
        setRequests(json.data.requests || [])
      } else {
        toast.error(json.error || "Không thể tải dữ liệu")
      }
    } catch (error) {
      console.error("Error fetching leave requests:", error)
      toast.error("Không thể tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const handleAction = async () => {
    if (!selectedRequest || !dialogAction) return

    setSubmitting(true)
    try {
      const body: any = { action: dialogAction }
      if (dialogAction === "reject" && rejectionReason.trim()) {
        body.rejection_reason = rejectionReason.trim()
      }

      const res = await mobileFetch(`/api/shifts/leave/${selectedRequest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã cập nhật yêu cầu")
        setDialogAction(null)
        setSelectedRequest(null)
        setRejectionReason("")
        fetchRequests()
      } else {
        toast.error(json.error || "Không thể cập nhật")
      }
    } catch (error) {
      toast.error("Không thể cập nhật")
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge className="bg-yellow-500">Chờ duyệt</Badge>
      case "APPROVED":
        return <Badge className="bg-green-500">Đã duyệt</Badge>
      case "REJECTED":
        return <Badge variant="destructive">Từ chối</Badge>
      case "CANCELLED":
        return <Badge variant="outline">Đã hủy</Badge>
      default:
        return null
    }
  }

  const pendingRequests = requests.filter(r => r.status === "PENDING")
  const processedRequests = requests.filter(r => r.status !== "PENDING")

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {isMobile ? (
        <MobilePageHeader
          icon={CalendarDays}
          title="Duyệt nghỉ phép"
          subtitle="Quản lý yêu cầu nghỉ phép của nhân viên"
        />
      ) : (
        <div className="max-w-7xl mx-auto p-6 mb-6">
          <h1 className="text-2xl font-bold">Duyệt nghỉ phép</h1>
          <p className="text-muted-foreground">Quản lý yêu cầu nghỉ phép của nhân viên</p>
        </div>
      )}

      <div className={isMobile ? "p-4 space-y-6" : "max-w-7xl mx-auto p-6 space-y-6"}>
        {/* Pending Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Yêu cầu chờ duyệt ({pendingRequests.length})
            </CardTitle>
            <CardDescription>
              Những yêu cầu nghỉ phép đang chờ bạn phê duyệt
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Không có yêu cầu nào đang chờ duyệt</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <Card key={request.id} className="border-l-4 border-l-yellow-500">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{request.users_requester.full_name}</p>
                              <p className="text-xs text-muted-foreground">{request.users_requester.email}</p>
                            </div>
                          </div>
                          {getStatusBadge(request.status)}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">
                            {format(new Date(request.leave_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                          </span>
                        </div>

                        {request.reason && (
                          <div className="flex items-start gap-2 text-sm">
                            <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <p className="text-muted-foreground">{request.reason}</p>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          Gửi lúc: {format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </div>

                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request)
                              setDialogAction("approve")
                            }}
                            className="flex-1"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedRequest(request)
                              setDialogAction("reject")
                            }}
                            className="flex-1"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Từ chối
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Processed Requests */}
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử xử lý ({processedRequests.length})</CardTitle>
            <CardDescription>
              Những yêu cầu đã được xử lý
            </CardDescription>
          </CardHeader>
          <CardContent>
            {processedRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Chưa có yêu cầu nào được xử lý</p>
              </div>
            ) : (
              <div className="space-y-3">
                {processedRequests.slice(0, 10).map((request) => (
                  <Card key={request.id} className="border-l-4 border-l-muted">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <p className="font-medium text-sm">{request.users_requester.full_name}</p>
                          </div>
                          {getStatusBadge(request.status)}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>{format(new Date(request.leave_date), "dd/MM/yyyy", { locale: vi })}</span>
                        </div>

                        {request.reason && (
                          <p className="text-xs text-muted-foreground">{request.reason}</p>
                        )}

                        {request.rejection_reason && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 rounded text-xs text-red-600">
                            Lý do từ chối: {request.rejection_reason}
                          </div>
                        )}

                        {request.users_approver && request.approved_at && (
                          <div className="text-xs text-muted-foreground">
                            {request.status === "APPROVED" ? "Duyệt" : "Từ chối"} bởi {request.users_approver.full_name} •{" "}
                            {format(new Date(request.approved_at), "dd/MM/yyyy HH:mm")}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approval Dialog */}
      <AlertDialog open={dialogAction === "approve"} onOpenChange={(open) => !open && setDialogAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận duyệt nghỉ phép</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn phê duyệt yêu cầu nghỉ phép của{" "}
              <strong>{selectedRequest?.users_requester.full_name}</strong> vào ngày{" "}
              <strong>
                {selectedRequest && format(new Date(selectedRequest.leave_date), "dd/MM/yyyy", { locale: vi })}
              </strong>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Duyệt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rejection Dialog */}
      <AlertDialog open={dialogAction === "reject"} onOpenChange={(open) => !open && setDialogAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận từ chối</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn đang từ chối yêu cầu nghỉ phép của{" "}
              <strong>{selectedRequest?.users_requester.full_name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejection-reason">Lý do từ chối (không bắt buộc)</Label>
            <Textarea
              id="rejection-reason"
              placeholder="Nhập lý do từ chối..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Từ chối"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
