"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, X, FilePlus } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function CreateStockTransferRequestPage() {
    const router = useRouter()
    const [mainWarehouses, setMainWarehouses] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [selectedWarehouse, setSelectedWarehouse] = useState("")
    const [details, setDetails] = useState<Array<{ productId: string; quantity: string }>>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)
            setError(null)

            // Load main warehouses
            const warehouseRes = await mobileFetch("/api/warehouses?type=MAIN&pageSize=100")
            const warehouseJson = await warehouseRes.json()
            if (warehouseJson?.success) {
                setMainWarehouses(warehouseJson.data || [])
            } else {
                throw new Error("Không thể tải danh sách kho: " + (warehouseJson?.error || "Unknown error"))
            }

            // Load products
            const productRes = await mobileFetch("/api/products?pageSize=100")
            const productJson = await productRes.json()
            if (productJson?.success) {
                setProducts(productJson.data || [])
            } else {
                throw new Error("Không thể tải danh sách sản phẩm: " + (productJson?.error || "Unknown error"))
            }
        } catch (err: any) {
            console.error("Load data error:", err)
            setError(err?.message || String(err))
        } finally {
            setLoading(false)
        }
    }

    const handleAddProduct = () => {
        setDetails([...details, { productId: "", quantity: "" }])
    }

    const handleRemoveProduct = (idx: number) => {
        setDetails(details.filter((_, i) => i !== idx))
    }

    const handleDetailChange = (idx: number, field: string, value: any) => {
        const newDetails = [...details]
        newDetails[idx] = { ...newDetails[idx], [field]: value }
        setDetails(newDetails)
    }

    const handleSubmit = async () => {
        if (!selectedWarehouse || details.length === 0) {
            setError("Vui lòng chọn kho và thêm sản phẩm")
            return
        }

        if (details.some((d) => !d.productId || Number(d.quantity) <= 0)) {
            setError("Vui lòng hoàn thành tất cả sản phẩm")
            return
        }

        setSubmitting(true)
        setError(null)

        try {
            const res = await mobileFetch("/api/stock-transfer-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fromWarehouseId: selectedWarehouse,
                    details: details.map((d) => ({
                        productId: d.productId,
                        requestedQuantity: Number(d.quantity),
                    })),
                }),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi tạo yêu cầu")

            toast.success("Tạo yêu cầu thành công")
            router.push("/store/stock-transfer-requests")
        } catch (err: any) {
            console.error("Submit error:", err)
            setError(err?.message || String(err))
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center">Đang tải dữ liệu...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={FilePlus}
                title="Tạo Yêu Cầu Mới"
                subtitle="Yêu cầu nhập hàng từ Kho Tổng"
            />

            <div className="p-4 md:p-8 space-y-6">
                {/* Header - Desktop only */}
                <div className="hidden md:flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Tạo Yêu Cầu Chuyển Kho Mới</h1>
                        <p className="text-muted-foreground mt-2">Yêu cầu nhập hàng từ Kho Tổng</p>
                    </div>
                </div>

                <Card className="p-6">
                    <div className="space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm text-red-800">{error}</p>
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-semibold mb-2 block">Chọn Kho Tổng</label>
                            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn Kho Tổng" />
                                </SelectTrigger>
                                <SelectContent>
                                    {mainWarehouses.length > 0 ? (
                                        mainWarehouses.map((w) => (
                                            <SelectItem key={w.id} value={w.id}>
                                                {w.name} ({w.code})
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <SelectItem value="_none" disabled>
                                            Không có kho nào
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-sm font-semibold">Sản Phẩm Yêu Cầu</label>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleAddProduct}
                                    className="gap-1"
                                >
                                    <Plus className="w-4 h-4" />
                                    Thêm Sản Phẩm
                                </Button>
                            </div>

                            <div className="space-y-3">
                                {details.length === 0 && (
                                    <p className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
                                        Chưa có sản phẩm nào. Nhấn "Thêm Sản Phẩm" để bắt đầu.
                                    </p>
                                )}

                                {details.map((detail, idx) => (
                                    <div key={idx} className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Select value={detail.productId} onValueChange={(v) => handleDetailChange(idx, "productId", v)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Chọn sản phẩm" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {products.length > 0 ? (
                                                        products.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.name} ({p.code})
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        <SelectItem value="_none" disabled>
                                                            Không có sản phẩm nào
                                                        </SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="w-32">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                placeholder="Số lượng"
                                                value={detail.quantity || ""}
                                                onChange={(e) =>
                                                    handleDetailChange(idx, "quantity", e.target.value)
                                                }
                                            />
                                        </div>

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleRemoveProduct(idx)}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-4 border-t">
                            <Button variant="outline" onClick={() => router.back()}>
                                Hủy
                            </Button>
                            <Button onClick={handleSubmit} disabled={submitting || mainWarehouses.length === 0}>
                                {submitting ? "Đang tạo..." : "Tạo Yêu Cầu"}
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
