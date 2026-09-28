'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useShift } from '@/hooks/useShift'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/utils'
import { formatDbTimeToDisplay } from '@/lib/server-time'
import { Clock, LogIn, LogOut } from 'lucide-react'

interface ShiftStatusProps {
  currentShift?: any | null
  isLoading?: boolean
  error?: string | null
  checkIn?: (opening_cash: number, notes?: string) => Promise<any | null>
  checkOut?: (closing_cash: number, notes?: string) => Promise<any>
  onRefresh?: () => Promise<void>
}

export function ShiftStatus(props: ShiftStatusProps = {}) {
  // Use props if provided, otherwise fall back to useShift hook
  const shiftHook = useShift()
  const { user } = useAuth()
  const currentShift = props.currentShift !== undefined ? props.currentShift : shiftHook.currentShift
  const isLoading = props.isLoading !== undefined ? props.isLoading : shiftHook.isLoading
  const error = props.error !== undefined ? props.error : shiftHook.error
  const checkIn = props.checkIn || shiftHook.checkIn
  const checkOut = props.checkOut || shiftHook.checkOut
  const { onRefresh } = props

  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if user is staff
  const isStaff = user?.role === 'STAFF'
  // Show stats grid only for staff
  const showStatsGrid = isStaff

  if (isLoading) {
    return null
  }

  const handleCheckIn = async () => {
    if (!openingCash || parseFloat(openingCash) <= 0) {
      toast.error('Vui lòng nhập tiền mặt đầu ca lớn hơn 0')
      return
    }

    setIsSubmitting(true)
    const result = await checkIn(parseFloat(openingCash), notes)
    setIsSubmitting(false)

    if (result) {
      toast.success('Vào ca thành công')
      setCheckInOpen(false)
      setOpeningCash('')
      setNotes('')
      // Notify parent to refresh if callback provided
      if (onRefresh) {
        await onRefresh()
      }
    } else if (error) {
      toast.error(error)
    }
  }

  const handleCheckOut = async () => {
    if (!closingCash || parseFloat(closingCash) < 0) {
      toast.error('Vui lòng nhập tiền mặt cuối ca hợp lệ')
      return
    }

    setIsSubmitting(true)
    const result = await checkOut(parseFloat(closingCash), notes)
    setIsSubmitting(false)

    if (result) {
      toast.success('Đóng ca thành công. Chờ quản lý xác nhận.')
      setCheckOutOpen(false)
      setClosingCash('')
      setNotes('')
      // Notify parent to refresh if callback provided
      if (onRefresh) {
        await onRefresh()
      }
    }
  }

  // No shift - show check-in button or error message
  if (!currentShift) {
    // If error is about another shift, show appropriate message
    if (error) {
      return (
        <Card className="p-4 border-2 border-orange-300 bg-orange-50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-semibold text-orange-900">⏳ Ca Chưa Kết Thúc</p>
              <p className="text-sm text-orange-700">{error}</p>
            </div>
          </div>
        </Card>
      )
    }

    return (
      <Card className="p-4 border-2 border-yellow-300 bg-yellow-50">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-yellow-900">⚠️ Chưa Vào Ca</p>
            <p className="text-sm text-yellow-700">Vui lòng vào ca trước khi bán hàng</p>
          </div>
          <Button
            onClick={() => setCheckInOpen(true)}
            className="bg-green-600 hover:bg-green-700"
            size="sm"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Vào Ca
          </Button>
        </div>

        {/* Check-in Dialog */}
        <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vào Ca Làm Việc</DialogTitle>
              <DialogDescription>Nhập tiền mặt đầu ca để bắt đầu</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="opening_cash" className="text-sm font-medium">Tiền Mặt Đầu Ca (đ)*</Label>
                <Input
                  id="opening_cash"
                  type="number"
                  placeholder="0"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  disabled={isSubmitting}
                  min="0"
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium">Ghi Chú (Tùy Chọn)</Label>
                <Textarea
                  id="notes"
                  placeholder="Ghi chú thêm về ca làm việc..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCheckInOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Hủy
                </Button>
                <Button
                  onClick={handleCheckIn}
                  disabled={isSubmitting}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? 'Đang Vào Ca...' : 'Xác Nhận Vào Ca'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    )
  }

  // Check if this is a virtual shift (manager/admin without actual shift)
  const isVirtualShift = (currentShift as any)?.isVirtualShift === true

  // Check if this is another user's shift (for manager view)
  const isOtherUserShift = (currentShift as any)?.isOtherUserShift === true
  const staffName = (currentShift as any)?.users?.full_name

  // Don't show shift status card for virtual shifts (manager/admin without actual shift)
  if (isVirtualShift) {
    return null
  }

  // Has active shift - show status and check-out button (or read-only view if it's another user's shift)
  return (
    <Card className={`p-4 border-2 ${isOtherUserShift ? 'border-blue-300 bg-blue-50' : 'border-green-300 bg-green-50'}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={isOtherUserShift ? "bg-blue-600" : "bg-green-600"}>
              {isOtherUserShift ? "Ca của " + staffName : "Đang Làm Việc"}
            </Badge>
            <span className={`text-sm font-semibold ${isOtherUserShift ? 'text-blue-900' : 'text-green-900'}`}>
              {isOtherUserShift ? "Ca của nhân viên khác" : "Ca Đang Hoạt Động"}
            </span>
          </div>
          {!isOtherUserShift && (
            <Button
              onClick={() => setCheckOutOpen(true)}
              variant="destructive"
              size="sm"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Đóng Ca
            </Button>
          )}
        </div>

        {/* Stats Grid - Only show for STAFF */}
        {showStatsGrid && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Check-in time */}
              <div className="bg-white p-2 rounded-lg">
                <p className="text-xs text-gray-600">Giờ Vào Ca</p>
                <p className="font-semibold text-green-700">
                  {currentShift.check_in_time
                    ? formatDbTimeToDisplay(currentShift.check_in_time)
                    : '-'}
                </p>
              </div>

              {/* Total orders */}
              <div className="bg-white p-2 rounded-lg">
                <p className="text-xs text-gray-600">Tổng Đơn Hàng</p>
                <p className="font-semibold text-blue-700">{currentShift.total_orders}</p>
              </div>

              {/* Cash orders */}
              <div className="bg-white p-2 rounded-lg">
                <p className="text-xs text-gray-600">Đơn Tiền Mặt</p>
                <p className="font-semibold text-green-700">{currentShift.cash_orders}</p>
              </div>

              {/* Transfer orders */}
              <div className="bg-white p-2 rounded-lg">
                <p className="text-xs text-gray-600">Đơn Chuyển Khoản</p>
                <p className="font-semibold text-blue-700">{currentShift.transfer_orders}</p>
              </div>

              {/* Total revenue */}
              <div className="bg-white p-2 rounded-lg">
                <p className="text-xs text-gray-600">Tổng Doanh Thu</p>
                <p className="font-semibold text-orange-700">
                  {formatCurrency(currentShift.total_revenue)}
                </p>
              </div>
            </div>

            {/* E-wallet and discount info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2 rounded-lg">
                <p className="text-gray-600">Đơn Ví Điện Tử</p>
                <p className="font-semibold text-purple-700">{currentShift.ewallet_orders}</p>
              </div>
              <div className="bg-white p-2 rounded-lg">
                <p className="text-gray-600">Tổng Giảm Giá</p>
                <p className="font-semibold text-red-700">
                  {formatCurrency(currentShift.total_discount)}
                </p>
              </div>
              <div className="bg-white p-2 rounded-lg">
                <p className="text-gray-600">Tiền Đầu Ca</p>
                <p className="font-semibold text-green-700">
                  {currentShift.opening_cash ? formatCurrency(currentShift.opening_cash) : '-'}
                </p>
              </div>
              <div className="bg-white p-2 rounded-lg">
                <p className="text-gray-600">Phiếu Giảm Giá</p>
                <p className="font-semibold text-purple-700">{currentShift.total_orders > 0 ? '✓' : '-'}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Check-out Dialog */}
      <Dialog open={checkOutOpen} onOpenChange={setCheckOutOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Đóng Ca Làm Việc</DialogTitle>
            <DialogDescription>Kiểm tra và xác nhận thông tin đóng ca</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Summary */}
            <Card className="bg-blue-50 border-blue-200">
              <div className="p-4">
                <p className="text-xs font-semibold text-blue-900 mb-4">TỔNG KẾT CA LÀM VIỆC</p>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-blue-700">Tổng Đơn Hàng</p>
                    <p className="font-bold text-lg text-blue-900">{currentShift.total_orders}</p>
                  </div>
                  <div>
                    <p className="text-blue-700">Tổng Doanh Thu</p>
                    <p className="font-bold text-lg text-blue-900">
                      {formatCurrency(currentShift.total_revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Tiền Mặt: {currentShift.cash_orders}</p>
                    <p className="font-semibold text-green-700">
                      {formatCurrency(
                        currentShift.total_revenue -
                          currentShift.transfer_total -
                          currentShift.ewallet_total
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Chuyển Khoản: {currentShift.transfer_orders}</p>
                    <p className="font-semibold text-blue-700">
                      {formatCurrency(currentShift.transfer_total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Ví Điện Tử: {currentShift.ewallet_orders}</p>
                    <p className="font-semibold text-purple-700">
                      {formatCurrency(currentShift.ewallet_total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Tổng Giảm Giá</p>
                    <p className="font-semibold text-red-700">
                      -{formatCurrency(currentShift.total_discount)}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Closing cash input */}
            <div className="space-y-2">
              <Label htmlFor="closing_cash" className="text-sm font-medium">Tiền Mặt Cuối Ca (đ)*</Label>
              <Input
                id="closing_cash"
                type="number"
                placeholder="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                disabled={isSubmitting}
                min="0"
                className="mt-1"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="checkout_notes" className="text-sm font-medium">Ghi Chú</Label>
              <Textarea
                id="checkout_notes"
                placeholder="Ghi chú về chênh lệch tiền mặt hoặc sự kiện trong ca..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                className="mt-1"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCheckOutOpen(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Hủy
              </Button>
              <Button
                onClick={handleCheckOut}
                disabled={isSubmitting}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {isSubmitting ? 'Đang Đóng Ca...' : 'Xác Nhận Đóng Ca'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
