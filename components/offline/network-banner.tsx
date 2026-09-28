'use client'

/**
 * Network Status Banner
 * Shows offline status and pending orders count
 */

import { useState } from 'react'
import { useOffline } from '@/contexts/offline-context'
import { WifiOff, CloudUpload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SyncStatusModal } from './sync-status-modal'

export function NetworkBanner() {
  const { isOnline, syncStatus, pendingOrdersCount, triggerManualSync } = useOffline()
  const [showModal, setShowModal] = useState(false)

  // Don't show banner if online and no pending orders
  if (isOnline && pendingOrdersCount === 0) {
    return null
  }

  return (
    <>
      <div
        className={`
          fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between
          ${isOnline ? 'bg-blue-500' : 'bg-orange-500'}
          text-white shadow-lg transition-colors duration-300
        `}
        role="alert"
        aria-live="polite"
      >
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {!isOnline && <WifiOff className="h-5 w-5 flex-shrink-0" aria-hidden="true" />}
          {isOnline && pendingOrdersCount > 0 && (
            <CloudUpload className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          )}

          <span className="text-sm font-medium">
            {!isOnline && `Chế độ Offline - ${pendingOrdersCount} đơn chờ đồng bộ`}
            {isOnline && pendingOrdersCount > 0 && `${pendingOrdersCount} đơn chờ đồng bộ`}
          </span>
        </button>

        {isOnline && pendingOrdersCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={triggerManualSync}
            disabled={syncStatus === 'syncing'}
            className="ml-auto"
          >
            {syncStatus === 'syncing' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang đồng bộ...
              </>
            ) : (
              'Đồng bộ ngay'
            )}
          </Button>
        )}
      </div>

      <SyncStatusModal open={showModal} onOpenChange={setShowModal} />
    </>
  )
}
