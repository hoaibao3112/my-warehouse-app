"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"

export function RecentTransactions() {
  const [transactions, setTransactions] = useState<any[]>([])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const me = await (await mobileFetch('/api/auth/me')).json()
        const warehouseId = me?.data?.warehouseId
        const q = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}&page=1&pageSize=10` : `?page=1&pageSize=10`
        const res = await mobileFetch(`/api/stock-transactions${q}`)
        const json = await res.json()
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
        if (!mounted) return
        setTransactions(json.data || [])
      } catch (err) {
        console.error('Failed to load recent transactions', err)
        toast.error('Không thể tải giao dịch gần đây')
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const typeColors = {
    IMPORT: "bg-green-100 text-green-800",
    EXPORT: "bg-blue-100 text-blue-800",
    TRANSFER_IN: "bg-purple-100 text-purple-800",
    TRANSFER_OUT: "bg-orange-100 text-orange-800",
    LOSS: "bg-red-100 text-red-800",
    ADJUSTMENT: "bg-gray-100 text-gray-800",
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Giao Dịch Gần Đây</h2>

      <ResponsiveTable
        data={transactions}
        columns={[
          {
            key: 'type',
            label: 'Loại',
            render: (txn) => {
              const tKey = (txn.transaction_type ?? txn.type) as keyof typeof typeColors
              return <Badge className={typeColors[tKey]}>{txn.transaction_type ?? txn.type}</Badge>
            },
            mobilePrimary: true,
          },
          {
            key: 'product',
            label: 'Sản Phẩm',
            render: (txn) => <span>{txn.product?.name ?? txn.product_name ?? txn.product}</span>,
            mobilePrimary: true,
          },
          {
            key: 'quantity',
            label: 'Số Lượng',
            render: (txn) => <span className="font-medium">{txn.quantity}</span>,
          },
          {
            key: 'reference',
            label: 'Tham Chiếu',
            render: (txn) => <span>{txn.reference ?? txn.notes ?? ''}</span>,
          },
          {
            key: 'date',
            label: 'Ngày',
            render: (txn) => <span>{txn.created_at ?? txn.date}</span>,
          },
        ]}
        actions={[]}
        keyExtractor={(txn) => txn.id}
        emptyMessage="Chưa có giao dịch nào"
        mobileCardTitle={(txn) => txn.product?.name ?? txn.product_name ?? txn.product}
        mobileCardBadge={(txn) => {
          const tKey = (txn.transaction_type ?? txn.type) as keyof typeof typeColors
          return <Badge className={typeColors[tKey]}>{txn.transaction_type ?? txn.type}</Badge>
        }}
        mobileCardMeta={(txn) => [
          <span className="text-xs">SL: {txn.quantity}</span>,
          <span className="text-xs">Tham chiếu: {txn.reference ?? txn.notes ?? '-'}</span>,
          <span className="text-xs">Ngày: {txn.created_at ?? txn.date}</span>,
        ]}
      />
    </Card>
  )
}
