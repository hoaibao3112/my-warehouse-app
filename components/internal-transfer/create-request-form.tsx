"use client"

import { mobileFetch } from "@/lib/mobile/api-client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"

interface RequestItem {
  productId: string
  productName?: string
  quantity: number
  unitId: string
  unitName?: string
}

interface CreateRequestFormProps {
  products: Array<{ id: string; name: string; code: string }>
  units: Array<{ id: string; name: string; code: string }>
  onSuccess?: () => void
  onCancel?: () => void
}

export function CreateRequestForm({ products, units, onSuccess, onCancel }: CreateRequestFormProps) {
  const [items, setItems] = useState<RequestItem[]>([
    { productId: "", quantity: 1, unitId: "" }
  ])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const addItem = () => {
    setItems([...items, { productId: "", quantity: 1, unitId: "" }])
  }

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Phải có ít nhất 1 sản phẩm"
      })
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof RequestItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    for (const item of items) {
      if (!item.productId || !item.unitId || item.quantity < 0 || isNaN(item.quantity)) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Vui lòng điền đầy đủ thông tin cho tất cả sản phẩm (số lượng >= 0)"
        })
        return
      }
    }

    setLoading(true)
    try {
      const response = await mobileFetch("/api/internal-transfer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Thành công",
          description: "Đã tạo phiếu yêu cầu nhập hàng nội bộ"
        })
        if (onSuccess) {
          onSuccess()
        } else {
          router.push("/store/internal-transfers")
        }
      } else {
        throw new Error(data.error || "Có lỗi xảy ra")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Tạo Phiếu Yêu Cầu Nhập Hàng Nội Bộ</CardTitle>
          <CardDescription>
            Nhập thông tin sản phẩm cần yêu cầu từ kho tổng
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <Card key={index} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Label>Sản phẩm *</Label>
                  <Select
                    value={item.productId}
                    onValueChange={(value) => updateItem(index, "productId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn sản phẩm" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.code} - {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Số lượng *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value))}
                  />
                </div>

                <div>
                  <Label>Đơn vị *</Label>
                  <Select
                    value={item.unitId}
                    onValueChange={(value) => updateItem(index, "unitId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn đơn vị" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Xóa
                </Button>
              )}
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={addItem} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Thêm sản phẩm
          </Button>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => {
            if (onCancel) {
              onCancel()
            } else {
              router.back()
            }
          }}>
            Hủy
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Đang tạo..." : "Tạo phiếu yêu cầu"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
