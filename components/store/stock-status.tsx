"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { WAREHOUSE_CHANGE_EVENT } from "./warehouse-selector"
import { toast } from "sonner"

export function StockStatus() {
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
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

        const q = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}&page=1&pageSize=200` : `?page=1&pageSize=200`
        const res = await mobileFetch(`/api/warehouse-stock${q}`)
        const json = await res.json()
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
        if (!mounted) return

        // Filter low stock items
        // Show items where quantity is low (< 10 for now, or based on reorder level if set)
        const items = (json.data || []).filter((it: any) => {
          const qty = Number(it.quantity) || 0
          // Default threshold is 10, or use reorderLevel if available
          const reorder = it.reorderLevel ?? it.reorder_level ?? it.product?.reorderLevel ?? 10
          console.log('Item:', it.product_name, 'Qty:', qty, 'Reorder:', reorder, 'Low?', qty < reorder)
          return qty < reorder // Show items below reorder level (including negative)
        })

        console.log('Total stock items:', json.data?.length, 'Low stock items:', items.length)
        setLowStockItems(items)
      } catch (err) {
        console.error('Failed to load low stock items', err)
        toast.error('Không thể tải danh sách tồn kho thấp')
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
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <h2 className="text-lg font-semibold text-foreground">Mục Hàng Tồn Kho Thấp</h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg animate-pulse">
              <div className="flex-1">
                <div className="h-4 bg-muted rounded w-32 mb-2"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </div>
              <div className="h-6 w-16 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {lowStockItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Không có sản phẩm nào có tồn kho thấp</p>
            </div>
          ) : (
            lowStockItems.map((item) => (
              <div key={item.product_id ?? item.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-foreground">{item.product_name ?? item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.product_code ?? item.code ?? item.product_id}</p>
                </div>

                <div className="text-right mr-4">
                  <p className="text-sm font-medium text-foreground">
                    {item.quantity} / {item.reorderLevel ?? item.reorder_level ?? 10} {item.unit_name ?? item.unit_code ?? ''}
                  </p>
                  <div className="w-24 h-2 bg-muted rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${Math.min(100, Math.max(0, ((Number(item.quantity) || 0) / ((item.reorderLevel ?? item.reorder_level ?? 10) || 1)) * 100))}%` }}
                    />
                  </div>
                </div>

                <Badge className="bg-red-100 text-red-800">Thấp</Badge>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  )
}
