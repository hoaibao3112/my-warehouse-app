'use client'

/**
 * Offline Page
 * Full-screen page shown when offline without cached data
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOffline } from '@/contexts/offline-context'

export default function OfflinePage() {
  const router = useRouter()
  const { isOnline } = useOffline()
  const [checking, setChecking] = useState(false)

  // Redirect back when online
  useEffect(() => {
    if (isOnline) {
      console.log('[OfflinePage] Network back online - redirecting')
      router.back()
    }
  }, [isOnline, router])

  async function checkConnection() {
    setChecking(true)

    // Wait 1 second to give user feedback
    await new Promise(r => setTimeout(r, 1000))

    setChecking(false)

    // If online, router.back() will be triggered by useEffect
  }

  return (
    <div
      className="flex items-center justify-center p-4 bg-gray-50"
      style={{
        minHeight: '100dvh',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-gray-100 p-6">
            <WifiOff className="h-16 w-16 text-gray-400" aria-hidden="true" />
          </div>
        </div>

        {/* Title & Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Không có kết nối
          </h1>
          <p className="text-gray-600">
            Vui lòng kiểm tra kết nối mạng để tiếp tục sử dụng ứng dụng.
          </p>
        </div>

        {/* Retry Button */}
        <Button
          onClick={checkConnection}
          disabled={checking}
          className="w-full"
          size="lg"
        >
          {checking ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Đang kiểm tra...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Thử lại
            </>
          )}
        </Button>

        {/* Additional Info */}
        <div className="text-sm text-gray-500 space-y-1">
          <p>Kiểm tra:</p>
          <ul className="list-disc list-inside text-left space-y-1">
            <li>WiFi hoặc dữ liệu di động đã bật</li>
            <li>Chế độ máy bay đã tắt</li>
            <li>Tín hiệu mạng ổn định</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
