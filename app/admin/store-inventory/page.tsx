"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { Package, Warehouse, Eye } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface WarehouseOption {
    id: string
    name: string
    type: string
}

export default function AdminStoreInventoryPage() {
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadWarehouses()
    }, [])

    const loadWarehouses = async () => {
        try {
            const res = await mobileFetch("/api/warehouses?pageSize=100")
            const json = await res.json()
            if (json.success) {
                const stores = (json.data || []).filter((w: WarehouseOption) => w.type === 'STORE')
                setWarehouses(stores)
                if (stores.length > 0) {
                    setSelectedWarehouseId(stores[0].id)
                }
            }
        } catch (error) {
            console.error("Failed to load warehouses:", error)
            toast.error("Lỗi tải danh sách kho")
        } finally {
            setLoading(false)
        }
    }

    const handleOpenInventoryPage = () => {
        if (!selectedWarehouseId) {
            toast.error("Vui lòng chọn cửa hàng")
            return
        }
        sessionStorage.setItem('adminSelectedWarehouseId', selectedWarehouseId)
        window.open(`/store/inventory?adminAccess=true&warehouseId=${selectedWarehouseId}`, '_blank')
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Package}
                title="Tồn Kho Cửa Hàng"
                subtitle="Xem tồn kho tại các cửa hàng"
                gradient="blue"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:block">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tồn Kho Cửa Hàng</h1>
                    <p className="text-sm md:text-base text-muted-foreground mt-2">
                        Chọn cửa hàng để xem tồn kho với quyền admin
                    </p>
                </div>

                <Card className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Chọn Cửa Hàng</label>
                            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Chọn cửa hàng..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {warehouses.map((wh) => (
                                        <SelectItem key={wh.id} value={wh.id}>
                                            <div className="flex items-center gap-2">
                                                <Warehouse className="w-4 h-4" />
                                                {wh.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button onClick={handleOpenInventoryPage} className="w-full" disabled={!selectedWarehouseId}>
                            <Eye className="w-4 h-4 mr-2" />
                            Xem Tồn Kho
                        </Button>
                    </div>
                </Card>

                {warehouses.length === 0 && (
                    <Card className="p-6 text-center text-muted-foreground">
                        <p>Chưa có cửa hàng nào được tạo.</p>
                    </Card>
                )}
            </div>
        </div>
    )
}
