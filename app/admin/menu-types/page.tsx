"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Trash2, Edit2, Menu } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"

interface MenuItem {
  id: string
  name: string
  created_at: string
  categories?: Array<{
    id: string
    name: string
  }>
  warehouses?: {
    id: string
    name: string
  } | null
}

export default function MenuTypesPage() {
  const [menuTypes, setMenuTypes] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState("")
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load menu types on mount
  useEffect(() => {
    fetchMenuTypes()
  }, [])

  const fetchMenuTypes = async () => {
    try {
      setLoading(true)
      const response = await mobileFetch("/api/menu-types")
      const result = await response.json()
      if (result.success) {
        setMenuTypes(result.data || [])
      } else {
        toast.error(result.error || "Lỗi tải loại hàng")
        setMenuTypes([])
      }
    } catch (error) {
      console.error("Error fetching menu types:", error)
      toast.error("Lỗi tải loại hàng")
      setMenuTypes([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (menuType?: MenuItem) => {
    if (menuType) {
      setEditingId(menuType.id)
      setFormName(menuType.name)
    } else {
      setEditingId(null)
      setFormName("")
    }
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Tên loại hàng không được bỏ trống")
      return
    }

    try {
      setIsSaving(true)

      if (editingId) {
        // Update existing
        const response = await mobileFetch(`/api/menu-types/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim() }),
        })
        const result = await response.json()

        if (result.success) {
          setMenuTypes(menuTypes.map((m) => (m.id === editingId ? result.data : m)))
          toast.success("Cập nhật loại hàng thành công")
        } else {
          toast.error(result.error || "Lỗi cập nhật loại hàng")
        }
      } else {
        // Create new
        const response = await mobileFetch("/api/menu-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim() }),
        })
        const result = await response.json()

        if (result.success) {
          setMenuTypes([result.data, ...menuTypes])
          toast.success("Tạo loại hàng thành công")
        } else {
          toast.error(result.error || "Lỗi tạo loại hàng")
        }
      }

      setShowDialog(false)
      setFormName("")
      setEditingId(null)
    } catch (error) {
      console.error("Error saving menu type:", error)
      toast.error("Lỗi lưu loại hàng")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return

    try {
      setDeleting(true)
      const response = await mobileFetch(`/api/menu-types/${deleteConfirmId}`, {
        method: "DELETE",
      })
      const result = await response.json()

      if (result.success) {
        setMenuTypes(menuTypes.filter((m) => m.id !== deleteConfirmId))
        toast.success("Xóa loại hàng thành công")
      } else {
        toast.error(result.error || "Lỗi xóa loại hàng")
      }

      setDeleteConfirmId(null)
    } catch (error) {
      console.error("Error deleting menu type:", error)
      toast.error("Lỗi xóa loại hàng")
    } finally {
      setDeleting(false)
    }
  }

  const filteredMenuTypes = menuTypes.filter((mt) =>
    mt.name.toLowerCase().includes(searchFilter.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Menu}
        title="Loại Hàng"
        subtitle="Quản lý các loại hàng"
        gradient="amber"
      />

      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold text-foreground">Loại Hàng</h1>
            <p className="text-muted-foreground mt-2">Quản lý các loại hàng (ví dụ: Đồ ăn, Đồ uống)</p>
          </div>
          <Button className="gap-2" onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Thêm Loại Hàng</span>
            <span className="md:hidden">Thêm</span>
          </Button>
        </div>

        <Card className="p-6">
          <div className="mb-6 flex gap-4 items-center">
            <div className="flex-1 relative max-w-md">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm loại hàng..."
                className="pl-10"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Đang tải dữ liệu...
              </div>
            ) : filteredMenuTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Chưa có loại hàng nào
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {filteredMenuTypes.map((menuType) => (
                    <Card key={menuType.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{menuType.name}</p>
                            {menuType.warehouses ? (
                              <Badge variant="outline" className="text-[10px] h-5 px-1 bg-blue-50 text-blue-700 border-blue-200">
                                {menuType.warehouses.name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] h-5 px-1 bg-gray-50 text-gray-600 border-gray-200">
                                Chung
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{formatDbDateToDisplay(menuType.created_at)}</p>
                          <div className="flex gap-1 flex-wrap mt-2">
                            {menuType.categories && menuType.categories.length > 0 ? (
                              menuType.categories.slice(0, 3).map((cat) => (
                                <Badge key={cat.id} variant="secondary" className="text-xs">
                                  {cat.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">Không có nhóm</span>
                            )}
                            {menuType.categories && menuType.categories.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{menuType.categories.length - 3}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleOpenDialog(menuType)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(menuType.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
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
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Tên Loại Hàng</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Kho/Phạm Vi</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Nhóm Hàng</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày Tạo</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMenuTypes.map((menuType) => (
                      <tr key={menuType.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium text-foreground">{menuType.name}</td>
                        <td className="py-3 px-4">
                          {menuType.warehouses ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {menuType.warehouses.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                              Toàn hệ thống
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2 flex-wrap">
                            {menuType.categories && menuType.categories.length > 0 ? (
                              menuType.categories.map((cat) => (
                                <Badge key={cat.id} variant="secondary">
                                  {cat.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">Không có</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {formatDbDateToDisplay(menuType.created_at)}
                        </td>
                        <td className="py-3 px-4 flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDialog(menuType)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(menuType.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Sửa Loại Hàng" : "Thêm Loại Hàng"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-foreground">Tên Loại Hàng</label>
                <Input
                  placeholder="Ví dụ: Đồ ăn, Đồ uống..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave()
                  }}
                  className="mt-2"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <DialogClose asChild>
                  <Button variant="outline">Hủy</Button>
                </DialogClose>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Đang lưu..." : editingId ? "Cập Nhật" : "Thêm"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa loại hàng</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa loại hàng <strong>{menuTypes.find((m) => m.id === deleteConfirmId)?.name}</strong> này? Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Đang xóa..." : "Xóa"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
