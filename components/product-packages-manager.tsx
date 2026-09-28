"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Save, X } from "lucide-react"
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
import { mobileFetch } from "@/lib/mobile/api-client"

interface ProductPackage {
  id: string
  productId: string
  productName: string
  packageUnitId: string
  packageUnitName: string
  baseQuantity: number
  packageName: string
  isDefault: boolean
  isSellable: boolean
  isPurchasable: boolean
  isTransferable: boolean
  createdAt?: string
  updatedAt?: string
}

interface ProductPackagesManagerProps {
  productId: string
  productName: string
  onClose: () => void
}

export function ProductPackagesManager({ productId, productName, onClose }: ProductPackagesManagerProps) {
  const [packages, setPackages] = useState<ProductPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [units, setUnits] = useState<any[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
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
    baseQuantity: '',
    packageName: '',
    isDefault: false,
    isSellable: true,
    isPurchasable: true,
    isTransferable: true
  })

  useEffect(() => {
    loadPackages()
    loadUnits()
  }, [productId])

  const loadPackages = async () => {
    try {
      setLoading(true)
      const res = await mobileFetch(`/api/admin/product-packages?productId=${productId}&pageSize=100`)
      const json = await res.json()
      if (json.success) {
        setPackages(json.data || [])
      } else {
        toast.error("Failed to load packages: " + (json.error || "Unknown error"))
      }
    } catch (error: any) {
      toast.error("Error loading packages: " + error.message)
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
    }
  }

  const handleAddClick = () => {
    setEditingId(null)
    setFormData({
      packageUnitId: '',
      baseQuantity: '',
      packageName: '',
      isDefault: false,
      isSellable: true,
      isPurchasable: true,
      isTransferable: true
    })
    setDialogOpen(true)
  }

  const handleEditClick = (pkg: ProductPackage) => {
    setEditingId(pkg.id)
    setFormData({
      packageUnitId: pkg.packageUnitId,
      baseQuantity: String(pkg.baseQuantity),
      packageName: pkg.packageName,
      isDefault: pkg.isDefault,
      isSellable: pkg.isSellable,
      isPurchasable: pkg.isPurchasable,
      isTransferable: pkg.isTransferable
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.packageUnitId || !formData.baseQuantity || !formData.packageName) {
      toast.error("Please fill in all required fields")
      return
    }

    const baseQty = Number(formData.baseQuantity)
    if (isNaN(baseQty) || baseQty <= 0) {
      toast.error("Base quantity must be a positive number")
      return
    }

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
          packageName: formData.packageName,
          isDefault: formData.isDefault,
          isSellable: formData.isSellable,
          isPurchasable: formData.isPurchasable,
          isTransferable: formData.isTransferable
        })
      })

      const json = await res.json()
      if (json.success) {
        toast.success(editingId ? "Package updated" : "Package created")
        setDialogOpen(false)
        loadPackages()
      } else {
        toast.error("Save failed: " + (json.error || "Unknown error"))
      }
    } catch (error: any) {
      toast.error("Error saving: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (packageId: string) => {
    setConfirmDialog({
      open: true,
      title: "Confirm Delete",
      description: "Are you sure you want to delete this package?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeleting(packageId)
        try {
          const res = await mobileFetch(`/api/admin/product-packages/${packageId}`, {
            method: "DELETE"
          })

          const json = await res.json()
          if (json.success) {
            toast.success("Package deleted")
            loadPackages()
          } else {
            toast.error("Delete failed: " + (json.error || "Unknown error"))
          }
        } catch (error: any) {
          toast.error("Error deleting: " + error.message)
        } finally {
          setDeleting(null)
        }
      }
    })
  }

  return (
    <Card className="w-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Product Packages</h2>
          <p className="text-gray-500">{productName}</p>
        </div>
        <Button onClick={handleAddClick} className="gap-2" disabled={loading || saving || !!deleting}>
          <Plus className="w-4 h-4" />
          Add Package
        </Button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}

      {packages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No packages defined yet. Click "Add Package" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50">
              <div className="flex-1">
                <div className="font-semibold">{pkg.packageName}</div>
                <div className="text-sm text-gray-600">
                  1 {pkg.packageUnitName} = {pkg.baseQuantity} base units
                </div>
                <div className="flex gap-2 mt-2">
                  {pkg.isDefault && <Badge variant="default">Default</Badge>}
                  {pkg.isSellable && <Badge variant="secondary">Sellable</Badge>}
                  {pkg.isPurchasable && <Badge variant="secondary">Purchasable</Badge>}
                  {pkg.isTransferable && <Badge variant="secondary">Transferable</Badge>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditClick(pkg)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(pkg.id)}
                  disabled={deleting === pkg.id || saving}
                  className="text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Package" : "Add Package"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="unit">Package Unit *</Label>
              <select
                id="unit"
                className="w-full mt-2 px-3 py-2 border rounded-md"
                value={formData.packageUnitId}
                onChange={(e) => setFormData({ ...formData, packageUnitId: e.target.value })}
              >
                <option value="">Select a unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="baseQty">Base Quantity *</Label>
              <Input
                id="baseQty"
                type="number"
                step="0.001"
                value={formData.baseQuantity}
                onChange={(e) => setFormData({ ...formData, baseQuantity: e.target.value })}
                placeholder="e.g., 330"
              />
            </div>

            <div>
              <Label htmlFor="packageName">Package Name *</Label>
              <Input
                id="packageName"
                value={formData.packageName}
                onChange={(e) => setFormData({ ...formData, packageName: e.target.value })}
                placeholder="e.g., Chai Coca 330ML"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                <span>Set as default</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isSellable}
                  onChange={(e) => setFormData({ ...formData, isSellable: e.target.checked })}
                />
                <span>Can be sold</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isPurchasable}
                  onChange={(e) => setFormData({ ...formData, isPurchasable: e.target.checked })}
                />
                <span>Can be purchased</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isTransferable}
                  onChange={(e) => setFormData({ ...formData, isTransferable: e.target.checked })}
                />
                <span>Can be transferred</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save"}
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
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDialog.onConfirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
