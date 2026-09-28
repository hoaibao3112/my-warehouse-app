"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isAdmin } from "@/lib/auth-helpers"
import { AccountManagement } from "@/components/admin/account-management"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { Badge } from "@/components/ui/badge"
import { Eye, Edit, Building2, Trash2, Plus } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { translateError } from "@/lib/error-translator"

interface Warehouse {
  id: string
  code: string
  name: string
  type: string
  location?: string
  managerId?: string
  isActive: boolean
  discount_percentage?: number
  createdAt: string
  updatedAt: string
}

export default function UsersWarehousesPage() {
  const { user, loading: isLoading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("warehouses")
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [createWarehouseOpen, setCreateWarehouseOpen] = useState(false)

  // Form states for creating warehouse
  const [warehouseForm, setWarehouseForm] = useState({
    code: "",
    name: "",
    type: "STORE",
    location: "",
    selectedManagerId: "", // For selecting existing manager (MAIN/STORE)
    managerEmail: "",
    managerName: "",
    managerPassword: ""
  })

  // Available managers for selection
  const [availableManagers, setAvailableManagers] = useState<any[]>([])
  const [managerSearchQuery, setManagerSearchQuery] = useState("")

  // Edit warehouse dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDialogLoading, setEditDialogLoading] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    location: "",
    managerEmail: "",
    managerName: "",
    managerPassword: "",
    discountPercentage: ""
  })

  // Delete warehouse dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deletePreview, setDeletePreview] = useState<any | null>(null)
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false)



  // Check if user is admin
  useEffect(() => {
    if (!isLoading && user && !isAdmin(user)) {
      router.push("/store")
    }
  }, [user, isLoading, router])

  // Fetch warehouses
  useEffect(() => {
    if (isAdmin(user)) {
      fetchWarehouses()
    }
  }, [user])

  // Fetch available managers when create dialog opens
  useEffect(() => {
    if (createWarehouseOpen && isAdmin(user)) {
      const fetchManagers = async () => {
        try {
          // Fetch users with manager roles
          const res = await mobileFetch('/api/users?pageSize=100')
          const json = await res.json()
          if (json.success && json.data) {
            // Filter only manager roles
            const managerRoles = ['WAREHOUSE_MANAGER', 'GENERAL_MANAGER', 'MANAGER']
            const managers = json.data.filter((u: any) => managerRoles.includes(u.role))
            setAvailableManagers(managers)
          }
        } catch (err) {
          console.error('Error fetching managers:', err)
        }
      }
      fetchManagers()
    }
  }, [createWarehouseOpen, user])

  const fetchWarehouses = async () => {
    setLoading(true)
    try {
      const response = await mobileFetch("/api/warehouses?pageSize=100")
      const data = await response.json()
      if (data.success) {
        setWarehouses(data.data)
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error)
    } finally {
      setLoading(false)
    }
  }



  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await mobileFetch("/api/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouseForm)
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Không thể tạo kho hàng")
      }

      // Success
      toast.success("Đã tạo kho hàng thành công", {
        description: `Mã kho: ${data.data.code}`
      })

      setWarehouseForm({
        code: "",
        name: "",
        type: "STORE",
        location: "",
        selectedManagerId: "",
        managerEmail: "",
        managerName: "",
        managerPassword: ""
      })
      await fetchWarehouses()
      setCreateWarehouseOpen(false)
    } catch (error: any) {
      console.error("Error creating warehouse:", error)
      toast.error("Lỗi tạo kho hàng", {
        description: error.message || String(error)
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenEditDialog = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse)
    setEditDialogLoading(true)
    setEditDialogOpen(true)

    // Fetch warehouse with manager details
    mobileFetch(`/api/warehouses/${warehouse.id}`)
      .then(response => response.json())
      .then(data => {
        if (data.success && data.data.users && data.data.users.length > 0) {
          const manager = data.data.users[0]
          setEditForm({
            name: warehouse.name,
            location: warehouse.location || "",
            managerEmail: manager.email,
            managerName: manager.full_name,
            managerPassword: "",
            discountPercentage: data.data.discount_percentage ? String(data.data.discount_percentage) : "0"
          })
        } else {
          setEditForm({
            name: warehouse.name,
            location: warehouse.location || "",
            managerEmail: "",
            managerName: "",
            managerPassword: "",
            discountPercentage: data.data.discount_percentage ? String(data.data.discount_percentage) : "0"
          })
        }
      })
      .catch(error => {
        console.error("Error fetching warehouse:", error)
        setEditForm({
          name: warehouse.name,
          location: warehouse.location || "",
          managerEmail: "",
          managerName: "",
          managerPassword: "",
          discountPercentage: "0"
        })
      })
      .finally(() => {
        setEditDialogLoading(false)
      })
  }

  const handleUpdateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWarehouse) return
    setLoading(true)
    try {
      const response = await mobileFetch(`/api/warehouses/${editingWarehouse.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Không thể cập nhật kho hàng")
      }

      toast.success("Đã cập nhật kho hàng thành công")
      setEditDialogOpen(false)
      setEditingWarehouse(null)
      setEditForm({
        name: "",
        location: "",
        managerEmail: "",
        managerName: "",
        managerPassword: "",
        discountPercentage: ""
      })
      await fetchWarehouses()
    } catch (error: any) {
      console.error("Error updating warehouse:", error)
      toast.error("Lỗi cập nhật kho hàng", {
        description: error.message || String(error)
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDeleteDialog = async (warehouse: Warehouse) => {
    setWarehouseToDelete(warehouse)
    setDeletePreview(null)
    setDeleteDialogOpen(true)
    setDeletePreviewLoading(true)
    try {
      const res = await mobileFetch(`/api/warehouses/${warehouse.id}/delete-preview`)
      const data = await res.json()
      if (data.success) {
        setDeletePreview(data.data)
      }
    } catch (err) {
      console.error('Error loading delete preview:', err)
    } finally {
      setDeletePreviewLoading(false)
    }
  }

  const handleDeleteWarehouse = async () => {
    if (!warehouseToDelete) return
    setDeleteLoading(true)
    try {
      const response = await mobileFetch(`/api/warehouses/${warehouseToDelete.id}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Đã xóa kho hàng")
        setDeleteDialogOpen(false)
        setWarehouseToDelete(null)
        await fetchWarehouses()
      } else {
        toast.error(data.error || "Không thể xóa kho hàng")
      }
    } catch (error) {
      console.error("Error deleting warehouse:", error)
      toast.error(translateError(error))
    } finally {
      setDeleteLoading(false)
    }
  }

  if (isLoading) {
    return <div className="p-8">Đang tải...</div>
  }

  if (!user || !isAdmin(user)) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Building2}
        title="Quản Lý Kho & Người Dùng"
        subtitle="Quản lý kho hàng và nhân sự"
      />

      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold">Quản Lý Kho Hàng & Người Dùng</h1>
          <p className="text-muted-foreground mt-2">Tạo kho hàng và quản lý người dùng cho từng kho</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="warehouses">Kho Hàng</TabsTrigger>
            <TabsTrigger value="accounts">Quản Lý Tài Khoản</TabsTrigger>
          </TabsList>

          {/* Warehouses Tab */}
          <TabsContent value="warehouses" className="space-y-6">

            <div className="flex justify-end">
              <Button className="gap-2" onClick={() => setCreateWarehouseOpen(true)}>
                <Plus className="w-4 h-4" />
                Tạo Kho Hàng
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Danh Sách Kho Hàng</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={warehouses}
                  columns={[
                    {
                      key: 'code',
                      label: 'Mã Kho',
                      render: (warehouse) => <span className="font-mono">{warehouse.code}</span>,
                      mobilePrimary: true,
                    },
                    {
                      key: 'name',
                      label: 'Tên Kho',
                      render: (warehouse) => <span>{warehouse.name}</span>,
                      mobilePrimary: true,
                    },
                    {
                      key: 'type',
                      label: 'Loại',
                      render: (warehouse) => {
                        const typeMap: Record<string, string> = {
                          'MAIN': 'Kho Tổng',
                          'STORE': 'Kho Con',
                          'PARTNER': 'Đối Tác'
                        }
                        return <span>{typeMap[warehouse.type] || warehouse.type}</span>
                      },
                    },
                    {
                      key: 'location',
                      label: 'Địa Điểm',
                      render: (warehouse) => <span>{warehouse.location || "-"}</span>,
                    },
                    {
                      key: 'status',
                      label: 'Trạng Thái',
                      render: (warehouse) => (
                        <Badge className={warehouse.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {warehouse.isActive ? "Hoạt Động" : "Không Hoạt Động"}
                        </Badge>
                      ),
                    },
                  ]}
                  actions={[
                    {
                      label: 'Xem Chi Tiết',
                      icon: <Eye className="w-4 h-4" />,
                      onClick: (warehouse) => {
                        router.push(`/admin/warehouses/${warehouse.id}`)
                      },
                      variant: 'ghost',
                    },
                    {
                      label: 'Quản Lý Tài Khoản',
                      icon: <Edit className="w-4 h-4" />,
                      onClick: (warehouse) => handleOpenEditDialog(warehouse),
                      variant: 'ghost',
                    },
                    {
                      label: 'Xóa',
                      icon: <Trash2 className="w-4 h-4" />,
                      onClick: (warehouse) => handleOpenDeleteDialog(warehouse),
                      variant: 'destructive',
                    },
                  ]}
                  keyExtractor={(warehouse) => warehouse.id}
                  emptyMessage="Chưa có kho hàng nào"
                  mobileCardTitle={(warehouse) => warehouse.name}
                  mobileCardBadge={(warehouse) => (
                    <Badge className={warehouse.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {warehouse.isActive ? "On" : "Off"}
                    </Badge>
                  )}
                  mobileCardMeta={(warehouse) => {
                    const typeMap: Record<string, string> = {
                      'MAIN': 'Kho Tổng',
                      'STORE': 'Kho Con',
                      'PARTNER': 'Đối Tác'
                    }
                    return [
                      <span className="text-xs" key="code">Mã: {warehouse.code}</span>,
                      <span className="text-xs" key="type">Loại: {typeMap[warehouse.type] || warehouse.type}</span>,
                      <span className="text-xs" key="loc">Vị trí: {warehouse.location || "-"}</span>,
                    ]
                  }}
                />
              </CardContent>
            </Card>

            <Dialog open={createWarehouseOpen} onOpenChange={setCreateWarehouseOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tạo Kho Hàng Mới</DialogTitle>
                  <DialogDescription>
                    {warehouseForm.type === 'PARTNER'
                      ? 'Tạo kho nhượng quyền - bắt buộc phải có tài khoản quản lý'
                      : 'Tạo kho hàng mới - tài khoản quản lý có thể tạo sau'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateWarehouse} className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      {warehouseForm.type === 'MAIN' ? 'Thông Tin Kho Tổng' : (warehouseForm.type === 'PARTNER' ? 'Thông Tin Cửa Hàng Đối Tác' : 'Thông Tin Kho Con')}
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label htmlFor="type" className="mb-2 block">Loại Kho *</Label>
                        <select
                          id="type"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={warehouseForm.type}
                          onChange={(e) => setWarehouseForm({ ...warehouseForm, type: e.target.value })}
                          required
                        >
                          <option value="STORE">Kho Con</option>
                          <option value="MAIN">Kho Tổng</option>
                          <option value="PARTNER">Cửa Hàng Đối Tác (Partner)</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="code" className="mb-2 block">Mã Kho *</Label>
                        <Input
                          id="code"
                          placeholder={warehouseForm.type === 'MAIN' ? 'VD: MAIN-01' : 'VD: STORE-01'}
                          value={warehouseForm.code}
                          onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="name" className="mb-2 block">Tên Kho</Label>
                        <Input
                          id="name"
                          placeholder="VD: Cửa Hàng Hà Nội"
                          value={warehouseForm.name}
                          onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="location" className="mb-2 block">Địa Điểm</Label>
                        <Input
                          id="location"
                          placeholder="VD: TP. HCM"
                          value={warehouseForm.location}
                          onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Manager selection - different for PARTNER vs MAIN/STORE */}
                  {warehouseForm.type === 'PARTNER' ? (
                    /* PARTNER: Create new manager account */
                    <div className="border-t pt-2">
                      <Label className="mb-4 block text-lg font-semibold">
                        Tài Khoản Quản Lý <span className="text-red-500">*</span>
                      </Label>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <Label htmlFor="managerEmail" className="mb-2 block">Email Quản Lý *</Label>
                          <Input
                            id="managerEmail"
                            type="email"
                            placeholder="manager@example.com"
                            value={warehouseForm.managerEmail}
                            onChange={(e) => setWarehouseForm({ ...warehouseForm, managerEmail: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="managerName" className="mb-2 block">Tên Quản Lý *</Label>
                          <Input
                            id="managerName"
                            placeholder="Nguyễn Văn A"
                            value={warehouseForm.managerName}
                            onChange={(e) => setWarehouseForm({ ...warehouseForm, managerName: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="managerPassword" className="mb-2 block">Mật Khẩu Quản Lý *</Label>
                          <Input
                            id="managerPassword"
                            type="password"
                            placeholder="••••••••"
                            value={warehouseForm.managerPassword}
                            onChange={(e) => setWarehouseForm({ ...warehouseForm, managerPassword: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* MAIN/STORE: Select existing manager */
                    <div className="border-t pt-2">
                      <div className="flex items-center justify-between mb-4">
                        <Label className="text-lg font-semibold">Chọn Quản Lý</Label>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Không bắt buộc</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Có thể chọn user quản lý có sẵn hoặc bỏ trống rồi phân sau trong "Quản Lý Tài Khoản"
                      </p>
                      <div className="space-y-3">
                        <Input
                          placeholder="Tìm theo email hoặc tên..."
                          value={managerSearchQuery}
                          onChange={(e) => setManagerSearchQuery(e.target.value)}
                          className="mb-2"
                        />
                        <select
                          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground"
                          value={warehouseForm.selectedManagerId}
                          onChange={(e) => setWarehouseForm({ ...warehouseForm, selectedManagerId: e.target.value })}
                        >
                          <option value="">-- Không chọn quản lý --</option>
                          {availableManagers
                            .filter(m => {
                              if (!managerSearchQuery) return true
                              const q = managerSearchQuery.toLowerCase()
                              return (m.fullName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
                            })
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.fullName || m.email} ({m.role})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setCreateWarehouseOpen(false)}>Hủy</Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Đang tạo..." : "Tạo Kho"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Accounts Tab */}
          <TabsContent value="accounts">
            <AccountManagement />
          </TabsContent>
        </Tabs>

        {/* Edit Warehouse Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chỉnh Sửa Kho Hàng</DialogTitle>
              <DialogDescription>
                Cập nhật thông tin kho và tài khoản quản lý
              </DialogDescription>
            </DialogHeader>

            {editDialogLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-muted-foreground">Đang tải thông tin...</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUpdateWarehouse} className="space-y-6">
                {/* Warehouse Info */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Thông Tin Kho</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="edit-name" className="mb-2 block">Tên Kho</Label>
                      <Input
                        id="edit-name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-location" className="mb-2 block">Địa Điểm</Label>
                      <Input
                        id="edit-location"
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-discount" className="mb-2 block">Chiết Khấu (%)</Label>
                      <Input
                        id="edit-discount"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        value={editForm.discountPercentage}
                        onChange={(e) => setEditForm({ ...editForm, discountPercentage: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Chiết khấu áp dụng cho nhập hàng nội bộ (0-100%)</p>
                    </div>
                  </div>
                </div>

                {/* Manager Info */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">Tài Khoản Quản Lý</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Thông tin hiện tại được hiển thị dưới. Để thay đổi, hãy nhập giá trị mới (để trống nếu không cần thay đổi)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="edit-manager-email" className="mb-2 block">Email Quản Lý</Label>
                      <Input
                        id="edit-manager-email"
                        type="email"
                        placeholder={editForm.managerEmail || "Chưa có"}
                        value={editForm.managerEmail}
                        onChange={(e) => setEditForm({ ...editForm, managerEmail: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-manager-name" className="mb-2 block">Tên Quản Lý</Label>
                      <Input
                        id="edit-manager-name"
                        placeholder={editForm.managerName || "Chưa có"}
                        value={editForm.managerName}
                        onChange={(e) => setEditForm({ ...editForm, managerName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-manager-password" className="mb-2 block">Mật Khẩu Mới</Label>
                      <Input
                        id="edit-manager-password"
                        type="password"
                        placeholder="Chỉ cần nhập nếu thay đổi"
                        value={editForm.managerPassword}
                        onChange={(e) => setEditForm({ ...editForm, managerPassword: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Đang cập nhật..." : "Cập Nhật"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>



        {/* Delete Warehouse Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
          if (!open && !deleteLoading) {
            setDeleteDialogOpen(false)
            setWarehouseToDelete(null)
            setDeletePreview(null)
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Xác nhận xóa kho
              </DialogTitle>
              <DialogDescription>
                Xóa kho <strong>{warehouseToDelete?.name}</strong> ({warehouseToDelete?.code}).
                Hành động này <strong>không thể hoàn tác</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {deletePreviewLoading ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Đang tải thông tin...</div>
              ) : deletePreview ? (
                <>
                  {/* Chặn xóa nếu còn blocking data */}
                  {deletePreview.hasBlockingData && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm space-y-1">
                      <p className="font-semibold text-red-700">Không thể xóa — còn dữ liệu chưa xử lý:</p>
                      {deletePreview.blockingData.purchaseOrders > 0 && (
                        <p className="text-red-600">• {deletePreview.blockingData.purchaseOrders} đơn đặt hàng nhập</p>
                      )}
                      {deletePreview.blockingData.transferRequests > 0 && (
                        <p className="text-red-600">• {deletePreview.blockingData.transferRequests} phiếu chuyển kho</p>
                      )}
                      <p className="text-red-500 text-xs mt-1">Vui lòng xử lý hoặc hủy các phiếu trên trước khi xóa kho.</p>
                    </div>
                  )}

                  {/* Dữ liệu sẽ bị xóa */}
                  {!deletePreview.hasBlockingData && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">Dữ liệu sẽ bị xóa vĩnh viễn:</p>

                      {/* Tồn kho & nhập hàng */}
                      {(deletePreview.willBeDeleted.warehouseStock > 0 ||
                        deletePreview.willBeDeleted.inventoryChecks > 0 ||
                        deletePreview.willBeDeleted.inventoryAdjustments > 0 ||
                        deletePreview.willBeDeleted.inventoryImports > 0 ||
                        deletePreview.willBeDeleted.productionTransactions > 0) && (
                        <div className="rounded-md border p-3 text-sm space-y-1">
                          <p className="font-medium text-gray-600 text-xs uppercase mb-1">Tồn kho & Sản xuất</p>
                          {deletePreview.willBeDeleted.warehouseStock > 0 && <p>• {deletePreview.willBeDeleted.warehouseStock} bản ghi tồn kho</p>}
                          {deletePreview.willBeDeleted.inventoryChecks > 0 && <p>• {deletePreview.willBeDeleted.inventoryChecks} phiếu kiểm kê</p>}
                          {deletePreview.willBeDeleted.inventoryAdjustments > 0 && <p>• {deletePreview.willBeDeleted.inventoryAdjustments} phiếu điều chỉnh kho</p>}
                          {deletePreview.willBeDeleted.inventoryImports > 0 && <p>• {deletePreview.willBeDeleted.inventoryImports} phiếu nhập hàng</p>}
                          {deletePreview.willBeDeleted.productionTransactions > 0 && <p>• {deletePreview.willBeDeleted.productionTransactions} phiếu sản xuất</p>}
                        </div>
                      )}

                      {/* Bán hàng */}
                      {(deletePreview.willBeDeleted.salesInvoices > 0 ||
                        deletePreview.willBeDeleted.salesSessions > 0 ||
                        deletePreview.willBeDeleted.externalSalesExports > 0) && (
                        <div className="rounded-md border p-3 text-sm space-y-1">
                          <p className="font-medium text-gray-600 text-xs uppercase mb-1">Bán hàng</p>
                          {deletePreview.willBeDeleted.salesInvoices > 0 && <p>• {deletePreview.willBeDeleted.salesInvoices} hóa đơn bán hàng</p>}
                          {deletePreview.willBeDeleted.salesSessions > 0 && <p>• {deletePreview.willBeDeleted.salesSessions} phiên bán hàng</p>}
                          {deletePreview.willBeDeleted.externalSalesExports > 0 && <p>• {deletePreview.willBeDeleted.externalSalesExports} phiếu xuất hàng external</p>}
                        </div>
                      )}

                      {/* Chấm công */}
                      {(deletePreview.willBeDeleted.attendanceSessions > 0 ||
                        deletePreview.willBeDeleted.shiftSessions > 0 ||
                        deletePreview.willBeDeleted.workShifts > 0 ||
                        deletePreview.willBeDeleted.shiftAssignments > 0) && (
                        <div className="rounded-md border p-3 text-sm space-y-1">
                          <p className="font-medium text-gray-600 text-xs uppercase mb-1">Chấm công & Ca làm việc</p>
                          <p className="text-xs text-blue-600 mb-1">Chỉ xóa dữ liệu của kho này, không ảnh hưởng kho khác</p>
                          {deletePreview.willBeDeleted.attendanceSessions > 0 && <p>• {deletePreview.willBeDeleted.attendanceSessions} bản ghi chấm công</p>}
                          {deletePreview.willBeDeleted.shiftSessions > 0 && <p>• {deletePreview.willBeDeleted.shiftSessions} phiên ca làm việc</p>}
                          {deletePreview.willBeDeleted.workShifts > 0 && <p>• {deletePreview.willBeDeleted.workShifts} ca làm việc</p>}
                          {deletePreview.willBeDeleted.shiftAssignments > 0 && <p>• {deletePreview.willBeDeleted.shiftAssignments} phân công ca</p>}
                          {deletePreview.willBeDeleted.leaveRequests > 0 && <p>• {deletePreview.willBeDeleted.leaveRequests} yêu cầu nghỉ phép</p>}
                          {deletePreview.willBeDeleted.salaryAdvanceRequests > 0 && <p>• {deletePreview.willBeDeleted.salaryAdvanceRequests} yêu cầu tạm ứng</p>}
                        </div>
                      )}

                      {/* Người dùng */}
                      {(deletePreview.users.willBeDeleted > 0 || deletePreview.users.willBeUnlinked > 0) && (
                        <div className="rounded-md border p-3 text-sm space-y-1">
                          <p className="font-medium text-gray-600 text-xs uppercase mb-1">Tài khoản</p>
                          {deletePreview.users.willBeDeleted > 0 && (
                            <p className="text-red-600">• {deletePreview.users.willBeDeleted} tài khoản quản lý sẽ bị <strong>xóa</strong></p>
                          )}
                          {deletePreview.users.willBeUnlinked > 0 && (
                            <p className="text-orange-600">• {deletePreview.users.willBeUnlinked} nhân viên sẽ được <strong>bỏ liên kết</strong> (tài khoản vẫn giữ)</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Không thể tải thông tin xem trước.</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => { setDeleteDialogOpen(false); setWarehouseToDelete(null); setDeletePreview(null) }}
                disabled={deleteLoading}
              >
                Hủy
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteWarehouse}
                disabled={deleteLoading || deletePreviewLoading || (deletePreview?.hasBlockingData ?? false)}
              >
                {deleteLoading ? "Đang xóa..." : "Xác nhận xóa"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
