'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/utils'
import { ResponsiveTable, TableColumn, TableAction } from '@/components/mobile/responsive-table'
import { Eye, ClipboardCheck, Edit2, Trash2 } from 'lucide-react'
import { MobilePageHeader } from '@/components/mobile/mobile-page-header'
import { formatDbTimeToDisplay, formatDbDateToDisplay } from '@/lib/server-time'
import { mobileFetch } from "@/lib/mobile/api-client"

interface ShiftSession {
  id: string
  assignment_id?: string // For absent employees
  users_shift_sessions_user_idTousers: { id: string; full_name: string; email: string }
  warehouses: { id: string; code: string; name: string }
  work_shifts?: { id: string; shift_name: string; start_time: string; end_time: string }
  session_date: string
  check_in_time?: string | null
  check_out_time?: string | null
  total_orders?: number
  total_revenue?: number
  cash_orders?: number
  transfer_orders?: number
  ewallet_orders?: number
  opening_cash?: number
  closing_cash?: number
  expected_cash?: number
  cash_difference?: number
  status: 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED' | 'REJECTED' | 'ABSENT'
  notes?: string
  rejection_reason?: string
}

interface ShiftDetail extends ShiftSession {
  invoices?: any[]
  analytics?: {
    topProducts: any[]
    topVouchers: any[]
    promotionsUsed: any[]
    giftPromotionsUsed: any[] // NEW: Gift promotions (Buy 1 Get 1)
    peakHours: any[]
    discountBreakdown: {
      totalDiscount: number
      regularDiscount: number
      promotionDiscount: number
      voucherDiscount: number
      giftDiscount: number // NEW: Value of free items
    }
    vouchersUsed: any[]
    paymentBreakdown: {
      cash: { count: number; total: number }
      transfer: { count: number; total: number }
      ewallet: { count: number; total: number }
    }
  }
  peakHours?: any[]
  summaryStats?: {
    totalInvoices: number
    grossRevenue: number // NEW: Before discounts
    netRevenue: number // NEW: After discounts
    totalDiscount: number // NEW: Total discounts including gift values
    totalRevenue: number // Legacy - same as netRevenue
    avgRevenuePerOrder: number
    totalProductsSold: number
    avgProductsPerOrder: number
    uniqueProducts: number
    peakHour: { hour: number; count: number; total: number } | null
    bestSellingProduct: { name: string; quantity: number; revenue: number } | null
    voucherUsageRate: number
    promotionUsageRate: number
    giftPromotionUsageRate: number // NEW
    voucherCount: number // NEW
    promotionCount: number // NEW
    giftPromotionCount: number // NEW
  }
  invoiceCount?: number
}

