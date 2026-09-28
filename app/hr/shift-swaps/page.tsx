"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { ArrowRightLeft, Check, X, RefreshCw, CalendarIcon, Filter, Clock, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export default function ShiftSwapsPage() {
  const { toast } = useToast()
  const [shiftSwaps, setShiftSwaps] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending")
  const [warehouses, setWarehouses] = useState<any[]>([])

  // Filters for "all" tab
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all")
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

  useEffect(() => {
    loadWarehouses()
  }, [])

  useEffect(() => {
    loadShiftSwaps()
  }, [activeTab, selectedWarehouse, selectedStatus, selectedSwapType, employeeSearch, startDate, endDate])

  const loadWarehouses = async () => {
    try {
      const res = await mobileFetch("/api/warehouses?pageSize=1000")
      const json = await res.json()
      if (json.success) {
        setWarehouses(json.data || [])
      }
    } catch (error) {
      console.error("Error loading warehouses:", error)
    }
  }

  const loadShiftSwaps = async () => {
    try {
      setLoading(true)

      if (activeTab === "pending") {
        // Fetch pending swap requests waiting for HR approval
        const res = await mobileFetch("/api/shifts/swap?status=PENDING&type=all")
        const json = await res.json()

        if (json.success) {
          // Filter only requests where target has already accepted (pending manager approval)
          const pendingApproval = json.data.filter((r: any) => r.target_response || r.target_user_id)
          setShiftSwaps(pendingApproval)
        } else {
          toast({
            title: "Lỗi",
            description: json.error || "Không thể tải danh sách đổi ca",
            variant: "destructive",
          })
        }
      } else {
        // Fetch all swap requests with filters
        const params = new URLSearchParams({ type: "all" })

        if (selectedWarehouse !== "all") {
          params.append("warehouseId", selectedWarehouse)
        }

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
          setShiftSwaps(json.data || [])
        } else {
          toast({
            title: "Lỗi",
            description: json.error || "Không thể tải danh sách đổi ca",
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error("Error fetching shift swaps:", error)
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách đổi ca",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      toast({
        title: "Đang xuất báo cáo...",
        description: "Vui lòng đợi trong giây lát",
      })

      const params = new URLSearchParams()
      if (selectedStatus !== "all") params.append("status", selectedStatus)
      if (employeeSearch.trim()) params.append("employeeSearch", employeeSearch.trim())
      if (startDate) params.append("startDate", startDate.toISOString().split('T')[0])
      if (endDate) params.append("endDate", endDate.toISOString().split('T')[0])

      const response = await mobileFetch(`/api/hr/shift-swaps/export?${params.toString()}`)

      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bao-cao-doi-ca-${format(new Date(), "ddMMyyyy")}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Thành công",
        description: "Đã tải xuống báo cáo đổi ca",
      })
    } catch (error) {
      console.error("Export error:", error)
      toast({
        title: "Lỗi",
        description: "Không thể xuất báo cáo",
        variant: "destructive",
      })
    }
  }

  const handleApproveSwap = async (requestId: string) => {
    try {
      const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })

      const json = await res.json()

      if (json.success) {
        toast({
          title: "Thành công",
          description: json.message || "Đã phê duyệt đổi ca",
        })
        setConfirmDialog({ open: false, request: null, action: "approve" })
        loadShiftSwaps()
      } else {
        toast({
          title: "Lỗi",
          description: json.error || "Không thể phê duyệt",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể phê duyệt yêu cầu",
        variant: "destructive",
      })
    }
  }

  const handleRejectSwap = async (requestId: string) => {
    try {
      const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejection_reason: "HR từ chối" }),
      })

      const json = await res.json()

      if (json.success) {
        toast({
          title: "Thành công",
          description: json.message || "Đã từ chối đổi ca",
        })
        setConfirmDialog({ open: false, request: null, action: "reject" })
        loadShiftSwaps()
      } else {
        toast({
          title: "Lỗi",
          description: json.error || "Không thể từ chối",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể từ chối yêu cầu",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Quản Lý Đổi Ca</h1>
          <p className="text-muted-foreground mt-1">
            {activeTab === "pending"
              ? `Chờ duyệt: ${shiftSwaps.length} yêu cầu`
              : `Tổng số: ${shiftSwaps.length} yêu cầu`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadShiftSwaps}
          disabled={loading}
        >
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
            Tất Cả / Lịch Sử
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {/* Filters for "all" tab */}
          {activeTab === "all" && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Bộ Lọc
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Warehouse Filter */}
                  <div className="space-y-2">
                    <Label>Kho/Cửa hàng</Label>
                    <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn kho..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name} ({warehouse.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Employee Search */}
                  <div className="space-y-2">
                    <Label>Tìm kiếm nhân viên</Label>
                    <Input
                      placeholder="Nhập tên hoặc email..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                    />
                  </div>

                  {/* Swap Type Filter */}
                  <div className="space-y-2">
                    <Label>Loại yêu cầu</Label>
                    <Select value={selectedSwapType} onValueChange={setSelectedSwapType}>
                      <SelectTrigger>
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
                  <div className="space-y-2">
                    <Label>Trạng thái</Label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger>
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
                  <div className="space-y-2">
                    <Label>Từ ngày</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "dd/MM/yyyy", { locale: vi }) : "Chọn ngày bắt đầu"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* End Date */}
                  <div className="space-y-2">
                    <Label>Đến ngày</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "dd/MM/yyyy", { locale: vi }) : "Chọn ngày kết thúc"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Clear Filters Button */}
                {(selectedWarehouse !== "all" || employeeSearch || selectedStatus !== "all" || selectedSwapType !== "all" || startDate || endDate) && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedWarehouse("all")
                        setEmployeeSearch("")
                        setSelectedStatus("all")
                        setSelectedSwapType("all")
                        setStartDate(undefined)
                        setEndDate(undefined)
                      }}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Xóa bộ lọc
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === "pending"
                  ? "Yêu Cầu Đổi Ca Chờ Duyệt"
                  : "Tất Cả Yêu Cầu Đổi Ca"}
              </CardTitle>
              <CardDescription>
                {activeTab === "pending"
                  ? "Danh sách yêu cầu đổi ca đã được nhân viên chấp nhận, chờ HR phê duyệt"
                  : "Lịch sử tất cả các yêu cầu đổi ca (đang chờ, đã duyệt, đã từ chối, đã hủy)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : !shiftSwaps || shiftSwaps.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <ArrowRightLeft className="w-12 h-12 text-muted-foreground opacity-50" />
                    <div className="text-muted-foreground">
                      {activeTab === "pending"
                        ? "Không có yêu cầu đổi ca nào đang chờ duyệt"
                        : "Không tìm thấy yêu cầu đổi ca nào"}
                    </div>
                    {activeTab === "all" && (selectedWarehouse !== "all" || selectedStatus !== "all" || selectedSwapType !== "all" || employeeSearch || startDate || endDate) && (
                      <p className="text-sm text-muted-foreground">
                        Thử thay đổi bộ lọc để xem thêm kết quả
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {shiftSwaps.map((request) => (
                    <Card key={request.id} className="border-2">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          {/* Type Badge */}
                          <div className="flex items-center gap-2">
                            {request.swap_type === 'REPLACE' ? (
                              <Badge className="bg-purple-500 text-white">
                                Làm Thay Ca
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-500 text-white">
                                Đổi Ca
                              </Badge>
                            )}
                          </div>
                          {/* Creator and Created At */}
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>Tạo bởi: {request.users_requester?.full_name}</span>
                            <span className="mx-1">•</span>
                            <Clock className="w-3 h-3" />
                            <span>{request.created_at ? format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: vi }) : "-"}</span>
                          </div>

                          {/* Requester and Target Info */}
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <ArrowRightLeft className="w-4 h-4" />
                                <span>Người yêu cầu</span>
                              </div>
                              <div>
                                <div className="font-semibold">{request.users_requester?.full_name}</div>
                                <div className="text-sm text-muted-foreground">{request.users_requester?.email}</div>
                              </div>
                              <div className="text-sm">
                                <Badge variant="outline" className="mr-2">
                                  {request.work_shifts?.shift_code}
                                </Badge>
                                {format(new Date(request.requester_date), "dd/MM/yyyy", { locale: vi })}
                                <div className="text-xs text-muted-foreground mt-1">
                                  {request.work_shifts?.start_time} - {request.work_shifts?.end_time}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Check className="w-4 h-4" />
                                <span>{request.swap_type === 'REPLACE' ? 'Người nhận thay' : 'Người nhận'}</span>
                              </div>
                              <div>
                                <div className="font-semibold">{request.users_target?.full_name || "Đang chờ"}</div>
                                <div className="text-sm text-muted-foreground">{request.users_target?.email || "-"}</div>
                              </div>
                              {request.swap_type === 'SWAP' && (
                                <div className="text-sm">
                                  <Badge variant="outline" className="mr-2">
                                    {request.target_work_shifts?.shift_code}
                                  </Badge>
                                  {format(new Date(request.target_date), "dd/MM/yyyy", { locale: vi })}
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {request.target_work_shifts?.start_time} - {request.target_work_shifts?.end_time}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Warehouse */}
                          <div className="text-sm">
                            <span className="text-muted-foreground">Kho:</span>{" "}
                            <span className="font-medium">{request.warehouses?.name}</span>
                          </div>

                          {/* Reason - Highlighted for REPLACE type */}
                          {request.requester_reason && (
                            <div className={cn(
                              "text-sm p-3 rounded border-l-4",
                              request.swap_type === 'REPLACE'
                                ? "bg-amber-50 border-amber-500"
                                : "bg-blue-50 border-blue-500"
                            )}>
                              <div className={cn(
                                "font-semibold mb-1 flex items-center gap-2",
                                request.swap_type === 'REPLACE' ? "text-amber-800" : "text-blue-800"
                              )}>
                                {request.swap_type === 'REPLACE' && (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">!</span>
                                )}
                                Lý do {request.swap_type === 'REPLACE' ? '(cần duyệt)' : ''}:
                              </div>
                              <div className={request.swap_type === 'REPLACE' ? "text-amber-900 font-medium" : ""}>
                                {request.requester_reason}
                              </div>
                            </div>
                          )}

                          {/* Status Badge (for "all" tab) */}
                          {activeTab === "all" && (
                            <div className="pt-2 border-t space-y-2">
                              <div className="text-sm text-muted-foreground mb-2">Trạng thái:</div>
                              {request.status === "PENDING" && (
                                <Badge className="bg-yellow-500">
                                  Đang chờ {request.target_user_id ? "duyệt HR" : "nhân viên nhận"}
                                </Badge>
                              )}
                              {request.status === "APPROVED" && (
                                <div className="space-y-1">
                                  <Badge className="bg-green-500">Đã duyệt</Badge>
                                  {request.users_approver && (
                                    <div className="text-sm text-muted-foreground">
                                      Người duyệt: <span className="font-medium text-green-700">{request.users_approver.full_name}</span>
                                    </div>
                                  )}
                                  {request.approved_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Thời gian: {format(new Date(request.approved_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                                    </div>
                                  )}
                                </div>
                              )}
                              {request.status === "REJECTED" && (
                                <div className="space-y-1">
                                  <Badge className="bg-red-500">Đã từ chối</Badge>
                                  {request.users_approver && (
                                    <div className="text-sm text-muted-foreground">
                                      Người từ chối: <span className="font-medium text-red-700">{request.users_approver.full_name}</span>
                                    </div>
                                  )}
                                  {request.approved_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Thời gian: {format(new Date(request.approved_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                                    </div>
                                  )}
                                  {request.rejection_reason && (
                                    <div className="text-sm text-red-700 italic">
                                      Lý do: {request.rejection_reason}
                                    </div>
                                  )}
                                </div>
                              )}
                              {request.status === "CANCELLED" && (
                                <Badge variant="outline">Đã hủy</Badge>
                              )}
                              {request.status === "EXPIRED" && (
                                <Badge variant="secondary">Hết hạn</Badge>
                              )}
                            </div>
                          )}

                          {/* Actions (only for pending tab) */}
                          {activeTab === "pending" && (
                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                variant="default"
                                className="flex-1"
                                onClick={() => setConfirmDialog({ open: true, request, action: "approve" })}
                              >
                                <Check className="w-4 h-4 mr-2" />
                                Phê Duyệt
                              </Button>
                              <Button
                                variant="destructive"
                                className="flex-1"
                                onClick={() => setConfirmDialog({ open: true, request, action: "reject" })}
                              >
                                <X className="w-4 h-4 mr-2" />
                                Từ Chối
                              </Button>
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
        </TabsContent>
      </Tabs>

      {/* Confirm Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmDialog.action === "approve" ? (
                <>
                  <Check className="w-5 h-5 text-green-600" />
                  Phê duyệt {confirmDialog.request?.swap_type === 'REPLACE' ? 'làm thay ca' : 'đổi ca'}?
                </>
              ) : (
                <>
                  <X className="w-5 h-5 text-red-600" />
                  Từ chối {confirmDialog.request?.swap_type === 'REPLACE' ? 'làm thay ca' : 'đổi ca'}?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {confirmDialog.action === "approve"
                    ? `Bạn có chắc chắn muốn phê duyệt yêu cầu ${confirmDialog.request?.swap_type === 'REPLACE' ? 'làm thay ca' : 'đổi ca'} này không?`
                    : `Bạn có chắc chắn muốn từ chối yêu cầu ${confirmDialog.request?.swap_type === 'REPLACE' ? 'làm thay ca' : 'đổi ca'} này không?`}
                </p>

                {/* Display request details */}
                {confirmDialog.request && (
                  <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {confirmDialog.request.swap_type === 'REPLACE' ? (
                        <Badge className="bg-purple-500 text-white">Làm Thay Ca</Badge>
                      ) : (
                        <Badge className="bg-blue-500 text-white">Đổi Ca</Badge>
                      )}
                    </div>

                    <div>
                      <span className="font-medium">Người yêu cầu:</span>{" "}
                      {confirmDialog.request.users_requester?.full_name}
                    </div>

                    <div>
                      <span className="font-medium">Người nhận:</span>{" "}
                      {confirmDialog.request.users_target?.full_name || "Đang chờ"}
                    </div>

                    {confirmDialog.request.requester_reason && (
                      <div className={cn(
                        "p-2 rounded border-l-4 mt-2",
                        confirmDialog.request.swap_type === 'REPLACE'
                          ? "bg-amber-50 border-amber-500"
                          : "bg-blue-50 border-blue-500"
                      )}>
                        <div className={cn(
                          "font-semibold text-xs mb-1 flex items-center gap-1",
                          confirmDialog.request.swap_type === 'REPLACE' ? "text-amber-800" : "text-blue-800"
                        )}>
                          {confirmDialog.request.swap_type === 'REPLACE' && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">!</span>
                          )}
                          Lý do:
                        </div>
                        <div className={cn(
                          "text-sm",
                          confirmDialog.request.swap_type === 'REPLACE' ? "text-amber-900 font-medium" : "text-gray-700"
                        )}>
                          {confirmDialog.request.requester_reason}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => {
                if (confirmDialog.request) {
                  if (confirmDialog.action === "approve") {
                    handleApproveSwap(confirmDialog.request.id)
                  } else {
                    handleRejectSwap(confirmDialog.request.id)
                  }
                }
              }}
            >
              {confirmDialog.action === "approve" ? "Phê Duyệt" : "Từ Chối"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
