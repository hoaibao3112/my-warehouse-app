"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { mobileFetch } from "@/lib/mobile/api-client"

type ApprovalItem = {
  id: string
  type: string
  number: string
  warehouse: string
  amount: string
  date: string
}

export function PendingApprovals() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const [poRes, wtRes, ilrRes] = await Promise.all([
          mobileFetch('/api/purchase-orders?status=SUBMITTED').then(r => r.json()).catch(() => ({ data: [] })),
          mobileFetch('/api/warehouse-transfers?status=PENDING&pageSize=5').then(r => r.json()).catch(() => ({ data: [] })),
          mobileFetch('/api/inventory-loss-reports?pageSize=5').then(r => r.json()).catch(() => ({ data: [] })),
        ])

        const poItems = (poRes.data || []).slice(0, 3).map((p: any) => ({
          id: p.id,
          type: 'Đơn Đặt Hàng',
          number: p.po_number || p.poNumber || '-',
          warehouse: p.warehouse_id || p.warehouseId || '-',
          amount: p.total_amount != null ? String(p.total_amount) : '-',
          date: p.created_at || p.createdAt || '-',
        }))

        const wtItems = (wtRes.data || []).slice(0, 3).map((t: any) => ({
          id: t.id,
          type: 'Chuyển Kho',
          number: t.transfer_number || t.transferNumber || '-',
          warehouse: t.from_warehouse_id || t.fromWarehouseId || '-',
          amount: ((t.items && t.items.length) || t.items_count || '-') + ' mục',
          date: t.created_at || t.createdAt || '-',
        }))

        const ilrItems = (ilrRes.data || []).slice(0, 3).map((r: any) => ({
          id: r.id,
          type: 'Báo Cáo Mất Hàng',
          number: r.report_number || r.reportNumber || '-',
          warehouse: r.warehouse_id || r.warehouseId || '-',
          amount: String(r.quantity_lost || r.quantityLost || '-') + ' đơn vị',
          date: r.created_at || r.createdAt || '-',
        }))

        setApprovals([...poItems, ...wtItems, ...ilrItems].slice(0, 6))
      } catch (e) {
        // ignore
      }
    }

    load()
  }, [])

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Phê Duyệt Đang Chờ</h2>

      <div className="space-y-4">
        {approvals.map((approval) => (
          <div key={approval.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline">{approval.type}</Badge>
                <span className="font-medium text-foreground">{approval.number}</span>
              </div>
              <p className="text-sm text-muted-foreground">{approval.warehouse}</p>
              <p className="text-xs text-muted-foreground mt-1">{approval.date}</p>
            </div>

            <div className="text-right mr-4">
              <p className="font-semibold text-foreground">{approval.amount}</p>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="default">
                Phê Duyệt
              </Button>
              <Button size="sm" variant="outline">
                Từ Chối
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
