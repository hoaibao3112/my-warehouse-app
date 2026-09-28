"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2, Building2 } from "lucide-react"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { WarehouseAssignmentDialog } from "@/components/admin/warehouse-assignment-dialog"

// Permissions for Main Warehouse staff (advanced managers)
const MAIN_WAREHOUSE_PERMISSIONS = [
  { id: "product_management", label: "Sản Phẩm & Công Cụ" },
  { id: "category_management", label: "Loại Hàng & Nhóm Hàng" },
  { id: "recipe_management", label: "Sản Phẩm Chế Biến" },
  { id: "unit_management", label: "Đơn Vị" },
  { id: "supplier_management", label: "Nhà Cung Cấp" },
  { id: "inventory_intake", label: "Nhập Hàng" },
  { id: "warehouse_transfer", label: "Xuất Hàng Nội Bộ" },
  { id: "tools_transfer", label: "Nhập/Xuất Công Cụ" },
  { id: "inventory_check", label: "Kiểm Kê Tồn Kho" },
  { id: "promotion_management", label: "Voucher & Khuyến Mãi" },
  { id: "reports", label: "Báo Cáo" }
]

// Default permissions for MANAGER role (all permissions - can create, edit, approve)
const MANAGER_DEFAULT_PERMISSIONS = [
  "product_management",
  "category_management",
  "recipe_management",
  "unit_management",
  "supplier_management",
  "inventory_intake",
  "warehouse_transfer",
  "tools_transfer",
  "inventory_check",
  "promotion_management",
  "reports"
]

// Default permissions for WAREHOUSE_STAFF role (can create products, tools, manage master data, and intake requests, but cannot approve)
const WAREHOUSE_STAFF_DEFAULT_PERMISSIONS = [
  "product_management",      // Can create/edit products and tools
  "category_management",     // Can create/edit categories and groups
  "unit_management",         // Can create/edit units
  "inventory_intake",        // Can view/create intake requests (but cannot approve)
  "warehouse_transfer",      // Can view transfer requests (but cannot approve)
  "tools_transfer",          // Can view tools transfer (but cannot approve)
  "inventory_check",         // Can create and view inventory checks
  "reports"                  // Can view reports
]

interface MainWarehouseUser {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  permissions?: string
  created_at: string
  updated_at: string
}

