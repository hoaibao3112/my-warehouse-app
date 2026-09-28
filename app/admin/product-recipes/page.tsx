'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2, Zap, ChefHat, Upload } from 'lucide-react'
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import RecipeDialog from './components/recipe-dialog'
import ProduceDialog from './components/produce-dialog'
import { RecipeImportDialog } from './components/recipe-import-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { mobileFetch } from "@/lib/mobile/api-client"

export default function ProductRecipesPage() {
  const { user, loading: authLoading, hasPermission } = useAuth()
  const [recipes, setRecipes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [openProduceDialog, setOpenProduceDialog] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalRecipes, setTotalRecipes] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Only ADMIN can manage recipes (create/edit/delete)
  const canManageRecipes = user && (
    user.role === 'AdminKhoTong' ||
    user.role === 'ADMIN'
  )

  // ADMIN, WAREHOUSE_MANAGER, MANAGER/STAFF (with permission) can view/produce recipes
  const canProduceRecipes = user && (
    user.role === 'QuanLyKhoCon' ||
    user.role === 'AdminKhoTong' ||
    user.role === 'WAREHOUSE_MANAGER' ||
    user.role === 'ADMIN' ||
    hasPermission('recipe_management')
  )

  // Fetch recipes on component mount and when pagination changes
  useEffect(() => {
    fetchRecipes()
  }, [currentPage, pageSize])

  async function fetchRecipes() {
    try {
      setLoading(true)
      setError('')
      const response = await mobileFetch(`/api/product-recipes?page=${currentPage}&limit=${pageSize}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 403) {
          setError('Bạn không có quyền truy cập tính năng này')
        } else if (response.status === 401) {
          setError('Vui lòng đăng nhập lại')
        } else {
          setError('Không thể tải dữ liệu')
        }
        setRecipes([])
        return
      }

      const data = await response.json()
      setRecipes(data.data || [])
      if (data.pagination) {
        setTotalRecipes(data.pagination.total || 0)
        setTotalPages(data.pagination.pages || 1)
        setCurrentPage(data.pagination.page || 1)
      }
    } catch (err) {
      console.error('Error fetching recipes:', err)
      setError('Lỗi kết nối đến máy chủ')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await mobileFetch(`/api/product-recipes/${id}`, {
        method: 'DELETE',
        credentials: 'include', // Include cookies in the request
      })
      if (!response.ok) throw new Error('Failed to delete recipe')

      setRecipes(recipes.filter(r => r.id !== id))
      setDeleteId(null)
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to delete recipe')
    }
  }

  function handleEdit(recipe: any) {
    setSelectedRecipe(recipe)
    setOpenDialog(true)
  }

  function handleProduce(recipe: any) {
    setSelectedRecipe(recipe)
    setOpenProduceDialog(true)
  }

  function handleCloseDialog() {
    setSelectedRecipe(null)
    setOpenDialog(false)
  }

  function handleCloseProduceDialog() {
    setSelectedRecipe(null)
    setOpenProduceDialog(false)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ChefHat}
        title="Sản Phẩm Chế Biến"
        subtitle="Quản lý công thức chế biến"
        gradient="orange"
      />
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="hidden md:flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Sản phẩm chế biến</h1>
            <p className="text-muted-foreground mt-2">Quản lý công thức chế biến sản phẩm từ nguyên liệu</p>
          </div>
          {canManageRecipes && (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm" className="gap-1">
                <Upload className="w-4 h-4" />
                Import
              </Button>
              <Button onClick={() => setOpenDialog(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Thêm công thức
              </Button>
            </div>
          )}
        </div>
        {canManageRecipes && (
          <div className="md:hidden flex gap-2 justify-end flex-wrap">
            <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm" className="gap-1">
              <Upload className="w-4 h-4" />
            </Button>
            <Button onClick={() => setOpenDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Thêm
            </Button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Recipes Table */}
        <Card className="p-4 md:p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Danh sách công thức</h2>
            <p className="text-sm text-muted-foreground mt-1">{totalRecipes} công thức được thiết lập</p>
          </div>

          <div className="overflow-x-auto">
            {recipes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Chưa có công thức nào. Hãy tạo công thức mới!</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Mã món</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Tên công thức</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Nhóm hàng</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">ĐVT</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Nguyên liệu</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Giá tiền</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng thái</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map(recipe => (
                    <tr key={recipe.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 text-foreground">
                        {recipe.code ? (
                          <Badge variant="outline" className="font-mono text-xs">{recipe.code}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground font-semibold">{recipe.name}</td>
                      <td className="py-3 px-4 text-foreground">
                        {recipe.categories ? (
                          <Badge className="bg-blue-100 text-blue-800">{recipe.categories.name}</Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">Chưa chọn</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {recipe.product_units ? (
                          <span className="text-sm font-medium">{recipe.product_units.name}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        <div className="text-sm">
                          {recipe.recipe_ingredients.map((ing: any, idx: number) => (
                            <div key={idx}>
                              {ing.products.name} ({ing.quantity_required} {ing.product_units.code})
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-foreground font-semibold">
                        {recipe.price ? `${parseFloat(recipe.price).toLocaleString('vi-VN')} ₫` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {recipe.is_active ? (
                          <Badge className="bg-green-100 text-green-800">Hoạt động</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800">Không hoạt động</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-center gap-2">
                          {canProduceRecipes && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleProduce(recipe)}
                              title="Sản xuất"
                              className="hover:bg-amber-50 dark:hover:bg-amber-950 hover:text-amber-600 dark:hover:text-amber-400"
                            >
                              <Zap className="w-4 h-4" />
                            </Button>
                          )}
                          {canManageRecipes && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(recipe)}
                                title="Chỉnh sửa"
                                className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteId(recipe.id)}
                                title="Xóa"
                                className="hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {recipes.length > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Trang {currentPage}/{totalPages} • {totalRecipes} công thức
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || loading}
                >
                  Trước
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading}
                >
                  Tiếp
                </Button>
                <select
                  className="ml-2 p-1.5 text-sm border rounded"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          )}
        </Card>

        {/* Recipe Dialog */}
        <RecipeDialog
          open={openDialog}
          onOpenChange={setOpenDialog}
          recipe={selectedRecipe}
          onClose={handleCloseDialog}
          onSuccess={() => {
            handleCloseDialog()
            fetchRecipes()
          }}
        />

        {/* Produce Dialog */}
        <ProduceDialog
          open={openProduceDialog}
          onOpenChange={setOpenProduceDialog}
          recipe={selectedRecipe}
          onClose={handleCloseProduceDialog}
          onSuccess={() => {
            handleCloseProduceDialog()
            fetchRecipes()
          }}
        />

        {/* Delete Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa công thức</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa công thức này? Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-600"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Dialog */}
        <RecipeImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onSuccess={() => {
            fetchRecipes()
          }}
        />
      </div>
    </div>
  )
}
