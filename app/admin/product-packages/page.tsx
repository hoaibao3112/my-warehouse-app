"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Edit, Trash2, Plus, Package } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { ProductPackagesManager } from "@/components/product-packages-manager"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"

interface ProductPackage {
  id: string
  productId: string
  productName: string
  productCode: string
  packageUnitId: string
  packageUnitName: string
  baseUnitId: string
  baseQuantity: number
  packageName: string
  isDefault: boolean
  isSellable: boolean
  isPurchasable: boolean
  isTransferable: boolean
}

export default function ProductPackagesPage() {
  const [packages, setPackages] = useState<ProductPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => {} })

  useEffect(() => {
    loadPackages()
  }, [page, pageSize])

  const loadPackages = async () => {
    try {
      setLoading(true)
      const q = new URLSearchParams()
      q.set("page", String(page))
      q.set("pageSize", String(pageSize))

      const res = await mobileFetch(`/api/admin/product-packages?${q.toString()}`)
      const json = await res.json()
      if (json.success) {
        setPackages(json.data || [])
        setTotal(json.total || 0)
      } else {
        toast.error("Failed to load packages: " + (json.error || "Unknown error"))
      }
    } catch (error: any) {
      toast.error("Error loading packages: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (packageId: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa",
      description: "Bạn có chắc muốn xóa quy cách này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
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
        }
      }
    })
  }

  const filteredPackages = packages.filter((pkg) =>
    pkg.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.packageName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (selectedProduct) {
    return (
      <ProductPackagesManager
        productId={selectedProduct.id}
        productName={selectedProduct.name}
        onClose={() => setSelectedProduct(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Package}
        title="Quy Cách Đóng Gói"
        subtitle="Quản lý quy cách sản phẩm"
        gradient="green"
      />
      <div className="p-4 md:p-8">
      <Card className="p-4 md:p-6">
        <div className="hidden md:flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Quy Cách Đóng Gói</h1>
          <Button disabled className="gap-2" title="Use product detail view to add packages">
            <Plus className="w-4 h-4" />
            Add Package
          </Button>
        </div>

        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by product name, code, or package name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading && <p className="text-gray-500 text-center py-8">Loading...</p>}

        {filteredPackages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No packages found. Create packages from product details.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition"
              >
                <div className="flex-1">
                  <div className="font-semibold">
                    {pkg.productName} <span className="text-gray-500 text-sm">({pkg.productCode})</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Package: {pkg.packageName}
                  </div>
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
                    onClick={() =>
                      setSelectedProduct({
                        id: pkg.productId,
                        name: pkg.productName
                      })
                    }
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(pkg.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredPackages.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600">
              Showing {filteredPackages.length} of {total} packages
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="px-3 py-2 text-sm">
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <Button
                variant="outline"
                disabled={page * pageSize >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">{confirmDialog.description}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Hủy</Button>
            <Button variant="destructive" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
