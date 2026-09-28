'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2, Zap, ChefHat } from 'lucide-react'
import { MobilePageHeader } from '@/components/mobile/mobile-page-header'
import { mobileFetch } from '@/lib/mobile/api-client'
import { WAREHOUSE_CHANGE_EVENT } from '@/components/store/warehouse-selector'
import RecipeDialog from './components/recipe-dialog'
import ProduceDialog from './components/produce-dialog'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function ProductsPage() {
  const { user, loading: authLoading } = useAuth()
  const [recipes, setRecipes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [openProduceDialog, setOpenProduceDialog] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Only AdminKhoTong can create/edit/delete recipes
  // QuanLyKhoCon và STAFF can only VIEW recipes and PRODUCE
  const canManageRecipes = user && (
    user.role === 'AdminKhoTong' ||
    user.role === 'ADMIN'
  )

  // QuanLyKhoCon can produce recipes but not create/edit/delete
  const canProduceRecipes = user && (
    user.role === 'QuanLyKhoCon' ||
    user.role === 'AdminKhoTong' ||
    user.role === 'WAREHOUSE_MANAGER' ||
    user.role === 'ADMIN'
  )

  // Fetch recipes on component mount
  useEffect(() => {
    // Redirect if not authorized
    if (user && !canManageRecipes) {
      window.location.href = '/store'
      return
    }

    if (canManageRecipes) {
      fetchRecipes()
    }

    // Listen for warehouse changes - reload recipes
    const handleWarehouseChange = () => {
      console.log('[Products] Warehouse changed - reloading recipes')
      if (canManageRecipes) {
        fetchRecipes()
      }
    }
    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [user, canManageRecipes])

  async function fetchRecipes() {
    try {
      setLoading(true)
      setError('')
      const response = await mobileFetch('/api/product-recipes', {
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
    } catch (err) {
      console.error('Error fetching recipes:', err)
      setError('Lỗi kết nối đến máy chủ')
      toast.error("Không thể tải danh sách công thức")
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
      toast.error("Không thể xóa công thức")
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
        title="Sản phẩm chế biến"
        subtitle="Quản lý công thức chế biến"
      />

      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="hidden md:block">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Sản phẩm chế biến</h1>
            <p className="text-muted-foreground mt-2">Quản lý công thức chế biến sản phẩm từ nguyên liệu</p>
          </div>
          {canManageRecipes && (
            <Button onClick={() => setOpenDialog(true)} className="gap-2 w-full md:w-auto">
              <Plus className="w-4 h-4" />
              Thêm công thức
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Recipes Table */}
        <Card className="p-4 md:p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Danh sách công thức</h2>
            <p className="text-sm text-muted-foreground mt-1">{recipes.length} công thức được thiết lập</p>
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
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Tên công thức</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Nhóm hàng</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Nguyên liệu</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Giá tiền</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map(recipe => (
                    <tr key={recipe.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 text-foreground font-semibold">{recipe.name}</td>
                      <td className="py-3 px-4 text-foreground">
                        {recipe.categories ? (
                          <Badge className="bg-blue-100 text-blue-800">{recipe.categories.name}</Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">Chưa chọn</span>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
      </div>
    </div>
  )
}
