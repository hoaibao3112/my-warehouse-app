'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Users, Package } from 'lucide-react'
import { MobilePageHeader } from '@/components/mobile/mobile-page-header'
import { formatDbTimeToDisplay, formatDbDateToDisplay } from '@/lib/server-time'
import { mobileFetch } from "@/lib/mobile/api-client"
import { ShiftProductsDialog } from '@/components/shifts/shift-products-dialog'

interface ShiftDetail {
  id: string
  users_shift_sessions_user_idTousers: { id: string; full_name: string; email: string }
  warehouses: { id: string; code: string; name: string }
  work_shifts?: { id: string; shift_name: string; start_time: string; end_time: string }
  session_date: string
  check_in_time?: string | null
  check_out_time?: string | null
  total_orders?: number
  total_revenue?: number
  total_discount?: number
  cash_orders?: number
  transfer_orders?: number
  ewallet_orders?: number
  opening_cash?: number
  closing_cash?: number
  expected_cash?: number
  cash_difference?: number
  cash_revenue?: number
  ewallet_revenue?: number
  vouchers_used?: number
  voucher_programs?: string[]
  promotions_used?: number
  promotion_names?: string[]
  status: 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED' | 'REJECTED' | 'ABSENT'
  notes?: string
  rejection_reason?: string
  invoices?: any[]
  analytics?: {
    topProducts: any[]
    topVouchers: any[]
    promotionsUsed: any[]
    peakHours: any[]
    discountBreakdown: any
    vouchersUsed: any[]
    paymentBreakdown: any
  }
}

interface StaffInfo {
  id: string
  full_name: string
  email: string
}

