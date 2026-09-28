'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useSalesSession } from '@/hooks/useSalesSession'
import { formatCurrency } from '@/lib/utils'
import { useCurrencyInput } from '@/hooks/use-currency-input'
import { Briefcase, Package, Receipt } from 'lucide-react'
import { MobilePageHeader } from '@/components/mobile/mobile-page-header'
import { formatDbTimeToDisplay, formatDbDateToDisplay } from '@/lib/server-time'
import { ShiftProductsDialog } from '@/components/shifts/shift-products-dialog'
import { ShiftInvoicesDialog } from '@/components/shifts/shift-invoices-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface WorkShift {
  id: string
  name: string
  code: string
  startTime: string
  endTime: string
}

export default function MyShiftPage() {
  // Use new sales session hook (separated from attendance)
  const {
    currentSession: currentShift,
    isLoading,
    error,
    lastOperationError,
    clearLastOperationError,
    openSession,
    closeSession,
    refreshSession: refreshShift,
    workShifts: apiWorkShifts
  } = useSalesSession()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [openingCash, setOpeningCash] = useState('0')
  const [openingCashDisplay, setOpeningCashDisplay] = useState('0')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { handleInputChange: handleCashChange, getNumericValue } = useCurrencyInput()

  // Close shift state
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)
  const [closingCash, setClosingCash] = useState('')
  const [closingCashDisplay, setClosingCashDisplay] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [closingShiftProcessing, setClosingShiftProcessing] = useState(false)

  // Error dialog state
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)

  // Products dialog state
  const [showProductsDialog, setShowProductsDialog] = useState(false)

  // Invoices dialog state
  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false)

  // Work shifts state
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([])
  const [selectedWorkShiftId, setSelectedWorkShiftId] = useState<string>('')

  // Derived stats - show zeroes if shift is closed/not active
  // Uses new sales session statuses: IN_PROGRESS, PENDING_APPROVAL, COMPLETED, REJECTED
  const statsShift = (currentShift && currentShift.status === 'IN_PROGRESS' && !currentShift.shift_closed_at)
    ? currentShift
    : {
      total_orders: 0, cash_orders: 0, ewallet_orders: 0,
      total_revenue: 0, total_discount: 0, total_vat: 0,
      cash_revenue: 0, ewallet_revenue: 0,
      vouchers_used: 0, promotions_used: 0
    }

  // Load work shifts when check-in dialog opens
  useEffect(() => {
    if (checkInOpen) {
      const loadShifts = async () => {
        try {
          const res = await fetch('/api/shifts/work-shifts')
          const data = await res.json()
          if (data.success && data.data) {
            setWorkShifts(data.data)

            // Auto-select based on current time
            const now = new Date()
            const currentTime = now.getHours() * 60 + now.getMinutes()

            const matchingShift = data.data.find((ws: WorkShift) => {
              const [startH, startM] = ws.startTime.split(':').map(Number)
              const [endH, endM] = ws.endTime.split(':').map(Number)
              const startTotal = startH * 60 + startM
              const endTotal = endH * 60 + endM

              if (endTotal < startTotal) { // Cross-day shift
                return currentTime >= startTotal || currentTime <= endTotal
              }
              return currentTime >= startTotal && currentTime <= endTotal
            })

            if (matchingShift) {
              setSelectedWorkShiftId(matchingShift.id)
            } else if (data.data.length > 0) {
              // Default to first shift if no match
              setSelectedWorkShiftId(data.data[0].id)
            }
          }
        } catch (e) {
          console.error("Failed to load work shifts", e)
        }
      }
      loadShifts()
    }
  }, [checkInOpen])

  // useEffect for general loading errors - only show if not a shift-specific error
  useEffect(() => {
    if (error && !error.includes("ca")) {
      // Only show toast for non-shift related errors
      toast.error(error)
    }
  }, [error])

  useEffect(() => {
    if (lastOperationError) {
      setErrorDialogOpen(true)
    }
  }, [lastOperationError])

  const handleCheckIn = async () => {
    // Allow 0 or empty (defaults to 0)
    const numericCash = openingCashDisplay ? getNumericValue(openingCashDisplay) : 0
    if (numericCash < 0) {
      toast.error('Tiền mặt đầu ca không được là số âm')
      return
    }

    setIsSubmitting(true)
    // Use new openSession method
    const result = await openSession(numericCash, selectedWorkShiftId)
    setIsSubmitting(false)

    if (result) {
      toast.success('Vào ca thành công')
      setCheckInOpen(false)
      setOpeningCash('0')
      setOpeningCashDisplay('0')
      setNotes('')
    } else {
      toast.error('Vào ca thất bại')
    }
  }

  const handleCloseShift = async () => {
    if (!currentShift?.id) {
      toast.error('Không có ca làm việc để đóng')
      return
    }

    const numericCash = closingCashDisplay ? getNumericValue(closingCashDisplay) : 0
    if (numericCash < 0) {
      toast.error('Tiền mặt cuối ca không được là số âm')
      return
    }

    setClosingShiftProcessing(true)
    // Use new closeSession method
    const result = await closeSession(numericCash, closeNotes)
    setClosingShiftProcessing(false)

    if (result) {
      toast.success('Đóng ca thành công')
      setCloseShiftOpen(false)
      setClosingCash('')
      setClosingCashDisplay('')
      setCloseNotes('')
      // Wait a bit for server to process, then refresh
      await new Promise(resolve => setTimeout(resolve, 500))
      await refreshShift()
    } else {
      toast.error('Đóng ca thất bại')
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Đang tải...</div>
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
        icon={Briefcase}
        title="Ca Bán Hàng"
        subtitle="Quản lý ca bán hàng của bạn"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6 max-w-4xl">
        <div className="space-y-4 md:space-y-6">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold">Ca Bán Hàng</h1>
            <p className="text-muted-foreground">Quản lý ca bán hàng của bạn</p>
          </div>

          {!currentShift ? (
            <Card>
              <CardHeader>
                <CardTitle>Chưa Mở Ca</CardTitle>
                <CardDescription>Bạn chưa mở ca bán hàng hôm nay</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => { setOpeningCashDisplay('0'); setCheckInOpen(true) }} size="lg" className="w-full">
                  Mở Ca Bán Hàng
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Sales Statistics Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Thống Kê Bán Hàng</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowInvoicesDialog(true)}
                    >
                      <Receipt className="h-4 w-4" />
                      <span className="hidden sm:inline">Xem hóa đơn</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowProductsDialog(true)}
                    >
                      <Package className="h-4 w-4" />
                      <span className="hidden sm:inline">Xem sản phẩm</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Tổng Đơn Hàng</p>
                      <p className="text-2xl font-bold">{statsShift.total_orders}</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Tiền Mặt</p>
                      <p className="text-lg font-bold text-green-600">{statsShift.cash_orders}</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Ví Điện Tử</p>
                      <p className="text-lg font-bold text-purple-600">{statsShift.ewallet_orders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Revenue Card */}
              <Card className="border-green-100 bg-green-50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Doanh Thu</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tổng Doanh Thu</Label>
                      <p className="text-2xl font-bold text-green-700">
                        {formatCurrency(String(statsShift.total_revenue))}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Giảm Giá</Label>
                      <p className="text-2xl font-bold text-orange-600">
                        {formatCurrency(String(statsShift.total_discount))}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-4 border-t">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Tiền Mặt</Label>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(String(statsShift.cash_revenue || 0))}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Ví Điện Tử</Label>
                      <p className="text-xl font-bold text-purple-600">
                        {formatCurrency(String(statsShift.ewallet_revenue || 0))}
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">VAT (Thu Hộ)</Label>
                      <p className="text-xl font-bold text-rose-600">
                        {formatCurrency(String(statsShift.total_vat || 0))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Voucher & Promotion Card */}
              <Card className="border-blue-100 bg-blue-50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Voucher & Khuyến Mãi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Voucher Sử Dụng</Label>
                      <p className="text-2xl font-bold text-blue-700">
                        {currentShift.vouchers_used || 0}
                      </p>
                      {currentShift.voucher_programs && currentShift.voucher_programs.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {currentShift.voucher_programs.map((program: string, index: number) => (
                            <p key={index} className="text-xs text-blue-600">• {program}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Khuyến Mãi Sử Dụng</Label>
                      <p className="text-2xl font-bold text-blue-700">
                        {currentShift.promotions_used || 0}
                      </p>
                      {currentShift.promotion_names && currentShift.promotion_names.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {currentShift.promotion_names.map((name: string, index: number) => (
                            <p key={index} className="text-xs text-blue-600">• {name}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {currentShift.status === 'REJECTED' && currentShift.rejection_reason && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-red-700">⚠️ Ca Bị Từ Chối</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="workShift">Ca Làm Việc</Label>
                        <Select value={selectedWorkShiftId} onValueChange={setSelectedWorkShiftId}>
                          <SelectTrigger id="workShift">
                            <SelectValue placeholder="Chọn ca làm việc..." />
                          </SelectTrigger>
                          <SelectContent>
                            {workShifts.map((shift) => (
                              <SelectItem key={shift.id} value={shift.id}>
                                {shift.name} ({shift.startTime} - {shift.endTime})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <p className="text-sm font-medium text-red-900">Lý do từ chối:</p>
                        <p className="text-red-600 text-base">{currentShift.rejection_reason}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Shift Status Alert - Show when shift is closed */}
              {/* Use shift_closed_at OR check_out_time since Mode 2 only sets shift_closed_at */}
              {(currentShift.shift_closed_at || currentShift.check_out_time) && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">✅</div>
                    <div className="flex-1">
                      <p className="font-bold text-green-900 text-lg">Ca Gần Nhất Đã Hoàn Thành</p>
                      <p className="text-sm text-green-700 mt-1">Thời gian đóng ca: {formatTime(currentShift.shift_closed_at || currentShift.check_out_time)}</p>
                      <p className="text-xs text-green-600 mt-2">Bạn có thể tiếp tục mở ca mới nếu cần.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                {/* Use shift_closed_at OR check_out_time since Mode 2 only sets shift_closed_at */}
                {(currentShift.shift_closed_at || currentShift.check_out_time) ? (
                  <Button
                    onClick={() => { setOpeningCashDisplay('0'); setCheckInOpen(true) }}
                    size="lg"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Mở Ca Bán Hàng Mới
                  </Button>
                ) : currentShift.shift_opened_at ? (
                  <Button
                    onClick={() => { setClosingCashDisplay(''); setCloseShiftOpen(true) }}
                    size="lg"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    Đóng Ca Bán Hàng
                  </Button>
                ) : (
                  <Button
                    onClick={() => { setOpeningCashDisplay('0'); setCheckInOpen(true) }}
                    size="lg"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Mở Ca Bán Hàng
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Check-in Dialog */}
          <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-2xl">Mở Ca Bán Hàng</DialogTitle>
                <DialogDescription className="text-base mt-2">Nhập tiền mặt đầu ca để bắt đầu bán hàng</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">

                <div className="space-y-2">
                  <Label htmlFor="opening_cash" className="text-base font-semibold text-foreground">
                    Tiền Mặt Đầu Ca (đ)<span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">Nhập số tiền mặt bạn có khi bắt đầu ca</p>
                  <Input
                    id="opening_cash"
                    type="text"
                    placeholder="0"
                    value={openingCashDisplay || '0'}
                    onChange={(e) => {
                      const { display, numeric } = handleCashChange(e.target.value)
                      setOpeningCashDisplay(display)
                      setOpeningCash(String(numeric))
                    }}
                    onFocus={(e) => {
                      // Select all on focus for easy editing
                      if (e.target.value === '0') {
                        e.target.select()
                      }
                    }}
                    disabled={isSubmitting}
                    className="h-10 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-base font-semibold text-foreground">
                    Ghi Chú <span className="text-xs font-normal text-muted-foreground">(Tùy Chọn)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">Thêm ghi chú về ca làm việc nếu cần</p>
                  <Textarea
                    id="notes"
                    placeholder="Ví dụ: Quên ghi một số hóa đơn..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isSubmitting}
                    className="min-h-20 text-base resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCheckInOpen(false)}
                    disabled={isSubmitting}
                    className="flex-1 h-10 text-base"
                  >
                    Hủy
                  </Button>
                  <Button onClick={handleCheckIn} disabled={isSubmitting} className="flex-1 h-10 text-base">
                    {isSubmitting ? 'Đang Mở Ca...' : 'Xác Nhận Mở Ca'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Close Shift Dialog */}
          <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-2xl">Đóng Ca Bán Hàng</DialogTitle>
                <DialogDescription className="text-base mt-2">Nhập tiền mặt cuối ca để hoàn thành</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {currentShift && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-blue-900">Thông Tin Ca Bán Hàng</p>
                    <div className="grid grid-cols-2 gap-3 text-xs text-blue-800">
                      <div>
                        <p className="text-blue-600">Tên Ca</p>
                        <p className="font-semibold">{currentShift.shift_name ? currentShift.shift_name : 'Phiên bán hàng'}</p>
                      </div>
                      <div>
                        <p className="text-blue-600">Thời Gian Mở Ca</p>
                        <p className="font-semibold">{currentShift.shift_opened_at ? formatTime(currentShift.shift_opened_at) : (currentShift.check_in_time ? formatTime(currentShift.check_in_time) : 'Chưa mở')}</p>
                      </div>
                      <div>
                        <p className="text-blue-600">Tổng Đơn Hàng</p>
                        <p className="font-semibold">{currentShift.total_orders || 0}</p>
                      </div>
                      <div>
                        <p className="text-blue-600">Doanh Thu</p>
                        <p className="font-semibold">{formatCurrency(currentShift.total_revenue)}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="closing_cash" className="text-base font-semibold text-foreground">
                    Tiền Mặt Cuối Ca (đ)<span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">Nhập số tiền mặt bạn có khi kết thúc ca</p>
                  <Input
                    id="closing_cash"
                    type="text"
                    placeholder="0"
                    value={closingCashDisplay || ''}
                    onChange={(e) => {
                      const { display, numeric } = handleCashChange(e.target.value)
                      setClosingCashDisplay(display)
                      setClosingCash(String(numeric))
                    }}
                    disabled={closingShiftProcessing}
                    className="h-10 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="close_notes" className="text-base font-semibold text-foreground">
                    Ghi Chú <span className="text-xs font-normal text-muted-foreground">(Tùy Chọn)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">Thêm ghi chú về ca làm việc nếu cần</p>
                  <Textarea
                    id="close_notes"
                    placeholder="Ví dụ: Quên ghi một số hóa đơn..."
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    disabled={closingShiftProcessing}
                    className="min-h-20 text-base resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCloseShiftOpen(false)}
                    disabled={closingShiftProcessing}
                    className="flex-1 h-10 text-base"
                  >
                    Hủy
                  </Button>
                  <Button onClick={handleCloseShift} disabled={closingShiftProcessing} className="flex-1 h-10 text-base bg-red-600 hover:bg-red-700">
                    {closingShiftProcessing ? 'Đang Đóng Ca...' : 'Xác Nhận Đóng Ca'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Error Dialog - Prominent notification for operation failures */}
          <Dialog open={errorDialogOpen} onOpenChange={(open) => {
            if (!open) {
              clearLastOperationError()
            }
            setErrorDialogOpen(open)
          }}>
            <DialogContent className="max-w-md border-red-300 bg-red-50">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-2xl text-red-700">⚠️ Lỗi Thao Tác</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                  <p className="text-red-900 font-medium text-base leading-relaxed">
                    {lastOperationError}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      clearLastOperationError()
                      setErrorDialogOpen(false)
                    }}
                    className="flex-1 h-10 text-base bg-red-600 hover:bg-red-700"
                  >
                    Đóng
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Products Dialog */}
          <ShiftProductsDialog
            open={showProductsDialog}
            onOpenChange={setShowProductsDialog}
            sessionId={currentShift?.id || null}
            sessionDate={currentShift ? formatDate(currentShift.session_date) : undefined}
          />

          {/* Invoices Dialog */}
          <ShiftInvoicesDialog
            open={showInvoicesDialog}
            onOpenChange={setShowInvoicesDialog}
            sessionId={currentShift?.id || null}
            sessionDate={currentShift ? formatDate(currentShift.session_date) : undefined}
          />

        </div>
      </div>
    </div>
  )
}
