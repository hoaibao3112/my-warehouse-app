"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Eye, Trash2, Edit, Truck, Loader2 } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { formatVietnamDate } from "@/lib/timezone"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/use-auth"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"
import { useDebouncedCallback } from "@/hooks/use-debounce"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function StoreSupplierIntakePage() {
    const { user, loading: authLoading } = useAuth()
    const [storeWarehouse, setStoreWarehouse] = useState<any | null>(null)
    const [loading, setLoading] = useState(false)
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [supplierProducts, setSupplierProducts] = useState<any[]>([])
    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
    const [productQuantities, setProductQuantities] = useState<Map<string, { quantity: string; unitId: string; convertedQuantity?: number; defaultUnitId?: string }>>(new Map())
    const [productUnitsMap, setProductUnitsMap] = useState<Map<string, any[]>>(new Map())
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
    const [createPOOpen, setCreatePOOpen] = useState(false)
    const [editPOOpen, setEditPOOpen] = useState(false)
    const [viewPOOpen, setViewPOOpen] = useState(false)
    const [selectedPO, setSelectedPO] = useState<any | null>(null)
    const [editingPO, setEditingPO] = useState<any | null>(null)
    const [creatingPO, setCreatingPO] = useState(false)
    const [isEditMode, setIsEditMode] = useState(false)
    const [completedInventoryCheck, setCompletedInventoryCheck] = useState<any | null>(null)
    const [loadingPO, setLoadingPO] = useState(false)

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean
        title: string
        description: string
        onConfirm: () => void
    }>({ open: false, title: '', description: '', onConfirm: () => { } })

    useEffect(() => {
        // Wait for auth to complete before loading data
        if (!authLoading && user?.warehouseId) {
            loadData()
        }
    }, [authLoading, user?.warehouseId])

    const loadData = async () => {
        if (!user?.warehouseId) {
            return
        }

        try {
            setLoading(true)

            // Load store warehouse info using user's warehouse ID
            const whRes = await mobileFetch(`/api/warehouses/${user.warehouseId}`)
            const whJson = await whRes.json()
            if (whJson?.success && whJson.data) {
                setStoreWarehouse(whJson.data)

                // Load purchase orders for this warehouse
                const poRes = await mobileFetch(`/api/purchase-orders-detail?page=1&pageSize=100&warehouseId=${user.warehouseId}`)
                const poJson = await poRes.json()
                if (poJson?.success) {
                    setPurchaseOrders(poJson.data || [])
                }

                // Load latest completed inventory check for this warehouse
                const checkRes = await mobileFetch(`/api/inventory-checks?warehouseId=${user.warehouseId}`)
                const checkJson = await checkRes.json()
                if (checkJson?.success && checkJson.data) {
                    const completedChecks = checkJson.data.filter((c: any) => c.status === 'COMPLETED')
                    if (completedChecks.length > 0) {
                        completedChecks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        setCompletedInventoryCheck(completedChecks[0])
                    }
                }
            }

            // Load suppliers
            const supplierRes = await mobileFetch('/api/suppliers')
            const supplierJson = await supplierRes.json()
            if (supplierJson?.success) {
                setSuppliers(supplierJson.data || [])
            }
        } catch (error) {
            console.error("Error loading data:", error)
            toast.error("Lỗi tải dữ liệu")
        } finally {
            setLoading(false)
        }
    }

    // Helper function to check if a purchase order is locked
    // PO is locked if it was created BEFORE the latest completed inventory check
    const isPOLocked = (poDate: string): boolean => {
        if (!completedInventoryCheck) return false

        // Use updatedAt (when check was completed) or fallback to createdAt
        const checkCompletedDate = completedInventoryCheck.updatedAt || completedInventoryCheck.createdAt
        if (!checkCompletedDate) return false

        const poTime = new Date(poDate).getTime()
        const checkTime = new Date(checkCompletedDate).getTime()

        // Lock if PO was created before the check was completed
        return poTime < checkTime
    }

    // Load supplier products when supplier changes
    useEffect(() => {
        if (!selectedSupplier) {
            setSupplierProducts([])
            if (!isEditMode) {
                setSelectedProducts(new Set())
            }
            setProductUnitsMap(new Map())
            return
        }

        const loadSupplierProducts = async () => {
            try {
                const res = await mobileFetch(`/api/suppliers/${selectedSupplier}`)
                const json = await res.json()
                if (json?.success) {
                    const products = json.data?.products || []
                    setSupplierProducts(products)

                    if (!isEditMode) {
                        setSelectedProducts(new Set(products.map((p: any) => p.product_id) || []))
                    }

                    // Fetch units for ALL products in ONE batch request
                    const unitsMap = new Map()
                    const productIds = products.map((p: any) => p.product_id)

                    if (productIds.length > 0) {
                        try {
                            const batchRes = await mobileFetch('/api/products/batch-units', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ productIds })
                            })
                            const batchJson = await batchRes.json()

                            if (batchRes.ok && batchJson?.success) {
                                const batchData = batchJson.data || {}

                                for (const product of products) {
                                    const productId = product.product_id
                                    const productUnitsData = batchData[productId]

                                    if (productUnitsData) {
                                        const { units: unitsList, defaultUnitId } = productUnitsData

                                        // Priority: 1. Supplier's configured unit, 2. Product's default unit, 3. First available unit
                                        const supplierUnitId = product.unitId || product.unit_id // From supplier_products join
                                        const foundSupplierUnit = supplierUnitId ? unitsList.find((u: any) => u.id === supplierUnitId) : null

                                        // If supplier has a specific unit configured, RESTRICT the list to ONLY that unit
                                        if (foundSupplierUnit) {
                                            unitsMap.set(productId, [foundSupplierUnit])
                                        } else {
                                            // Otherwise allow all convertible units
                                            const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)
                                            unitsMap.set(productId, convertibleUnits.length > 0 ? convertibleUnits : unitsList)
                                        }

                                        if (defaultUnitId || unitsList.length > 0) {
                                            const preferredUnitId = foundSupplierUnit ? supplierUnitId : (defaultUnitId || unitsList[0]?.id)
                                            setProductQuantities(prev => {
                                                const newMap = new Map(prev)
                                                const existing = newMap.get(productId)
                                                const finalUnitId = (isEditMode && existing?.unitId) ? existing.unitId : preferredUnitId
                                                newMap.set(productId, {
                                                    quantity: existing?.quantity || "",
                                                    unitId: finalUnitId,
                                                    defaultUnitId: preferredUnitId,
                                                })
                                                return newMap
                                            })
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('Failed to fetch batch units:', err)
                            toast.error("Không thể tải đơn vị quy đổi sản phẩm")
                            // Silently fail - units will be empty for products
                        }
                    }
                    setProductUnitsMap(unitsMap)
                }
            } catch (err: any) {
                toast.error("Lỗi tải sản phẩm", { description: err?.message })
            }
        }

        loadSupplierProducts()
    }, [selectedSupplier, isEditMode])

    const handleCreatePO = async () => {
        if (!selectedSupplier || selectedProducts.size === 0) {
            toast.error("Vui lòng chọn nhà cung cấp và sản phẩm")
            return
        }

        if (!user?.warehouseId) {
            toast.error("Không thể xác định kho của bạn")
            return
        }

        // Validate all products have quantities
        for (const productId of selectedProducts) {
            const qty = productQuantities.get(productId)
            if (!qty || !qty.quantity || Number(qty.quantity) <= 0) {
                toast.error("Vui lòng nhập số lượng hợp lệ cho tất cả sản phẩm")
                return
            }
        }

        setCreatingPO(true)
        try {
            const items = supplierProducts
                .filter((p: any) => selectedProducts.has(p.product_id))
                .map((p: any) => {
                    const qty = productQuantities.get(p.product_id)
                    return {
                        productId: p.product_id,
                        quantity: Number(qty?.quantity || 1),
                        unitId: qty?.unitId,
                        convertedQuantity: qty?.convertedQuantity,
                    }
                })

            const res = await fetchWithRateLimit(`/api/purchase-orders-detail`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supplierId: selectedSupplier,
                    warehouseId: user.warehouseId,
                    items,
                }),
            })

            const json = await res.json()

            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi tạo phiếu")
            }
            toast.success("Phiếu nhập hàng đã được tạo và cộng vào tồn kho")
            setCreatePOOpen(false)
            setSelectedSupplier(null)
            setSelectedProducts(new Set())
            setProductQuantities(new Map())
            loadData()
        } catch (err: any) {
            toast.error("Lỗi tạo phiếu", { description: err?.message })
        } finally {
            setCreatingPO(false)
        }
    }

    const handleUpdatePO = async () => {
        if (!editingPO || !selectedSupplier || selectedProducts.size === 0) {
            toast.error("Vui lòng chọn nhà cung cấp và sản phẩm")
            return
        }

        for (const productId of selectedProducts) {
            const qty = productQuantities.get(productId)
            if (!qty || !qty.quantity || Number(qty.quantity) <= 0) {
                toast.error("Vui lòng nhập số lượng hợp lệ cho tất cả sản phẩm")
                return
            }
        }

        setCreatingPO(true)
        try {
            const items = Array.from(selectedProducts).map((productId) => {
                const qty = productQuantities.get(productId)
                return {
                    productId,
                    quantity: Number(qty?.quantity || 0),
                    unitId: qty?.unitId || null,
                }
            }).filter(item => item.quantity > 0)

            if (items.length === 0) {
                toast.error("Vui lòng nhập số lượng cho ít nhất một sản phẩm")
                return
            }

            const res = await fetchWithRateLimit(`/api/purchase-orders-detail/${editingPO.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supplierId: selectedSupplier,
                    warehouseId: user?.warehouseId,
                    items,
                }),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi cập nhật phiếu")
            }

            toast.success("Đã cập nhật phiếu nhập")
            setEditPOOpen(false)
            setIsEditMode(false)
            setEditingPO(null)
            setSelectedSupplier(null)
            setSelectedProducts(new Set())
            setProductQuantities(new Map())
            loadData()
        } catch (err: any) {
            toast.error("Lỗi cập nhật phiếu", { description: err?.message })
        } finally {
            setCreatingPO(false)
        }
    }

    // Show loading skeleton while auth or data is loading
    if (authLoading) {
        return (
            <div className="min-h-screen bg-background">
                <MobilePageHeader
                    icon={Truck}
                    title="Nhập Hàng NCC"
                    subtitle="Nhập hàng từ nhà cung cấp"
                />
                <div className="p-4 md:p-8 space-y-4">
                    <Skeleton className="h-10 w-40 ml-auto" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        )
    }

    // Show error if no warehouse assigned
    if (!user?.warehouseId) {
        return (
            <div className="min-h-screen bg-background">
                <MobilePageHeader
                    icon={Truck}
                    title="Nhập Hàng NCC"
                    subtitle="Nhập hàng từ nhà cung cấp"
                />
                <div className="p-4 md:p-8">
                    <Card className="p-6">
                        <div className="text-center text-muted-foreground">
                            <p>Không thể xác định kho của bạn.</p>
                            <p className="text-sm mt-2">Vui lòng liên hệ quản trị viên để được phân công kho.</p>
                        </div>
                    </Card>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background pb-20 md:pb-0">
            <MobilePageHeader
                icon={Truck}
                title="Nhập Hàng NCC"
                subtitle="Nhập hàng từ nhà cung cấp"
            />

            <div className="p-4 md:p-8 space-y-4 md:space-y-6">
                {/* Header - Desktop only */}
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold">Nhập Hàng Từ Nhà Cung Cấp</h1>
                    <p className="text-muted-foreground mt-1">
                        Nhập hàng trực tiếp từ nhà cung cấp vào kho {storeWarehouse?.name || 'Store'}
                    </p>
                </div>

                {/* Inventory Check Notice */}
                {completedInventoryCheck && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                            <span className="font-semibold">🔒 Lưu ý:</span> Các phiếu nhập hàng tạo trước ngày{" "}
                            <span className="font-bold">
                                {formatVietnamDate(completedInventoryCheck.updatedAt || completedInventoryCheck.createdAt)}
                            </span>{" "}
                            đã bị khóa do kiểm kê{" "}
                            <span className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                                {completedInventoryCheck.number}
                            </span>{" "}
                            đã hoàn thành. Chỉ có thể sửa/xóa các phiếu tạo sau thời điểm này.
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end">
                    <Button onClick={() => setCreatePOOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Tạo Phiếu Nhập
                    </Button>
                </div>

                {/* Purchase Orders Table */}
                <Card className="p-4 md:p-6">
                    <ResponsiveTable
                        data={purchaseOrders}
                        columns={[
                            {
                                key: 'po_number',
                                label: 'Mã Phiếu',
                                render: (order) => <span className="font-medium">{order.po_number}</span>,
                                mobilePrimary: true,
                            },
                            {
                                key: 'supplier_name',
                                label: 'Nhà Cung Cấp',
                                render: (order) => <span>{order.supplier_name || "-"}</span>,
                            },
                            {
                                key: 'warehouse_name',
                                label: 'Kho',
                                render: (order) => <span>{order.warehouse_name || "-"}</span>,
                            },
                            {
                                key: 'total_amount',
                                label: 'Tổng Tiền',
                                render: (order) => <span>{Number(order.total_amount || 0).toLocaleString("vi-VN")} ₫</span>,
                                align: 'right',
                                mobilePrimary: true,
                            },
                            {
                                key: 'created_at',
                                label: 'Ngày Tạo',
                                render: (order) => <span className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleString("vi-VN")}</span>,
                                align: 'center',
                            },
                        ]}
                        actions={[
                            {
                                label: 'Xem',
                                icon: <Eye className="w-4 h-4" />,
                                onClick: async (order) => {
                                    try {
                                        const res = await mobileFetch(`/api/purchase-orders-detail/${order.id}`)
                                        const json = await res.json()
                                        if (json?.success) {
                                            setSelectedPO(json.data)
                                            setViewPOOpen(true)
                                        }
                                    } catch (err) {
                                        toast.error("Lỗi tải chi tiết")
                                    }
                                },
                                variant: 'ghost',
                            },
                            {
                                label: 'Sửa',
                                icon: <Edit className="w-4 h-4" />,
                                onClick: async (order) => {
                                    try {
                                        setLoadingPO(true)
                                        const res = await fetchWithRateLimit(`/api/purchase-orders-detail/${order.id}`)
                                        const json = await res.json()
                                        if (json?.success) {
                                            setIsEditMode(true)
                                            setEditingPO(json.data)
                                            const productIds = new Set<string>()
                                            const quantities = new Map()
                                            json.data.items?.forEach((item: any) => {
                                                productIds.add(item.product_id)
                                                quantities.set(item.product_id, {
                                                    quantity: String(item.quantity || 0),
                                                    unitId: item.unit_id || "",
                                                })
                                            })
                                            setSelectedProducts(productIds)
                                            setProductQuantities(quantities)
                                            setSelectedSupplier(json.data.supplier_id)
                                            setEditPOOpen(true)
                                        }
                                    } catch (err) {
                                        toast.error("Lỗi tải phiếu để chỉnh sửa")
                                    } finally {
                                        setLoadingPO(false)
                                    }
                                },
                                disabled: (order) => loadingPO || creatingPO || isPOLocked(order.created_at),
                                show: (order) => !isPOLocked(order.created_at),
                                variant: 'ghost',
                            },
                            {
                                label: 'Xóa',
                                icon: <Trash2 className="w-4 h-4" />,
                                onClick: (order) => {
                                    setConfirmDialog({
                                        open: true,
                                        title: "Xác nhận xóa phiếu",
                                        description: "Bạn có chắc muốn xóa phiếu này? Tồn kho sẽ được hoàn tác lại.",
                                        onConfirm: async () => {
                                            setConfirmDialog(prev => ({ ...prev, open: false }))
                                            try {
                                                setLoadingPO(true)
                                                const res = await fetchWithRateLimit(`/api/purchase-orders-detail/${order.id}`, {
                                                    method: "DELETE",
                                                })
                                                const json = await res.json()
                                                if (!res.ok || !json?.success) {
                                                    throw new Error(json?.error || "Lỗi xóa phiếu")
                                                }
                                                toast.success("Đã xóa phiếu và hoàn tác tồn kho")
                                                loadData()
                                            } catch (err: any) {
                                                toast.error("Lỗi xóa phiếu", { description: err?.message })
                                            } finally {
                                                setLoadingPO(false)
                                            }
                                        }
                                    })
                                },
                                disabled: (order) => loadingPO || creatingPO || isPOLocked(order.created_at),
                                show: (order) => !isPOLocked(order.created_at),
                                variant: 'ghost',
                                className: 'text-red-600 hover:text-red-700 hover:bg-red-50'
                            },
                        ]}
                        keyExtractor={(order) => order.id}
                        loading={loading}
                        emptyMessage="Chưa có phiếu nhập hàng nào"
                        mobileCardTitle={(order) => order.po_number}
                        mobileCardBadge={(order) => isPOLocked(order.created_at) ? (
                            <Badge variant="secondary" className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                                Đã khóa
                            </Badge>
                        ) : null}
                        mobileCardMeta={(order) => [
                            <>🏪 {order.supplier_name || "-"}</>,
                            <>📦 {order.warehouse_name || "-"}</>,
                            <>💰 {Number(order.total_amount || 0).toLocaleString("vi-VN")} ₫</>,
                            <>📅 {new Date(order.created_at).toLocaleString("vi-VN")}</>,
                        ]}
                    />
                </Card>
            </div>

            {/* Create Purchase Order Dialog */}
            <Dialog open={createPOOpen} onOpenChange={(open) => {
                setCreatePOOpen(open)
                if (!open) {
                    setSelectedSupplier(null)
                    setSelectedProducts(new Set())
                    setProductQuantities(new Map())
                }
            }}>
                <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                        <DialogTitle>Tạo Phiếu Nhập Mua Hàng</DialogTitle>
                        <DialogDescription>Chọn nhà cung cấp và sản phẩm cần nhập</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto">
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <Label className="text-sm font-medium">Chọn Nhà Cung Cấp *</Label>
                                <Select value={selectedSupplier || ""} onValueChange={setSelectedSupplier}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn nhà cung cấp..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedSupplier && (
                                <div>
                                    <Label className="text-sm font-medium">Chọn Sản Phẩm *</Label>
                                    <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                                        {supplierProducts.length === 0 ? (
                                            <div className="p-4 text-center">
                                                <p className="text-sm text-muted-foreground">Nhà cung cấp này chưa có sản phẩm</p>
                                            </div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted border-b sticky top-0">
                                                    <tr>
                                                        <th className="text-left py-2 px-3 font-semibold">Chọn</th>
                                                        <th className="text-left py-2 px-3 font-semibold">Mã</th>
                                                        <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                                                        <th className="text-right py-2 px-3 font-semibold">Giá</th>
                                                        <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                                                        <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {supplierProducts.map((product) => {
                                                        const isSelected = selectedProducts.has(product.product_id)
                                                        const qty = productQuantities.get(product.product_id) || { quantity: "", unitId: product.unit_id || "", defaultUnitId: product.unit_id || "", convertedQuantity: undefined }
                                                        const productUnits = productUnitsMap.get(product.product_id) || []
                                                        const defaultUnit = productUnits.find((u: any) => u.id === qty.defaultUnitId)
                                                        const hasConversion = qty.convertedQuantity !== undefined && qty.convertedQuantity !== null

                                                        return (
                                                            <tr key={product.id} className={`border-b ${isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'}`}>
                                                                <td className="py-3 px-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={(e) => {
                                                                            const newSet = new Set(selectedProducts)
                                                                            if (e.target.checked) {
                                                                                newSet.add(product.product_id)
                                                                                if (!productQuantities.has(product.product_id)) {
                                                                                    const newQty = new Map(productQuantities)
                                                                                    const defaultUnitId = productUnits[0]?.id || product.unit_id || ""
                                                                                    newQty.set(product.product_id, {
                                                                                        quantity: "",
                                                                                        unitId: defaultUnitId,
                                                                                        defaultUnitId: defaultUnitId
                                                                                    })
                                                                                    setProductQuantities(newQty)
                                                                                }
                                                                            } else {
                                                                                newSet.delete(product.product_id)
                                                                            }
                                                                            setSelectedProducts(newSet)
                                                                        }}
                                                                        className="w-4 h-4"
                                                                    />
                                                                </td>
                                                                <td className="py-3 px-3 text-muted-foreground text-xs font-medium">{product.code}</td>
                                                                <td className="py-3 px-3 font-medium">{product.name}</td>
                                                                <td className="py-3 px-3 text-right">{Number(product.unit_price).toLocaleString("vi-VN")} đ</td>
                                                                <td className="py-3 px-3 text-center">
                                                                    {isSelected ? (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <Input
                                                                                type="number"
                                                                                min="0"
                                                                                step="0.0001"
                                                                                placeholder="0"
                                                                                value={qty.quantity}
                                                                                onChange={(e) => {
                                                                                    const newValue = String(e.target.value).replace(/^0+(?=\d)/, '') || e.target.value
                                                                                    const newQty = new Map(productQuantities)

                                                                                    let convertedQty: number | undefined = undefined
                                                                                    if (newValue && qty.unitId && qty.defaultUnitId && qty.unitId !== qty.defaultUnitId) {
                                                                                        const unitsList = productUnits
                                                                                        const defaultU = unitsList.find((u: any) => u.id === qty.defaultUnitId)
                                                                                        const selectedU = unitsList.find((u: any) => u.id === qty.unitId)

                                                                                        if (defaultU && selectedU && defaultU.multiplier !== null && selectedU.multiplier !== null) {
                                                                                            convertedQty = Number(newValue) * (selectedU.multiplier / defaultU.multiplier)
                                                                                            convertedQty = Math.round(convertedQty * 100) / 100
                                                                                        }
                                                                                    }

                                                                                    newQty.set(product.product_id, {
                                                                                        quantity: newValue,
                                                                                        unitId: qty.unitId,
                                                                                        defaultUnitId: qty.defaultUnitId,
                                                                                        convertedQuantity: convertedQty
                                                                                    })
                                                                                    setProductQuantities(newQty)
                                                                                }}
                                                                                className="text-sm text-center w-20 mx-auto"
                                                                            />
                                                                            {hasConversion && (
                                                                                <span className="text-xs text-muted-foreground">
                                                                                    ≈ {qty.convertedQuantity} {defaultUnit?.code || defaultUnit?.name || ''}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="py-3 px-3 text-center">
                                                                    {isSelected ? (
                                                                        <Select value={qty.unitId || ""} onValueChange={(value) => {
                                                                            const newQty = new Map(productQuantities)

                                                                            let convertedQty: number | undefined = undefined
                                                                            if (qty.quantity && value && qty.defaultUnitId && value !== qty.defaultUnitId) {
                                                                                const unitsList = productUnits
                                                                                const defaultU = unitsList.find((u: any) => u.id === qty.defaultUnitId)
                                                                                const selectedU = unitsList.find((u: any) => u.id === value)

                                                                                if (defaultU && selectedU && defaultU.multiplier !== null && selectedU.multiplier !== null) {
                                                                                    convertedQty = Number(qty.quantity) * (selectedU.multiplier / defaultU.multiplier)
                                                                                    convertedQty = Math.round(convertedQty * 100) / 100
                                                                                }
                                                                            }

                                                                            newQty.set(product.product_id, {
                                                                                quantity: qty.quantity,
                                                                                unitId: value,
                                                                                defaultUnitId: qty.defaultUnitId,
                                                                                convertedQuantity: convertedQty
                                                                            })
                                                                            setProductQuantities(newQty)
                                                                        }}>
                                                                            <SelectTrigger className="w-32 mx-auto text-sm">
                                                                                <SelectValue placeholder="Chọn đơn vị" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {productUnits.map((unit: any) => (
                                                                                    <SelectItem key={unit.id} value={unit.id}>
                                                                                        {unit.code || unit.name} {unit.id === qty.defaultUnitId ? '(mặc định)' : ''}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">-</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Total Amount Section */}
                            {selectedSupplier && selectedProducts.size > 0 && Array.from(selectedProducts).some(prodId => {
                                const qty = productQuantities.get(prodId)
                                return qty && qty.quantity && Number(qty.quantity) > 0
                            }) && (
                                    <div className="border-t pt-4 mt-4">
                                        <div className="flex justify-end items-center gap-4">
                                            <div className="text-right">
                                                <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                                                <div className="text-2xl font-bold text-primary">
                                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                                        Array.from(selectedProducts).reduce((sum, productId) => {
                                                            const qty = productQuantities.get(productId)
                                                            const product = supplierProducts.find((p: any) => p.product_id === productId)

                                                            if (qty && qty.quantity && product && product.unit_price) {
                                                                const effectiveQty = qty.convertedQuantity !== undefined && qty.convertedQuantity !== null
                                                                    ? qty.convertedQuantity
                                                                    : Number(qty.quantity)
                                                                return sum + (effectiveQty * Number(product.unit_price))
                                                            }
                                                            return sum
                                                        }, 0)
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>

                    <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setCreatePOOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={handleCreatePO} disabled={creatingPO || !selectedSupplier || selectedProducts.size === 0}>
                            {creatingPO ? "Đang tạo..." : "Tạo Phiếu"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Purchase Order Dialog */}
            <Dialog open={editPOOpen} onOpenChange={(open) => {
                setEditPOOpen(open)
                if (!open) {
                    setIsEditMode(false)
                    setEditingPO(null)
                    setSelectedSupplier(null)
                    setSelectedProducts(new Set())
                    setProductQuantities(new Map())
                }
            }}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                        <DialogTitle className="text-base sm:text-lg">Chỉnh Sửa Phiếu Nhập Mua Hàng</DialogTitle>
                        <DialogDescription className="text-xs sm:text-sm">Cập nhật thông tin phiếu nhập (Mã: {editingPO?.po_number})</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto">
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <Label className="text-sm font-medium">Chọn Nhà Cung Cấp *</Label>
                                <Select value={selectedSupplier || ""} onValueChange={setSelectedSupplier}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn nhà cung cấp..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedSupplier && isEditMode && editingPO?.items && (
                                <div>
                                    <Label className="text-sm font-medium">Sản Phẩm Đã Chọn *</Label>
                                    <div className="border rounded-lg overflow-hidden">
                                        <div className="overflow-x-auto max-h-96 overflow-y-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted border-b sticky top-0">
                                                    <tr>
                                                        <th className="text-left py-2 px-3 font-semibold">Mã</th>
                                                        <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                                                        <th className="text-right py-2 px-3 font-semibold">Giá</th>
                                                        <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                                                        <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                                                        <th className="text-center py-2 px-3 font-semibold">Xóa</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {editingPO.items
                                                        .filter((item: any) => selectedProducts.has(item.product_id))
                                                        .map((item: any) => {
                                                            const qty = productQuantities.get(item.product_id)
                                                            const productUnits = productUnitsMap.get(item.product_id) || []
                                                            return (
                                                                <tr key={item.product_id} className="border-b last:border-0 hover:bg-muted/30">
                                                                    <td className="py-2 px-3 text-muted-foreground text-xs font-medium">{item.product_code || "-"}</td>
                                                                    <td className="py-2 px-3 font-medium">{item.product_name}</td>
                                                                    <td className="py-2 px-3 text-right">{Number(item.unit_price || 0).toLocaleString("vi-VN")} ₫</td>
                                                                    <td className="py-2 px-3 text-center">
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            step="0.0001"
                                                                            className="w-24 h-8 mx-auto text-sm text-center"
                                                                            placeholder="0"
                                                                            value={qty?.quantity || ""}
                                                                            onChange={(e) => {
                                                                                const cleanValue = String(e.target.value).replace(/^0+(?=\d)/, '') || e.target.value
                                                                                const newMap = new Map(productQuantities)
                                                                                const currentData = newMap.get(item.product_id) || { quantity: "", unitId: "", defaultUnitId: item.unit_id }
                                                                                newMap.set(item.product_id, { ...currentData, quantity: cleanValue })
                                                                                setProductQuantities(newMap)
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td className="py-2 px-3 text-center">
                                                                        {productUnits.length > 0 ? (
                                                                            <Select
                                                                                value={qty?.unitId || ""}
                                                                                onValueChange={(unitId) => {
                                                                                    const newMap = new Map(productQuantities)
                                                                                    const currentData = newMap.get(item.product_id) || { quantity: "", unitId: "", defaultUnitId: item.unit_id }
                                                                                    newMap.set(item.product_id, { ...currentData, unitId })
                                                                                    setProductQuantities(newMap)
                                                                                }}
                                                                            >
                                                                                <SelectTrigger className="w-32 mx-auto text-sm">
                                                                                    <SelectValue placeholder="Chọn đơn vị" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {productUnits.map((unit: any) => (
                                                                                        <SelectItem key={unit.id} value={unit.id}>
                                                                                            {unit.code || unit.name} {unit.id === qty?.defaultUnitId ? '(mặc định)' : ''}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        ) : (
                                                                            <span className="text-muted-foreground">-</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 px-3 text-center">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-8 w-8 p-0"
                                                                            onClick={() => {
                                                                                const newSet = new Set(selectedProducts)
                                                                                newSet.delete(item.product_id)
                                                                                setSelectedProducts(newSet)
                                                                                const newMap = new Map(productQuantities)
                                                                                newMap.delete(item.product_id)
                                                                                setProductQuantities(newMap)
                                                                            }}
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                                        </Button>
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t flex justify-between items-center">
                                        <span className="text-sm font-semibold">Tổng Tiền:</span>
                                        <span className="text-lg font-bold text-primary">
                                            {(() => {
                                                let total = 0
                                                editingPO.items
                                                    .filter((item: any) => selectedProducts.has(item.product_id))
                                                    .forEach((item: any) => {
                                                        const qty = productQuantities.get(item.product_id)
                                                        const quantity = Number(qty?.quantity || 0)
                                                        const unitPrice = Number(item.unit_price || 0)
                                                        total += quantity * unitPrice
                                                    })
                                                return total.toLocaleString("vi-VN") + " ₫"
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex-col sm:flex-row gap-2 flex justify-end">
                        <Button variant="ghost" onClick={() => setEditPOOpen(false)} className="w-full sm:w-auto">
                            Hủy
                        </Button>
                        <Button
                            className="w-full sm:w-auto"
                            onClick={handleUpdatePO}
                            disabled={creatingPO || !selectedSupplier || selectedProducts.size === 0}
                        >
                            {creatingPO ? "Đang cập nhật..." : "Cập Nhật"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Purchase Order Dialog */}
            <Dialog open={viewPOOpen} onOpenChange={setViewPOOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Chi tiết Phiếu Nhập Mua Hàng</DialogTitle>
                    </DialogHeader>

                    {selectedPO ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                                <div>
                                    <p className="text-sm text-muted-foreground">Mã Phiếu</p>
                                    <p className="font-semibold">{selectedPO.po_number}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Ngày Tạo</p>
                                    <p className="font-semibold">{new Date(selectedPO.created_at).toLocaleString("vi-VN")}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Nhà Cung Cấp</p>
                                    <p className="font-semibold">{selectedPO.supplier_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Kho</p>
                                    <p className="font-semibold">{selectedPO.warehouse_name}</p>
                                </div>
                            </div>

                            <div>
                                <Label className="text-base font-semibold mb-3">Danh sách sản phẩm</Label>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted border-b">
                                            <tr>
                                                <th className="text-left py-2 px-3 font-semibold">Mã SP</th>
                                                <th className="text-left py-2 px-3 font-semibold">Tên Sản Phẩm</th>
                                                <th className="text-center py-2 px-3 font-semibold">Số Lượng</th>
                                                <th className="text-center py-2 px-3 font-semibold">Đơn Vị</th>
                                                <th className="text-right py-2 px-3 font-semibold">Đơn Giá</th>
                                                <th className="text-right py-2 px-3 font-semibold">Thành Tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPO.items?.map((item: any) => (
                                                <tr key={item.id} className="border-b last:border-0">
                                                    <td className="py-2 px-3 text-muted-foreground text-xs font-medium">{item.product_code || "-"}</td>
                                                    <td className="py-2 px-3 font-medium">{item.product_name || item.productId}</td>
                                                    <td className="py-2 px-3 text-center">{item.quantity}</td>
                                                    <td className="py-2 px-3 text-center">{item.unit_code || item.unit_name || "-"}</td>
                                                    <td className="py-2 px-3 text-right">{Number(item.unit_price || 0).toLocaleString("vi-VN")} ₫</td>
                                                    <td className="py-2 px-3 text-right font-semibold">{Number(item.line_total || 0).toLocaleString("vi-VN")} ₫</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-muted/50 border-t-2">
                                            <tr>
                                                <td colSpan={5} className="py-2 px-3 text-right font-semibold">Tổng Cộng:</td>
                                                <td className="py-2 px-3 text-right font-bold text-primary">
                                                    {Number(selectedPO.total_amount || 0).toLocaleString("vi-VN")} ₫
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">Đang tải...</p>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setViewPOOpen(false)}>
                            Đóng
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirm Dialog */}
            <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                <DialogContent className="max-w-[340px] rounded-lg">
                    <DialogHeader>
                        <DialogTitle>{confirmDialog.title}</DialogTitle>
                        <DialogDescription>{confirmDialog.description}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
                            Hủy
                        </Button>
                        <Button variant="destructive" onClick={confirmDialog.onConfirm}>
                            Xác nhận
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
