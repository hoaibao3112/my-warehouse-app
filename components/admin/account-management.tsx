"use client"

import { useEffect, useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, Trash2, KeyRound } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { ResponsiveTable } from "@/components/mobile/responsive-table"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"
import { translateError } from "@/lib/error-translator"

export function AccountManagement() {
    const [users, setUsers] = useState<any[]>([])
    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<any>(null)
    const [creating, setCreating] = useState(false)
    const [updating, setUpdating] = useState(false)
    const [canApproveAsWM, setCanApproveAsWM] = useState(false) // Permission for GM to approve as WM
    const emailRef = useRef<HTMLInputElement | null>(null)
    const nameRef = useRef<HTMLInputElement | null>(null)
    const roleRef = useRef<HTMLSelectElement | null>(null)
    const warehouseRef = useRef<HTMLSelectElement | null>(null)
    const pwdRef = useRef<HTMLInputElement | null>(null)
    const editNameRef = useRef<HTMLInputElement | null>(null)
    const editWarehouseRef = useRef<HTMLSelectElement | null>(null)
    const editRoleRef = useRef<HTMLSelectElement | null>(null)

    const [filterRole, setFilterRole] = useState("all")
    const [filterWarehouse, setFilterWarehouse] = useState("all")

    // Track currently selected role in edit dialog (for reactive warehouse UI)
    const [editingRole, setEditingRole] = useState<string>("")

    // Delete user state
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [userToDelete, setUserToDelete] = useState<any>(null)
    const [deleting, setDeleting] = useState(false)

    // Reset password state  
    const [resetPwdOpen, setResetPwdOpen] = useState(false)
    const [newPassword, setNewPassword] = useState("")
    const [resettingPwd, setResettingPwd] = useState(false)

    // Multi-warehouse selection for managers
    const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([])


    const [warehousesList, setWarehousesList] = useState<any[]>([])

    useEffect(() => {
        // Load warehouses for filter/create - exclude PARTNER (franchise) warehouses
        const loadWarehouses = async () => {
            try {
                const res = await mobileFetch("/api/warehouses?pageSize=100")
                const data = await res.json()
                if (data.success) {
                    // Lọc kho PARTNER - admin không quản lý kho nhượng quyền
                    const nonPartnerWarehouses = (data.data || []).filter((w: any) => w.type !== 'PARTNER')
                    setWarehousesList(nonPartnerWarehouses)
                }
            } catch (e) {
                console.error(e)
            }
        }
        loadWarehouses()
    }, [])

    useEffect(() => {
        const load = async () => {
            try {
                const params = new URLSearchParams()
                if (filterRole && filterRole !== "all") params.append("role", filterRole)
                if (filterWarehouse && filterWarehouse !== "all") params.append("warehouseId", filterWarehouse)

                // Add pageSize to get all or reasonable amount
                params.append("pageSize", "100")

                const res = await mobileFetch(`/api/users?${params.toString()}`)
                const json = await res.json()
                // Loại bỏ ADMIN và ATTENDANCE_STAFF - không cần quản lý trong trang này
                const filteredUsers = (json.data || []).filter((u: any) => !['ADMIN', 'ATTENDANCE_STAFF'].includes(u.role))
                setUsers(filteredUsers)
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
        GENERAL_MANAGER: { label: "Tổng quản lý", color: "bg-indigo-100 text-indigo-800" },
        WAREHOUSE_MANAGER: { label: "Quản lý cửa hàng", color: "bg-blue-100 text-blue-800" },
        MANAGER: { label: "Quản lý kho tổng", color: "bg-cyan-100 text-cyan-800" },
        WAREHOUSE_STAFF: { label: "Nhân viên kho", color: "bg-teal-100 text-teal-800" },
        STAFF: { label: "Nhân viên bán hàng", color: "bg-green-100 text-green-800" },
        ATTENDANCE_STAFF: { label: "Nhân viên (Chấm công)", color: "bg-orange-100 text-orange-800" },
    }

    const getRoleLabel = (role: string) => {
        return ROLE_LABELS[role]?.label || role
    }

    const getRoleColor = (role: string) => {
        return ROLE_LABELS[role]?.color || "bg-gray-100 text-gray-800"
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Danh Sách Tài Khoản</h3>
                <Button className="gap-2" onClick={() => setAddOpen(true)}>
                    <Plus className="w-4 h-4" />
                    Thêm Tài Khoản
                </Button>
            </div>

            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex-1">
                        <Input placeholder="Tìm kiếm tài khoản..." className="w-full" />
                    </div>
                    <div className="w-full md:w-48">
                        <select
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                        >
                            <option value="all">Tất cả vai trò</option>
                            <option value="HR">Nhân sự</option>
                            <option value="GENERAL_MANAGER">Tổng quản lý</option>
                            <option value="WAREHOUSE_MANAGER">Quản lý cửa hàng</option>
                            <option value="MANAGER">Quản lý kho tổng</option>
                            <option value="STAFF">Nhân viên bán hàng</option>
                            <option value="WAREHOUSE_STAFF">Nhân viên kho</option>
                        </select>
                    </div>
                    <div className="w-full md:w-48">
                        <select
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={filterWarehouse}
                            onChange={(e) => setFilterWarehouse(e.target.value)}
                        >
                            <option value="all">Tất cả kho</option>
                            {warehousesList.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <ResponsiveTable
                    data={users}
                    columns={[
                        {
                            key: 'fullName',
                            label: 'Tên',
                            render: (user) => <span className="font-medium">{user.fullName || user.name || <span className="text-muted-foreground italic">(Chưa cập nhật)</span>}</span>,
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
                            render: (user) => {
                                // Manager roles có thể quản lý nhiều kho
                                if (['WAREHOUSE_MANAGER', 'GENERAL_MANAGER'].includes(user.role)) {
                                    const warehouseCount = Number(user.warehouseAssignmentCount) || (user.warehouseId ? 1 : 0)
                                    if (warehouseCount > 1) {
                                        return (
                                            <span className="inline-flex items-center gap-1">
                                                <Badge className="bg-blue-100 text-blue-800">{warehouseCount} kho</Badge>
                                            </span>
                                        )
                                    } else if (warehouseCount === 1) {
                                        const warehouseName = user.warehouseName ||
                                            warehousesList.find(w => w.id === user.warehouseId)?.name ||
                                            'Kho đã gán'
                                        return <span>{warehouseName}</span>
                                    }
                                    return <span className="text-muted-foreground">-</span>
                                }
                                // Các role khác - hiển thị 1 kho
                                return <span>{user.warehouseName || (user.warehouseId ? (warehousesList.find(w => w.id === user.warehouseId)?.name || user.warehouseId) : '-')}</span>
                            },
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
                    ]}
                    actions={[
                        {
                            label: 'Sửa',
                            icon: <Edit className="w-4 h-4" />,
                            onClick: async (user) => {
                                setEditingUser(user)
                                // Set permission state based on user's current permissions
                                const hasApproveAsWMPermission = user.permissions?.includes('can_approve_on_behalf_wm') || false
                                setCanApproveAsWM(hasApproveAsWMPermission)

                                // Load warehouse assignments for manager roles
                                if (['WAREHOUSE_MANAGER', 'GENERAL_MANAGER'].includes(user.role)) {
                                    try {
                                        const res = await mobileFetch(`/api/users/${user.id}/warehouse-assignments`)
                                        const json = await res.json()
                                        if (json.success && json.data) {
                                            setSelectedWarehouseIds(json.data.map((a: any) => a.warehouseId))
                                        } else {
                                            setSelectedWarehouseIds(user.warehouseId ? [user.warehouseId] : [])
                                        }
                                    } catch (err) {
                                        // Fallback to single warehouse
                                        setSelectedWarehouseIds(user.warehouseId ? [user.warehouseId] : [])
                                    }
                                } else {
                                    setSelectedWarehouseIds([])
                                }

                                setNewPassword("") // Reset password field
                                setEditingRole(user.role) // Set initial editing role
                                setEditOpen(true)
                            },
                            variant: 'ghost',
                        },
                        {
                            label: 'Xóa',
                            icon: <Trash2 className="w-4 h-4" />,
                            onClick: (user) => {
                                setUserToDelete(user)
                                setDeleteOpen(true)
                            },
                            variant: 'destructive',
                        },
                    ]}
                    keyExtractor={(user) => user.id}
                    emptyMessage="Chưa có tài khoản nào"
                    mobileCardTitle={(user) => user.fullName || user.name}
                    mobileCardBadge={(user) => (
                        <Badge className={user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {user.isActive ? 'Hoạt động' : 'Tắt'}
                        </Badge>
                    )}
                    mobileCardMeta={(user) => [
                        <span className="text-xs">Email: {user.email}</span>,
                        <><Badge className={getRoleColor(user.role)}>{getRoleLabel(user.role)}</Badge></>,
                    ]}
                />
            </Card>

            <Dialog open={addOpen} onOpenChange={(open) => setAddOpen(open)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Thêm Tài Khoản Mới</DialogTitle>
                        <DialogDescription>Tạo tài khoản mới cho hệ thống</DialogDescription>
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
                                Kho (Bắt buộc với vai trò cửa hàng/kho)
                            </Label>
                            <select id="warehouse" ref={warehouseRef} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground mt-1">
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
                                const rolesRequiringWarehouse = ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF']
                                if (rolesRequiringWarehouse.includes(role || '') && !warehouseId) {
                                    toast.error("Vui lòng chọn kho cho vai trò này")
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
                                const params = new URLSearchParams()
                                if (filterRole && filterRole !== "all") params.append("role", filterRole)
                                if (filterWarehouse && filterWarehouse !== "all") params.append("warehouseId", filterWarehouse)
                                params.append("pageSize", "100")
                                const r2 = await mobileFetch(`/api/users?${params.toString()}`)
                                const j2 = await r2.json()
                                setUsers(j2.data || [])

                                setAddOpen(false)
                                toast.success("Đã tạo tài khoản thành công")
                            } catch (err) {
                                toast.error(translateError(err))
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
                        <DialogTitle>Chỉnh Sửa Tài Khoản</DialogTitle>
                        <DialogDescription>Cập nhật thông tin tài khoản</DialogDescription>
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
                                <select
                                    id="editRole"
                                    ref={editRoleRef}
                                    value={editingRole}
                                    onChange={(e) => {
                                        setEditingRole(e.target.value)
                                        // Reset warehouse selection when role changes
                                        if (['WAREHOUSE_MANAGER', 'GENERAL_MANAGER'].includes(e.target.value)) {
                                            // Keep multi-select mode
                                        } else {
                                            // Switch to single select - keep only first warehouse or clear
                                            if (selectedWarehouseIds.length > 1) {
                                                setSelectedWarehouseIds([selectedWarehouseIds[0]])
                                            }
                                        }
                                    }}
                                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground mt-1"
                                >
                                    <option value="HR">Nhân sự</option>
                                    <option value="GENERAL_MANAGER">Tổng quản lý</option>
                                    <option value="WAREHOUSE_MANAGER">Quản lý cửa hàng</option>
                                    <option value="MANAGER">Quản lý kho tổng</option>
                                    <option value="STAFF">Nhân viên bán hàng</option>
                                    <option value="WAREHOUSE_STAFF">Nhân viên kho</option>
                                </select>
                            </div>
                            {/* Warehouse assignment - multi-select for WAREHOUSE_MANAGER/GENERAL_MANAGER */}
                            {(['WAREHOUSE_MANAGER', 'GENERAL_MANAGER'].includes(editingRole)) ? (
                                <div>
                                    <Label className="mb-2 block">Quản lý các kho</Label>

                                    {/* Selected warehouses badges */}
                                    {selectedWarehouseIds.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {selectedWarehouseIds.map(id => {
                                                const w = warehousesList.find(w => w.id === id)
                                                return w ? (
                                                    <span
                                                        key={id}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                                                    >
                                                        {w.code || w.name}
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedWarehouseIds(selectedWarehouseIds.filter(i => i !== id))}
                                                            className="hover:bg-primary/20 rounded-full p-0.5"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </span>
                                                ) : null
                                            })}
                                        </div>
                                    )}

                                    {/* Dropdown with checkbox list */}
                                    <details className="group">
                                        <summary className="flex items-center justify-between cursor-pointer px-3 py-2 border rounded-lg bg-background hover:bg-muted/50">
                                            <span className="text-sm text-muted-foreground">
                                                {selectedWarehouseIds.length > 0
                                                    ? `Đã chọn ${selectedWarehouseIds.length} kho`
                                                    : 'Chọn kho...'}
                                            </span>
                                            <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </summary>
                                        <div className="mt-1 border rounded-lg bg-background shadow-lg">
                                            {/* Quick actions */}
                                            <div className="flex gap-2 p-2 border-b text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedWarehouseIds(warehousesList.map(w => w.id))}
                                                    className="text-primary hover:underline"
                                                >
                                                    Chọn tất cả
                                                </button>
                                                <span className="text-muted-foreground">|</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedWarehouseIds([])}
                                                    className="text-muted-foreground hover:underline"
                                                >
                                                    Bỏ chọn
                                                </button>
                                            </div>
                                            {/* Checkbox list */}
                                            <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                                                {warehousesList.map((w) => (
                                                    <label key={w.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 hover:bg-muted rounded text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedWarehouseIds.includes(w.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedWarehouseIds([...selectedWarehouseIds, w.id])
                                                                } else {
                                                                    setSelectedWarehouseIds(selectedWarehouseIds.filter(id => id !== w.id))
                                                                }
                                                            }}
                                                            className="h-4 w-4 rounded border-gray-300 text-primary"
                                                        />
                                                        <span>{w.code ? `${w.code} — ${w.name}` : w.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            ) : (
                                <div>
                                    <Label htmlFor="editWarehouse">Kho</Label>
                                    <select id="editWarehouse" ref={editWarehouseRef} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground mt-1" defaultValue={editingUser.warehouseId || ''}>
                                        <option value="">-- Không có --</option>
                                        {warehousesList.map((w) => (
                                            <option key={w.id} value={w.id}>{w.code ? `${w.code} — ${w.name}` : w.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {/* Permission for GENERAL_MANAGER to approve on behalf of WAREHOUSE_MANAGER */}
                            {editingUser.role === 'GENERAL_MANAGER' && (
                                <div className="flex items-center space-x-2 mt-4 p-3 border border-input rounded-lg bg-muted/50">
                                    <input
                                        type="checkbox"
                                        id="canApproveAsWM"
                                        checked={canApproveAsWM}
                                        onChange={(e) => setCanApproveAsWM(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <Label htmlFor="canApproveAsWM" className="cursor-pointer">
                                        Cho phép duyệt thay Quản lý cửa hàng
                                    </Label>
                                </div>
                            )}

                            {/* Reset password section */}
                            <div className="border-t pt-4 mt-4">
                                <Label className="text-sm font-medium text-muted-foreground">Đặt lại mật khẩu</Label>
                                <div className="flex gap-2 mt-2">
                                    <Input
                                        type="password"
                                        placeholder="Nhập mật khẩu mới..."
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={!newPassword || resettingPwd}
                                        onClick={async () => {
                                            if (!newPassword || !editingUser) return
                                            setResettingPwd(true)
                                            try {
                                                const res = await mobileFetch(`/api/users/${editingUser.id}`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ password: newPassword })
                                                })
                                                const json = await res.json()
                                                if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                                                toast.success("Đã đặt lại mật khẩu")
                                                setNewPassword("")
                                            } catch (err) {
                                                toast.error(translateError(err))
                                            } finally {
                                                setResettingPwd(false)
                                            }
                                        }}
                                    >
                                        <KeyRound className="w-4 h-4 mr-1" />
                                        {resettingPwd ? 'Đang xử lý...' : 'Đặt lại'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <DialogClose className="btn" disabled={updating}>Hủy</DialogClose>
                        <Button onClick={async () => {
                            setUpdating(true)
                            try {
                                // Validation for non-manager roles
                                const rolesUsingMultiWarehouse = ['WAREHOUSE_MANAGER', 'GENERAL_MANAGER']
                                const rolesRequiringSingleWarehouse = ['WAREHOUSE_STAFF', 'STAFF', 'ATTENDANCE_STAFF']

                                if (rolesRequiringSingleWarehouse.includes(editingRole) && !editWarehouseRef.current?.value) {
                                    toast.error("Vui lòng chọn kho cho vai trò này")
                                    setUpdating(false)
                                    return
                                }

                                // Build base payload
                                const newRole = editingRole || editingUser.role
                                const payload: any = {
                                    fullName: editNameRef.current?.value,
                                    role: newRole,
                                }

                                // Include permissions for GENERAL_MANAGER
                                if (newRole === 'GENERAL_MANAGER') {
                                    const newPermissions = canApproveAsWM ? ['can_approve_on_behalf_wm'] : []
                                    payload.permissions = newPermissions
                                }

                                // For manager roles, update warehouse assignments separately
                                if (rolesUsingMultiWarehouse.includes(newRole)) {
                                    // Update warehouse assignments via dedicated API
                                    const assignRes = await mobileFetch(`/api/users/${editingUser.id}/warehouse-assignments`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ warehouseIds: selectedWarehouseIds })
                                    })
                                    const assignJson = await assignRes.json()
                                    if (!assignRes.ok || !assignJson?.success) {
                                        throw new Error(assignJson?.error || 'Failed to update warehouse assignments')
                                    }
                                } else {
                                    // For other roles, use single warehouseId
                                    payload.warehouseId = editWarehouseRef.current?.value || null
                                }

                                // Update user info
                                const res = await mobileFetch(`/api/users/${editingUser.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload)
                                })
                                const json = await res.json()
                                if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')

                                // refresh
                                const params = new URLSearchParams()
                                if (filterRole && filterRole !== "all") params.append("role", filterRole)
                                if (filterWarehouse && filterWarehouse !== "all") params.append("warehouseId", filterWarehouse)
                                params.append("pageSize", "100")
                                const r2 = await mobileFetch(`/api/users?${params.toString()}`)
                                const j2 = await r2.json()
                                setUsers(j2.data || [])

                                setEditOpen(false)
                                toast.success("Cập nhật thành công")
                            } catch (err) {
                                toast.error(translateError(err))
                            } finally {
                                setUpdating(false)
                            }
                        }} disabled={updating}>{updating ? 'Đang cập nhật...' : 'Cập Nhật'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete User Confirmation */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Xác nhận xóa tài khoản</AlertDialogTitle>
                        <AlertDialogDescription>
                            Bạn có chắc chắn muốn xóa tài khoản <strong>{userToDelete?.fullName || userToDelete?.email}</strong>?
                            Hành động này không thể hoàn tác.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (!userToDelete) return
                                setDeleting(true)
                                try {
                                    const res = await mobileFetch(`/api/users/${userToDelete.id}`, { method: 'DELETE' })
                                    const json = await res.json()
                                    if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')

                                    // Refresh list
                                    const params = new URLSearchParams()
                                    if (filterRole && filterRole !== "all") params.append("role", filterRole)
                                    if (filterWarehouse && filterWarehouse !== "all") params.append("warehouseId", filterWarehouse)
                                    params.append("pageSize", "100")
                                    const r2 = await mobileFetch(`/api/users?${params.toString()}`)
                                    const j2 = await r2.json()
                                    setUsers(j2.data || [])

                                    setDeleteOpen(false)
                                    setUserToDelete(null)
                                    toast.success("Đã xóa tài khoản")
                                } catch (err) {
                                    toast.error(translateError(err))
                                } finally {
                                    setDeleting(false)
                                }
                            }}
                            disabled={deleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {deleting ? 'Đang xóa...' : 'Xóa'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
