"use client"

import { WarehouseDashboardOverview } from "@/components/warehouse/warehouse-dashboard-overview"
import { RecentTransfers } from "@/components/admin/recent-transfers"
import { LowStockProducts } from "@/components/admin/low-stock-products"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { Warehouse, Package, FileText, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function WarehouseDashboard() {
    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Warehouse}
                title="Kho Tổng"
                subtitle="Bảng điều khiển kho tổng"
            />

            <div className="p-4 md:p-8 space-y-6 md:space-y-8">
                <div className="hidden md:block">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">Bảng Điều Khiển Kho Tổng</h1>
                    <p className="text-sm md:text-base text-muted-foreground mt-2">Quản lý kho hàng, hàng tồn kho và xuất hàng</p>
                </div>

                <WarehouseDashboardOverview />

                {/* Quick Actions */}
                <Card className="p-6">
                    <h2 className="text-lg font-semibold mb-4">Truy Cập Nhanh</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Link href="/warehouse/products">
                            <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                                <Package className="w-6 h-6 text-blue-500" />
                                <span className="text-sm">Sản Phẩm</span>
                            </Button>
                        </Link>
                        <Link href="/warehouse/stock-transfer-requests">
                            <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                                <TrendingUp className="w-6 h-6 text-orange-500" />
                                <span className="text-sm">Yêu Cầu Nhập</span>
                            </Button>
                        </Link>
                        <Link href="/warehouse/transfers">
                            <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                                <Warehouse className="w-6 h-6 text-green-500" />
                                <span className="text-sm">Xuất Kho</span>
                            </Button>
                        </Link>
                        <Link href="/warehouse/reports">
                            <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                                <FileText className="w-6 h-6 text-purple-500" />
                                <span className="text-sm">Kiểm Kê</span>
                            </Button>
                        </Link>
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                    <LowStockProducts />
                    <RecentTransfers />
                </div>
            </div>
        </div>
    )
}
