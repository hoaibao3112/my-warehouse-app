"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatVietnamDate } from "@/lib/timezone"
import { getStatusLabel, getStatusColor } from "@/lib/transfer-status"
import { mobileFetch } from "@/lib/mobile/api-client"

type IntakeRequest = {
  id: string
  transfer_number: string
  from_warehouse_name: string
  created_at: string
  status: string
}

export function RecentTransfers() {
  const [intakeRequests, setIntakeRequests] = useState<IntakeRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // First, get warehouses to identify main warehouse
        const warehousesRes = await mobileFetch('/api/warehouses?pageSize=100')
        const warehousesJson = await warehousesRes.json()
        const allWarehouses = warehousesJson?.data || []
        const mainWarehouse = allWarehouses.find((w: any) => w.type === 'MAIN')
        const mainWarehouseId = mainWarehouse?.id

        if (!mainWarehouseId) {
          console.error("Main warehouse not found")
          setIntakeRequests([])
          setLoading(false)
          return
        }

        // Create warehouse name map
        const warehouseMap = Object.fromEntries(
          allWarehouses.map((w: any) => [w.id, w])
        )

        console.log("Main warehouse ID:", mainWarehouseId)
        console.log("All warehouses:", allWarehouses)

        // Fetch transfers with pagination to get more results
        const transfersRes = await mobileFetch('/api/warehouse-transfers?page=1&pageSize=100')
        const transfersJson = await transfersRes.json()
        const allTransfers = transfersJson?.data || []

        console.log("All transfers:", allTransfers)

        // Filter to only transfers FROM store warehouses TO main warehouse, then take top 5 (by created_at DESC)
        const intakeReqs = allTransfers
          .filter((t: any) => {
            const toWhId = t.to_warehouse_id
            const fromWhId = t.from_warehouse_id
            const fromWh = warehouseMap[fromWhId]

            console.log(`Transfer ${t.transfer_number}: from=${fromWhId} (${fromWh?.type}), to=${toWhId}, mainWh=${mainWarehouseId}`)

            // Must go TO main warehouse
            if (toWhId !== mainWarehouseId) return false

            // Must come FROM a store warehouse (not MAIN)
            if (!fromWh || fromWh.type === 'MAIN') return false

            return true
          })
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .map((t: any) => ({
            id: t.id,
            transfer_number: t.transfer_number || t.id?.slice(0, 8) || '-',
            from_warehouse_name: warehouseMap[t.from_warehouse_id]?.name || warehouseMap[t.from_warehouse_id]?.code || '-',
            created_at: t.created_at || '-',
            status: t.status || 'UNKNOWN'
          }))
          .slice(0, 5)

        // If no transfers from store to main found, show all recent transfers as fallback
        let finalRequests = intakeReqs
        if (finalRequests.length === 0) {
          console.log("No transfers from store to main found, showing all recent transfers instead")
          finalRequests = allTransfers
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((t: any) => ({
              id: t.id,
              transfer_number: t.transfer_number || t.id?.slice(0, 8) || '-',
              from_warehouse_name: warehouseMap[t.from_warehouse_id]?.name || warehouseMap[t.from_warehouse_id]?.code || '-',
              created_at: t.created_at || '-',
              status: t.status || 'UNKNOWN'
            }))
            .slice(0, 5)
        }

        setIntakeRequests(finalRequests)
      } catch (e) {
        console.error("Failed to load intake requests:", e)
        setIntakeRequests([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])



  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Yêu Cầu Nhập Hàng Gần Đây</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : intakeRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Không có yêu cầu nhập hàng nào</p>
      ) : (
        <div className="space-y-3">
          {intakeRequests.map((request) => (
            <div key={request.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{request.transfer_number}</p>
                <p className="text-sm text-muted-foreground mt-1">Từ: {request.from_warehouse_name}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatVietnamDate(request.created_at)}</p>
              </div>

              <div className="flex items-center gap-4 ml-4">
                <Badge className={getStatusColor(request.status)}>
                  {getStatusLabel(request.status)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
