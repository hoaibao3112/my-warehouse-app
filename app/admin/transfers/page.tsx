"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Eye, ArrowRightLeft } from "lucide-react"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function TransfersPage() {
    const [transfers, setTransfers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [viewOpen, setViewOpen] = useState(false)
    const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null)
    const [warehousesMap, setWarehousesMap] = useState<Record<string, string>>({})
    const [usersMap, setUsersMap] = useState<Record<string, string>>({})
    const [storeWarehouses, setStoreWarehouses] = useState<any[]>([])
    const [selectedStoreWarehouse, setSelectedStoreWarehouse] = useState<string>("")
    const { user } = useAuth()
    const [approvedMap, setApprovedMap] = useState<Record<string, string>>({})
    const [approvedUnitMap, setApprovedUnitMap] = useState<Record<string, string>>({})
    const [approving, setApproving] = useState(false)
    const [showSignature, setShowSignature] = useState(false)
    const [warehouseDiscount, setWarehouseDiscount] = useState<number>(0)

    // Memoized fetch function để auto-refresh
    const fetchTransfers = useCallback(async () => {
        setError(null)
        try {
            // Build query with toWarehouseId filter if selected
            // Admin transfers are OUTBOUND from MAIN warehouse TO store warehouses
            let url = `/api/warehouse-transfers?page=1&pageSize=100`
            if (selectedStoreWarehouse) {
                url += `&toWarehouseId=${selectedStoreWarehouse}`
            }
            const res = await fetch(url)
            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
            setTransfers(json.data || [])
        } catch (err: any) {
            setError(err?.message || String(err))
        }
    }, [selectedStoreWarehouse])

    // Load transfers on mount and when filter changes
    useEffect(() => {
        setLoading(true)
        fetchTransfers().finally(() => setLoading(false))
    }, [fetchTransfers])

    // Auto-refresh transfers mỗi 30 giây (adaptive: tăng dần lên 2 phút nếu không có thay đổi)
    useAutoRefresh(fetchTransfers, 30000)

    // Load lookup data (warehouses, users)
    useEffect(() => {
        const fetchLookups = async () => {
            try {
                const whRes = await mobileFetch(`/api/warehouses?page=1&pageSize=200`)
                const whJson = await whRes.json()
                if (whJson?.success && Array.isArray(whJson.data)) {
                    const map: Record<string, string> = {}
                    const stores: any[] = []
                    for (const w of whJson.data) {
                        map[w.id] = w.name || w.code || w.id
                        // Collect store warehouses (not MAIN)
                        if (w.type !== 'MAIN') {
                            stores.push(w)
                        }
                    }
                    setWarehousesMap(map)
                    setStoreWarehouses(stores)
                }

                const uRes = await mobileFetch(`/api/users?page=1&pageSize=200`)
                const uJson = await uRes.json()
                if (uJson?.success && Array.isArray(uJson.data)) {
                    const um: Record<string, string> = {}
                    for (const u of uJson.data) um[u.id] = u.name || u.email || u.id
                    setUsersMap(um)
                }
            } catch (e) {
                // ignore lookup failures; fallbacks will show ids
            }
        }

        fetchLookups()
    }, [])

    const formatDate = (value: any) => {
        try {
            const d = new Date(value)
            if (isNaN(d.getTime())) return "-"
            return d.toLocaleString("vi-VN")
        } catch {
            return "-"
        }
    }

    // Calculate total amount reactively
    const totalAmount = useMemo(() => {
        if (!selectedTransfer) return 0
        let subtotal = (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
            const price = Number(item.price ?? item.product_price ?? 0)
            let displayQty = 0

            if (selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) {
                // Use admin's approved quantity if available, otherwise use manager's approved quantity
                displayQty = Number(approvedMap[item.id] ?? (item.admin_approved_quantity ?? item.received_quantity ?? Number(item.quantity ?? item.requested_quantity ?? 0)))
            } else if (selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                // In DA_XUAT_KHO state, use admin's approved quantity if available, otherwise manager's approved quantity
                displayQty = Number(item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
            } else {
                // In completed state, use actual received quantity
                displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
            }

            // Use converted quantity (in default unit) if available, otherwise use display quantity
            // This ensures correct calculation when unit differs from default unit
            const effectiveQty = item.convertedQuantity !== undefined && item.convertedQuantity !== null
                ? Number(item.convertedQuantity)
                : displayQty

            return sum + (effectiveQty * price)
        }, 0)

        // Apply warehouse discount if status is HOAN_THANH (completed)
        if (selectedTransfer.status === 'HOAN_THANH' && warehouseDiscount > 0) {
            return subtotal * (1 - warehouseDiscount / 100)
        }

        return subtotal
    }, [selectedTransfer, approvedMap, warehouseDiscount])

    // Actions are performed in the detailed view. Keep list as a navigator only.

    const statusColors = {
        PENDING: "bg-yellow-100 text-yellow-800",
        APPROVED: "bg-blue-100 text-blue-800",
        RECEIVED: "bg-green-100 text-green-800",
        REJECTED: "bg-red-100 text-red-800",
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={ArrowRightLeft}
                title="Xuất Hàng Nội Bộ"
                subtitle="Theo dõi và phê duyệt xuất hàng"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Xuất Hàng Nội Bộ</h1>
                        <p className="text-muted-foreground mt-2">Theo dõi và phê duyệt xuất hàng nội bộ</p>
                    </div>
                </div>

                <Card className="p-6">
                    <div className="mb-6 space-y-4">
                        <div className="flex gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                <Input placeholder="Tìm kiếm xuất hàng..." className="pl-10" />
                            </div>
                        </div>

                        {/* Store Warehouse Filter */}
                        <div className="flex gap-4 items-end">
                            <div className="w-64">
                                <label className="text-sm font-medium text-muted-foreground mb-1 block">Lọc theo Kho Con</label>
                                <select
                                    value={selectedStoreWarehouse}
                                    onChange={(e) => setSelectedStoreWarehouse(e.target.value)}
                                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                                >
                                    <option value="">Tất cả kho con</option>
                                    {storeWarehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.name || warehouse.code}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải xuất hàng...</p>}
                        {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {transfers.map((transfer) => (
                                <Card key={transfer.id} className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate">{warehousesMap[transfer.to_warehouse_id] || transfer.toWarehouse || 'Kho'}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(transfer.created_at ?? transfer.createdAt ?? transfer.requestedAt)}</p>
                                            <p className="text-xs text-muted-foreground">Bởi: {usersMap[transfer.requested_by] || transfer.requestedBy || '-'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={getStatusColor(transfer.status as any)}>
                                                {getStatusLabel(transfer.status as any)}
                                            </Badge>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={async () => {
                                                    try {
                                                        setViewOpen(true)
                                                        const res = await mobileFetch(`/api/stock-transfer-requests/${transfer.id}`)
                                                        const json = await res.json()
                                                        const data = json?.data || transfer
                                                        setSelectedTransfer(data)
                                                        const map: Record<string, string> = {}
                                                        const items = data.items || []
                                                        for (const it of items) {
                                                            if (data.status === TRANSFER_STATUS.CHO_DUYET) {
                                                                map[it.id] = String(Number(it.quantity ?? it.requested_quantity ?? 0))
                                                            } else {
                                                                map[it.id] = String(Number(it.received_quantity ?? 0))
                                                            }
                                                        }
                                                        setApprovedMap(map)
                                                        if (data.status === 'HOAN_THANH' || data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                                            try {
                                                                const whRes = await mobileFetch(`/api/warehouses/${data.to_warehouse_id}`)
                                                                const whJson = await whRes.json()
                                                                if (whJson?.success && whJson?.data?.discount_percentage) {
                                                                    setWarehouseDiscount(Number(whJson.data.discount_percentage))
                                                                } else {
                                                                    setWarehouseDiscount(0)
                                                                }
                                                            } catch (err) {
                                                                setWarehouseDiscount(0)
                                                            }
                                                        }
                                                    } catch (err) {
                                                        setSelectedTransfer(transfer)
                                                    }
                                                }}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <table className="w-full hidden md:table">
                            <thead>
                                <tr className="border-b border-border">
                                    {/* Removed columns Số Chuyển Kho / Từ / Số Lượng per product owner's request */}
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Đến</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Yêu Cầu Bởi</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transfers.map((transfer) => (
                                    <tr key={transfer.id} className="border-b border-border hover:bg-muted/50">
                                        <td className="py-3 px-4 text-foreground">{warehousesMap[transfer.to_warehouse_id] || transfer.toWarehouse || transfer.to_warehouse_id}</td>
                                        <td className="py-3 px-4">
                                            <Badge className={getStatusColor(transfer.status as any)}>
                                                {getStatusLabel(transfer.status as any)}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-foreground">{usersMap[transfer.requested_by] || transfer.requestedBy || transfer.requested_by}</td>
                                        <td className="py-3 px-4 text-foreground">{formatDate(transfer.created_at ?? transfer.createdAt ?? transfer.requestedAt)}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={async () => {
                                                        try {
                                                            setViewOpen(true)
                                                            const res = await mobileFetch(`/api/stock-transfer-requests/${transfer.id}`)
                                                            const json = await res.json()
                                                            const data = json?.data || transfer
                                                            setSelectedTransfer(data)
                                                            // Initialize approved map: if already approved, use received_quantity; otherwise use requested quantity
                                                            const map: Record<string, string> = {}
                                                            const items = data.items || []
                                                            for (const it of items) {
                                                                // If status is CHO_DUYET (pending), default to requested quantity
                                                                // Otherwise, use received_quantity (already approved)
                                                                if (data.status === TRANSFER_STATUS.CHO_DUYET) {
                                                                    map[it.id] = String(Number(it.quantity ?? it.requested_quantity ?? 0))
                                                                } else {
                                                                    map[it.id] = String(Number(it.received_quantity ?? 0))
                                                                }
                                                            }
                                                            setApprovedMap(map)

                                                            // Fetch receiving warehouse discount if status is completed
                                                            if (data.status === 'HOAN_THANH' || data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                                                try {
                                                                    const whRes = await mobileFetch(`/api/warehouses/${data.to_warehouse_id}`)
                                                                    const whJson = await whRes.json()
                                                                    if (whJson?.success && whJson?.data?.discount_percentage) {
                                                                        setWarehouseDiscount(Number(whJson.data.discount_percentage))
                                                                    } else {
                                                                        setWarehouseDiscount(0)
                                                                    }
                                                                } catch (err) {
                                                                    setWarehouseDiscount(0)
                                                                }
                                                            }
                                                        } catch (err) {
                                                            setSelectedTransfer(transfer)
                                                        }
                                                    }}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Dialog open={viewOpen} onOpenChange={(open) => { if (!open) { setSelectedTransfer(null); setApprovedMap({}); setShowSignature(false); } setViewOpen(open) }}>
                    <DialogContent className="max-w-2xl max-h-screen flex flex-col p-0 gap-0">
                        <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                            <DialogTitle>Chi tiết xuất hàng</DialogTitle>
                            <DialogDescription>Thông tin chi tiết xuất hàng nội bộ</DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto">
                            <div className="px-6 py-4">
                                {selectedTransfer ? (
                                    <div className="space-y-2">
                                        <p><strong>Đến:</strong> {warehousesMap[selectedTransfer.to_warehouse_id] || selectedTransfer.toWarehouse || selectedTransfer.to}</p>
                                        <p>
                                            <strong>Trạng thái:</strong>
                                            <Badge className={getStatusColor(selectedTransfer.status as any)}>
                                                {getStatusLabel(selectedTransfer.status as any)}
                                            </Badge>
                                        </p>
                                        <div>
                                            <strong>Items:</strong>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left">
                                                        <th className="py-2 px-2">Sản phẩm</th>
                                                        <th className="py-2 px-2">Yêu cầu</th>
                                                        <th className="py-2 px-2">Tồn kho cửa hàng</th>
                                                        <th className="py-2 px-2">Tồn kho Kho Tổng</th>
                                                        <th className="py-2 px-2">Đơn giá</th>
                                                        {(selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) && (
                                                            <>
                                                                <th className="py-2 px-2">{selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET ? 'Duyệt (Kho Tổng)' : 'Duyệt (Kho Tổng)'}</th>
                                                                <th className="py-2 px-2">Đơn vị duyệt</th>
                                                            </>
                                                        )}
                                                        {selectedTransfer.status !== TRANSFER_STATUS.CHO_DUYET && selectedTransfer.status !== TRANSFER_STATUS.DA_DUYET && (
                                                            <>
                                                                <th className="py-2 px-2">Số duyệt</th>
                                                                <th className="py-2 px-2">Đơn vị</th>
                                                                <th className="py-2 px-2">Kho con nhập nhận</th>
                                                            </>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(selectedTransfer.itemsList || selectedTransfer.items || []).map((it: any) => {
                                                        const price = Number(it.price ?? it.product_price ?? 0)
                                                        // Status-aware logic:
                                                        // At CHO_DUYET (before manager approval): show original request
                                                        // At DA_DUYET and later (after manager approval): show manager's approved quantity (received_quantity) - CỨNG
                                                        const requestedQty = selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET
                                                            ? (it.quantity ?? it.requested_quantity ?? it.qty)
                                                            : (it.received_quantity ?? it.quantity ?? it.requested_quantity ?? it.qty)

                                                        return (
                                                            <tr key={it.id} className="border-t">
                                                                <td className="py-2 px-2">{it.product_name ?? it.productName ?? it.productId}</td>
                                                                <td className="py-2 px-2">
                                                                    <div className="font-semibold">{requestedQty}</div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {it.unit_code ?? '-'}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2 px-2">
                                                                    <span className={it.store_stock <= 0 ? "text-red-600 font-semibold" : "text-foreground"}>
                                                                        {it.store_stock ?? 0}
                                                                    </span>
                                                                    <div className="text-xs text-muted-foreground">{it.default_unit_code ?? '-'}</div>
                                                                </td>
                                                                <td className="py-2 px-2">
                                                                    <span className={it.main_stock <= 0 ? "text-red-600 font-semibold" : "text-foreground"}>
                                                                        {it.main_stock ?? 0}
                                                                    </span>
                                                                    <div className="text-xs text-muted-foreground">{it.default_unit_code ?? '-'}</div>
                                                                </td>
                                                                <td className="py-2 px-2">
                                                                    <div className="font-semibold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)}</div>
                                                                </td>
                                                                {(selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) && (
                                                                    <>
                                                                        <td className="py-2 px-2">
                                                                            <div>
                                                                                <input
                                                                                    type="number"
                                                                                    min={0}
                                                                                    step="0.0001"
                                                                                    max={Number(it.convertedQuantity ?? it.quantity ?? it.requested_quantity ?? it.qty) || undefined}
                                                                                    value={approvedMap[it.id] ?? String(it.admin_approved_quantity ?? it.received_quantity ?? 0)}
                                                                                    onChange={(e) => setApprovedMap((m) => ({ ...m, [it.id]: e.target.value }))}
                                                                                    className="border px-2 py-1 rounded w-28"
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-2 px-2">
                                                                            <select
                                                                                value={approvedUnitMap[it.id] ?? (it.unit_code ?? '')}
                                                                                onChange={(e) => setApprovedUnitMap((m) => ({ ...m, [it.id]: e.target.value }))}
                                                                                className="border px-2 py-1 rounded text-sm"
                                                                            >
                                                                                <option value={it.unit_code ?? ''}>{it.unit_code ?? 'N/A'}</option>
                                                                                {it.convertedQuantity !== undefined && it.default_unit_code && (
                                                                                    <option value={it.default_unit_code}>{it.default_unit_code}</option>
                                                                                )}
                                                                            </select>
                                                                        </td>
                                                                    </>
                                                                )}
                                                                {selectedTransfer.status !== TRANSFER_STATUS.CHO_DUYET && selectedTransfer.status !== TRANSFER_STATUS.DA_DUYET && (
                                                                    <>
                                                                        <td className="py-2 px-2 font-semibold">{it.admin_approved_quantity ?? it.received_quantity ?? 0}</td>
                                                                        <td className="py-2 px-2 text-sm">{it.approved_unit_code ?? it.unit_code ?? '-'}</td>
                                                                        <td className="py-2 px-2">
                                                                            {selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO
                                                                                ? 'Đang nhập...'
                                                                                : (it.actual_received_quantity ?? '-')}
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Total Amount Section for Detail View */}
                                        {selectedTransfer && (selectedTransfer.itemsList || selectedTransfer.items || []).length > 0 && (
                                            <div className="border-t mt-4 pt-4">
                                                {selectedTransfer.status === 'HOAN_THANH' && warehouseDiscount > 0 ? (
                                                    <div className="flex justify-end items-center gap-4">
                                                        <div className="text-right space-y-2">
                                                            <div>
                                                                <div className="text-sm text-muted-foreground mb-1">Tổng tiền gốc:</div>
                                                                <div className="text-lg font-semibold text-foreground">
                                                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                                                        (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                                                            const price = Number(item.price ?? item.product_price ?? 0)
                                                                            const displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                                                            // Use converted quantity (in default unit) if available, otherwise use display quantity
                                                                            const effectiveQty = item.convertedQuantity !== undefined && item.convertedQuantity !== null
                                                                                ? Number(item.convertedQuantity)
                                                                                : displayQty
                                                                            return sum + (effectiveQty * price)
                                                                        }, 0)
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="pt-2 border-t">
                                                                <div className="text-sm text-red-600 mb-1">Chiết khấu ({warehouseDiscount}%):</div>
                                                                <div className="text-lg font-semibold text-red-600">
                                                                    -
                                                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                                                        ((selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                                                            const price = Number(item.price ?? item.product_price ?? 0)
                                                                            const displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                                                            // Use converted quantity (in default unit) if available, otherwise use display quantity
                                                                            const effectiveQty = item.convertedQuantity !== undefined && item.convertedQuantity !== null
                                                                                ? Number(item.convertedQuantity)
                                                                                : displayQty
                                                                            return sum + (effectiveQty * price)
                                                                        }, 0)) * (warehouseDiscount / 100)
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="pt-2 border-t">
                                                                <div className="text-sm text-green-600 mb-1">Thành tiền:</div>
                                                                <div className="text-2xl font-bold text-green-600">
                                                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end items-center gap-4">
                                                        <div className="text-right">
                                                            <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                                                            <div className="text-2xl font-bold text-primary">
                                                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p>Đang tải...</p>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex items-center gap-2 flex-wrap justify-end">
                            {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && user && (user.role === "ADMIN" || user.role === "AdminKhoTong" || user.role === "MANAGER") && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                            const reason = prompt('Lý do từ chối (bắt buộc để từ chối)')
                                            if (!reason || reason.trim().length === 0) {
                                                toast.error('Lý do từ chối là bắt buộc')
                                                return
                                            }
                                            try {
                                                const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ rejectionReason: reason }),
                                                })
                                                const json = await res.json()
                                                if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi từ chối')
                                                toast.success('Đã từ chối')
                                                setViewOpen(false)
                                                // refresh list
                                                const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                                                const j = await r.json()
                                                if (j?.success) setTransfers(j.data || [])
                                            } catch (err: any) {
                                                toast.error(err?.message || String(err))
                                            }
                                        }}
                                    >
                                        Từ chối
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="default"
                                        onClick={async () => {
                                            // Validate approved quantities
                                            const items = (selectedTransfer.itemsList || selectedTransfer.items || [])
                                            const payloadItems: any[] = []
                                            for (const it of items) {
                                                const approved = Number(approvedMap[it.id] ?? 0)
                                                const maxAllowed = Number(it.convertedQuantity ?? it.quantity ?? it.requested_quantity ?? it.qty) || 0
                                                if (approved < 0 || approved > maxAllowed) {
                                                    toast.error(`Số lượng phê duyệt cho ${it.product_name || it.productId} không hợp lệ`)
                                                    return
                                                }
                                                payloadItems.push({
                                                    itemId: it.id,
                                                    approvedQuantity: approved,
                                                    approvedUnitCode: approvedUnitMap[it.id] ?? (it.unit_code ?? '')
                                                })
                                            }

                                            try {
                                                setApproving(true)
                                                const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ items: payloadItems }),
                                                })
                                                const json = await res.json()
                                                if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi duyệt')
                                                toast.success('Đã duyệt yêu cầu')
                                                setViewOpen(false)
                                                const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                                                const j = await r.json()
                                                if (j?.success) setTransfers(j.data || [])
                                            } catch (err: any) {
                                                toast.error(err?.message || String(err))
                                            } finally {
                                                setApproving(false)
                                            }
                                        }}
                                    >
                                        {approving ? 'Đang xử lý...' : 'Duyệt'}
                                    </Button>
                                </>
                            )}
                            {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && (user.role === "ADMIN" || user.role === "AdminKhoTong" || user.role === "MANAGER") && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-blue-600 hover:bg-blue-700"
                                    onClick={async () => {
                                        // Validate approved quantities
                                        const items = (selectedTransfer.itemsList || selectedTransfer.items || [])
                                        const payloadItems: any[] = []
                                        for (const it of items) {
                                            const approved = Number(approvedMap[it.id] || (it.received_quantity ?? 0))
                                            const maxAllowed = Number(it.convertedQuantity ?? it.quantity ?? it.requested_quantity ?? it.qty) || 0
                                            if (approved < 0 || approved > maxAllowed) {
                                                toast.error(`Số lượng phê duyệt cho ${it.product_name || it.productId} không hợp lệ`)
                                                return
                                            }
                                            payloadItems.push({
                                                itemId: it.id,
                                                approvedQuantity: approved,
                                                approvedUnitCode: approvedUnitMap[it.id] ?? (it.unit_code ?? '')
                                            })
                                        }

                                        try {
                                            setApproving(true)
                                            const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ items: payloadItems }),
                                            })
                                            const json = await res.json()
                                            if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi duyệt')
                                            toast.success('Đã duyệt và xuất kho')
                                            setViewOpen(false)
                                            const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                                            const j = await r.json()
                                            if (j?.success) setTransfers(j.data || [])
                                        } catch (err: any) {
                                            toast.error(err?.message || String(err))
                                        } finally {
                                            setApproving(false)
                                        }
                                    }}
                                    disabled={approving}
                                >
                                    {approving ? 'Đang duyệt...' : 'Duyệt & Xuất Kho'}
                                </Button>
                            )}
                            {selectedTransfer && selectedTransfer.status === 'HOAN_THANH' && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => {
                                        // Open PDF in new tab
                                        window.open(`/api/stock-transfer-requests/${selectedTransfer.id}/pdf`, '_blank')
                                    }}
                                >
                                    Tải Báo Cáo
                                </Button>
                            )}
                            {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.CHO_ADMIN_XAC_NHAN && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={async () => {
                                        setApproving(true)
                                        try {
                                            const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/admin-confirm-shortage`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ action: 'CONFIRM' }),
                                            })
                                            const json = await res.json()
                                            if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi xác nhận')
                                            toast.success('Đã xác nhận và hoàn thành yêu cầu')
                                            setViewOpen(false)
                                            const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                                            const j = await r.json()
                                            if (j?.success) setTransfers(j.data || [])
                                        } catch (err: any) {
                                            toast.error(err?.message || String(err))
                                        } finally {
                                            setApproving(false)
                                        }
                                    }}
                                    disabled={approving}
                                >
                                    {approving ? 'Đang xác nhận...' : 'Xác Nhận'}
                                </Button>
                            )}
                            {selectedTransfer && selectedTransfer.status !== TRANSFER_STATUS.CHO_DUYET && selectedTransfer.status !== TRANSFER_STATUS.DA_DUYET && selectedTransfer.status !== 'HOAN_THANH' && selectedTransfer.status !== TRANSFER_STATUS.DA_XUAT_KHO && selectedTransfer.status !== TRANSFER_STATUS.CHO_ADMIN_XAC_NHAN && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={async () => {
                                        // Validate approved quantities for update
                                        const items = (selectedTransfer.itemsList || selectedTransfer.items || [])
                                        const payloadItems: any[] = []
                                        for (const it of items) {
                                            const approved = Number(approvedMap[it.id] || 0)
                                            const maxAllowed = Number(it.convertedQuantity ?? it.quantity ?? it.requested_quantity ?? it.qty) || 0
                                            if (approved < 0 || approved > maxAllowed) {
                                                toast.error(`Số lượng phê duyệt cho ${it.product_name || it.productId} không hợp lệ`)
                                                return
                                            }
                                            payloadItems.push({
                                                itemId: it.id,
                                                approvedQuantity: approved,
                                                approvedUnitCode: approvedUnitMap[it.id] ?? (it.unit_code ?? '')
                                            })
                                        }

                                        try {
                                            setApproving(true)
                                            const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ items: payloadItems }),
                                            })
                                            const json = await res.json()
                                            if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi cập nhật')
                                            toast.success('Đã cập nhật phê duyệt')
                                            setViewOpen(false)
                                            const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                                            const j = await r.json()
                                            if (j?.success) setTransfers(j.data || [])
                                        } catch (err: any) {
                                            toast.error(err?.message || String(err))
                                        } finally {
                                            setApproving(false)
                                        }
                                    }}
                                >
                                    {approving ? 'Đang xử lý...' : 'Cập nhật phê duyệt'}
                                </Button>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