export function MainWarehouseUsersComponent() {
  const [mainWarehouseUsers, setMainWarehouseUsers] = useState<MainWarehouseUser[]>([])
  const [loading, setLoading] = useState(false)
  const [mainWarehouseId, setMainWarehouseId] = useState<string>("")

  // Form states for creating user
  const [userForm, setUserForm] = useState({
    username: "",
    fullName: "",
    password: "",
    role: "MANAGER" as "MANAGER" | "WAREHOUSE_STAFF" | "GENERAL_MANAGER" | "HR" | "WAREHOUSE_MANAGER"
  })
  const [generatedEmail, setGeneratedEmail] = useState<string>("")

  // Warehouse assignment dialog state
  const [warehouseAssignmentOpen, setWarehouseAssignmentOpen] = useState(false)
  const [selectedUserForAssignment, setSelectedUserForAssignment] = useState<{ id: string, name: string } | null>(null)

  // Edit staff dialog state
  const [editStaffDialogOpen, setEditStaffDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<MainWarehouseUser | null>(null)
  const [editStaffLoading, setEditStaffLoading] = useState(false)
  const [editStaffForm, setEditStaffForm] = useState({
    fullName: "",
    password: "",
    permissions: [] as string[],
    role: ""
  })

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [staffToDelete, setStaffToDelete] = useState<MainWarehouseUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Fetch main warehouse info
  useEffect(() => {
    fetchMainWarehouse()
  }, [])

  // Fetch main warehouse users
  useEffect(() => {
    if (mainWarehouseId) {
      fetchMainWarehouseUsers()
    }
  }, [mainWarehouseId])

  // Generate email when username changes
  useEffect(() => {
    if (userForm.username) {
      setGeneratedEmail(`${userForm.username}@express.com.vn`)
    } else {
      setGeneratedEmail("")
    }
  }, [userForm.username])

  const fetchMainWarehouse = async () => {
    try {
      const response = await mobileFetch("/api/warehouses?pageSize=100&type=MAIN")
      const data = await response.json()
      if (data.success && data.data.length > 0) {
        setMainWarehouseId(data.data[0].id)
      }
    } catch (error) {
      console.error("Error fetching main warehouse:", error)
      toast.error("Lỗi tải thông tin kho tổng")
    }
  }

  const fetchMainWarehouseUsers = async () => {
    setLoading(true)
    try {
      const response = await mobileFetch(`/api/warehouse-users?warehouseId=${mainWarehouseId}&pageSize=100`)
      const data = await response.json()
      if (data.success) {
        setMainWarehouseUsers(data.data)
      }
    } catch (error) {
      console.error("Error fetching main warehouse users:", error)
      toast.error("Lỗi tải danh sách nhân viên")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userForm.username || !userForm.fullName || !userForm.password) {
      toast.error("Vui lòng điền đầy đủ thông tin")
      return
    }

    setLoading(true)
    try {
      // Determine payload based on role
      let payload: any = {
        email: generatedEmail,
        fullName: userForm.fullName,
        password: userForm.password,
        role: userForm.role,
      }

      // For MANAGER and WAREHOUSE_STAFF, set warehouse and permissions
      if (userForm.role === "MANAGER" || userForm.role === "WAREHOUSE_STAFF") {
        payload.warehouseId = mainWarehouseId
        payload.permissions = userForm.role === "MANAGER"
          ? MANAGER_DEFAULT_PERMISSIONS
          : WAREHOUSE_STAFF_DEFAULT_PERMISSIONS
      }
      // For GENERAL_MANAGER and HR, no warehouse or permissions needed initially
      // Warehouses will be assigned separately for GENERAL_MANAGER
      // HR has preset permissions handled in backend

      const response = await mobileFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (response.ok && data.success) {
        const roleLabels: Record<string, string> = {
          "MANAGER": "quản lý",
          "WAREHOUSE_STAFF": "nhân viên kho",
          "GENERAL_MANAGER": "tổng quản lý",
          "HR": "nhân sự"
        }
        toast.success(`Tạo ${roleLabels[userForm.role] || "người dùng"} thành công`)

        // For GENERAL_MANAGER, show warehouse assignment dialog
        if (userForm.role === "GENERAL_MANAGER" && data.data?.id) {
          setSelectedUserForAssignment({ id: data.data.id, name: userForm.fullName })
          setWarehouseAssignmentOpen(true)
        }

        setUserForm({ username: "", fullName: "", password: "", role: "MANAGER" })
        setGeneratedEmail("")
        await fetchMainWarehouseUsers()
      } else {
        toast.error(data.error || "Lỗi tạo nhân viên")
      }
    } catch (error) {
      console.error("Error creating user:", error)
      toast.error("Lỗi kết nối")
    } finally {
      setLoading(false)
    }
  }

  const handleEditStaff = (staff: MainWarehouseUser) => {
    setEditingStaff(staff)
    setEditStaffForm({
      fullName: staff.full_name,
      password: "",
      permissions: staff.permissions ? JSON.parse(staff.permissions) : [],
      role: staff.role || "MANAGER"
    })
    setEditStaffDialogOpen(true)
  }

  const handleSaveStaffChanges = async () => {
    if (!editingStaff) return

    setEditStaffLoading(true)
    try {
      const response = await mobileFetch(`/api/users/${editingStaff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editStaffForm.fullName,
          password: editStaffForm.password || undefined,
          permissions: editStaffForm.permissions
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast.success("Cập nhật nhân viên thành công")
        setEditStaffDialogOpen(false)
        setEditingStaff(null)
        await fetchMainWarehouseUsers()
      } else {
        toast.error(data.error || "Lỗi cập nhật nhân viên")
      }
    } catch (error) {
      console.error("Error updating staff:", error)
      toast.error("Lỗi kết nối")
    } finally {
      setEditStaffLoading(false)
    }
  }

  const handleDeleteStaff = async () => {
    if (!staffToDelete) return

    setDeleteLoading(true)
    try {
      const response = await mobileFetch(`/api/users/${staffToDelete.id}`, {
        method: "DELETE"
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast.success("Xóa nhân viên thành công")
        setDeleteDialogOpen(false)
        setStaffToDelete(null)
        await fetchMainWarehouseUsers()
      } else {
        toast.error(data.error || "Lỗi xóa nhân viên")
      }
    } catch (error) {
      console.error("Error deleting staff:", error)
      toast.error("Lỗi kết nối")
    } finally {
      setDeleteLoading(false)
    }
  }

  const togglePermission = (permissionId: string) => {
    setEditStaffForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }))
  }

  if (!mainWarehouseId) {
    return <div className="text-center text-muted-foreground">Đang tải thông tin kho tổng...</div>
  }

  return (
    <div className="space-y-6">
      {/* Create User Card */}
      <Card>
        <CardHeader>
          <CardTitle>Tạo Nhân Viên Kho Tổng</CardTitle>
          <CardDescription>Tạo tài khoản nhân viên quản lý cấp cao cho kho tổng</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="userUsername" className="mb-2 block">Tên Đăng Nhập</Label>
                  <Input
                    id="userUsername"
                    placeholder="nhanvien_khotong_1"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Email sẽ là: {generatedEmail || "..."}</p>
                </div>
                <div>
                  <Label htmlFor="userFullName" className="mb-2 block">Tên Nhân Viên</Label>
                  <Input
                    id="userFullName"
                    placeholder="Nguyễn Văn A"
                    value={userForm.fullName}
                    onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="userRole" className="mb-2 block">Chức Vụ</Label>
                  <select
                    id="userRole"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as "MANAGER" | "WAREHOUSE_STAFF" | "GENERAL_MANAGER" | "HR" | "WAREHOUSE_MANAGER" })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                  >
                    <option value="MANAGER">Quản Lý (Toàn Quyền - Có thể chỉnh sửa quyền)</option>
                    <option value="WAREHOUSE_STAFF">Nhân Viên Kho (Quyền Cố Định)</option>
                    <option value="WAREHOUSE_MANAGER">Quản Lý Cửa Hàng (Quản lý nhiều kho)</option>
                    <option value="GENERAL_MANAGER">Tổng Quản Lý (Tự động quản lý TẤT CẢ kho STORE)</option>
                    <option value="HR">Nhân Sự (Quản lý nhân viên & chấm công)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {userForm.role === "MANAGER"
                      ? "Có toàn quyền, admin có thể chỉnh sửa quyền hạn nếu cần"
                      : userForm.role === "WAREHOUSE_STAFF"
                      ? "Quyền hạn cố định: Tạo/sửa sản phẩm, công cụ, loại hàng, nhóm hàng, đơn vị, phiếu nhập - không duyệt phiếu (Truy cập admin)"
                      : userForm.role === "WAREHOUSE_MANAGER"
                      ? "Quản lý nhiều kho được admin gán, dùng nút 'Gán Kho' để chọn kho"
                      : userForm.role === "GENERAL_MANAGER"
                      ? "Tự động quản lý TẤT CẢ kho STORE (không cần chọn kho), không quản lý kho MAIN"
                      : "Quản lý nhân viên, chấm công, báo cáo - không ảnh hưởng ADMIN"}
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="userPassword" className="mb-2 block">Mật Khẩu</Label>
                <Input
                  id="userPassword"
                  type="password"
                  placeholder="••••••••"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="pt-4">
              <Button type="submit" disabled={loading || !generatedEmail}>
                {loading ? "Đang tạo..." : "Tạo Nhân Viên"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Users List Card */}
      <Card>
        <CardHeader>
          <CardTitle>Danh Sách Nhân Viên Kho Tổng</CardTitle>
          <CardDescription>Quản lý nhân viên và quản lý</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground">Đang tải...</div>
          ) : mainWarehouseUsers.length === 0 ? (
            <div className="text-center text-muted-foreground">Chưa có nhân viên</div>
          ) : (
            <ResponsiveTable
              data={mainWarehouseUsers}
              columns={[
                {
                  key: 'email',
                  label: 'Email',
                  render: (staff) => <span className="font-mono text-sm">{staff.email}</span>,
                  mobilePrimary: true,
                },
                {
                  key: 'full_name',
                  label: 'Tên Nhân Viên',
                  render: (staff) => <span>{staff.full_name}</span>,
                  mobilePrimary: true,
                },
                {
                  key: 'role',
                  label: 'Chức Vụ',
                  render: (staff) => {
                    const roleMap: Record<string, { label: string, className: string }> = {
                      "MANAGER": { label: "Quản Lý", className: "bg-purple-100 text-purple-700" },
                      "WAREHOUSE_STAFF": { label: "Nhân Viên Kho", className: "bg-green-100 text-green-700" },
                      "WAREHOUSE_MANAGER": { label: "Quản Lý Cửa Hàng", className: "bg-cyan-100 text-cyan-700" },
                      "GENERAL_MANAGER": { label: "Tổng Quản Lý", className: "bg-blue-100 text-blue-700" },
                      "HR": { label: "Nhân Sự", className: "bg-orange-100 text-orange-700" },
                    }
                    const roleInfo = roleMap[staff.role] || { label: staff.role, className: "bg-gray-100 text-gray-700" }
                    return <Badge className={roleInfo.className}>{roleInfo.label}</Badge>
                  },
                },
                {
                  key: 'status',
                  label: 'Trạng Thái',
                  render: (staff) => (
                    <Badge className={staff.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {staff.is_active ? "Hoạt Động" : "Vô Hiệu Hóa"}
                    </Badge>
                  ),
                },
                {
                  key: 'created_at',
                  label: 'Ngày Tạo',
                  render: (staff) => <span className="text-sm">{formatDbDateToDisplay(staff.created_at)}</span>,
                },
              ]}
              actions={[
                {
                  label: 'Gán Kho',
                  icon: <Building2 className="w-4 h-4" />,
                  onClick: (staff) => {
                    setSelectedUserForAssignment({ id: staff.id, name: staff.full_name })
                    setWarehouseAssignmentOpen(true)
                  },
                  variant: 'outline',
                  show: (staff) => staff.role === 'WAREHOUSE_MANAGER',
                },
                {
                  label: 'Sửa',
                  icon: <Edit className="w-4 h-4" />,
                  onClick: (staff) => handleEditStaff(staff),
                  variant: 'outline',
                },
                {
                  label: 'Xóa',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: (staff) => {
                    setStaffToDelete(staff)
                    setDeleteDialogOpen(true)
                  },
                  variant: 'destructive',
                },
              ]}
              keyExtractor={(staff) => staff.id}
              emptyMessage="Chưa có nhân viên"
              mobileCardTitle={(staff) => staff.full_name}
              mobileCardBadge={(staff) => (
                <Badge className={staff.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {staff.is_active ? "On" : "Off"}
                </Badge>
              )}
              mobileCardMeta={(staff) => {
                const roleMap: Record<string, { label: string, className: string }> = {
                  "MANAGER": { label: "Quản Lý", className: "bg-purple-100 text-purple-700" },
                  "WAREHOUSE_STAFF": { label: "Nhân Viên Kho", className: "bg-green-100 text-green-700" },
                  "WAREHOUSE_MANAGER": { label: "Quản Lý Cửa Hàng", className: "bg-cyan-100 text-cyan-700" },
                  "GENERAL_MANAGER": { label: "Tổng Quản Lý", className: "bg-blue-100 text-blue-700" },
                  "HR": { label: "Nhân Sự", className: "bg-orange-100 text-orange-700" },
                }
                const roleInfo = roleMap[staff.role] || { label: staff.role, className: "bg-gray-100 text-gray-700" }
                return [
                  <span className="text-xs">Email: {staff.email}</span>,
                  <><Badge className={roleInfo.className}>{roleInfo.label}</Badge></>,
                  <span className="text-xs">Ngày tạo: {formatDbDateToDisplay(staff.created_at)}</span>,
                ]
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Edit Staff Dialog */}
      <Dialog open={editStaffDialogOpen} onOpenChange={setEditStaffDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chỉnh Sửa Nhân Viên</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin {editStaffForm.role === "WAREHOUSE_STAFF" ? "- Quyền hạn cố định theo chức vụ" : "và quyền hạn cho nhân viên"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* User Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="editFullName" className="mb-2 block">Tên Nhân Viên</Label>
                <Input
                  id="editFullName"
                  value={editStaffForm.fullName}
                  onChange={(e) => setEditStaffForm({ ...editStaffForm, fullName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="editPassword" className="mb-2 block">Mật Khẩu Mới (để trống để giữ nguyên)</Label>
                <Input
                  id="editPassword"
                  type="password"
                  placeholder="••••••••"
                  value={editStaffForm.password}
                  onChange={(e) => setEditStaffForm({ ...editStaffForm, password: e.target.value })}
                />
              </div>
            </div>

            {/* Permissions - Only show for MANAGER role */}
            {editStaffForm.role === "MANAGER" && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Quyền Hạn</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {MAIN_WAREHOUSE_PERMISSIONS.map((permission) => (
                    <div key={permission.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission.id}
                        checked={editStaffForm.permissions.includes(permission.id)}
                        onCheckedChange={() => togglePermission(permission.id)}
                      />
                      <Label htmlFor={permission.id} className="cursor-pointer font-normal">
                        {permission.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* For WAREHOUSE_STAFF role - show fixed permissions */}
            {editStaffForm.role === "WAREHOUSE_STAFF" && (
              <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Label className="text-base font-semibold text-blue-900">Quyền Hạn Cố Định</Label>
                <p className="text-sm text-blue-800 mb-3">Nhân viên kho có quyền hạn cố định không thể thay đổi:</p>
                <div className="space-y-2">
                  {WAREHOUSE_STAFF_DEFAULT_PERMISSIONS.map((permId) => {
                    const perm = MAIN_WAREHOUSE_PERMISSIONS.find((p) => p.id === permId)
                    return perm ? (
                      <div key={permId} className="text-sm text-blue-800">
                        ✓ {perm.label}
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStaffDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveStaffChanges} disabled={editStaffLoading}>
              {editStaffLoading ? "Đang cập nhật..." : "Lưu Thay Đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác Nhận Xóa Nhân Viên</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa nhân viên <strong>{staffToDelete?.full_name}</strong>? Thao tác này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteStaff}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Đang xóa..." : "Xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warehouse Assignment Dialog */}
      {selectedUserForAssignment && (
        <WarehouseAssignmentDialog
          open={warehouseAssignmentOpen}
          onOpenChange={setWarehouseAssignmentOpen}
          userId={selectedUserForAssignment.id}
          userName={selectedUserForAssignment.name}
          onAssignmentComplete={() => {
            fetchMainWarehouseUsers()
          }}
        />
      )}
    </div>
  )
}
