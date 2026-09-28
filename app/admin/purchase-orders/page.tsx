"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Eye, ShoppingCart } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"

export default function PurchaseOrdersPage() {
  const [orders] = useState([
    {
      id: "po-1",
      number: "PO-2025-001",
      warehouse: "Kho Chính",
      supplier: "Nhà Cung Cấp A",
      amount: "$5,000",
      status: "APPROVED",
      date: "2025-01-15",
      items: 50,
    },
    {
      id: "po-2",
      number: "PO-2025-002",
      warehouse: "Cửa Hàng 01",
      supplier: "Nhà Cung Cấp B",
      amount: "$3,200",
      status: "RECEIVED",
      date: "2025-01-14",
      items: 30,
    },
    {
      id: "po-3",
      number: "PO-2025-003",
      warehouse: "Cửa Hàng 02",
      supplier: "Nhà Cung Cấp C",
      amount: "$2,800",
      status: "DRAFT",
      date: "2025-01-13",
      items: 25,
    },
  ])

  const statusColors = {
    DRAFT: "bg-gray-100 text-gray-800",
    SUBMITTED: "bg-blue-100 text-blue-800",
    APPROVED: "bg-green-100 text-green-800",
    RECEIVED: "bg-purple-100 text-purple-800",
    CANCELLED: "bg-red-100 text-red-800",
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ShoppingCart}
        title="Đơn Đặt Hàng"
        subtitle="Quản lý đơn đặt hàng"
        gradient="teal"
      />
      <div className="p-4 md:p-8 space-y-6">
      <div className="hidden md:flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Đơn Đặt Hàng</h1>
          <p className="text-muted-foreground mt-2">Theo dõi và quản lý đơn đặt hàng</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Đơn Đặt Hàng Mới
        </Button>
      </div>
      <div className="md:hidden flex justify-end">
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Đơn Đặt Hàng Mới
        </Button>
      </div>

      <Card className="p-6">
        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Tìm kiếm đơn đặt hàng..." className="pl-10" />
          </div>
        </div>

        <ResponsiveTable
          data={orders}
          columns={[
            {
              key: 'number',
              label: 'Số PO',
              render: (order) => <span className="font-medium">{order.number}</span>,
              mobilePrimary: true,
            },
            {
              key: 'warehouse',
              label: 'Kho',
              render: (order) => <span>{order.warehouse}</span>,
            },
            {
              key: 'supplier',
              label: 'Nhà Cung Cấp',
              render: (order) => <span>{order.supplier}</span>,
            },
            {
              key: 'items',
              label: 'Số Lượng',
              render: (order) => <span>{order.items}</span>,
            },
            {
              key: 'amount',
              label: 'Số Tiền',
              render: (order) => <span className="font-medium">{order.amount}</span>,
              mobilePrimary: true,
            },
            {
              key: 'status',
              label: 'Trạng Thái',
              render: (order) => <Badge className={statusColors[order.status as keyof typeof statusColors]}>{order.status}</Badge>,
            },
            {
              key: 'date',
              label: 'Ngày',
              render: (order) => <span>{order.date}</span>,
            },
          ]}
          actions={[
            {
              label: 'Xem',
              icon: <Eye className="w-4 h-4" />,
              onClick: () => {},
              variant: 'ghost',
            },
          ]}
          keyExtractor={(order) => order.id}
          emptyMessage="Chưa có đơn hàng nào"
          mobileCardTitle={(order) => order.number}
          mobileCardBadge={(order) => <Badge className={statusColors[order.status as keyof typeof statusColors]}>{order.status}</Badge>}
          mobileCardMeta={(order) => [
            <span className="text-xs">Kho: {order.warehouse}</span>,
            <span className="text-xs">NCC: {order.supplier}</span>,
            <span className="text-xs">SL: {order.items} mặt hàng</span>,
            <span className="text-xs">{order.amount}</span>,
            <span className="text-xs">{order.date}</span>,
          ]}
        />
      </Card>
    </div>
    </div>
  )
}
