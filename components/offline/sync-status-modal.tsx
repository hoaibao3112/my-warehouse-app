'use client'

/**
 * Sync Status Modal
 * Shows all pending orders and their sync status
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react'
import { useAllPendingOrders } from '@/hooks/use-offline-db'
import { syncService } from '@/lib/offline/sync-service'
import { toast } from 'sonner'

interface SyncStatusModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SyncStatusModal({ open, onOpenChange }: SyncStatusModalProps) {
  const { orders, loading, refresh } = useAllPendingOrders()
  const [retrying, setRetrying] = useState<string | null>(null)

  // Refresh when modal opens
  useEffect(() => {
    if (open) {
      refresh()
    }
  }, [open, refresh])

  // Auto-refresh every 5 seconds when modal is open
  useEffect(() => {
    if (!open) return

    const interval = setInterval(() => {
      refresh()
    }, 5000)

    return () => clearInterval(interval)
  }, [open, refresh])

  async function retryOrder(orderId: string) {
    try {
      setRetrying(orderId)
      toast.loading('Đang thử lại...', { id: 'retry' })

      await syncService.manualSync()
      await refresh()

      toast.success('Đã thử lại đồng bộ', { id: 'retry' })
    } catch (error) {
      console.error('[SyncStatusModal] Retry error:', error)
      toast.error('Lỗi khi thử lại', { id: 'retry' })
    } finally {
      setRetrying(null)
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'synced':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'syncing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      default:
        return <Clock className="h-5 w-5 text-orange-500" />
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case 'synced':
        return 'Đã đồng bộ'
      case 'failed':
        return 'Thất bại'
      case 'syncing':
        return 'Đang đồng bộ'
      default:
        return 'Chờ đồng bộ'
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'synced':
        return 'text-green-600'
      case 'failed':
        return 'text-red-600'
      case 'syncing':
        return 'text-blue-600'
      default:
        return 'text-orange-600'
    }
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Trạng thái đồng bộ</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Trạng thái đồng bộ ({orders.length})</DialogTitle>
          <DialogDescription>
            Danh sách đơn hàng chờ đồng bộ lên server
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mb-3 text-green-500" />
              <p className="font-medium">Tất cả đơn hàng đã đồng bộ</p>
              <p className="text-sm">Không có đơn hàng chờ đồng bộ</p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(order.sync_status)}
                </div>

                {/* Order Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {order.temp_invoice_number}
                    </span>
                    {order.server_invoice_number && (
                      <span className="text-sm text-gray-500">
                        → {order.server_invoice_number}
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-500 mt-1">
                    {new Date(order.created_at).toLocaleString('vi-VN')} •{' '}
                    {order.total_amount.toLocaleString('vi-VN')}đ
                  </div>

                  <div className={`text-sm font-medium mt-1 ${getStatusColor(order.sync_status)}`}>
                    {getStatusText(order.sync_status)}
                    {order.sync_attempts > 0 && order.sync_status !== 'synced' && (
                      <span className="text-gray-500 ml-2">
                        (Thử {order.sync_attempts}/5 lần)
                      </span>
                    )}
                  </div>

                  {/* Error Message */}
                  {order.sync_error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>{order.sync_error}</span>
                    </div>
                  )}
                </div>

                {/* Retry Button */}
                {order.sync_status === 'failed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryOrder(order.id)}
                    disabled={retrying === order.id}
                  >
                    {retrying === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Thử lại'
                    )}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {orders.length > 0 && (
            <Button onClick={() => refresh()}>
              <Loader2 className="mr-2 h-4 w-4" />
              Làm mới
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
