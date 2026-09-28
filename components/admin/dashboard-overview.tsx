"use client"

import { Card } from "@/components/ui/card"
import { Users, Warehouse, TrendingUp, Building2, Package } from "lucide-react"

import { useEffect, useState } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"

export function DashboardOverview() {
  const [counts, setCounts] = useState({ warehouses: 0, employees: 0, products: 0, suppliers: 0 })

  useEffect(() => {
    const load = async () => {
      try {
        const [warehousesRes, employeesRes, productsRes, suppliersRes] = await Promise.all([
          mobileFetch('/api/warehouses?pageSize=1').then(r => r.json()),
          mobileFetch('/api/hr/employees?pageSize=1').then(r => r.json()),
          mobileFetch('/api/products?pageSize=1').then(r => r.json()),
          mobileFetch('/api/suppliers?pageSize=1').then(r => r.json()),
        ])

        const warehouses = warehousesRes?.total || warehousesRes?.data?.length || 0
        const employees = employeesRes?.total || employeesRes?.data?.length || 0
        const suppliers = suppliersRes?.total || suppliersRes?.data?.length || 0
        const products = productsRes?.total || 0

        setCounts({ warehouses, employees, products, suppliers })
      } catch (e) {
        // ignore, keep zeros
      }
    }

    load()
  }, [])

  const stats = [
    { label: 'Tổng Số Kho', value: String(counts.warehouses), icon: Warehouse, color: 'text-blue-500' },
    { label: 'Nhân Viên', value: String(counts.employees), icon: Users, color: 'text-green-500' },
    { label: 'Sản Phẩm', value: String(counts.products), icon: Package, color: 'text-orange-500' },
    { label: 'Nhà Cung Cấp', value: String(counts.suppliers), icon: Building2, color: 'text-purple-500' },
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