export default function ManageShiftsPage() {
  const { user } = useAuth()
  const [shifts, setShifts] = useState<ShiftSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedShift, setSelectedShift] = useState<ShiftDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('pending')
  const [detailTab, setDetailTab] = useState('overview')
  const [editCheckInOpen, setEditCheckInOpen] = useState(false)
  const [editCheckOutOpen, setEditCheckOutOpen] = useState(false)
  const [editCheckInTime, setEditCheckInTime] = useState('')
  const [editCheckOutTime, setEditCheckOutTime] = useState('')

  useEffect(() => {
    loadShifts()
  }, [activeTab])

  const loadShifts = async () => {
    try {
      setIsLoading(true)

      if (activeTab === 'absent') {
        // Load absent employees from special endpoint
        const res = await mobileFetch(`/api/shifts/absent?limit=50`)
        const data = await res.json()

        if (data.success) {
          setShifts(data.data || [])
        } else {
          toast.error('Lỗi tải danh sách vắng mặt')
        }
      } else {
        const status = activeTab === 'pending' ? 'PENDING_APPROVAL' : activeTab.toUpperCase()
        const res = await mobileFetch(`/api/shifts?status=${status}&limit=50`)
        const data = await res.json()

        if (data.success) {
          setShifts(data.data || [])
        } else {
          toast.error('Lỗi tải danh sách ca')
        }
      }
    } catch (err) {
      toast.error('Lỗi tải danh sách ca')
    } finally {
      setIsLoading(false)
    }
  }

  const loadShiftDetail = async (shift: ShiftSession) => {
    try {
      // If this is an absent employee (no actual session yet), just show the shift info
      if (shift.status === 'ABSENT') {
        setSelectedShift({
          ...shift,
          total_orders: 0,
          total_revenue: 0,
          cash_orders: 0,
          transfer_orders: 0,
          ewallet_orders: 0,
        } as ShiftDetail)
        setDetailOpen(true)
        return
      }

      // Load shift detail
      const detailRes = await mobileFetch(`/api/shifts/${shift.id}`)
      const detailData = await detailRes.json()

      if (!detailData.success) {
        toast.error('Lỗi tải chi tiết ca')
        return
      }

      // Load analytics
      const analyticsRes = await mobileFetch(`/api/shifts/${shift.id}/analytics`)
      const analyticsData = await analyticsRes.json()

      if (analyticsData.success) {
        setSelectedShift({
          ...detailData.data,
          analytics: analyticsData.data.analytics,
          peakHours: analyticsData.data.peakHours,
          summaryStats: analyticsData.data.summaryStats,
          invoiceCount: analyticsData.data.invoiceCount
        })
      } else {
        setSelectedShift(detailData.data)
      }

      setDetailOpen(true)
    } catch (err) {
      toast.error('Lỗi tải chi tiết ca')
    }
  }

  const handleApprove = async (shiftId: string) => {
    try {
      setIsSubmitting(true)
      const res = await mobileFetch(`/api/shifts/${shiftId}/approve`, {
        method: 'POST'
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Đã xác nhận ca làm việc')
        setDetailOpen(false)
        setSelectedShift(null)
        loadShifts()
      } else {
        toast.error(data.error || 'Lỗi xác nhận ca')
      }
    } catch (err) {
      toast.error('Lỗi xác nhận ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async (shiftId: string) => {
    if (!rejectionReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối')
      return
    }

    try {
      setIsSubmitting(true)
      const res = await mobileFetch(`/api/shifts/${shiftId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectionReason })
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Đã từ chối ca làm việc')
        setRejectOpen(false)
        setRejectionReason('')
        setDetailOpen(false)
        setSelectedShift(null)
        loadShifts()
      } else {
        toast.error(data.error || 'Lỗi từ chối ca')
      }
    } catch (err) {
      toast.error('Lỗi từ chối ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditCheckIn = async () => {
    if (!editCheckInTime) {
      toast.error('Vui lòng nhập thời gian vào ca')
      return
    }

    try {
      setIsSubmitting(true)

      // Check if this is an absent employee (need to create session)
      const isAbsent = selectedShift?.status === 'ABSENT'
      const body: any = { check_in_time: editCheckInTime }

      if (isAbsent && selectedShift?.assignment_id) {
        body.is_absent_session = true
        body.assignment_id = selectedShift.assignment_id
      }

      const res = await mobileFetch(`/api/shifts/sessions/${selectedShift?.id}/edit-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.success) {
        toast.success(isAbsent ? 'Đã chấm công cho nhân viên vắng mặt' : 'Cập nhật giờ vào ca thành công')
        setEditCheckInOpen(false)
        setEditCheckInTime('')
        setDetailOpen(false)
        loadShifts()
      } else {
        toast.error(data.error || 'Cập nhật thất bại')
      }
    } catch (err) {
      toast.error('Lỗi cập nhật giờ vào ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCheckIn = async () => {
    // Cannot delete check-in for absent employees (no session exists yet)
    if (selectedShift?.status === 'ABSENT') {
      toast.error('Không thể xóa - nhân viên chưa có chấm công')
      return
    }

    try {
      setIsSubmitting(true)
      const res = await mobileFetch(`/api/shifts/sessions/${selectedShift?.id}/edit-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_in_time: null })
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Xóa giờ vào ca thành công')
        setDetailOpen(false)
        loadShifts()
      } else {
        toast.error(data.error || 'Xóa thất bại')
      }
    } catch (err) {
      toast.error('Lỗi xóa giờ vào ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditCheckOut = async () => {
    if (!editCheckOutTime) {
      toast.error('Vui lòng nhập thời gian tan ca')
      return
    }

    try {
      setIsSubmitting(true)

      // Check if this is an absent employee (need to create session)
      const isAbsent = selectedShift?.status === 'ABSENT'
      const body: any = { check_out_time: editCheckOutTime }

      if (isAbsent && selectedShift?.assignment_id) {
        body.is_absent_session = true
        body.assignment_id = selectedShift.assignment_id
      }

      const res = await mobileFetch(`/api/shifts/sessions/${selectedShift?.id}/edit-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.success) {
        toast.success(isAbsent ? 'Đã chấm công cho nhân viên vắng mặt' : 'Cập nhật giờ tan ca thành công')
        setEditCheckOutOpen(false)
        setEditCheckOutTime('')
        setDetailOpen(false)
        loadShifts()
      } else {
        toast.error(data.error || 'Cập nhật thất bại')
      }
    } catch (err) {
      toast.error('Lỗi cập nhật giờ tan ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCheckOut = async () => {
    // Cannot delete check-out for absent employees (no session exists yet)
    if (selectedShift?.status === 'ABSENT') {
      toast.error('Không thể xóa - nhân viên chưa có chấm công')
      return
    }

    try {
      setIsSubmitting(true)
      const res = await mobileFetch(`/api/shifts/sessions/${selectedShift?.id}/edit-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_out_time: null })
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Xóa giờ tan ca thành công')
        setDetailOpen(false)
        loadShifts()
      } else {
        toast.error(data.error || 'Xóa thất bại')
      }
    } catch (err) {
      toast.error('Lỗi xóa giờ tan ca')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return <Badge className="bg-green-500">Đang làm việc</Badge>
      case 'PENDING_APPROVAL':
        return <Badge className="bg-yellow-500">Chờ xác nhận</Badge>
      case 'COMPLETED':
        return <Badge className="bg-blue-500">Hoàn thành</Badge>
      case 'REJECTED':
        return <Badge className="bg-red-500">Bị từ chối</Badge>
      case 'ABSENT':
        return <Badge className="bg-red-600">Vắng mặt</Badge>
      default:
        return <Badge>Unknown</Badge>
    }
  }

  const formatTime = (dateString?: string) => {
    return formatDbTimeToDisplay(dateString)
  }

  const formatDate = (dateString: string) => {
    return formatDbDateToDisplay(dateString)
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ClipboardCheck}
        title="Quản Lý Ca"
        subtitle="Xác nhận ca làm việc"
      />

      <div className="space-y-6 md:space-y-8 p-4 md:p-6">
        <div className="hidden md:block space-y-2">
          <h1 className="text-3xl font-bold">Quản Lý Ca Làm Việc</h1>
          <p className="text-muted-foreground">Xem chi tiết và xác nhận ca làm việc</p>
        </div>

        <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending">Chờ Xác Nhận</TabsTrigger>
            <TabsTrigger value="completed">Đã Hoàn Thành</TabsTrigger>
            <TabsTrigger value="rejected">Bị Từ Chối</TabsTrigger>
            <TabsTrigger value="in_progress">Đang Làm Việc</TabsTrigger>
            <TabsTrigger value="absent">Vắng Mặt</TabsTrigger>
          </TabsList>

          {['pending', 'completed', 'rejected', 'in_progress', 'absent'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {isLoading ? (
                <div className="flex items-center justify-center h-96">Đang tải...</div>
              ) : shifts.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    Không có ca làm việc nào
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <ResponsiveTable
                    data={shifts}
                    columns={[
                      {
                        key: 'user',
                        label: 'Nhân Viên',
                        render: (shift) => <span className="font-medium">{shift.users_shift_sessions_user_idTousers.full_name}</span>,
                        mobilePrimary: true,
                      },
                      {
                        key: 'date',
                        label: 'Ngày',
                        render: (shift) => <span>{formatDate(shift.session_date)}</span>,
                        mobilePrimary: true,
                      },
                      {
                        key: 'shift',
                        label: 'Ca',
                        render: (shift) => <span>{shift.work_shifts?.shift_name || '-'}</span>,
                      },
                      {
                        key: 'checkin',
                        label: 'Giờ Vào',
                        render: (shift) => <span className={!shift.check_in_time ? 'text-red-500' : ''}>{shift.check_in_time ? formatTime(shift.check_in_time) : 'Chưa có'}</span>,
                      },
                      {
                        key: 'checkout',
                        label: 'Giờ Ra',
                        render: (shift) => <span className={!shift.check_out_time ? 'text-muted-foreground' : ''}>{shift.check_out_time ? formatTime(shift.check_out_time) : '-'}</span>,
                      },
                      {
                        key: 'orders',
                        label: 'Đơn Hàng',
                        render: (shift) => <span>{shift.total_orders ?? 0}</span>,
                      },
                      {
                        key: 'revenue',
                        label: 'Doanh Thu',
                        render: (shift) => <span className="font-medium">{formatCurrency(shift.total_revenue ?? 0)}</span>,
                      },
                      {
                        key: 'status',
                        label: 'Trạng Thái',
                        render: (shift) => getStatusBadge(shift.status),
                      },
                    ]}
                    actions={[
                      {
                        label: 'Chi Tiết',
                        icon: <Eye className="w-4 h-4" />,
                        onClick: (shift) => loadShiftDetail(shift),
                        variant: 'outline',
                      },
                    ]}
                    keyExtractor={(shift) => shift.id}
                    emptyMessage="Không có ca làm việc nào"
                    mobileCardTitle={(shift) => shift.users_shift_sessions_user_idTousers.full_name}
                    mobileCardBadge={(shift) => getStatusBadge(shift.status)}
                    mobileCardMeta={(shift) => [
                      <span key="date" className="text-xs">Ngày: {formatDate(shift.session_date)}</span>,
                      shift.work_shifts ? <span key="shift" className="text-xs">Ca: {shift.work_shifts.shift_name}</span> : null,
                      <span key="time" className="text-xs">
                        {shift.check_in_time
                          ? `Giờ: ${formatTime(shift.check_in_time)}${shift.check_out_time ? ` - ${formatTime(shift.check_out_time)}` : ' (chưa tan ca)'}`
                          : 'Chưa chấm công'
                        }
                      </span>,
                      shift.status !== 'ABSENT' ? <span key="orders" className="text-xs">{shift.total_orders ?? 0} đơn hàng</span> : null,
                      shift.status !== 'ABSENT' ? <span key="revenue" className="text-xs">Doanh thu: {formatCurrency(shift.total_revenue ?? 0)}</span> : null,
                    ].filter(Boolean)}
                  />
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Shift Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-4xl max-h-screen flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle className="text-2xl">Chi Tiết Ca Làm Việc</DialogTitle>
              {selectedShift && (
                <DialogDescription className="text-base pt-2">
                  {selectedShift.users_shift_sessions_user_idTousers.full_name} - {formatDate(selectedShift.session_date)}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
              {selectedShift && (
                <div className="space-y-6">
                  {/* Header Summary Card */}
                  <Card className={`bg-gradient-to-r ${selectedShift.status === 'ABSENT' ? 'from-red-50 to-orange-50 border-red-200' : 'from-blue-50 to-indigo-50 border-blue-200'}`}>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <div>
                            <Label className="text-xs text-muted-foreground uppercase font-semibold">Giờ Vào</Label>
                            <p className="font-bold text-lg mt-1">
                              {selectedShift.check_in_time ? formatTime(selectedShift.check_in_time) : <span className="text-muted-foreground">Chưa có</span>}
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground uppercase font-semibold">Giờ Ra</Label>
                            <p className="font-bold text-lg mt-1">
                              {selectedShift.check_out_time ? formatTime(selectedShift.check_out_time) : <span className="text-muted-foreground">Chưa có</span>}
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground uppercase font-semibold">Trạng Thái</Label>
                            <p className="mt-2">{getStatusBadge(selectedShift.status)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground uppercase font-semibold">Kho</Label>
                            <p className="font-bold text-lg mt-1">{selectedShift.warehouses.name}</p>
                          </div>
                        </div>

                        {/* Show shift info for absent employees */}
                        {selectedShift.status === 'ABSENT' && selectedShift.work_shifts && (
                          <div className="p-3 bg-red-100 rounded-lg border border-red-300">
                            <p className="text-sm text-red-700">
                              <span className="font-semibold">Ca làm việc:</span> {selectedShift.work_shifts.shift_name} ({selectedShift.work_shifts.start_time?.substring(0, 5)} - {selectedShift.work_shifts.end_time?.substring(0, 5)})
                            </p>
                            <p className="text-sm text-red-600 mt-1">Nhân viên chưa chấm công. Quản lý có thể thêm giờ vào/ra bên dưới.</p>
                          </div>
                        )}

                        {/* Edit/Delete Buttons */}
                        <div className="flex flex-wrap gap-2 pt-2">
                          {/* Add check-in button (for absent or no check-in) */}
                          {!selectedShift.check_in_time ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Set default time to shift start time on the session date
                                const sessionDate = new Date(selectedShift.session_date)
                                const dateStr = sessionDate.toISOString().split('T')[0]
                                const startTime = selectedShift.work_shifts?.start_time?.substring(0, 5) || '08:00'
                                setEditCheckInTime(`${dateStr}T${startTime}`)
                                setEditCheckInOpen(true)
                              }}
                              className="flex items-center gap-2 text-green-600 hover:text-green-700"
                            >
                              <Edit2 className="w-4 h-4" />
                              Thêm giờ vào
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const checkInDate = new Date(selectedShift.check_in_time!)
                                  const dateStr = checkInDate.toISOString().split('T')[0]
                                  const hours = checkInDate.getUTCHours().toString().padStart(2, '0')
                                  const mins = checkInDate.getUTCMinutes().toString().padStart(2, '0')
                                  setEditCheckInTime(`${dateStr}T${hours}:${mins}`)
                                  setEditCheckInOpen(true)
                                }}
                                className="flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                Sửa giờ vào
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDeleteCheckIn}
                                className="flex items-center gap-2 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                                Xóa vào
                              </Button>
                            </>
                          )}

                          {/* Add/Edit check-out button */}
                          {!selectedShift.check_out_time ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Set default time to shift end time on the session date
                                const sessionDate = new Date(selectedShift.session_date)
                                const dateStr = sessionDate.toISOString().split('T')[0]
                                const endTime = selectedShift.work_shifts?.end_time?.substring(0, 5) || '17:00'
                                setEditCheckOutTime(`${dateStr}T${endTime}`)
                                setEditCheckOutOpen(true)
                              }}
                              className="flex items-center gap-2 text-green-600 hover:text-green-700"
                            >
                              <Edit2 className="w-4 h-4" />
                              Thêm giờ ra
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const checkOutDate = new Date(selectedShift.check_out_time!)
                                  const dateStr = checkOutDate.toISOString().split('T')[0]
                                  const hours = checkOutDate.getUTCHours().toString().padStart(2, '0')
                                  const mins = checkOutDate.getUTCMinutes().toString().padStart(2, '0')
                                  setEditCheckOutTime(`${dateStr}T${hours}:${mins}`)
                                  setEditCheckOutOpen(true)
                                }}
                                className="flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                Sửa giờ ra
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDeleteCheckOut}
                                className="flex items-center gap-2 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                                Xóa ra
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tabs for Overview and Insights */}
                  <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                      <TabsTrigger value="overview">Tổng Quan</TabsTrigger>
                      <TabsTrigger value="insights">Phân Tích Chuyên Sâu</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6 mt-0">
                      {/* Sales Statistics */}
                      <Card className="border-2 border-slate-200">
                        <CardHeader className="bg-slate-50 border-b rounded-t-lg">
                          <CardTitle className="text-lg font-bold">📊 Thống Kê Bán Hàng</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                              <p className="text-xs text-blue-700 uppercase font-semibold">Doanh Thu Gốc</p>
                              <p className="text-2xl font-bold text-blue-600 mt-2">
                                {formatCurrency(selectedShift.summaryStats?.grossRevenue || (selectedShift.total_revenue || 0) + (selectedShift.analytics?.discountBreakdown?.totalDiscount || 0))}
                              </p>
                              <p className="text-xs text-blue-500 mt-1">(Trước giảm/tặng)</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-lg border border-red-200">
                              <p className="text-xs text-red-700 uppercase font-semibold">Tổng Giảm/Tặng</p>
                              <p className="text-2xl font-bold text-red-600 mt-2">
                                {formatCurrency(selectedShift.summaryStats?.totalDiscount || selectedShift.analytics?.discountBreakdown?.totalDiscount || 0)}
                              </p>
                              <p className="text-xs text-red-500 mt-1">(KM + Quà)</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border-2 border-green-300">
                              <p className="text-xs text-green-700 uppercase font-semibold">Doanh Thu Thực</p>
                              <p className="text-2xl font-bold text-green-600 mt-2">
                                {formatCurrency(selectedShift.summaryStats?.netRevenue || selectedShift.total_revenue || 0)}
                              </p>
                              <p className="text-xs text-green-500 mt-1">(Tiền thu)</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="text-center p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200">
                              <p className="text-xs text-muted-foreground uppercase font-semibold">Tổng Đơn</p>
                              <p className="text-2xl font-bold mt-2">{selectedShift.total_orders}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                              <p className="text-xs text-green-700 uppercase font-semibold">Tiền Mặt</p>
                              <p className="text-2xl font-bold text-green-600 mt-2">{selectedShift.analytics?.paymentBreakdown?.cash?.count || selectedShift.cash_orders || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                              <p className="text-xs text-purple-700 uppercase font-semibold">E-Wallet</p>
                              <p className="text-2xl font-bold text-purple-600 mt-2">{selectedShift.analytics?.paymentBreakdown?.ewallet?.count || selectedShift.ewallet_orders || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg border border-orange-200">
                              <p className="text-xs text-orange-700 uppercase font-semibold">Voucher</p>
                              <p className="text-2xl font-bold text-orange-600 mt-2">{selectedShift.summaryStats?.voucherCount || 0}</p>
                            </div>
                            <div className="text-center p-4 bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg border border-pink-200">
                              <p className="text-xs text-pink-700 uppercase font-semibold">Khuyến Mãi</p>
                              <p className="text-2xl font-bold text-pink-600 mt-2">{(selectedShift.summaryStats?.promotionCount || 0) + (selectedShift.summaryStats?.giftPromotionCount || 0)}</p>
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
                            {selectedShift.opening_cash !== null && (
                              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Tiền Đầu Ca</Label>
                                <p className="text-xl font-bold text-emerald-600 mt-2">{formatCurrency(selectedShift.opening_cash)}</p>
                              </div>
                            )}
                            {selectedShift.closing_cash !== null && (
                              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Tiền Cuối Ca</Label>
                                <p className="text-xl font-bold text-emerald-600 mt-2">{formatCurrency(selectedShift.closing_cash)}</p>
                              </div>
                            )}
                            {selectedShift.expected_cash !== null && (
                              <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Tiền Kỳ Vọng</Label>
                                <p className="text-xl font-bold text-sky-600 mt-2">{formatCurrency(selectedShift.expected_cash)}</p>
                              </div>
                            )}
                            {selectedShift.cash_difference !== null && (
                              <div className={`p-4 rounded-lg border-2 ${selectedShift.cash_difference >= 0
                                ? 'bg-green-50 border-green-300'
                                : 'bg-red-50 border-red-300'
                                }`}>
                                <Label className="text-xs text-muted-foreground uppercase font-semibold">Chênh Lệch</Label>
                                <p
                                  className={`text-xl font-bold mt-2 ${selectedShift.cash_difference >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}
                                >
                                  {formatCurrency(selectedShift.cash_difference)}
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Discount Breakdown */}
                      {selectedShift.analytics && (
                        <Card className="border-2 border-rose-200">
                          <CardHeader className="bg-rose-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🏷️ Chi Tiết Giảm Giá</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div className="p-4 bg-gradient-to-br from-red-50 to-rose-100 rounded-lg border border-red-200">
                                <p className="text-xs text-red-700 uppercase font-semibold">Tổng Giảm</p>
                                <p className="text-xl font-bold text-red-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.discountBreakdown.totalDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-100 rounded-lg border border-yellow-200">
                                <p className="text-xs text-yellow-700 uppercase font-semibold">Giảm Thường</p>
                                <p className="text-xl font-bold text-yellow-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.discountBreakdown.regularDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-100 rounded-lg border border-blue-200">
                                <p className="text-xs text-blue-700 uppercase font-semibold">Giảm Khuyến Mãi</p>
                                <p className="text-xl font-bold text-blue-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.discountBreakdown.promotionDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-gradient-to-br from-purple-50 to-violet-100 rounded-lg border border-purple-200">
                                <p className="text-xs text-purple-700 uppercase font-semibold">Giảm Voucher</p>
                                <p className="text-xl font-bold text-purple-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.discountBreakdown.voucherDiscount)}
                                </p>
                              </div>
                              <div className="p-4 bg-gradient-to-br from-pink-50 to-fuchsia-100 rounded-lg border border-pink-200">
                                <p className="text-xs text-pink-700 uppercase font-semibold">Quà Tặng</p>
                                <p className="text-xl font-bold text-pink-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.discountBreakdown.giftDiscount || 0)}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Payment Method Breakdown */}
                      {selectedShift.analytics && (
                        <Card className="border-2 border-cyan-200">
                          <CardHeader className="bg-cyan-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">💳 Chi Tiết Thanh Toán</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg border-2 border-green-300 shadow-sm">
                                <p className="text-sm text-green-700 uppercase font-semibold">Tiền Mặt</p>
                                <p className="text-3xl font-bold text-green-600 mt-2">
                                  {selectedShift.analytics.paymentBreakdown.cash.count}
                                </p>
                                <p className="text-lg font-semibold text-green-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.paymentBreakdown.cash.total)}
                                </p>
                              </div>

                              <div className="p-5 bg-gradient-to-br from-purple-50 to-fuchsia-100 rounded-lg border-2 border-purple-300 shadow-sm">
                                <p className="text-sm text-purple-700 uppercase font-semibold">Ví Điện Tử</p>
                                <p className="text-3xl font-bold text-purple-600 mt-2">
                                  {selectedShift.analytics.paymentBreakdown.ewallet.count}
                                </p>
                                <p className="text-lg font-semibold text-purple-600 mt-2">
                                  {formatCurrency(selectedShift.analytics.paymentBreakdown.ewallet.total)}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="insights" className="space-y-6 mt-0">
                      {/* Summary Statistics Card */}
                      {selectedShift.summaryStats && (
                        <Card className="border-2 border-indigo-200">
                          <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">📈 Tổng Quan Phân Tích</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {/* Average Revenue per Order */}
                              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg border border-green-200">
                                <p className="text-xs text-green-700 uppercase font-semibold">Doanh Thu TB/Đơn</p>
                                <p className="text-xl font-bold text-green-600 mt-2">
                                  {formatCurrency(selectedShift.summaryStats.avgRevenuePerOrder)}
                                </p>
                              </div>

                              {/* Average Products per Order */}
                              <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-100 rounded-lg border border-blue-200">
                                <p className="text-xs text-blue-700 uppercase font-semibold">SP TB/Đơn</p>
                                <p className="text-xl font-bold text-blue-600 mt-2">
                                  {selectedShift.summaryStats.avgProductsPerOrder.toFixed(1)}
                                </p>
                              </div>

                              {/* Total Products Sold */}
                              <div className="p-4 bg-gradient-to-br from-amber-50 to-yellow-100 rounded-lg border border-amber-200">
                                <p className="text-xs text-amber-700 uppercase font-semibold">Tổng SP Bán</p>
                                <p className="text-xl font-bold text-amber-600 mt-2">
                                  {selectedShift.summaryStats.totalProductsSold}
                                </p>
                              </div>

                              {/* Unique Products */}
                              <div className="p-4 bg-gradient-to-br from-purple-50 to-violet-100 rounded-lg border border-purple-200">
                                <p className="text-xs text-purple-700 uppercase font-semibold">Số Loại SP</p>
                                <p className="text-xl font-bold text-purple-600 mt-2">
                                  {selectedShift.summaryStats.uniqueProducts}
                                </p>
                              </div>
                            </div>

                            {/* Second row - Peak Hour & Best Selling Product */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              {/* Peak Hour */}
                              {selectedShift.summaryStats.peakHour && (
                                <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border-2 border-orange-300">
                                  <p className="text-sm text-orange-700 uppercase font-semibold">⏰ Khung Giờ Cao Điểm</p>
                                  <p className="text-2xl font-bold text-orange-600 mt-2">
                                    {String(selectedShift.summaryStats.peakHour.hour).padStart(2, '0')}:00 - {String(selectedShift.summaryStats.peakHour.hour + 1).padStart(2, '0')}:00
                                  </p>
                                  <p className="text-sm text-orange-600 mt-1">
                                    {selectedShift.summaryStats.peakHour.count} đơn • {formatCurrency(selectedShift.summaryStats.peakHour.total)}
                                  </p>
                                </div>
                              )}

                              {/* Best Selling Product */}
                              {selectedShift.summaryStats.bestSellingProduct && (
                                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border-2 border-amber-300">
                                  <p className="text-sm text-amber-700 uppercase font-semibold">🔥 Sản Phẩm Bán Chạy Nhất</p>
                                  <p className="text-xl font-bold text-amber-600 mt-2 truncate">
                                    {selectedShift.summaryStats.bestSellingProduct.name}
                                  </p>
                                  <p className="text-sm text-amber-600 mt-1">
                                    {selectedShift.summaryStats.bestSellingProduct.quantity} sản phẩm • {formatCurrency(selectedShift.summaryStats.bestSellingProduct.revenue)}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Third row - Usage Rates */}
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              {/* Voucher Usage Rate */}
                              <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-100 rounded-lg border border-pink-200">
                                <p className="text-xs text-pink-700 uppercase font-semibold">🎟️ Tỷ Lệ Dùng Voucher</p>
                                <p className="text-xl font-bold text-pink-600 mt-2">
                                  {selectedShift.summaryStats.voucherUsageRate.toFixed(1)}%
                                </p>
                              </div>

                              {/* Promotion Usage Rate */}
                              <div className="p-4 bg-gradient-to-br from-teal-50 to-cyan-100 rounded-lg border border-teal-200">
                                <p className="text-xs text-teal-700 uppercase font-semibold">🎁 Tỷ Lệ Dùng KM</p>
                                <p className="text-xl font-bold text-teal-600 mt-2">
                                  {selectedShift.summaryStats.promotionUsageRate.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Top Products - Moved to Insights */}
                      {selectedShift.analytics && selectedShift.analytics.topProducts.length > 0 && (
                        <Card className="border-2 border-amber-200">
                          <CardHeader className="bg-amber-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">📦 Chi Tiết Sản Phẩm Đã Bán ({selectedShift.analytics.topProducts.length})</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="rounded-lg border overflow-hidden">
                              <Table>
                                <TableHeader className="bg-amber-50">
                                  <TableRow>
                                    <TableHead className="font-bold">Tên Món</TableHead>
                                    <TableHead className="font-bold text-center">Số Lượng</TableHead>
                                    <TableHead className="font-bold text-right">Giá Đơn Vị</TableHead>
                                    <TableHead className="font-bold text-right">Doanh Thu</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedShift.analytics.topProducts.map((product, idx) => (
                                    <TableRow key={product.id} className={idx % 2 === 0 ? 'bg-amber-50/30' : ''}>
                                      <TableCell className="font-medium">{product.name}</TableCell>
                                      <TableCell className="text-center font-semibold">{product.quantity}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                                      <TableCell className="text-right font-bold text-amber-600">{formatCurrency(product.revenue)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Vouchers Used */}
                      {selectedShift.analytics && selectedShift.analytics.vouchersUsed.length > 0 && (
                        <Card className="border-2 border-violet-200">
                          <CardHeader className="bg-violet-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🎟️ Voucher Sử Dụng ({selectedShift.analytics.vouchersUsed.length})</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="rounded-lg border overflow-hidden">
                              <Table>
                                <TableHeader className="bg-violet-50">
                                  <TableRow>
                                    <TableHead className="font-bold">Mã Voucher</TableHead>
                                    <TableHead className="font-bold text-center">Số Lần Dùng</TableHead>
                                    <TableHead className="font-bold text-right">Tổng Giảm Giá</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedShift.analytics.vouchersUsed.map((voucher, idx) => (
                                    <TableRow key={idx} className={idx % 2 === 0 ? 'bg-violet-50/20' : ''}>
                                      <TableCell className="font-mono font-bold text-violet-700">{voucher.code}</TableCell>
                                      <TableCell className="text-center font-semibold">{voucher.count}</TableCell>
                                      <TableCell className="text-right font-bold text-red-600">
                                        -{formatCurrency(voucher.totalDiscount)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Invoices */}
                      {selectedShift.invoices && selectedShift.invoices.length > 0 && (
                        <Card className="border-2 border-indigo-200">
                          <CardHeader className="bg-indigo-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">📋 Hóa Đơn ({selectedShift.invoices.length})</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="rounded-lg border overflow-hidden">
                              <Table>
                                <TableHeader className="bg-indigo-50">
                                  <TableRow>
                                    <TableHead className="font-bold">Mã HĐ</TableHead>
                                    <TableHead className="font-bold">Thời Gian</TableHead>
                                    <TableHead className="font-bold text-center">Số Lượng</TableHead>
                                    <TableHead className="font-bold">Thanh Toán</TableHead>
                                    <TableHead className="font-bold text-right">Tổng Tiền</TableHead>
                                    <TableHead className="font-bold text-right">Giảm Giá</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedShift.invoices.map((invoice, idx) => {
                                    const getPaymentMethod = (notes?: string) => {
                                      if (!notes) return '-'
                                      if (notes.includes('Tiền mặt') || notes.includes('CASH')) return 'Tiền Mặt'
                                      if (notes.includes('Chuyển khoản') || notes.includes('TRANSFER')) return 'Chuyển Khoản'
                                      if (notes.includes('Ví Điện Tử') || notes.includes('EWALLET')) return 'Ví Điện Tử'
                                      return notes
                                    }
                                    return (
                                      <TableRow key={invoice.id} className={idx % 2 === 0 ? 'bg-indigo-50/10' : ''}>
                                        <TableCell className="font-mono text-sm font-semibold">{invoice.invoice_number}</TableCell>
                                        <TableCell className="text-sm">
                                          {formatTime(invoice.created_at)}
                                        </TableCell>
                                        <TableCell className="text-center font-semibold">{invoice.items?.length || 0}</TableCell>
                                        <TableCell className="font-medium">{getPaymentMethod(invoice.notes)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(invoice.total_amount)}</TableCell>
                                        <TableCell className="text-right font-semibold text-orange-600">{formatCurrency(invoice.discount_amount)}</TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Peak Hours Analysis */}
                      {selectedShift.peakHours && selectedShift.peakHours.length > 0 && (
                        <Card className="border-2 border-orange-200">
                          <CardHeader className="bg-orange-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">⏰ Phân Bố Doanh Thu Theo Giờ ({selectedShift.peakHours.length} khung giờ)</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              {selectedShift.peakHours.map((hour, idx) => (
                                <div key={hour.hour} className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border border-orange-200 hover:shadow-md transition-shadow">
                                  <div className="flex-1">
                                    <p className="font-bold text-lg text-orange-900">{String(hour.hour).padStart(2, '0')}:00 - {String(hour.hour + 1).padStart(2, '0')}:00</p>
                                    <p className="text-sm text-orange-700 font-semibold mt-1">{hour.count} đơn hàng</p>
                                  </div>
                                  <div className="text-right pl-4 border-l border-orange-200">
                                    <p className="font-bold text-lg text-orange-600">{formatCurrency(hour.total)}</p>
                                    <p className="text-xs text-orange-600 font-semibold mt-1">Trung bình: {formatCurrency(hour.avgPerTransaction)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Top Vouchers */}
                      {selectedShift.analytics && selectedShift.analytics.topVouchers.length > 0 && (
                        <Card className="border-2 border-fuchsia-200">
                          <CardHeader className="bg-fuchsia-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">⭐ Phiếu Giảm Giá Được Sử Dụng</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {selectedShift.analytics.topVouchers.map((voucher, idx) => (
                                <div key={idx} className="p-4 bg-gradient-to-br from-fuchsia-50 to-purple-100 rounded-lg border-2 border-fuchsia-300 hover:shadow-md transition-shadow">
                                  <p className="font-mono font-bold text-lg text-fuchsia-900">{voucher.code}</p>
                                  <div className="mt-3 flex justify-between">
                                    <span className="text-fuchsia-700 font-semibold">Sử dụng {voucher.count} lần</span>
                                    <span className="text-fuchsia-600 font-bold">-{formatCurrency(voucher.totalDiscount)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Promotions Used */}
                      {selectedShift.analytics && selectedShift.analytics.promotionsUsed.length > 0 && (
                        <Card className="border-2 border-teal-200">
                          <CardHeader className="bg-teal-50 border-b rounded-t-lg">
                            <CardTitle className="text-lg font-bold">🎁 Khuyến Mãi Được Áp Dụng</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              {selectedShift.analytics.promotionsUsed.map((promo, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg border-2 border-teal-300 hover:shadow-md transition-shadow">
                                  <div className="flex-1">
                                    <p className="font-bold text-lg text-teal-900">{promo.name}</p>
                                    <p className="text-sm text-teal-700 font-semibold mt-1">Áp dụng {promo.count} lần</p>
                                  </div>
                                  <p className="text-lg font-bold text-teal-600 ml-4">-{formatCurrency(promo.totalDiscount)}</p>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  </Tabs>

                  {/* Notes */}
                  <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-2 border-slate-300">
                    <CardHeader className="bg-slate-100 border-b">
                      <CardTitle className="text-base font-bold">📝 Ghi Chú</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <p className={selectedShift.notes ? 'text-slate-700 leading-relaxed' : 'text-muted-foreground italic'}>
                        {selectedShift.notes || 'Không có ghi chú'}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div></div>

            {/* Actions */}
            {selectedShift && selectedShift.status === 'PENDING_APPROVAL' && (
              <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                <Button
                  onClick={() => handleApprove(selectedShift.id)}
                  disabled={isSubmitting}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-lg font-bold py-6"
                >
                  {isSubmitting ? '⏳ Đang Xác Nhận...' : '✅ Xác Nhận Ca'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={isSubmitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-lg font-bold py-6"
                >
                  {isSubmitting ? '⏳ Đang Xử Lý...' : '❌ Từ Chối'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Từ Chối Ca Làm Việc?</AlertDialogTitle>
              <AlertDialogDescription>
                Nhập lý do từ chối. Nhân viên sẽ nhận được thông báo này.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Lý do từ chối..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="flex gap-2">
              <AlertDialogCancel disabled={isSubmitting}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedShift) {
                    handleReject(selectedShift.id)
                  }
                }}
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSubmitting ? 'Đang Xử Lý...' : 'Xác Nhận Từ Chối'}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Check-In Time Dialog */}
        <Dialog open={editCheckInOpen} onOpenChange={setEditCheckInOpen}>
          <DialogContent className="w-full max-w-sm">
            <DialogHeader>
              <DialogTitle>Sửa Giờ Vào Ca</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-check-in-time">Thời Gian Vào Ca</Label>
                <Input
                  id="edit-check-in-time"
                  type="datetime-local"
                  value={editCheckInTime}
                  onChange={(e) => setEditCheckInTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setEditCheckInOpen(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Hủy
              </Button>
              <Button onClick={handleEditCheckIn} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Đang Cập Nhật...' : 'Cập Nhật'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Check-Out Time Dialog */}
        <Dialog open={editCheckOutOpen} onOpenChange={setEditCheckOutOpen}>
          <DialogContent className="w-full max-w-sm">
            <DialogHeader>
              <DialogTitle>Sửa Giờ Tan Ca</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-check-out-time">Thời Gian Tan Ca</Label>
                <Input
                  id="edit-check-out-time"
                  type="datetime-local"
                  value={editCheckOutTime}
                  onChange={(e) => setEditCheckOutTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setEditCheckOutOpen(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Hủy
              </Button>
              <Button onClick={handleEditCheckOut} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Đang Cập Nhật...' : 'Cập Nhật'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
