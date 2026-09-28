"use client"

import { Card } from "@/components/ui/card"
import { TrendingUp, Package, Warehouse, AlertCircle } from "lucide-react"

import { useEffect, useState } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"

export function WarehouseDashboardOverview() {
    const [counts, setCounts] = useState({ products: 0, pendingRequests: 0, lowStock: 0, pendingTransfers: 0 })

    useEffect(() => {
        const load = async () => {
            try {
                // First, get MAIN warehouse ID
                let mainWarehouseId = ''
                try {
                    const whRes = await mobileFetch('/api/warehouses?type=MAIN&pageSize=10')
                    const whJson = await whRes.json()
                    if (whJson?.success && whJson?.data && whJson.data.length > 0) {
                        mainWarehouseId = whJson.data[0].id
                    }
                } catch (err) {
                    console.warn('Failed to fetch main warehouse', err)
                }

                const [productsRes, requestsRes, stockRes, transfersRes] = await Promise.all([
                    mobileFetch('/api/products?pageSize=1&excludeRecipes=true').then(r => r.json()),
                    mobileFetch('/api/stock-transfer-requests?pageSize=100').then(r => r.json()),
                    mobileFetch(`/api/warehouse-stock?pageSize=1000${mainWarehouseId ? `&warehouseId=${mainWarehouseId}` : ''}`).then(r => r.json()),
                    mobileFetch('/api/warehouse-transfers?pageSize=100').then(r => r.json()),
                ])

                // Use total from API instead of array length to get accurate count
                const products = productsRes?.total || productsRes?.data?.length || 0

                // Count pending transfer requests (CHO_DUYET status)
                const pendingRequests = (requestsRes?.data || []).filter((t: any) =>
                    t.status === 'CHO_DUYET'
                ).length

                // low stock: products with quantity <= 10
                const lowStock = (stockRes?.data || []).filter((s: any) => Number(s.quantity || 0) <= 10).length

                // Pending outgoing transfers (DA_DUYET but not completed)
                const pendingTransfers = (transfersRes?.data || []).filter((t: any) =>
                    t.status === 'DA_DUYET' || t.status === 'DA_XUAT_KHO'
                ).length

                setCounts({ products, pendingRequests, lowStock, pendingTransfers })
            } catch (e) {
                // ignore, keep zeros
            }
        }

        load()
    }, [])

    const stats = [
        { label: 'Sản Phẩm Hoạt Động', value: String(counts.products), icon: Package, color: 'text-blue-500' },
        { label: 'Yêu Cầu Nhập Kho', value: String(counts.pendingRequests), icon: TrendingUp, color: 'text-orange-500' },
        { label: 'Phiếu Xuất Đang Chờ', value: String(counts.pendingTransfers), icon: Warehouse, color: 'text-green-500' },
        { label: 'Hàng Tồn Kho Thấp', value: String(counts.lowStock), icon: AlertCircle, color: 'text-red-500' },
    ]

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {stats.map((stat) => {
                const Icon = stat.icon
                return (
                    <Card key={stat.label} className="p-4 md:p-6">
                        <div className="flex items-center justify-between">
                            <div className="min-w-0">
                                <p className="text-xs md:text-sm text-muted-foreground truncate">{stat.label}</p>
                                <p className="text-xl md:text-2xl font-bold text-foreground mt-2">{stat.value}</p>
                            </div>
                            <Icon className={`w-6 md:w-8 h-6 md:h-8 ${stat.color} flex-shrink-0`} />
                        </div>
                    </Card>
                )
            })}
        </div>
    )
}
