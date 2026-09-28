"use client"

import { mobileFetch } from "@/lib/mobile/api-client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { toast } from "sonner"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { Check, X, User, ArrowRightLeft, UserCheck, Clock, RefreshCw, CalendarIcon, Filter } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
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

export default function ShiftSwapApprovalPage() {
  const [swapRequests, setSwapRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending")

  // Filters for "all" tab
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedSwapType, setSelectedSwapType] = useState<string>("all")
  const [employeeSearch, setEmployeeSearch] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    request: any
    action: "approve" | "reject"
  }>({ open: false, request: null, action: "approve" })

  const fetchSwapRequests = async () => {
    try {
      setLoading(true)

      if (activeTab === "pending") {
        // Fetch pending swap requests that have been accepted by target user
        const res = await mobileFetch("/api/shifts/swap?status=PENDING&type=all")
        const json = await res.json()

        if (json.success) {
          // Filter only REPLACE requests where target has already accepted (need manager approval)
          // SWAP type doesn't need manager approval - it auto-approves when accepted
          const pendingApproval = json.data.filter((r: any) =>
            r.swap_type === 'REPLACE' && r.target_user_id
          )
          setSwapRequests(pendingApproval)
        } else {
          toast.error(json.error || "Không thể tải danh sách yêu cầu")
        }
      } else {
        // Fetch all swap requests with filters
        const params = new URLSearchParams({ type: "all" })

        if (selectedStatus !== "all") {
          params.append("status", selectedStatus)
        }

        if (selectedSwapType !== "all") {
          params.append("swapType", selectedSwapType)
        }

        if (employeeSearch.trim()) {
          params.append("employeeSearch", employeeSearch.trim())
        }

        if (startDate) {
          params.append("startDate", startDate.toISOString().split('T')[0])
        }

        if (endDate) {
          params.append("endDate", endDate.toISOString().split('T')[0])
        }

        const res = await mobileFetch(`/api/shifts/swap?${params.toString()}`)
        const json = await res.json()

        if (json.success) {
          setSwapRequests(json.data || [])
        } else {
          toast.error(json.error || "Không thể tải danh sách yêu cầu")
        }
      }
    } catch (error) {
      console.error("Error fetching swap requests:", error)
      toast.error("Không thể tải danh sách yêu cầu")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSwapRequests()
  }, [activeTab, selectedStatus, selectedSwapType, employeeSearch, startDate, endDate])

  const handleApprove = async (requestId: string) => {
    try {
      const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã phê duyệt yêu cầu làm thay ca")
        setConfirmDialog({ open: false, request: null, action: "approve" })
        fetchSwapRequests()
      } else {
        toast.error(json.error || "Không thể phê duyệt")
      }
    } catch (error) {
      toast.error("Không thể phê duyệt yêu cầu")
    }
  }

  const handleReject = async (requestId: string) => {
    try {
      const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejection_reason: "Quản lý từ chối" }),
      })

      const json = await res.json()

      if (json.success) {
        toast.success(json.message || "Đã từ chối yêu cầu làm thay ca")
        setConfirmDialog({ open: false, request: null, action: "reject" })
        fetchSwapRequests()
      } else {
        toast.error(json.error || "Không thể từ chối")
      }
    } catch (error) {
      toast.error("Không thể từ chối yêu cầu")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={UserCheck}
        title="Quản Lý Đổi Ca"
        subtitle={activeTab === "pending" ? `Chờ duyệt: ${swapRequests.length}` : `Tổng: ${swapRequests.length}`}
      />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="hidden md:flex md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản Lý Đổi Ca</h1>
            <p className="text-muted-foreground">
              {activeTab === "pending" ? "Duyệt các yêu cầu làm thay ca đang chờ" : "Lịch sử tất cả yêu cầu đổi ca"}
            </p>
          </div>
          <Button variant="outline" onClick={fetchSwapRequests} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Làm mới
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "all")}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="pending" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Chờ Duyệt
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Lịch Sử
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {/* Filters for "all" tab */}
            {activeTab === "all" && (
              <Card className="mb-4">
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Filter className="w-4 h-4" />
                    Bộ Lọc
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Employee Search */}
                    <div className="space-y-1">
                      <Label className="text-xs">Tìm nhân viên</Label>
                      <Input
                        placeholder="Tên hoặc email..."
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        className="h-9"
                      />
                    </div>

                    {/* Swap Type Filter */}
                    <div className="space-y-1">
                      <Label className="text-xs">Loại yêu cầu</Label>
                      <Select value={selectedSwapType} onValueChange={setSelectedSwapType}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Chọn loại..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="SWAP">Đổi ca</SelectItem>
                          <SelectItem value="REPLACE">Làm thay ca</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-1">
                      <Label className="text-xs">Trạng thái</Label>
                      <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Chọn trạng thái..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="PENDING">Đang chờ</SelectItem>
                          <SelectItem value="APPROVED">Đã duyệt</SelectItem>
                          <SelectItem value="REJECTED">Đã từ chối</SelectItem>
                          <SelectItem value="CANCELLED">Đã hủy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1">
                      <Label className="text-xs">Từ ngày</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "dd/MM/yyyy", { locale: vi }) : "Chọn..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* End Date */}
                    <div className="space-y-1">
                      <Label className="text-xs">Đến ngày</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "dd/MM/yyyy", { locale: vi }) : "Chọn..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Clear Filters */}
                  {(employeeSearch || selectedStatus !== "all" || selectedSwapType !== "all" || startDate || endDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setEmployeeSearch("")
                        setSelectedStatus("all")
                        setSelectedSwapType("all")
                        setStartDate(undefined)
                        setEndDate(undefined)
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Xóa bộ lọc
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Content */}
            {loading ? (
              <Card className="p-6">
                <div className="text-center text-muted-foreground">Đang tải...</div>
              </Card>
            ) : swapRequests.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  {activeTab === "pending"
                    ? "Không có yêu cầu làm thay ca nào cần phê duyệt"
                    : "Không tìm thấy yêu cầu đổi ca nào"}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {swapRequests.map((request) => (
                  <Card key={request.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ArrowRightLeft className="h-5 w-5" />
                          {request.swap_type === 'REPLACE' ? 'Làm thay ca' : 'Đổi ca'}
                        </CardTitle>
                        {request.swap_type === 'REPLACE' ? (
                          <Badge className="bg-purple-500 text-white">Làm thay</Badge>
                        ) : (
                          <Badge className="bg-blue-500 text-white">Đổi ca</Badge>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-1 text-xs">
                        <User className="w-3 h-3" />
                        Tạo: {request.users_requester?.full_name}
                        <span className="mx-1">•</span>
                        <Clock className="w-3 h-3" />
                        {request.created_at ? format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: vi }) : "-"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Requester Info */}
                      <div className="p-3 bg-blue-50 rounded-lg space-y-1">
                        <div className="flex items-center gap-2 font-medium text-blue-900 text-sm">
                          <User className="h-4 w-4" />
                          {request.users_requester?.full_name}
                          <Badge variant="outline" className="ml-auto text-xs">Người yêu cầu</Badge>
                        </div>
                        <div className="text-xs text-blue-700">
                          Ca: {request.work_shifts?.shift_name} - {format(new Date(request.requester_date), "dd/MM/yyyy", { locale: vi })}
                        </div>
                        {request.requester_reason && (
                          <div className="text-xs text-amber-800 bg-amber-50 p-2 rounded border-l-2 border-amber-500 mt-2">
                            <span className="font-medium">Lý do:</span> {request.requester_reason}
                          </div>
                        )}
                      </div>

                      {/* Target Info */}
                      {request.users_target && (
                        <div className="p-3 bg-green-50 rounded-lg space-y-1">
                          <div className="flex items-center gap-2 font-medium text-green-900 text-sm">
                            <User className="h-4 w-4" />
                            {request.users_target?.full_name}
                            <Badge variant="outline" className="ml-auto text-xs">
                              {request.swap_type === 'REPLACE' ? 'Người nhận thay' : 'Người nhận'}
                            </Badge>
                          </div>
                          {request.swap_type === 'SWAP' && request.target_date && (
                            <div className="text-xs text-green-700">
                              Ca: {request.target_work_shifts?.shift_name} - {format(new Date(request.target_date), "dd/MM/yyyy", { locale: vi })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status for History tab */}
                      {activeTab === "all" && (
                        <div className="pt-2 border-t">
                          {request.status === "PENDING" && (
                            <Badge className="bg-yellow-500">
                              Đang chờ {request.target_user_id ? "duyệt" : "nhân viên nhận"}
                            </Badge>
                          )}
                          {request.status === "APPROVED" && (
                            <div className="space-y-1">
                              <Badge className="bg-green-500">Đã duyệt</Badge>
                              {request.users_approver && (
                                <div className="text-xs text-muted-foreground">
                                  Người duyệt: <span className="font-medium text-green-700">{request.users_approver.full_name}</span>
                                </div>
                              )}
                              {request.approved_at && (
                                <div className="text-xs text-muted-foreground">
                                  {format(new Date(request.approved_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                                </div>
                              )}
                            </div>
                          )}
                          {request.status === "REJECTED" && (
                            <div className="space-y-1">
                              <Badge className="bg-red-500">Đã từ chối</Badge>
                              {request.rejection_reason && (
                                <div className="text-xs text-red-700">Lý do: {request.rejection_reason}</div>
                              )}
                            </div>
                          )}
                          {request.status === "CANCELLED" && <Badge variant="outline">Đã hủy</Badge>}
                        </div>
                      )}

                      {/* Action Buttons (only for pending tab) */}
                      {activeTab === "pending" && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="default"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => setConfirmDialog({ open: true, request, action: "approve" })}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Duyệt
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => setConfirmDialog({ open: true, request, action: "reject" })}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Từ chối
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Confirm Dialog */}
        <AlertDialog
          open={confirmDialog.open}
          onOpenChange={(open) => {
            if (!open) setConfirmDialog({ open: false, request: null, action: "approve" })
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDialog.action === "approve" ? "Phê duyệt làm thay ca" : "Từ chối làm thay ca"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.action === "approve"
                  ? "Xác nhận phê duyệt yêu cầu này? Ca sẽ được giao cho người nhận thay."
                  : "Bạn có chắc muốn từ chối yêu cầu này?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                className={confirmDialog.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                onClick={() => {
                  if (confirmDialog.request) {
                    if (confirmDialog.action === "approve") {
                      handleApprove(confirmDialog.request.id)
                    } else {
                      handleReject(confirmDialog.request.id)
                    }
                  }
                }}
              >
                {confirmDialog.action === "approve" ? "Phê duyệt" : "Từ chối"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