export default function StaffShiftViewPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const staffId = params.staffId as string

  const [isLoading, setIsLoading] = useState(false)
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null)
  const [todayShift, setTodayShift] = useState<ShiftDetail | null>(null)
  const [shiftHistory, setShiftHistory] = useState<ShiftDetail[]>([])
  const [selectedHistoryShift, setSelectedHistoryShift] = useState<ShiftDetail | null>(null)
  const [activeTab, setActiveTab] = useState('today')
  const [showProductsDialog, setShowProductsDialog] = useState(false)
  const [selectedShiftForProducts, setSelectedShiftForProducts] = useState<ShiftDetail | null>(null)

  useEffect(() => {
    // Only managers/admins can view staff shifts
    if (user && !['WAREHOUSE_MANAGER', 'ADMIN', 'GENERAL_MANAGER', 'QuanLyKhoCon'].includes(user.role)) {
      toast.error('Bạn không có quyền xem thông tin này')
      router.push('/store/shifts')
      return
    }

    if (staffId) {
      loadStaffData()
    }
  }, [staffId, user, router])

  const loadStaffData = async () => {
    try {
      setIsLoading(true)

      // Load staff info
      const staffRes = await mobileFetch(`/api/users/${staffId}`)
      const staffData = await staffRes.json()
      if (staffData.success && staffData.data) {
        setStaffInfo(staffData.data)
      }

      // Load today's shift
      const todayRes = await mobileFetch(`/api/shifts/staff/${staffId}/today`)
      const todayData = await todayRes.json()
      if (todayData.success && todayData.data) {
        setTodayShift(todayData.data)
      }

      // Load shift history (last 7 days)
      const historyRes = await mobileFetch(`/api/shifts/staff/${staffId}/history?days=7`)
      const historyData = await historyRes.json()
      if (historyData.success && historyData.data) {
        setShiftHistory(historyData.data)
      }
    } catch (err) {
      toast.error('Lỗi tải thông tin nhân viên')
      console.error(err)
    } finally {
      setIsLoading(false)
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
        return <Badge className="bg-gray-500">Vắng mặt</Badge>
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

  const renderShiftDetails = (shift: ShiftDetail) => (
    <div className="space-y-4">
      {/* Basic Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Thông Tin Ca Làm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Ngày</p>
              <p className="text-sm font-medium">{formatDate(shift.session_date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Ca Làm</p>
              <p className="text-sm font-medium">{shift.work_shifts?.shift_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Vào Ca</p>
              <p className="text-sm font-medium">{shift.check_in_time ? formatTime(shift.check_in_time) : 'Chưa vào'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Đóng Ca</p>
              <p className="text-sm font-medium">{shift.check_out_time ? formatTime(shift.check_out_time) : 'Chưa đóng'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Kho</p>
              <p className="text-sm font-medium">{shift.warehouses?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Trạng Thái</p>
              <div className="mt-1">{getStatusBadge(shift.status)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Statistics Card */}
      {shift.status !== 'ABSENT' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Thống Kê Bán Hàng</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setSelectedShiftForProducts(shift)
                setShowProductsDialog(true)
              }}
            >
              <Package className="h-4 w-4" />
              Xem chi tiết sản phẩm
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Tổng Đơn</p>
                <p className="text-2xl font-bold">{shift.total_orders || 0}</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-muted-foreground">Tiền Mặt</p>
                <p className="text-lg font-bold text-green-600">{shift.cash_orders || 0}</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-muted-foreground">Ví Điện Tử</p>
                <p className="text-lg font-bold text-purple-600">{shift.ewallet_orders || 0}</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-muted-foreground">Chuyển Khoản</p>
                <p className="text-lg font-bold text-blue-600">{shift.transfer_orders || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue Card */}
      {shift.status !== 'ABSENT' && (
        <Card className="border-green-100 bg-green-50">
          <CardHeader>
            <CardTitle>Doanh Thu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Tổng Doanh Thu</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatCurrency(shift.total_revenue || 0)}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Giảm Giá</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(shift.total_discount || 0)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-green-200">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Tiền Mặt</p>
                <p className="text-xl font-bold text-green-600">
                  {formatCurrency(shift.analytics?.paymentBreakdown?.cash?.total || shift.cash_revenue || 0)}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Ví Điện Tử</p>
                <p className="text-xl font-bold text-purple-600">
                  {formatCurrency(shift.analytics?.paymentBreakdown?.ewallet?.total || shift.ewallet_revenue || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cash Card */}
      {shift.status !== 'ABSENT' && (shift.opening_cash !== undefined || shift.closing_cash !== undefined) && (
        <Card className="border-amber-100 bg-amber-50">
          <CardHeader>
            <CardTitle>Quản Lý Tiền Mặt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Tiền Đầu Ca</p>
                <p className="text-xl font-bold text-amber-700">
                  {formatCurrency(shift.opening_cash || 0)}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Tiền Cuối Ca</p>
                <p className="text-xl font-bold text-amber-700">
                  {formatCurrency(shift.closing_cash || 0)}
                </p>
              </div>
            </div>

            {shift.expected_cash !== undefined && shift.cash_difference !== undefined && (
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-amber-200">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Tiền Kỳ Vọng</p>
                  <p className="text-lg font-bold text-amber-700">
                    {formatCurrency(shift.expected_cash)}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Chênh Lệch</p>
                  <p className={`text-lg font-bold ${shift.cash_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {shift.cash_difference >= 0 ? '+' : ''}{formatCurrency(shift.cash_difference)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Voucher & Promotion Card */}
      {shift.status !== 'ABSENT' && (
        <Card className="border-blue-100 bg-blue-50">
          <CardHeader>
            <CardTitle>Voucher & Khuyến Mãi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Voucher Sử Dụng</p>
                <p className="text-2xl font-bold text-blue-700">
                  {shift.vouchers_used || 0}
                </p>
                {shift.voucher_programs && shift.voucher_programs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {shift.voucher_programs.map((program: string, index: number) => (
                      <p key={index} className="text-xs text-blue-600">• {program}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Khuyến Mãi Sử Dụng</p>
                <p className="text-2xl font-bold text-blue-700">
                  {shift.promotions_used || 0}
                </p>
                {shift.promotion_names && shift.promotion_names.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {shift.promotion_names.map((name: string, index: number) => (
                      <p key={index} className="text-xs text-blue-600">• {name}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejection Reason */}
      {shift.status === 'REJECTED' && shift.rejection_reason && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-red-700">⚠️ Ca Bị Từ Chối</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-900">Lý do từ chối:</p>
              <p className="text-red-600 text-base">{shift.rejection_reason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {shift.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ghi Chú</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{shift.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MobilePageHeader icon={Users} title="Chi Tiết Nhân Viên" backUrl="/store/shifts/manage" />
        <div className="flex items-center justify-center h-96">Đang tải...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader icon={Users} title="Chi Tiết Nhân Viên" backUrl="/store/shifts/manage" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6 max-w-4xl">
        <div className="space-y-4 md:space-y-6">
          <div className="hidden md:block flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/store/shifts/manage')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{staffInfo?.full_name || 'Nhân Viên'}</h1>
              <p className="text-muted-foreground">{staffInfo?.email}</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="today">Ca Hôm Nay</TabsTrigger>
              <TabsTrigger value="history">Lịch Sử</TabsTrigger>
            </TabsList>

            {/* Today's Shift Tab */}
            <TabsContent value="today" className="space-y-4">
              {todayShift ? (
                renderShiftDetails(todayShift)
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Chưa Vào Ca</CardTitle>
                    <CardDescription>Nhân viên chưa vào ca làm việc hôm nay</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
              {shiftHistory.length > 0 ? (
                <div className="space-y-4">
                  {shiftHistory.map((shift) => (
                    <Card
                      key={shift.id}
                      className="cursor-pointer hover:border-primary"
                      onClick={() => setSelectedHistoryShift(selectedHistoryShift?.id === shift.id ? null : shift)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{formatDate(shift.session_date)}</CardTitle>
                            <CardDescription>{shift.work_shifts?.shift_name || 'N/A'}</CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(shift.status)}
                            <p className="text-sm font-bold text-green-600">
                              {formatCurrency(shift.total_revenue || 0)}
                            </p>
                          </div>
                        </div>
                      </CardHeader>

                      {selectedHistoryShift?.id === shift.id && (
                        <CardContent>
                          <div className="border-t pt-4">{renderShiftDetails(shift)}</div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Không Có Lịch Sử</CardTitle>
                    <CardDescription>Không tìm thấy dữ liệu ca làm việc trong 7 ngày qua</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Products Dialog */}
      <ShiftProductsDialog
        open={showProductsDialog}
        onOpenChange={setShowProductsDialog}
        sessionId={selectedShiftForProducts?.id || null}
        sessionDate={selectedShiftForProducts ? formatDate(selectedShiftForProducts.session_date) : undefined}
      />
    </div>
  )
}
