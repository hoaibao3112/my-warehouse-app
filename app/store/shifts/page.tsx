'use client'

import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ShiftsPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user?.role === 'WAREHOUSE_MANAGER' || user?.role === 'ADMIN' || user?.role === 'GENERAL_MANAGER') {
      // Managers go to calendar view for scheduling
      router.push('/store/shifts/calendar')
    } else if (user?.role === 'STAFF') {
      // STAFF goes to their sales shift details (not attendance)
      router.push('/store/shifts/my-shift')
    }
  }, [user, router])

  return (
    <div className="flex items-center justify-center h-96">
      <p>Đang chuyển hướng...</p>
    </div>
  )
}
