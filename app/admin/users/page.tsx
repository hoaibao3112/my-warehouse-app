"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, Trash2, Users } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useRef } from "react"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const roleRef = useRef<HTMLSelectElement | null>(null)
  const warehouseRef = useRef<HTMLSelectElement | null>(null)
  const pwdRef = useRef<HTMLInputElement | null>(null)
  const editNameRef = useRef<HTMLInputElement | null>(null)
  const editWarehouseRef = useRef<HTMLSelectElement | null>(null)

  const [filterRole, setFilterRole] = useState("all")
  const [filterWarehouse, setFilterWarehouse] = useState("all")


  const [warehousesList, setWarehousesList] = useState<any[]>([])
  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams()
        if (filterRole && filterRole !== "all") params.append("role", filterRole)
        if (filterWarehouse && filterWarehouse !== "all") params.append("warehouseId", filterWarehouse)

        const res = await mobileFetch(`/api/users?${params.toString()}`)
        const json = await res.json()
        setUsers(json.data || [])
      } catch (e) {
        setUsers([])
      }
    }
    load()
  }, [filterRole, filterWarehouse])

  // Map role values to Vietnamese labels and colors
  const ROLE_LABELS: Record<string, { label: string, color: string }> = {
    ADMIN: { label: "Quản trị viên", color: "bg-red-100 text-red-800" },
    HR: { label: "Nhân sự", color: "bg-purple-100 text-purple-800" },
    GENERAL_MANAGER: { label: "Quản lý tổng", color: "bg-indigo-100 text-indigo-800" },
    WAREHOUSE_MANAGER: { label: "Quản lý cửa hàng", color: "bg-blue-100 text-blue-800" },
    MANAGER: { label: "Quản lý kho chính", color: "bg-cyan-100 text-cyan-800" },
    WAREHOUSE_STAFF: { label: "Nhân viên kho", color: "bg-teal-100 text-teal-800" },
    STAFF: { label: "Nhân viên bán hàng", color: "bg-green-100 text-green-800" },
    ATTENDANCE_STAFF: { label: "Nhân viên (Chấm công)", color: "bg-orange-100 text-orange-800" },
    // Legacy role names fallback
    AdminKhoTong: { label: "Quản trị viên", color: "bg-red-100 text-red-800" },
    QuanLyKhoCon: { label: "Quản lý cửa hàng", color: "bg-blue-100 text-blue-800" },
  }

  const getRoleLabel = (role: string) => {
    return ROLE_LABELS[role]?.label || role
  }

  const getRoleColor = (role: string) => {
    return ROLE_LABELS[role]?.color || "bg-gray-100 text-gray-800"
  }



  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Users}
        title="Người Dùng"
        subtitle="Quản lý người dùng hệ thống"
      />

      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold text-foreground">Người Dùng</h1>
            <p className="text-muted-foreground mt-2">Quản lý người dùng hệ thống và quyền hạn</p>
          </div>
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Thêm Người Dùng</span>
            <span className="md:hidden">Thêm</span>
          </Button>
        </div>

        <Card className="p-6">
          <div className="mb-6 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm người dùng..." className="pl-10" />
            </div>
          </div>

          <ResponsiveTable
            data={users}
            columns={[
              {
                key: 'fullName',
                label: 'Tên',
                render: (user) => <span className="font-medium">{user.fullName || user.name}</span>,
                mobilePrimary: true,
              },
              {
                key: 'email',
                label: 'Email',
                render: (user) => <span>{user.email}</span>,
                mobilePrimary: true,
              },
              {
                key: 'role',
                label: 'Vai Trò',
                render: (user) => <Badge className={getRoleColor(user.role)}>{getRoleLabel(user.role)}</Badge>,
              },
              {
                key: 'warehouse',
                label: 'Kho',
                render: (user) => <span>{user.warehouseId || user.warehouse || '-'}</span>,
              },
              {
                key: 'isActive',
                label: 'Trạng Thái',
                render: (user) => (
                  <Badge className={user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {user.isActive ? 'Hoạt động' : 'Không hoạt động'}
                  </Badge>
                ),
              },
              {
                key: 'createdAt',
                label: 'Tạo',
                render: (user) => <span>{user.createdAt || user.created_at}</span>,
              },
            ]}
            actions={[
              {
                label: 'Sửa',
                icon: <Edit className="w-4 h-4" />,
                onClick: (user) => {
                  setEditingUser(user)
                  setEditOpen(true)
                },
                variant: 'ghost',
              },
              {
                label: 'Xóa',
                icon: <Trash2 className="w-4 h-4" />,
                onClick: () => { },
                variant: 'ghost',
              },
            ]}
            keyExtractor={(user) => user.id}
            emptyMessage="Chưa có người dùng nào"
            mobileCardTitle={(user) => user.fullName || user.name}
            mobileCardBadge={(user) => (
              <Badge className={user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                {user.isActive ? 'Hoạt động' : 'Tắt'}
              </Badge>
            )}
            mobileCardMeta={(user) => [
              <span className="text-xs">Email: {user.email}</span>,
              <><Badge className={getRoleColor(user.role)}>{getRoleLabel(user.role)}</Badge></>,
              <span className="text-xs">Kho: {user.warehouseId || user.warehouse || '-'}</span>,
              <span className="text-xs">Ngày tạo: {user.createdAt || user.created_at}</span>,
            ]}
          />
        </Card>

        <Dialog open={addOpen} onOpenChange={(open) => setAddOpen(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm Người Dùng</DialogTitle>
              <DialogDescription>Thông tin người dùng mới</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 mt-2">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" ref={emailRef} type="email" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input id="fullName" ref={nameRef} type="text" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="role">Vai Trò</Label>
                <select id="role" ref={roleRef} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground mt-1">
                  <option value="ADMIN">Quản trị viên (Admin)</option>
                  <option value="HR">Nhân sự (HR)</option>
                  <option value="GENERAL_MANAGER">Quản lý tổng</option>
                  <option value="WAREHOUSE_MANAGER">Quản lý cửa hàng</option>
                  <option value="MANAGER">Quản lý kho chính</option>
                  <option value="WAREHOUSE_STAFF">Nhân viên kho</option>
                  <option value="STAFF">Nhân viên bán hàng</option>
                  <option value="ATTENDANCE_STAFF">Nhân viên (Chấm công)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="warehouse">
                  Kho {['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF', 'QuanLyKhoCon'].includes(roleRef.current?.value || '') ? '(bắt buộc)' : '(tùy chọn)'}
                </Label>
                <select id="warehouse" ref={warehouseRef} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground mt-1" required={['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF'].includes(roleRef.current?.value || '')}>
                  <option value="">-- Không có --</option>
                  {warehousesList.map((w) => (
                    <option key={w.id} value={w.id}>{w.code ? `${w.code} — ${w.name}` : w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="password">Mật khẩu</Label>
                <Input id="password" ref={pwdRef} type="password" className="mt-1" />
              </div>
            </div>

            <DialogFooter>
              <DialogClose className="btn" disabled={creating}>Hủy</DialogClose>
              <Button onClick={async () => {
                setCreating(true)
                try {
                  const role = roleRef.current?.value
                  const warehouseId = warehouseRef.current?.value

                  // Validate warehouse is selected for store users
                  const rolesRequiringWarehouse = ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF', 'QuanLyKhoCon']
                  if (rolesRequiringWarehouse.includes(role || '') && !warehouseId) {
                    toast.error("Vui lòng chọn kho cho người dùng Quản Lý Kho Con")
                    setCreating(false)
                    return
                  }

                  const payload = {
                    email: emailRef.current?.value,
                    fullName: nameRef.current?.value,
                    role: role,
                    warehouseId: warehouseId || null,
                    password: pwdRef.current?.value,
                  }
                  const res = await mobileFetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                  const json = await res.json()
                  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                  // refresh
                  const r2 = await mobileFetch('/api/users')
                  const j2 = await r2.json()
                  setUsers(j2.data || [])
                  setAddOpen(false)
                } catch (err) {
                  toast.error((err as any)?.message || String(err))
                } finally {
                  setCreating(false)
                }
              }} disabled={creating}>{creating ? 'Đang lưu...' : 'Lưu'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={(open) => setEditOpen(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Chỉnh Sửa Người Dùng</DialogTitle>
              <DialogDescription>Cập nhật thông tin người dùng</DialogDescription>
            </DialogHeader>

            {editingUser && (
              <div className="space-y-2 mt-2">
                <div>
                  <Label htmlFor="editEmail">Email</Label>
                  <Input id="editEmail" value={editingUser.email} disabled className="mt-1 opacity-75" />
                </div>
                <div>
                  <Label htmlFor="editName">Họ và tên</Label>
                  <Input id="editName" ref={editNameRef} type="text" defaultValue={editingUser.fullName} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="editRole">Vai Trò</Label>
                  <Input id="editRole" value={editingUser.role} disabled className="mt-1 opacity-75" />
                </div>
                <div>
                  <Label htmlFor="editWarehouse">
                    Kho {['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF', 'QuanLyKhoCon'].includes(editingUser.role) ? '(bắt buộc)' : '(tùy chọn)'}
                  </Label>
                  <select id="editWarehouse" ref={editWarehouseRef} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground mt-1" defaultValue={editingUser.warehouseId || ''} required={['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF'].includes(editingUser.role)}>
                    <option value="">-- Không có --</option>
                    {warehousesList.map((w) => (
                      <option key={w.id} value={w.id}>{w.code ? `${w.code} — ${w.name}` : w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <DialogFooter>
              <DialogClose className="btn" disabled={updating}>Hủy</DialogClose>
              <Button onClick={async () => {
                setUpdating(true)
                try {
                  const rolesRequiringWarehouse = ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF', 'QuanLyKhoCon']
                  if (rolesRequiringWarehouse.includes(editingUser.role) && !editWarehouseRef.current?.value) {
                    toast.error("Vui lòng chọn kho cho người dùng này")
                    setUpdating(false)
                    return
                  }

                  const payload = {
                    fullName: editNameRef.current?.value,
                    warehouseId: editWarehouseRef.current?.value || null,
                  }
                  const res = await mobileFetch(`/api/users/${editingUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                  const json = await res.json()
                  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                  // refresh
                  const r2 = await mobileFetch('/api/users')
                  const j2 = await r2.json()
                  setUsers(j2.data || [])
                  setEditOpen(false)
                } catch (err) {
                  toast.error((err as any)?.message || String(err))
                } finally {
                  setUpdating(false)
                }
              }} disabled={updating}>{updating ? 'Đang cập nhật...' : 'Cập Nhật'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
