"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, X, ScanLine } from "lucide-react"
import { BarcodeScanner } from "@/components/barcode-scanner"
import { useProductScanner } from "@/hooks/use-scanner"
import { toast } from "sonner"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"
import { mobileFetch } from "@/lib/mobile/api-client"

interface CreateTransferRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateTransferRequestDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTransferRequestDialogProps) {
  const [mainWarehouses, setMainWarehouses] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState("")
  const [details, setDetails] = useState<Array<{ productId: string; quantity: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Barcode scanner for products
  const { scannerOpen, openScanner, closeScanner, handleScan } = useProductScanner(
    async (productCode) => {
      console.log('Scanned product code:', productCode)

      try {
        // Fetch product by barcode
        const response = await mobileFetch(`/api/products/by-code/${encodeURIComponent(productCode)}`)
        const result = await response.json()

        if (result.success && result.data) {
          const product = result.data

          // Check if product already in details
          const existingIndex = details.findIndex(d => d.productId === product.id)

          if (existingIndex >= 0) {
            // Increment quantity
            const newDetails = [...details]
            newDetails[existingIndex].quantity += 1
            setDetails(newDetails)
            toast.success(`Đã tăng số lượng: ${product.name}`)
          } else {
            // Add new product with quantity 1
            setDetails([...details, { productId: product.id, quantity: 1 }])
            toast.success(`Đã thêm: ${product.name}`)
          }
        } else {
          toast.error('Không tìm thấy sản phẩm với mã này')
        }
      } catch (error) {
        console.error('Error fetching product:', error)
        toast.error('Lỗi khi tìm sản phẩm')
      }
    }
  )

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const loadData = async () => {
    try {
      // Load main warehouses
      const warehouseRes = await mobileFetch("/api/warehouses?type=MAIN&pageSize=100")
      const warehouseJson = await warehouseRes.json()
      if (warehouseJson?.success) {
        setMainWarehouses(warehouseJson.data || [])
      } else {
        console.error("Lỗi tải kho:", warehouseJson?.error)
        toast.error("Không thể tải danh sách kho")
        setError("Lỗi tải danh sách kho: " + (warehouseJson?.error || "unknown"))
      }

      // Load products
      const productRes = await mobileFetch("/api/products?pageSize=100")
      const productJson = await productRes.json()
      if (productJson?.success) {
        setProducts(productJson.data || [])
      } else {
        console.error("Lỗi tải sản phẩm:", productJson?.error)
        toast.error("Không thể tải danh sách sản phẩm")
        setError("Lỗi tải danh sách sản phẩm: " + (productJson?.error || "unknown"))
      }
    } catch (err: any) {
      console.error("Lỗi loadData:", err)
      toast.error("Không thể tải dữ liệu phiếu yêu cầu")
      setError("Lỗi tải dữ liệu: " + (err?.message || String(err)))
    }
  }

  const handleAddProduct = () => {
    setDetails([...details, { productId: "", quantity: 0 }])
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

    if (details.some((d) => !d.productId || d.quantity <= 0)) {
      setError("Vui lòng hoàn thành tất cả sản phẩm")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithRateLimit("/api/stock-transfer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: selectedWarehouse,
          details: details.map((d) => ({
            productId: d.productId,
            requestedQuantity: d.quantity,
          })),
        }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi tạo yêu cầu")

      toast.success("Tạo yêu cầu thành công!")
      setSelectedWarehouse("")
      setDetails([])
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo Yêu Cầu Chuyển Kho</DialogTitle>
          <DialogDescription>Yêu cầu nhập hàng từ Kho Tổng</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold mb-2 block">Kho Tổng</label>
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn Kho Tổng" />
              </SelectTrigger>
              <SelectContent>
                {mainWarehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold">Sản Phẩm Yêu Cầu</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openScanner}
                  disabled={loading}
                  className="gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ScanLine className="w-4 h-4" />
                  Quét mã
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddProduct}
                  disabled={loading}
                  className="gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Sản Phẩm
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {details.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">
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
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-24">
                    <Input
                      type="number"
                      placeholder="Số lượng"
                      value={detail.quantity || ""}
                      onChange={(e) =>
                        handleDetailChange(idx, "quantity", Number(e.target.value) || 0)
                      }
                      min="1"
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveProduct(idx)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Đang tạo..." : "Tạo Yêu Cầu"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Barcode Scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={closeScanner}
        onScan={handleScan}
        title="Quét mã sản phẩm"
        description="Đưa camera đến mã vạch để thêm vào yêu cầu chuyển kho"
        allowManualInput
      />
    </Dialog>
  )
}
