"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { getStatusLabel, getStatusColor } from "@/lib/transfer-status"
import { formatDbDateToDisplay, formatDbTimeToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { WAREHOUSE_CHANGE_EVENT } from "./warehouse-selector"
import { toast } from "sonner"

export function TransferRequests() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      if (!mounted) return
      setLoading(true)
      try {
        const me = await (await mobileFetch('/api/auth/me')).json()
        const user = me?.data

        let warehouseId: string | null = null
        if (user?.role === 'GENERAL_MANAGER') {
          try {
            warehouseId = sessionStorage.getItem('selectedWarehouseId')
          } catch (e) {
            console.error('Failed to access sessionStorage:', e)
          }
        } else {
          warehouseId = user?.warehouseId || null
        }

        console.log('Loading transfers for warehouse:', warehouseId)

        // show transfers that are incoming to this warehouse and pending
        const q = warehouseId ? `?toWarehouseId=${encodeURIComponent(warehouseId)}&page=1&pageSize=100` : `?page=1&pageSize=100`
        const res = await mobileFetch(`/api/warehouse-transfers${q}`)
        const json = await res.json()
        console.log('Transfer API response:', json)

        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
        if (!mounted) return

        // Filter to pending transfers (CHO_DUYET, DA_DUYET, DA_XUAT_KHO - not completed/cancelled)
        const pendingRequests = (json.data || []).filter((t: any) => {
          const status = t.status || ''
          return status === 'CHO_DUYET' || status === 'DA_DUYET' || status === 'DA_XUAT_KHO'
        })

        console.log('Total transfers:', json.data?.length, 'Pending:', pendingRequests.length)
        setRequests(pendingRequests)
      } catch (err) {
        console.error('Failed to load transfer requests', err)
        toast.error('Không thể tải yêu cầu chuyển kho')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    // Listen for warehouse changes - reload immediately
    const handleWarehouseChange = () => {
      load()
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      mounted = false
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [])


  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Yêu Cầu Chuyển Kho</h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg animate-pulse">
              <div className="flex-1">
                <div className="h-4 bg-muted rounded w-32 mb-2"></div>
                <div className="h-3 bg-muted rounded w-24"></div>
              </div>
              <div className="h-6 w-20 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Không có yêu cầu chuyển kho nào đang chờ</p>
            </div>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    {request.transfer_number ?? request.number ?? 'Phiếu chuyển kho'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Chuyển từ: {request.from_warehouse_name ?? request.fromWarehouseName ?? 'Kho Tổng'}
                  </p>
                </div>

                <div className="text-right mr-4">
                  <p className="text-sm font-medium text-foreground">
                    {formatDbDateToDisplay(request.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDbTimeToDisplay(request.created_at)}
                  </p>
                </div>

                <Badge className={getStatusColor(request.status ?? 'PENDING')}>{getStatusLabel(request.status ?? 'PENDING')}</Badge>
              </div>
            ))
          )}
        </div>
      )}

      <Button className="w-full mt-4 bg-transparent" variant="outline">
        Xem Tất Cả Yêu Cầu
      </Button>
    </Card>
  )
}
