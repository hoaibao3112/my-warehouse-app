"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Plus, Trash2, Package, User, Edit, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
import { translateError } from "@/lib/error-translator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useRouter } from "next/navigation"

export default function CreateExportPage() {
    const router = useRouter()
    const [customers, setCustomers] = useState<any[]>([])
    const [warehouses, setWarehouses] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [creating, setCreating] = useState(false)

    // Customer management state
    const [customerMgmtOpen, setCustomerMgmtOpen] = useState(false)
    const [editingCustomer, setEditingCustomer] = useState<any>(null)
    const [customerForm, setCustomerForm] = useState({ name: "", phone: "", address: "" })
    const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
    const [savingCustomer, setSavingCustomer] = useState(false)

    const [formData, setFormData] = useState({
        warehouseId: "",
        customerId: "",
        notes: "",
    })

    const [items, setItems] = useState<any[]>([])
    const [newCustomer, setNewCustomer] = useState({ name: "", address: "", phone: "", notes: "" })
    const [productSearchMap, setProductSearchMap] = useState<Map<number, string>>(new Map())
    const [productSearchOpenMap, setProductSearchOpenMap] = useState<Map<number, boolean>>(new Map())

    useEffect(() => {
        loadCustomers()
        loadWarehouses()
        loadProducts()
    }, [])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setProductSearchOpenMap(new Map())
        }
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [])

    const loadCustomers = async () => {
        try {
            const res = await mobileFetch(`/api/external-customers?pageSize=999&isActive=true`)
            const json = await res.json()
            if (json?.success) setCustomers(json.data || [])
        } catch (err) {
            console.error("Failed to load customers:", err)
        }
    }

    const loadWarehouses = async () => {
        try {
            const res = await mobileFetch(`/api/warehouses?pageSize=999`)
            const json = await res.json()
            if (json?.success) {
                // Only show MAIN warehouses
                setWarehouses((json.data || []).filter((w: any) => w.type === "MAIN"))
            }
        } catch (err) {
            console.error("Failed to load warehouses:", err)
        }
    }

    const loadProducts = async () => {
        try {
            // Load products WITH unit relations
            const res = await mobileFetch(`/api/products?pageSize=9999&includeUnits=true`)
            const json = await res.json()
            if (json?.success) {
                console.log('[Sales Export] Loaded products:', json.data?.length, 'Sample:', json.data?.[0])
                setProducts(json.data || [])
            }
        } catch (err) {
            console.error("Failed to load products:", err)
        }
    }

    const handleAddItem = () => {
        setItems([...items, { productId: "", quantity: "1", unitId: "", unitPrice: 0 }])
    }

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: value }

        // Auto-select unit when product is selected
        if (field === "productId" && value) {
            const product = products.find((p) => p.id === value)
            if (product) {
                newItems[index].unitId = product.unit_id
                // Auto-set price based on base unit price
                newItems[index].unitPrice = product.price || 0
            }
        }

        // Auto-update price when unit changes
        if (field === "unitId" && value) {
            const product = products.find((p) => p.id === newItems[index].productId)
            if (product) {
                if (value === product.unit_id) {
                    // Base unit selected - use product.price
                    newItems[index].unitPrice = product.price || 0
                } else {
                    // Package unit selected - calculate price per package
                    const pkgUnit = product.product_package_units?.find(
                        (p: any) => p.package_unit_id === value
                    )
                    if (pkgUnit?.base_quantity && product.price) {
                        // Price per package = base_price * base_quantity
                        newItems[index].unitPrice = product.price * pkgUnit.base_quantity
                    } else {
                        newItems[index].unitPrice = 0
                    }
                }
            }
        }

        setItems(newItems)
    }

    const calculateItemTotal = (item: any, product: any) => {
        if (!item.quantity || !item.unitPrice) return 0

        // Simply multiply quantity × unit price
        // The price already accounts for the unit (base or package)
        // No need to multiply by conversion ratio again
        return Number(item.quantity) * item.unitPrice
    }

    const calculateTotal = () => {
        return items.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId)
            return sum + calculateItemTotal(item, product)
        }, 0)
    }

    const handleCreateCustomer = async () => {
        if (!newCustomer.name.trim()) {
            toast.error("Tên khách hàng là bắt buộc")
            return
        }

        setSavingCustomer(true)
        try {
            const res = await mobileFetch(`/api/external-customers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newCustomer),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi tạo khách hàng")
            }

            toast.success("Đã tạo khách hàng mới")
            setFormData({ ...formData, customerId: json.data.id })
            setNewCustomer({ name: "", address: "", phone: "", notes: "" })
            setCustomerDialogOpen(false)
            loadCustomers()
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        } finally {
            setSavingCustomer(false)
        }
    }

    // Customer management handlers
    const handleEditCustomer = (customer: any) => {
        setEditingCustomer(customer)
        setCustomerForm({
            name: customer.name,
            phone: customer.phone || "",
            address: customer.address || "",
        })
        setCustomerMgmtOpen(true)
    }

    const handleDeleteCustomer = async (id: string) => {
        if (!confirm("Bạn có chắc muốn xóa khách hàng này?")) return

        try {
            const res = await mobileFetch(`/api/external-customers/${id}`, { method: "DELETE" })
            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi xóa")

            toast.success("Đã xóa khách hàng")
            loadCustomers()
            if (formData.customerId === id) {
                setFormData({ ...formData, customerId: "" })
            }
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        }
    }

    const handleSaveCustomer = async () => {
        if (!customerForm.name.trim()) {
            toast.error("Tên khách hàng là bắt buộc")
            return
        }

        setSavingCustomer(true)
        try {
            const url = editingCustomer
                ? `/api/external-customers/${editingCustomer.id}`
                : `/api/external-customers`
            const method = editingCustomer ? "PUT" : "POST"

            const res = await mobileFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(customerForm),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi lưu")

            toast.success(editingCustomer ? "Cập nhật thành công" : "Tạo khách hàng thành công")
            setEditingCustomer(null)
            setCustomerForm({ name: "", phone: "", address: "" })
            loadCustomers()
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        } finally {
            setSavingCustomer(false)
        }
    }

    const handleSubmit = async () => {
        // Validation
        if (!formData.warehouseId) {
            toast.error("Vui lòng chọn kho")
            return
        }

        if (!formData.customerId) {
            toast.error("Vui lòng chọn khách hàng")
            return
        }

        if (items.length === 0) {
            toast.error("Vui lòng thêm ít nhất một sản phẩm")
            return
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (!item.productId) {
                toast.error(`Sản phẩm ${i + 1}: Chưa chọn sản phẩm`)
                return
            }
            if (!item.unitId) {
                toast.error(`Sản phẩm ${i + 1}: Chưa chọn đơn vị`)
                return
            }
            if (Number(item.quantity) <= 0) {
                toast.error(`Sản phẩm ${i + 1}: Số lượng phải lớn hơn 0`)
                return
            }
        }

        setCreating(true)
        try {
            const res = await mobileFetch(`/api/external-sales-exports`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    items: items.map(i => ({
                        ...i,
                        quantity: Number(i.quantity)
                    })),
                }),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi tạo phiếu xuất")
            }

            toast.success("Tạo phiếu xuất thành công và đã trừ tồn kho")
            router.push(`/warehouse/external-sales-exports/${json.data.id}`)
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        } finally {
            setCreating(false)
        }
    }

    const getProductUnits = (productId: string) => {
        const product = products.find((p) => p.id === productId)
        if (!product) return []

        // Return base unit + package units if available
        const units = [
            {
                id: product.unit_id,
                name: product.unit?.name || product.unit?.code || "Đơn vị",
                code: product.unit?.code || "",
            },
        ]

        // Add package units if any
        if (product.product_package_units && product.product_package_units.length > 0) {
            product.product_package_units.forEach((pkg: any) => {
                units.push({
                    id: pkg.package_unit_id,
                    name: pkg.package_name || pkg.product_units?.name || "Đơn vị",
                    code: pkg.product_units?.code || "",
                })
            })
        }

        return units
    }

    const handleProductSearch = (index: number, value: string) => {
        const newMap = new Map(productSearchMap)
        newMap.set(index, value)
        setProductSearchMap(newMap)

        // Open dropdown when typing
        if (value.length > 0) {
            const openMap = new Map(productSearchOpenMap)
            openMap.set(index, true)
            setProductSearchOpenMap(openMap)
        }
    }

    const selectProduct = (index: number, productId: string) => {
        const product = products.find(p => p.id === productId)
        if (product) {
            handleItemChange(index, "productId", productId)
            const newMap = new Map(productSearchMap)
            newMap.set(index, product.name)
            setProductSearchMap(newMap)

            const openMap = new Map(productSearchOpenMap)
            openMap.set(index, false)
            setProductSearchOpenMap(openMap)
        }
    }

    const getFilteredProducts = (searchTerm: string) => {
        if (!searchTerm) return products.slice(0, 50)
        const term = searchTerm.toLowerCase()
        return products.filter(p =>
            p.name?.toLowerCase().includes(term) ||
            p.code?.toLowerCase().includes(term)
        ).slice(0, 50)
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Package}
                title="Tạo Phiếu Xuất"
                subtitle="Phiếu xuất bán hàng ra ngoài"
            />

            <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => router.back()}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Quay Lại
                    </Button>
                    <div className="hidden md:block">
                        <h1 className="text-2xl font-bold">Tạo Phiếu Xuất Bán Hàng</h1>
                    </div>
                </div>

                <Card className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Kho Xuất *</Label>
                            <Select value={formData.warehouseId} onValueChange={(v) => setFormData({ ...formData, warehouseId: v })}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="Chọn kho..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {warehouses.map((w) => (
                                        <SelectItem key={w.id} value={w.id}>
                                            {w.name} ({w.code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>Khách Hàng *</Label>
                            <div className="flex gap-2 mt-1">
                                <Select value={formData.customerId} onValueChange={(v) => setFormData({ ...formData, customerId: v })}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Chọn khách hàng..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {customers.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={() => setCustomerDialogOpen(true)}>
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Customer Management Section */}
                    <div>
                        <Collapsible open={customerMgmtOpen} onOpenChange={setCustomerMgmtOpen} className="border rounded-md p-4 bg-gray-50 dark:bg-gray-900/50">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="w-full flex justify-between items-center p-0 h-auto hover:bg-transparent">
                                    <span className="flex items-center gap-2 font-medium">
                                        <User className="w-4 h-4" />
                                        Quản Lý Khách Hàng
                                    </span>
                                    {customerMgmtOpen ? (
                                        <ChevronUp className="w-4 h-4" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4" />
                                    )}
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-4 space-y-4">
                                {/* Customer Form */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <Label className="text-xs">Tên khách hàng *</Label>
                                        <Input
                                            placeholder="Tên khách hàng"
                                            value={customerForm.name}
                                            onChange={(e) =>
                                                setCustomerForm({ ...customerForm, name: e.target.value })
                                            }
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Số điện thoại</Label>
                                        <Input
                                            placeholder="Số điện thoại"
                                            value={customerForm.phone}
                                            onChange={(e) =>
                                                setCustomerForm({ ...customerForm, phone: e.target.value })
                                            }
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Địa chỉ</Label>
                                        <Input
                                            placeholder="Địa chỉ"
                                            value={customerForm.address}
                                            onChange={(e) =>
                                                setCustomerForm({ ...customerForm, address: e.target.value })
                                            }
                                            className="mt-1"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        onClick={handleSaveCustomer}
                                        disabled={savingCustomer}
                                        size="sm"
                                        className="gap-2"
                                    >
                                        {editingCustomer ? (
                                            <Edit className="w-3 h-3" />
                                        ) : (
                                            <Plus className="w-3 h-3" />
                                        )}
                                        {savingCustomer
                                            ? "Đang lưu..."
                                            : editingCustomer
                                                ? "Cập Nhật"
                                                : "Thêm Mới"}
                                    </Button>
                                    {editingCustomer && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setEditingCustomer(null)
                                                setCustomerForm({ name: "", phone: "", address: "" })
                                            }}
                                        >
                                            Hủy
                                        </Button>
                                    )}
                                </div>

                                {/* Customer List */}
                                <div className="border rounded-md divide-y max-h-48 overflow-y-auto bg-background">
                                    {customers.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            Chưa có khách hàng nào
                                        </div>
                                    ) : (
                                        customers.map((c) => (
                                            <div
                                                key={c.id}
                                                className="p-2 px-3 flex items-center justify-between hover:bg-muted/50 text-sm"
                                            >
                                                <div className="flex-1">
                                                    <p className="font-medium">{c.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {c.phone || "---"} • {c.address || "---"}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7"
                                                        onClick={() => handleEditCustomer(c)}
                                                        title="Sửa"
                                                    >
                                                        <Edit className="w-3 h-3" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 hover:text-red-600"
                                                        onClick={() => handleDeleteCustomer(c.id)}
                                                        title="Xóa"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>

                    <div>
                        <Label>Ghi Chú</Label>
                        <Input
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Ghi chú (tùy chọn)"
                            className="mt-1"
                        />
                    </div>

                    {/* Items */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <Label className="text-lg font-semibold">Danh Sách Sản Phẩm</Label>
                            <Button onClick={handleAddItem} size="sm" variant="outline">
                                <Plus className="w-4 h-4 mr-2" />
                                Thêm Sản Phẩm
                            </Button>
                        </div>

                        {items.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                                Chưa có sản phẩm nào. Nhấn &quot;Thêm Sản Phẩm&quot; để bắt đầu.
                            </div>
                        )}

                        <div className="space-y-3">
                            {items.map((item, index) => {
                                const product = products.find((p) => p.id === item.productId)
                                const units = getProductUnits(item.productId)

                                return (
                                    <Card key={index} className="p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                                            <div className="md:col-span-1 flex items-center justify-center md:justify-start">
                                                <span className="font-semibold text-lg">{index + 1}</span>
                                            </div>

                                            <div className="md:col-span-4 relative">
                                                <Label className="text-xs">Sản Phẩm *</Label>
                                                <div className="relative" onClick={(e) => e.stopPropagation()}>
                                                    <Input
                                                        value={productSearchMap.get(index) || ""}
                                                        onChange={(e) => handleProductSearch(index, e.target.value)}
                                                        onFocus={() => {
                                                            const openMap = new Map(productSearchOpenMap)
                                                            openMap.set(index, true)
                                                            setProductSearchOpenMap(openMap)
                                                        }}
                                                        placeholder="Tìm kiếm sản phẩm..."
                                                        className="mt-1"
                                                    />
                                                    {productSearchOpenMap.get(index) && (
                                                        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border rounded-md shadow-lg">
                                                            {getFilteredProducts(productSearchMap.get(index) || "").map((p) => (
                                                                <div
                                                                    key={p.id}
                                                                    onClick={() => selectProduct(index, p.id)}
                                                                    className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm"
                                                                >
                                                                    <div className="font-medium">{p.name}</div>
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Mã: {p.code}</div>
                                                                </div>
                                                            ))}
                                                            {getFilteredProducts(productSearchMap.get(index) || "").length === 0 && (
                                                                <div className="px-3 py-2 text-sm text-gray-500">Không tìm thấy sản phẩm</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <Label className="text-xs">Đơn Vị *</Label>
                                                <Select
                                                    value={item.unitId}
                                                    onValueChange={(v) => handleItemChange(index, "unitId", v)}
                                                    disabled={!item.productId}
                                                >
                                                    <SelectTrigger className="mt-1">
                                                        <SelectValue placeholder="Đơn vị..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {units.map((u) => (
                                                            <SelectItem key={u.id} value={u.id}>
                                                                {u.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {product && item.unitId && item.unitId !== product.unit_id && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {(() => {
                                                            const pkgUnit = product.product_package_units?.find(
                                                                (p: any) => p.package_unit_id === item.unitId
                                                            )
                                                            if (pkgUnit && pkgUnit.base_quantity) {
                                                                const unitName = product.unit?.name || product.unit?.code || "ĐV cơ bản"
                                                                const pkgName = pkgUnit.package_name || pkgUnit.product_units?.name || "Đơn vị quy đổi"
                                                                return `1 ${pkgName} = ${pkgUnit.base_quantity} ${unitName}`
                                                            }
                                                            return "Chưa có quy đổi"
                                                        })()}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="md:col-span-2">
                                                <Label className="text-xs">Số Lượng *</Label>
                                                <Input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                                                    min="0"
                                                    step="0.0001"
                                                    className="mt-1"
                                                />
                                                {product && item.unitId && Number(item.quantity) > 0 && (
                                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
                                                        {(() => {
                                                            const selectedUnitId = item.unitId
                                                            const qty = Number(item.quantity)
                                                            // If selected unit is base unit
                                                            if (selectedUnitId === product.unit_id) {
                                                                return `= ${qty} ${product.unit?.name || ""}`
                                                            }
                                                            // If selected unit is package unit
                                                            const pkgUnit = product.product_package_units?.find(
                                                                (p: any) => p.package_unit_id === selectedUnitId
                                                            )
                                                            if (pkgUnit && pkgUnit.base_quantity) {
                                                                const totalInBaseUnit = qty * pkgUnit.base_quantity
                                                                const unitName = product.unit?.name || product.unit?.code || "đơn vị"
                                                                return `= ${totalInBaseUnit} ${unitName}`
                                                            }
                                                            return ""
                                                        })()}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="md:col-span-2">
                                                <Label className="text-xs">Đơn Giá (đ/{(() => {
                                                    if (!product || !item.unitId) return "đơn vị"
                                                    const selectedUnitId = item.unitId
                                                    if (selectedUnitId === product.unit_id) {
                                                        return product.unit?.name || "đơn vị"
                                                    }
                                                    const pkgUnit = product.product_package_units?.find(
                                                        (p: any) => p.package_unit_id === selectedUnitId
                                                    )
                                                    return pkgUnit?.package_name || pkgUnit?.product_units?.name || "đơn vị"
                                                })()})</Label>
                                                <Input
                                                    value={(item.unitPrice || 0).toLocaleString("vi-VN")}
                                                    readOnly
                                                    className="mt-1 bg-gray-50 dark:bg-gray-800"
                                                />
                                            </div>

                                            <div className="md:col-span-1 flex items-end">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveItem(index)}
                                                    className="w-full hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {product && (
                                            <div className="mt-2 text-sm text-muted-foreground">
                                                Thành tiền: <span className="font-semibold text-foreground">{calculateItemTotal(item, product).toLocaleString("vi-VN")} đ</span>
                                            </div>
                                        )}
                                    </Card>
                                )
                            })}
                        </div>
                    </div>

                    {/* Total */}
                    {items.length > 0 && (
                        <div className="flex justify-end">
                            <div className="w-full md:w-1/3 space-y-2">
                                <div className="flex justify-between text-lg font-semibold">
                                    <span>Tổng Tiền:</span>
                                    <span className="text-orange-600">{calculateTotal().toLocaleString("vi-VN")} đ</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 justify-end pt-4 border-t">
                        <Button variant="outline" onClick={() => router.back()} disabled={creating}>
                            Hủy
                        </Button>
                        <Button onClick={handleSubmit} disabled={creating}>
                            {creating ? "Đang tạo..." : "Tạo Phiếu Xuất"}
                        </Button>
                    </div>
                </Card >

                {/* Quick Add Customer Dialog */}
                < Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen} >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Thêm Khách Hàng Nhanh</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 mt-4">
                            <div>
                                <Label>Tên Khách Hàng *</Label>
                                <Input
                                    value={newCustomer.name}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                    placeholder="Nhập tên khách hàng"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Số Điện Thoại</Label>
                                <Input
                                    value={newCustomer.phone}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                    placeholder="Số điện thoại"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Địa Chỉ</Label>
                                <Input
                                    value={newCustomer.address}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                    placeholder="Địa chỉ"
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)} disabled={savingCustomer}>
                                Hủy
                            </Button>
                            <Button onClick={handleCreateCustomer} disabled={savingCustomer}>
                                {savingCustomer ? "Đang lưu..." : "Tạo Khách Hàng"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog >
            </div >
        </div >
    )
}
