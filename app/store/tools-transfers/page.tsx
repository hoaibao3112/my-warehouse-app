"use client"

import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Plus, Search, Eye, X, Hammer } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { mobileFetch } from "@/lib/mobile/api-client"

interface DetailItem {
    id: string
    productId: string
    product: string
    quantity: string
    unitId?: string
    price?: number
}

export default function StoreToolsTransfersPage() {
    const [transfers, setTransfers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [viewOpen, setViewOpen] = useState(false)
    const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [mainWarehouse, setMainWarehouse] = useState<any | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [toolsCategoryId, setToolsCategoryId] = useState<string>("")
    const [details, setDetails] = useState<DetailItem[]>([])
    const [creating, setCreating] = useState(false)
    const [searchTerm, setSearchTerm] = useState<string>("")
    const [receivedQuantities, setReceivedQuantities] = useState<{ [key: string]: number }>({})
    const [approvedQuantities, setApprovedQuantities] = useState<{ [key: string]: number }>({})
    const [confirming, setConfirming] = useState(false)
    const { user } = useAuth()

    // Get tools category on mount
    useEffect(() => {
        const fetchToolsCategory = async () => {
            try {
                const res = await mobileFetch('/api/categories')
                const json = await res.json()
                if (json?.success && Array.isArray(json.data)) {
                    const toolsCat = json.data.find((cat: any) =>
                        cat.name?.toLowerCase().includes('công cụ') ||
                        cat.name?.toLowerCase().includes('dụng cụ')
                    )
                    if (toolsCat) {
                        setToolsCategoryId(toolsCat.id)
                    }
                }
            } catch (err) {
                console.error('Failed to fetch tools category:', err)
                toast.error("Không thể tải danh mục công cụ")
            }
        }
        fetchToolsCategory()
    }, [])

    // Memoized fetch function để tránh infinite loop trong useAutoRefresh
    const fetchTransfers = useCallback(async () => {
        if (!toolsCategoryId) return

        setError(null)
        try {
            const res = await mobileFetch(`/api/stock-transfer-requests?page=1&pageSize=100&categoryId=${toolsCategoryId}`)
            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
            setTransfers(json.data || [])
        } catch (err: any) {
            setError(err?.message || String(err))
        }
    }, [toolsCategoryId])

    // Load transfers list on mount
    useEffect(() => {
        if (!toolsCategoryId) return
        setLoading(true)
        fetchTransfers().finally(() => setLoading(false))
    }, [fetchTransfers, toolsCategoryId])

    // Load main warehouse and tools products when create dialog opens
    useEffect(() => {
        if (!createOpen || !toolsCategoryId) return

        let mounted = true

        const fetchData = async () => {
            try {
                // Fetch main warehouse
                const whRes = await mobileFetch(`/api/warehouses?type=MAIN&page=1&pageSize=10`)
                const whJson = await whRes.json()
                if (mounted && whJson.data && whJson.data.length > 0) {
                    setMainWarehouse(whJson.data[0])
                }

                // Fetch tools products
                const prodRes = await mobileFetch(`/api/products?page=1&pageSize=1000&categoryId=${toolsCategoryId}`)
                const prodJson = await prodRes.json()
                if (mounted && prodJson?.success) {
                    const prods = (prodJson.data || []).filter((p: any) => !p.code?.startsWith('RECIPE-'))
                    setProducts(prods)
                }
            } catch (err) {
                console.error("Error loading data:", err)
                toast.error("Không thể tải dữ liệu phiếu nhập công cụ")
            }
        }

        fetchData()
        setDetails([{ id: "1", productId: "", product: "", quantity: "", unitId: "" }])
        return () => {
            mounted = false
        }
    }, [createOpen, toolsCategoryId])

    const formatDate = (value: any) => {
        try {
            const d = new Date(value)
            if (isNaN(d.getTime())) return "-"
            return d.toLocaleString("vi-VN")
        } catch {
            return "-"
        }
    }

    const handleAddDetail = () => {
        const newId = String(Math.max(...details.map((d) => Number(d.id)), 0) + 1)
        setDetails([...details, { id: newId, productId: "", product: "", quantity: "", unitId: "" }])
    }

    const handleRemoveDetail = (id: string) => {
        if (details.length > 1) {
            setDetails(details.filter((item) => item.id !== id))
        }
    }

    const handleSelectProduct = (itemId: string, product: any) => {
        setDetails(prevDetails =>
            prevDetails.map(item =>
                item.id === itemId
                    ? {
                        ...item,
                        product: product.name,
                        productId: product.id,
                        unitId: product.unit_id,
                        price: product.price ? Number(product.price) : 0
                    }
                    : item
            )
        )
    }

    const handleItemChange = (id: string, field: keyof DetailItem, value: string) => {
        setDetails(details.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
    }

    const handleCreateTransfer = async () => {
        if (!mainWarehouse || !user?.warehouseId) {
            toast.error("Không thể tạo yêu cầu: thông tin warehouse không đầy đủ")
            return
        }

        // Validate details
        const validDetails = details.filter(d => d.productId && d.quantity && Number(d.quantity) > 0)
        if (validDetails.length === 0) {
            toast.error("Vui lòng chọn ít nhất một công cụ với số lượng > 0")
            return
        }

        try {
            setCreating(true)

            // Determine if this should require approval based on user role
            // Managers can bypass approval by setting requiresApproval: false
            // Staff always requires approval (requiresApproval: true or undefined)
            const isManager = user && user.role === "WAREHOUSE_MANAGER"

            const res = await mobileFetch(`/api/stock-transfer-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fromWarehouseId: mainWarehouse.id,
                    requiresApproval: !isManager, // Staff: true, Manager: false (unless they want approval)
                    details: validDetails.map(d => ({
                        productId: d.productId,
                        // Send original quantity, not converted
                        requestedQuantity: Number(d.quantity),
                        unitId: d.unitId || null
                    })),
                }),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to create')

            // Success
            setCreateOpen(false)
            setDetails([])

            // Show appropriate message based on user role
            if (isManager) {
                toast.success("Đã tạo phiếu nhập công cụ (không cần duyệt)")
            } else {
                toast.success("Đã tạo yêu cầu nhập công cụ (chờ quản lý duyệt)")
            }

            // Refresh transfer list
            fetchTransfers()
        } catch (err: any) {
            toast.error("Lỗi tạo phiếu nhập công cụ", {
                description: err?.message || String(err)
            })
        } finally {
            setCreating(false)
        }
    }

    const handleManagerApprove = async () => {
        if (!selectedTransfer?.id) return
        setConfirming(true)
        try {
            // For tools transfers, manager approval means direct approval without modification
            const items = (selectedTransfer.items || selectedTransfer.itemsList || []).map((item: any) => ({
                itemId: item.id,
                approvedQuantity: item.quantity || item.requested_quantity || 0,
            }))

            const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/manager-confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
                credentials: 'include',
            })

            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi duyệt yêu cầu")

            toast.success("Duyệt yêu cầu thành công")
            setViewOpen(false)
            setSelectedTransfer(null)
            // Refresh list
            fetchTransfers()
        } catch (err: any) {
            toast.error("Lỗi duyệt yêu cầu", { description: err?.message || String(err) })
        } finally {
            setConfirming(false)
        }
    }

    const handleConfirmReceived = async () => {
        if (!selectedTransfer?.id) return
        setConfirming(true)
        try {
            const items = (selectedTransfer.items || selectedTransfer.itemsList || []).map((item: any) => ({
                itemId: item.id,
                actualReceivedQuantity: receivedQuantities[item.id] || 0,
            }))

            const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/sign-store`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
                credentials: 'include',
            })

            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi xác nhận")

            toast.success(json.message || "Xác nhận thành công")
            setViewOpen(false)
            setReceivedQuantities({})
            // Refresh list
            fetchTransfers()
        } catch (err: any) {
            toast.error("Lỗi xác nhận", { description: err?.message || String(err) })
        } finally {
            setConfirming(false)
        }
    }

    // Filter transfers by search term
    const filteredTransfers = transfers.filter((t) => {
        if (!searchTerm) return true
        const searchLower = searchTerm.toLowerCase()
        return (
            t.transfer_number?.toLowerCase().includes(searchLower) ||
            (t.itemsList && t.itemsList.some((item: any) =>
                item.product_name?.toLowerCase().includes(searchLower) ||
                item.product_code?.toLowerCase().includes(searchLower)
            ))
        )
    })

    if (!toolsCategoryId) {
        return (
            <div className="p-8">
                <Card className="p-6 bg-yellow-50 border-yellow-200">
                    <p className="text-sm text-yellow-800">Chưa tìm thấy danh mục Công Cụ Dụng Cụ. Vui lòng liên hệ quản trị viên.</p>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Hammer}
                title="Nhập Công Cụ"
                subtitle="Yêu cầu nhập công cụ dụng cụ"
            />

            <div className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="hidden md:block">
                        <h1 className="text-3xl font-bold text-foreground">Nhập Công Cụ</h1>
                        <p className="text-muted-foreground mt-2">Tạo và quản lý yêu cầu nhập công cụ dụng cụ từ Kho Tổng</p>
                    </div>
                    <Button className="gap-2 w-full md:w-auto" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Tạo Phiếu Nhập Công Cụ
                    </Button>
                </div>

                <Card className="p-6">
                    <div className="mb-6 flex gap-4 items-center">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Tìm kiếm mã yêu cầu hoặc tên công cụ..."
                                className="pl-10"
                            />
                        </div>
                        <Button variant="ghost" onClick={() => setSearchTerm('')}>Xóa</Button>
                    </div>

                    <div className="overflow-x-auto">
                        {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải yêu cầu chuyển công cụ...</p>}
                        {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}
                        {!loading && !error && filteredTransfers.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">Chưa có yêu cầu chuyển công cụ</p>
                        )}
                        {filteredTransfers.length > 0 && (
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-3 px-4 font-semibold text-foreground">Mã Yêu Cầu</th>
                                        <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                                        <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày Tạo</th>
                                        <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransfers.map((transfer) => (
                                        <tr key={transfer.id} className="border-b border-border hover:bg-muted/50">
                                            <td className="py-3 px-4 font-medium text-foreground">{transfer.transfer_number}</td>
                                            <td className="py-3 px-4">
                                                <Badge className={getStatusColor(transfer.status)}>
                                                    {getStatusLabel(transfer.status)}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-sm">{formatDate(transfer.created_at)}</td>
                                            <td className="py-3 px-4">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                                                    onClick={async () => {
                                                        try {
                                                            setViewOpen(true)
                                                            // Fetch the stock-transfer-request detail (includes product names and prices)
                                                            const res = await mobileFetch(`/api/stock-transfer-requests/${transfer.id}`)
                                                            const json = await res.json()
                                                            const data = json?.data || transfer
                                                            // Ensure itemsList is set properly
                                                            if (data && !data.itemsList && data.items) {
                                                                data.itemsList = data.items
                                                            }
                                                            setSelectedTransfer(data)
                                                            // Initialize received quantities with approved quantities
                                                            const initial: { [key: string]: number } = {}
                                                            const approvedInitial: { [key: string]: number } = {}
                                                            const itemsToProcess = data.itemsList || data.items || []
                                                            itemsToProcess.forEach((item: any) => {
                                                                let defaultReceived = 0
                                                                if (data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                                                    defaultReceived = item.admin_approved_quantity ?? item.quantity ?? item.requested_quantity ?? 0
                                                                } else {
                                                                    defaultReceived = item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0
                                                                }
                                                                initial[item.id] = defaultReceived
                                                                approvedInitial[item.id] = item.quantity || item.requested_quantity || 0
                                                            })
                                                            setReceivedQuantities(initial)
                                                            setApprovedQuantities(approvedInitial)
                                                        } catch (err) {
                                                            console.error('Error fetching transfer details:', err)
                                                            toast.error("Không thể tải chi tiết phiếu nhập công cụ")
                                                            setSelectedTransfer(transfer)
                                                        }
                                                    }}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Card>

                {/* Create Dialog */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
                        <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                            <DialogTitle>Tạo Phiếu Nhập Công Cụ Mới</DialogTitle>
                            <DialogDescription>
                                {user && user.role === "WAREHOUSE_MANAGER"
                                    ? "Tạo phiếu nhập công cụ từ kho Tổng xuống kho con (không cần duyệt)"
                                    : "Tạo yêu cầu nhập công cụ từ kho Tổng xuống kho con (chờ quản lý duyệt)"}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
                            {mainWarehouse && (
                                <div>
                                    <Label className="text-sm font-medium">Kho Tổng</Label>
                                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 mt-1">
                                        <strong>{mainWarehouse.name}</strong> ({mainWarehouse.code})
                                    </div>
                                </div>
                            )}

                            <div>
                                <Label className="text-sm font-medium mb-3 block">Chi tiết Công Cụ</Label>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                    {details.map((item, idx) => (
                                        <div key={item.id} className="flex gap-2 items-end">
                                            <div className="flex-1 space-y-2">
                                                <Label className="text-xs text-muted-foreground">Chọn Công Cụ</Label>
                                                <Select value={item.productId} onValueChange={(val) => {
                                                    const prod = products.find(p => p.id === val)
                                                    if (prod) handleSelectProduct(item.id, prod)
                                                }}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Chọn công cụ..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {products.map((prod) => (
                                                            <SelectItem key={prod.id} value={prod.id}>
                                                                {prod.code} - {prod.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-24 space-y-2">
                                                <Label className="text-xs text-muted-foreground">Số Lượng</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="w-32 space-y-2">
                                                <Label className="text-xs text-muted-foreground">Đơn Vị</Label>
                                                <div className="px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground text-sm h-10 flex items-center">
                                                    {item.unitId ? products.find(p => p.id === item.productId)?.unit_name || '-' : '-'}
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleRemoveDetail(item.id)}
                                                disabled={details.length === 1}
                                                className="text-red-600 hover:bg-red-50"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddDetail}
                                    className="mt-3 w-full"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Thêm Công Cụ
                                </Button>
                            </div>

                            {/* Total Amount Section */}
                            {details.length > 0 && details.some(d => d.productId && d.quantity) && (
                                <div className="border-t pt-4 mt-2">
                                    <div className="flex justify-end items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                                            <div className="text-2xl font-bold text-primary">
                                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                                    details.reduce((sum, item) => {
                                                        if (item.productId && item.quantity && item.price) {
                                                            return sum + (Number(item.quantity) * item.price)
                                                        }
                                                        return sum
                                                    }, 0)
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div></div>

                        <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                            <DialogClose asChild>
                                <Button variant="ghost">Hủy</Button>
                            </DialogClose>
                            <Button
                                onClick={handleCreateTransfer}
                                disabled={creating}
                            >
                                {creating ? 'Đang tạo...' : 'Tạo Yêu Cầu'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* View Dialog */}
                <Dialog open={viewOpen} onOpenChange={(open) => {
                    if (!open) {
                        setSelectedTransfer(null)
                        setReceivedQuantities({})
                        setApprovedQuantities({})
                    }
                    setViewOpen(open)
                }}>
                    <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
                        <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                            <DialogTitle>Chi tiết Yêu Cầu Chuyển Công Cụ</DialogTitle>
                            <DialogDescription>Xem chi tiết yêu cầu chuyển công cụ dụng cụ</DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
                            {selectedTransfer && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4 border-b pb-4">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Mã Yêu Cầu</p>
                                            <p className="font-semibold">{selectedTransfer.transfer_number}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Trạng Thái</p>
                                            <Badge className={getStatusColor(selectedTransfer.status)}>
                                                {getStatusLabel(selectedTransfer.status)}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Ngày Tạo</p>
                                            <p className="font-semibold">{formatDate(selectedTransfer.created_at)}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-semibold mb-3">Chi tiết Công Cụ</h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b">
                                                        <th className="text-left py-2 px-3 font-medium">Sản phẩm</th>
                                                        <th className="text-center py-2 px-3 font-medium">Yêu cầu</th>
                                                        <th className="text-center py-2 px-3 font-medium">Đơn giá</th>
                                                        <th className="text-center py-2 px-3 font-medium">
                                                            {(selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && !selectedTransfer.approved_by && user && user.role === "WAREHOUSE_MANAGER") ||
                                                                (selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && user.role === "ADMIN")
                                                                ? 'Duyệt (có thể chỉnh sửa)'
                                                                : 'Kho Tổng duyệt'}
                                                        </th>
                                                        {(selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO || selectedTransfer.status === 'HOAN_THANH') && (
                                                            <th className="text-center py-2 px-3 font-medium">
                                                                {selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO
                                                                    ? 'Nhận Thực Tế (mặc định = Đã duyệt)'
                                                                    : 'Nhận Thực Tế'}
                                                            </th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(selectedTransfer.itemsList || selectedTransfer.items || []).map((item: any) => {
                                                        const requestedQty = selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET
                                                            ? (item.quantity ?? item.requested_quantity ?? item.qty)
                                                            : (item.received_quantity ?? item.quantity ?? item.requested_quantity ?? item.qty)
                                                        const approvedQty = item.admin_approved_quantity ?? item.received_quantity ?? item.approved_quantity ?? '-'
                                                        const unitCode = item.unit_code ?? item.unit_name ?? item.unitCode ?? ''
                                                        const price = Number(item.price ?? item.product_price ?? 0)

                                                        return (
                                                            <tr key={item.id} className="border-b hover:bg-muted/50">
                                                                <td className="py-2 px-3">{item.product_name ?? item.productName ?? item.productId}</td>
                                                                <td className="py-2 px-3 text-center">
                                                                    <div>{requestedQty} {unitCode}</div>
                                                                </td>
                                                                <td className="py-2 px-3 text-center font-semibold">
                                                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)}
                                                                </td>
                                                                <td className="py-2 px-3 text-center">
                                                                    {((selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && !selectedTransfer.approved_by && user && user.role === "WAREHOUSE_MANAGER") ||
                                                                        (selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && user.role === "ADMIN")) ? (
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            value={approvedQuantities[item.id] ?? (approvedQty !== '-' ? approvedQty : 0)}
                                                                            onChange={(e) => {
                                                                                const cleanValue = Number(String(e.target.value).replace(/^0+(?=\d)/, '') || '0') || 0
                                                                                setApprovedQuantities({
                                                                                    ...approvedQuantities,
                                                                                    [item.id]: cleanValue,
                                                                                })
                                                                            }}
                                                                            className="w-20 mx-auto text-center text-sm"
                                                                            disabled={confirming}
                                                                        />
                                                                    ) : (
                                                                        approvedQty !== '-' ? `${approvedQty} ${item.approved_unit_code || unitCode}` : '-'
                                                                    )}
                                                                </td>
                                                                {(selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO || selectedTransfer.status === 'HOAN_THANH') && (
                                                                    <td className="py-2 px-3 text-center">
                                                                        {selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO ? (
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                <Input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    value={receivedQuantities[item.id] ?? 0}
                                                                                    onChange={(e) => {
                                                                                        const cleanValue = Number(String(e.target.value).replace(/^0+(?=\d)/, '') || '0') || 0
                                                                                        setReceivedQuantities({
                                                                                            ...receivedQuantities,
                                                                                            [item.id]: cleanValue,
                                                                                        })
                                                                                    }}
                                                                                    className="w-16 text-center text-sm"
                                                                                    disabled={confirming}
                                                                                />
                                                                                <span className="text-xs text-muted-foreground">{item.approved_unit_code || unitCode}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="font-semibold text-green-600">{item.actual_received_quantity ?? 0} {item.approved_unit_code || unitCode}</span>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Total section */}
                                        {(selectedTransfer.itemsList || selectedTransfer.items || []).length > 0 && (
                                            <div className="flex justify-end mt-4 pt-4 border-t">
                                                <div className="text-right">
                                                    <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                                                    <div className="text-2xl font-bold text-primary">
                                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                                            (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                                                const price = Number(item.price ?? item.product_price ?? 0)
                                                                let displayQty = 0

                                                                if ((selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && !selectedTransfer.approved_by && user && user.role === "WAREHOUSE_MANAGER") ||
                                                                    (selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && user.role === "ADMIN")) {
                                                                    displayQty = approvedQuantities[item.id] ?? Number(item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                                                } else if (selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                                                    displayQty = receivedQuantities[item.id] ?? Number(item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                                                } else if (selectedTransfer.status === 'HOAN_THANH') {
                                                                    displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? 0)
                                                                } else {
                                                                    displayQty = Number(item.quantity ?? item.requested_quantity ?? 0)
                                                                }

                                                                return sum + (displayQty * price)
                                                            }, 0)
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div></div>

                        <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                            {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && user && !selectedTransfer.approved_by && user.role === "WAREHOUSE_MANAGER" && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={handleManagerApprove}
                                    disabled={confirming}
                                >
                                    {confirming ? "Đang duyệt..." : "Duyệt Yêu Cầu"}
                                </Button>
                            )}
                            {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={handleConfirmReceived}
                                    disabled={confirming}
                                >
                                    {confirming ? "Đang xác nhận..." : "Xác Nhận Hoàn Thành"}
                                </Button>
                            )}
                            <DialogClose asChild>
                                <Button variant="ghost">Đóng</Button>
                            </DialogClose>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
