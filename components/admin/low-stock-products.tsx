"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { mobileFetch } from "@/lib/mobile/api-client"

type LowStockItem = {
  id: string
  code: string
  name: string
  unit_name: string
  quantity: number
  warehouse_id: string
  warehouse_name: string
}

export function LowStockProducts() {
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // First, get warehouses to identify main warehouse
        const warehousesRes = await mobileFetch('/api/warehouses?pageSize=100')
        if (!warehousesRes.ok) {
          console.error("Failed to fetch warehouses:", warehousesRes.status)
          setLowStockItems([])
          setLoading(false)
          return
        }
        const warehousesJson = await warehousesRes.json()
        if (!warehousesJson?.success) {
          console.error("Warehouses API error:", warehousesJson?.error)
          setLowStockItems([])
          setLoading(false)
          return
        }
        const allWarehouses = warehousesJson?.data || []
        const mainWarehouse = allWarehouses.find((w: any) => w.type === 'MAIN')
        const mainWarehouseId = mainWarehouse?.id

        if (!mainWarehouseId) {
          console.warn("Main warehouse not found. Available warehouses:", allWarehouses.map((w: any) => ({ id: w.id, type: w.type, name: w.name })))
          setLowStockItems([])
          setLoading(false)
          return
        }

        // Fetch stock items for main warehouse only
        const stockRes = await mobileFetch(`/api/warehouse-stock?warehouseId=${mainWarehouseId}&pageSize=1000`)
        const stockJson = await stockRes.json()
        const allStock = stockJson?.data || []

        // Filter items with low quantity (< 10)
        const lowStock = allStock.filter((s: any) => Number(s.quantity || 0) < 10).slice(0, 5)

        // Fetch all products for mapping
        const productsRes = await mobileFetch('/api/products?pageSize=1000')
        const productsJson = await productsRes.json()
        const products = productsJson?.data || []

        // Create lookup maps
        const productMap = Object.fromEntries(products.map((p: any) => [p.id, p]))
        const warehouseMap = Object.fromEntries(allWarehouses.map((w: any) => [w.id, w]))

        // Enrich low stock items with product and warehouse details
        const enrichedItems = lowStock.map((item: any) => {
          const product = productMap[item.product_id]
          const warehouse = warehouseMap[item.warehouse_id]
          return {
            id: item.id,
            code: product?.code || item.product_id?.slice(0, 8),
            name: product?.name || '-',
            unit_name: item.unit_name || product?.unit_name || '-',
            quantity: Number(item.quantity || 0),
            warehouse_id: item.warehouse_id,
            warehouse_name: warehouse?.name || warehouse?.code || '-'
          }
        })

        setLowStockItems(enrichedItems)
      } catch (e) {
        console.error("Failed to load low stock items:", e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-semibold text-foreground">Sản Phẩm Sắp Hết Hàng</h2>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : (
        <ResponsiveTable
          data={lowStockItems}
          columns={[
            {
              key: 'code',
              label: 'Mã SP',
              render: (item) => <span className="font-medium">{item.code}</span>,
              mobilePrimary: true,
            },
            {
              key: 'name',
              label: 'Tên Sản Phẩm',
              render: (item) => <span>{item.name}</span>,
              mobilePrimary: true,
            },
            {
              key: 'warehouse',
              label: 'Kho',
              render: (item) => <span className="text-sm">{item.warehouse_name}</span>,
            },
            {
              key: 'quantity',
              label: 'Số Lượng',
              render: (item) => (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                  {item.quantity}
                </Badge>
              ),
              align: 'right',
            },
            {
              key: 'unit',
              label: 'Đơn Vị',
              render: (item) => <span className="text-sm">{item.unit_name}</span>,
            },
          ]}
          actions={[]}
          keyExtractor={(item) => item.id}
          emptyMessage="Không có sản phẩm nào sắp hết hàng"
          mobileCardTitle={(item) => item.name}
          mobileCardBadge={(item) => (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
              {item.quantity}
            </Badge>
          )}
          mobileCardMeta={(item) => [
            <span className="text-xs">Mã: {item.code}</span>,
            <span className="text-xs">Kho: {item.warehouse_name}</span>,
            <span className="text-xs">ĐV: {item.unit_name}</span>,
          ]}
        />
      )}
    </Card>
  )
}
