"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Trash2, Edit2, FolderOpen } from "lucide-react"
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
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"

interface MenuType {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
  menu_type_id?: string
  created_at: string
  _count?: {
    products: number
  }
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [menuTypes, setMenuTypes] = useState<MenuType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState("")
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formMenuTypeId, setFormMenuTypeId] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load categories and menu types on mount
  useEffect(() => {
    fetchMenuTypes()
    fetchCategories()
  }, [])

  const fetchMenuTypes = async () => {
    try {
      const response = await mobileFetch("/api/menu-types")
      const result = await response.json()
      if (result.success) {
        setMenuTypes(result.data || [])
      }
    } catch (error) {
      console.error("Error fetching menu types:", error)
    }
  }

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await mobileFetch("/api/categories")
      const result = await response.json()

      if (result.success) {
        setCategories(result.data || [])
      } else {
        console.error("Error fetching categories:", result.error)
        toast.error("Lỗi tải danh mục")
        setCategories([])
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
      toast.error("Lỗi kết nối")
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (category?: Category) => {
    if (category) {
      setEditingId(category.id)
      setFormName(category.name)
      setFormMenuTypeId(category.menu_type_id || "")
    } else {
      setEditingId(null)
      setFormName("")
      setFormMenuTypeId("")
    }
    setShowDialog(true)
  }

  const handleCloseDialog = () => {
    setShowDialog(false)
    setEditingId(null)
    setFormName("")
    setFormMenuTypeId("")
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Vui lòng nhập tên danh mục")
      return
    }

    if (!formMenuTypeId) {
      toast.error("Vui lòng chọn loại hàng")
      return
    }

    try {
      setIsSaving(true)

      if (editingId) {
        // Update existing category
        const response = await mobileFetch(`/api/categories/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), menu_type_id: formMenuTypeId }),
        })

        const result = await response.json()

        if (result.success) {
          toast.success("Cập nhật danh mục thành công")
          handleCloseDialog()
          await fetchCategories()
        } else {
          toast.error(result.error || "Lỗi cập nhật danh mục")
        }
      } else {
        // Create new category
        const response = await mobileFetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), menu_type_id: formMenuTypeId }),
        })

        const result = await response.json()

        if (result.success) {
          toast.success("Thêm danh mục thành công")
          handleCloseDialog()
          await fetchCategories()
        } else {
          toast.error(result.error || "Lỗi tạo danh mục")
        }
      }
    } catch (error) {
      console.error("Error saving category:", error)
      toast.error("Lỗi khi lưu danh mục")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return

    try {
      setDeleting(true)

      const response = await mobileFetch(`/api/categories/${deleteConfirmId}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Xóa danh mục thành công")
        setCategories(categories.filter((c) => c.id !== deleteConfirmId))
        setDeleteConfirmId(null)
      } else {
        toast.error(result.error || "Lỗi xóa danh mục")
      }
    } catch (error) {
      console.error("Error deleting category:", error)
      toast.error("Lỗi khi xóa danh mục")
    } finally {
      setDeleting(false)
    }
  }

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchFilter.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={FolderOpen}
        title="Danh Mục"
        subtitle="Quản lý danh mục sản phẩm"
        gradient="purple"
      />
      
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold text-foreground">Danh Mục</h1>
            <p className="text-muted-foreground mt-2">Quản lý danh mục sản phẩm</p>
          </div>
          <Button className="gap-2" onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Thêm Danh Mục</span>
            <span className="md:hidden">Thêm</span>
          </Button>
        </div>

        <Card className="p-6">
        {/* Search Bar */}
        <div className="mb-6 flex gap-4 items-center">
          <div className="flex-1 relative max-w-md">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm danh mục..."
              className="pl-10"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredCategories.length} danh mục
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Đang tải dữ liệu...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {categories.length === 0 ? "Chưa có danh mục nào" : "Không tìm thấy danh mục"}
            </div>
          ) : (
            <ResponsiveTable
              data={filteredCategories}
              columns={[
                {
                  key: 'name',
                  label: 'Tên Danh Mục',
                  render: (category) => <span className="font-medium">{category.name}</span>,
                  mobilePrimary: true,
                },
                {
                  key: 'menu_type_id',
                  label: 'Loại Hàng',
                  render: (category) => {
                    const menuType = menuTypes.find((mt) => mt.id === category.menu_type_id)
                    return menuType ? (
                      <Badge>{menuType.name}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )
                  },
                },
                {
                  key: '_count',
                  label: 'Số Sản Phẩm',
                  render: (category) => <Badge variant="secondary">{category._count?.products || 0}</Badge>,
                  align: 'center',
                  mobilePrimary: true,
                },
                {
                  key: 'created_at',
                  label: 'Ngày Tạo',
                  render: (category) => (
                    <span className="text-sm text-muted-foreground">
                      {formatDbDateToDisplay(category.created_at)}
                    </span>
                  ),
                },
              ]}
              actions={[
                {
                  label: 'Sửa',
                  icon: <Edit2 className="w-4 h-4" />,
                  onClick: (category) => handleOpenDialog(category),
                  variant: 'ghost',
                  className: 'text-blue-600 hover:text-blue-700 hover:bg-blue-50',
                },
                {
                  label: 'Xóa',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: (category) => setDeleteConfirmId(category.id),
                  variant: 'ghost',
                  className: 'text-red-600 hover:text-red-700 hover:bg-red-50',
                },
              ]}
              keyExtractor={(category) => category.id}
              loading={loading}
              emptyMessage={categories.length === 0 ? "Chưa có danh mục nào" : "Không tìm thấy danh mục"}
              mobileCardTitle={(category) => category.name}
              mobileCardBadge={(category) => {
                const menuType = menuTypes.find((mt) => mt.id === category.menu_type_id)
                return menuType ? <Badge>{menuType.name}</Badge> : null
              }}
              mobileCardMeta={(category) => [
                <>📊 {category._count?.products || 0} sản phẩm</>,
                <>📅 {formatDbDateToDisplay(category.created_at)}</>,
              ]}
            />
          )}
        </div>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Sửa Danh Mục" : "Thêm Danh Mục"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Loại Hàng</label>
              <select
                value={formMenuTypeId}
                onChange={(e) => setFormMenuTypeId(e.target.value)}
                disabled={isSaving}
                className="w-full px-3 py-2 border border-input rounded-md text-sm disabled:bg-muted disabled:cursor-not-allowed"
              >
                <option value="">-- Chọn Loại Hàng --</option>
                {menuTypes.map((mt) => (
                  <option key={mt.id} value={mt.id}>
                    {mt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Tên Danh Mục</label>
              <Input
                placeholder="Nhập tên danh mục..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSave()
                  }
                }}
                disabled={isSaving}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={handleCloseDialog}
                disabled={isSaving}
              >
                Hủy
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !formName.trim() || !formMenuTypeId}
              >
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
            <AlertDialogTitle>Xóa danh mục</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa danh mục <strong>{categories.find((c) => c.id === deleteConfirmId)?.name}</strong> này? Hành động này không thể hoàn tác.
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
