"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Save, X, ArrowRight, Star, Package2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { mobileFetch } from "@/lib/mobile/api-client"

interface ProductPackage {
  id: string
  productId: string
  packageUnitId: string
  packageUnitName: string
  baseQuantity: number
  packageName: string
  isDefault: boolean
  isSellable: boolean
  isPurchasable: boolean
  isTransferable: boolean
}

interface ProductPackagesDialogProps {
  productId: string
  productName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProductPackagesDialog({ productId, productName, open, onOpenChange }: ProductPackagesDialogProps) {
  const [packages, setPackages] = useState<ProductPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [units, setUnits] = useState<any[]>([])
  const [baseUnit, setBaseUnit] = useState<any>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })

  const [formData, setFormData] = useState({
    packageUnitId: '',
    baseQuantity: ''
  })

  useEffect(() => {
    if (open) {
      loadProductInfo()
      loadPackages()
      loadUnits()
    }
  }, [open, productId])

  const loadProductInfo = async () => {
    try {
      const res = await mobileFetch(`/api/products/${productId}`)
      const json = await res.json()
      if (json.success && json.data) {
        setBaseUnit({
          id: json.data.unit_id,
          name: json.data.unit_name || 'Unknown'
        })
      }
    } catch (error) {
      console.error("Failed to load product info")
      toast.error("Không thể tải thông tin sản phẩm")
    }
  }

  const loadPackages = async () => {
    try {
      setLoading(true)
      const res = await mobileFetch(`/api/admin/product-packages?productId=${productId}&pageSize=100`)
      const json = await res.json()
      if (json.success) {
        setPackages(json.data || [])
      } else {
        toast.error("Lỗi tải quy đổi")
      }
    } catch (error: any) {
      console.error("Error loading packages:", error)
      toast.error("Lỗi khi tải danh sách quy đổi")
    } finally {
      setLoading(false)
    }
  }

  const loadUnits = async () => {
    try {
      const res = await mobileFetch(`/api/product-units`)
      const json = await res.json()
      if (json.success) {
        setUnits(json.data || [])
      }
    } catch (error) {
      console.error("Failed to load units")
      toast.error("Không thể tải danh sách đơn vị")
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setFormData({
      packageUnitId: '',
      baseQuantity: ''
    })
  }

  const handleAddClick = () => {
    resetForm()
    setAddDialogOpen(true)
  }

  const handleEditClick = (pkg: ProductPackage) => {
    setEditingId(pkg.id)
    setFormData({
      packageUnitId: pkg.packageUnitId,
      baseQuantity: String(pkg.baseQuantity)
    })
    setAddDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.packageUnitId || !formData.baseQuantity) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc")
      return
    }

    // Prevent self-conversion (e.g., ML → ML)
    if (baseUnit && formData.packageUnitId === baseUnit.id) {
      toast.error("Không thể quy đổi đơn vị về chính nó")
      return
    }

    const baseQty = Number(formData.baseQuantity)
    if (isNaN(baseQty) || baseQty <= 0) {
      toast.error("Số lượng phải là số dương")
      return
    }

    // Auto-generate package name from unit name and quantity
    const selectedUnit = units.find(u => u.id === formData.packageUnitId)
    const packageName = selectedUnit
      ? `${selectedUnit.name} (${baseQty} ${baseUnit?.name || 'base'})`
      : `Package ${baseQty}`

    setSaving(true)
    try {
      const method = editingId ? "PUT" : "POST"
      const url = editingId
        ? `/api/admin/product-packages/${editingId}`
        : `/api/admin/product-packages`

      const res = await mobileFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          packageUnitId: formData.packageUnitId,
          baseQuantity: baseQty,
          packageName: packageName,
          isDefault: false,
          isSellable: true,
          isPurchasable: true,
          isTransferable: true
        })
      })

      const json = await res.json()
      if (json.success) {
        toast.success(editingId ? "Đã cập nhật quy đổi" : "Đã tạo quy đổi")
        setAddDialogOpen(false)
        resetForm()
        loadPackages()
      } else {
        toast.error(json.error || "Lưu thất bại")
      }
    } catch (error: any) {
      toast.error("Lỗi: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (packageId: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa quy đổi",
      description: "Bạn có chắc muốn xóa quy đổi này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeleting(packageId)
        try {
          const res = await mobileFetch(`/api/admin/product-packages/${packageId}`, {
            method: "DELETE"
          })

          const json = await res.json()
          if (json.success) {
            toast.success("Đã xóa quy đổi")
            loadPackages()
          } else {
            toast.error(json.error || "Xóa thất bại")
          }
        } catch (error: any) {
          toast.error("Lỗi: " + error.message)
        } finally {
          setDeleting(null)
        }
      }
    })
  }

  const selectedUnit = units.find(u => u.id === formData.packageUnitId)
  const previewConversion = formData.baseQuantity && selectedUnit && baseUnit
    ? `1 ${selectedUnit.name} = ${formData.baseQuantity} ${baseUnit.name}`
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Quy Đổi Đơn Vị - {productName}</DialogTitle>
            <DialogDescription>
              Thiết lập các đơn vị quy đổi riêng cho sản phẩm này
            </DialogDescription>
          </DialogHeader>

          {/* Product Context Card */}
          {baseUnit && (
            <Card className="p-4 bg-muted/50 border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package2 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Đơn Vị Gốc (Base Unit)</p>
                    <p className="text-lg font-bold text-primary">{baseUnit.name}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  Tất cả quy đổi sẽ chuyển về đơn vị này
                </Badge>
              </div>
            </Card>
          )}

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm">Danh Sách Quy Đổi ({packages.length})</h3>
              <Button onClick={handleAddClick} size="sm" className="gap-2" disabled={loading || saving || !!deleting}>
                <Plus className="w-4 h-4" />
                Thêm Quy Đổi
              </Button>
            </div>

            {loading && <p className="text-gray-500 text-center py-8">Đang tải...</p>}

            {!loading && packages.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <div className="text-muted-foreground space-y-2">
                  <Package2 className="w-12 h-12 mx-auto opacity-30" />
                  <p className="font-medium">Chưa có quy đổi nào</p>
                  <p className="text-sm">Nhấn "Thêm Quy Đổi" để tạo quy đổi đầu tiên</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {packages.map((pkg) => (
                  <Card
                    key={pkg.id}
                    className={`p-4 hover:shadow-md transition-all ${pkg.isDefault ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-semibold">{pkg.packageName}</p>
                          {pkg.isDefault && (
                            <Badge className="gap-1">
                              <Star className="w-3 h-3" />
                              Mặc Định
                            </Badge>
                          )}
                        </div>

                        {/* Visual Conversion Display */}
                        <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2">
                          <span className="font-mono font-bold text-primary">1 {pkg.packageUnitName}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono font-bold text-green-600">{pkg.baseQuantity} {baseUnit?.name || 'base'}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(pkg)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(pkg.id)}
                          disabled={deleting === pkg.id || saving}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Chỉnh Sửa Quy Đổi" : "Thêm Quy Đổi Mới"}</DialogTitle>
            <DialogDescription>
              Quy đổi từ đơn vị khác về {baseUnit?.name || 'đơn vị gốc'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Unit Selection */}
            <div>
              <Label htmlFor="unit" className="flex items-center gap-2">
                Đơn Vị Muốn Quy Đổi <span className="text-red-500">*</span>
              </Label>
              <select
                id="unit"
                className="w-full mt-2 px-3 py-2 border rounded-md bg-white text-sm"
                value={formData.packageUnitId}
                onChange={(e) => setFormData({ ...formData, packageUnitId: e.target.value })}
              >
                <option value="">-- Chọn Đơn Vị --</option>
                {units
                  .filter(unit => unit.id !== baseUnit?.id)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.code})
                    </option>
                  ))}
              </select>
            </div>

            {/* Quantity Input */}
            <div>
              <Label htmlFor="baseQty" className="flex items-center gap-2">
                Số Lượng Tương Đương <span className="text-red-500">*</span>
              </Label>
              <Input
                id="baseQty"
                type="number"
                step="0.001"
                value={formData.baseQuantity}
                onChange={(e) => setFormData({ ...formData, baseQuantity: e.target.value })}
                placeholder="VD: 330"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ví dụ: Nếu 1 Chai = 330 ML, nhập <strong>330</strong>
              </p>
            </div>

            {/* Live Preview */}
            {previewConversion && (
              <Card className="p-3 bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2 text-sm">
                  <ArrowRight className="w-4 h-4 text-blue-600" />
                  <p className="font-mono font-bold text-blue-700">{previewConversion}</p>
                </div>
              </Card>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false)
                resetForm()
              }}
            >
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" />
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
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
    </>
  )
}
