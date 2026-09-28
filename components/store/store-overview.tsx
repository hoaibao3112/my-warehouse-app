"use client"

import { Card } from "@/components/ui/card"
import { Package, AlertCircle, TrendingUp, FileText } from "lucide-react"
import { useEffect, useState } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { WAREHOUSE_CHANGE_EVENT } from "./warehouse-selector"
import { toast } from "sonner"

export function StoreOverview() {
  const [counts, setCounts] = useState({ products: 0, lowStock: 0, pendingTransfers: 0, lossReports: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      if (!mounted) return
      setLoading(true)
      try {
        // get current user to infer warehouse if present
        const meRes = await mobileFetch(`/api/auth/me`)
        const meJson = await meRes.json()
        const user = meJson?.data

        let warehouseId: string | null = null

        // For GENERAL_MANAGER, get selected warehouse from sessionStorage
        if (user?.role === 'GENERAL_MANAGER') {
          try {
            warehouseId = sessionStorage.getItem('selectedWarehouseId')
          } catch (e) {
            console.error('Failed to access sessionStorage:', e)
          }
        } else {
          // For other roles, use their assigned warehouse
          warehouseId = user?.warehouseId || null
        }

        // fetch counts in parallel
        const params = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : ''

        const [productsRes, stockRes, transfersRes, lossRes] = await Promise.all([
          mobileFetch(`/api/products?page=1&pageSize=1${warehouseId ? `&warehouseId=${encodeURIComponent(warehouseId)}` : ''}`),
          mobileFetch(`/api/warehouse-stock?page=1&pageSize=200${warehouseId ? `&warehouseId=${encodeURIComponent(warehouseId)}` : ''}`),
          mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100${warehouseId ? `&toWarehouseId=${encodeURIComponent(warehouseId)}` : ''}`),
          mobileFetch(`/api/inventory-loss-reports?page=1&pageSize=1${warehouseId ? `&warehouseId=${encodeURIComponent(warehouseId)}` : ''}`),
        ])

        const [pJson, sJson, tJson, lJson] = await Promise.all([productsRes.json(), stockRes.json(), transfersRes.json(), lossRes.json()])

        if (!mounted) return

        const productsCount = pJson?.data?.total || (Array.isArray(pJson?.data) ? pJson.data.length : 0)
        const lowStockCount = Array.isArray(sJson?.data)
          ? sJson.data.filter((i: any) => Number(i.quantity) <= (i.reorderLevel ?? 0)).length
          : 0
        // Filter pending transfers (CHO_DUYET, DA_DUYET, DA_XUAT_KHO - not completed/cancelled)
        const pendingTransfers = (Array.isArray(tJson?.data)
          ? tJson.data.filter((t: any) => {
            const status = t.status || ''
            return status === 'CHO_DUYET' || status === 'DA_DUYET' || status === 'DA_XUAT_KHO'
          }).length
          : 0)
        const lossReports = lJson?.data?.length || 0

        setCounts({ products: productsCount, lowStock: lowStockCount, pendingTransfers, lossReports })
      } catch (err) {
        console.error('Failed to load store overview counts', err)
        toast.error('Không thể tải thông tin tổng quan')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    // Listen for warehouse changes - reload immediately
    const handleWarehouseChange = () => {
      load() // Reload data with new warehouse
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      mounted = false
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [])

  const stats = [
    { label: 'Tổng Số Sản Phẩm', value: String(counts.products), icon: Package, color: 'text-blue-500' },
    { label: 'Mục Hàng Tồn Kho Thấp', value: String(counts.lowStock), icon: AlertCircle, color: 'text-red-500' },
    { label: 'Chuyển Kho Đang Chờ', value: String(counts.pendingTransfers), icon: TrendingUp, color: 'text-orange-500' },
    { label: 'Báo Cáo Mất Hàng', value: String(counts.lossReports), icon: FileText, color: 'text-purple-500' },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6">
            <div className="flex items-center justify-between animate-pulse">
              <div className="flex-1">
                <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                <div className="h-8 bg-muted rounded w-16"></div>
              </div>
              <div className="w-8 h-8 bg-muted rounded"></div>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.label} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-2">{stat.value}</p>
              </div>
              <Icon className={`w-8 h-8 ${stat.color}`} />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
