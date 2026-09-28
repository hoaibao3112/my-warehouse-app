"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isWarehouseManager, isGeneralManager } from "@/lib/auth-helpers"
import { ResponsiveTable, TableColumn, TableAction } from "@/components/mobile/responsive-table"
import { Edit, Users, UserPlus } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"

const AVAILABLE_PERMISSIONS = [
  { id: "sales", label: "Bán Hàng" },
  { id: "purchase_requests", label: "Yêu Cầu Nhập Hàng" },
  { id: "inventory_check", label: "Quản Lý Tồn Kho" },
  { id: "loss_reports", label: "Báo Cáo Mất Hàng" },
  { id: "reports", label: "Kiểm Kê" }
]

const EDUCATION_LEVELS = [
  { value: "THPT", label: "THPT (Trung học phổ thông)" },
  { value: "CAO_DANG", label: "Cao Đẳng" },
  { value: "DAI_HOC", label: "Đại Học" },
  { value: "KHAC", label: "Khác" },
]

interface StaffUser {
  id: string
  email: string
  full_name: string
  role: string
  warehouse_id?: string
  is_active: boolean
  permissions?: string
  employment_type?: "FULLTIME" | "PARTTIME"
  contract_signed_date?: string
  employment_start_date?: string
  contract_expiry_date?: string
  work_status?: "ACTIVE" | "INACTIVE"
  national_id?: string
  bank_account?: string
  bank_name?: string
  permanent_address?: string
  phone_number?: string
  education_level?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  termination_date?: string
  created_at: string
  updated_at: string
}

export default function StoreUsersPage() {
  const { user, loading: authLoading } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse()
  const router = useRouter()
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(false)


  // For GENERAL_MANAGER, use selected warehouse; for others use their assigned warehouse
  const currentWarehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : user?.warehouseId

  // Create staff dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    phoneNumber: "",
    email: "",
    fullName: "",
    password: "",
    accountType: "STAFF" as "STAFF" | "ATTENDANCE_STAFF" | "WAREHOUSE_STAFF",
    employmentType: "FULLTIME" as "FULLTIME" | "PARTTIME",
    contractSignedDate: "",
    employmentStartDate: "",
    contractExpiryDate: "",
    workStatus: "ACTIVE" as "ACTIVE" | "INACTIVE",
    nationalId: "",
    bankAccount: "",
    bankName: "",
    permanentAddress: "",
    educationLevel: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    terminationDate: ""
  })

  // Edit staff dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null)
  const [editDialogLoading, setEditDialogLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    fullName: "",
    password: "",
    permissions: [] as string[],
    contractSignedDate: "",
    employmentStartDate: "",
    contractExpiryDate: "",
    workStatus: "ACTIVE" as "ACTIVE" | "INACTIVE",
    nationalId: "",
    bankAccount: "",
    bankName: "",
    permanentAddress: "",
    educationLevel: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    terminationDate: ""
  })

  // Check if user is warehouse manager or general manager
  const canManageUsers = isWarehouseManager(user) || isGeneralManager(user)
  useEffect(() => {
    if (!authLoading && user && !canManageUsers) {
      router.push("/store")
    }
  }, [user, authLoading, router, canManageUsers])

  // Fetch staff users and manager email
  useEffect(() => {
    if (currentWarehouseId && canManageUsers) {
      fetchStaffUsers()
    }
  }, [currentWarehouseId, canManageUsers])

  // Listen for warehouse changes separately to avoid stale closure
  useEffect(() => {
    const handleWarehouseChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ warehouseId: string }>
      const newWarehouseId = customEvent.detail?.warehouseId
      if (newWarehouseId && canManageUsers) {
        // Force fetch with the new warehouseId from event
        setLoading(true)
        mobileFetch(`/api/warehouse-users?warehouseId=${newWarehouseId}&pageSize=100`)
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setStaffUsers(data.data)
            }
          })
          .catch(error => {
            console.error("Error fetching staff users:", error)
            toast.error("Không thể tải danh sách nhân viên")
          })
          .finally(() => setLoading(false))
      }
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [canManageUsers, toast])

  const fetchStaffUsers = async () => {
    if (!currentWarehouseId) return
    setLoading(true)
    try {
      const response = await mobileFetch(`/api/warehouse-users?warehouseId=${currentWarehouseId}&pageSize=100`)
      const data = await response.json()
      if (data.success) {
        console.log("[STORE USERS] Fetched staff users:", data.data)
        data.data.forEach((staff: StaffUser) => {
          console.log(`[STORE USERS] Staff ${staff.email}: permissions = ${staff.permissions} (type: ${typeof staff.permissions})`)
        })
        setStaffUsers(data.data)
      }
    } catch (error) {
      console.error("Error fetching staff users:", error)
      toast.error("Không thể tải danh sách nhân viên")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWarehouseId || !user?.warehouseId) return

    // Check if either phone number or email is provided
    if (!formData.phoneNumber && !formData.email) {
      toast.error("Vui lòng nhập Số điện thoại hoặc Email")
      return
    }

    setLoading(true)
    try {
      const response = await mobileFetch("/api/warehouse-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: formData.phoneNumber,
          email: formData.email,
          fullName: formData.fullName,
          password: formData.password,
          warehouseId: user.warehouseId,
          accountType: formData.accountType,
          employmentType: formData.employmentType,
          contractSignedDate: formData.contractSignedDate || null,
          employmentStartDate: formData.employmentStartDate || null,
          contractExpiryDate: formData.contractExpiryDate || null,
          workStatus: formData.workStatus || 'ACTIVE',
          nationalId: formData.nationalId || null,
          bankAccount: formData.bankAccount || null,
          bankName: formData.bankName || null,
          permanentAddress: formData.permanentAddress || null,
          educationLevel: formData.educationLevel || null,
          emergencyContactName: formData.emergencyContactName || null,
          emergencyContactPhone: formData.emergencyContactPhone || null
        })
      })
      const data = await response.json()
      if (data.success) {
        setFormData({
          phoneNumber: "",
          email: "",
          fullName: "",
          password: "",
          accountType: "STAFF",
          employmentType: "FULLTIME",
          contractSignedDate: "",
          employmentStartDate: "",
          contractExpiryDate: "",
          workStatus: "ACTIVE",
          nationalId: "",
          bankAccount: "",
          bankName: "",
          permanentAddress: "",
          educationLevel: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          terminationDate: ""
        })
        setCreateDialogOpen(false)
        await fetchStaffUsers()
        toast.success("Tạo nhân viên mới thành công")
      } else {
        toast.error(data.error || "Không thể tạo nhân viên")
      }
    } catch (error) {
      console.error("Error creating staff:", error)
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenEditDialog = (staff: StaffUser) => {
    setEditingStaff(staff)
    console.log("[STORE USERS] Opening edit dialog for staff:", staff)
    console.log("[STORE USERS] Raw permissions from staff object:", staff.permissions, "type:", typeof staff.permissions)
    let parsedPermissions: string[] = []
    try {
      if (staff.permissions) {
        if (typeof staff.permissions === 'string') {
          console.log("[STORE USERS] Parsing permissions as JSON string:", staff.permissions)
          parsedPermissions = JSON.parse(staff.permissions)
        } else if (Array.isArray(staff.permissions)) {
          console.log("[STORE USERS] Permissions already array:", staff.permissions)
          parsedPermissions = staff.permissions
        } else {
          console.log("[STORE USERS] Permissions is neither string nor array, setting empty")
          parsedPermissions = []
        }
      }
    } catch (e) {
      console.error("[STORE USERS] Error parsing permissions:", e, staff.permissions)
      parsedPermissions = []
    }
    console.log("[STORE USERS] Final parsed permissions for form:", parsedPermissions)
    setEditForm({
      fullName: staff.full_name,
      password: "",
      permissions: parsedPermissions,
      contractSignedDate: staff.contract_signed_date ? new Date(staff.contract_signed_date).toISOString().split('T')[0] : "",
      employmentStartDate: staff.employment_start_date ? new Date(staff.employment_start_date).toISOString().split('T')[0] : "",
      contractExpiryDate: staff.contract_expiry_date ? new Date(staff.contract_expiry_date).toISOString().split('T')[0] : "",
      workStatus: (staff.work_status || "ACTIVE") as "ACTIVE" | "INACTIVE",
      nationalId: staff.national_id || "",
      bankAccount: staff.bank_account || "",
      bankName: staff.bank_name || "",
      permanentAddress: staff.permanent_address || "",
      educationLevel: staff.education_level || "",
      emergencyContactName: staff.emergency_contact_name || "",
      emergencyContactPhone: staff.emergency_contact_phone || "",
      terminationDate: staff.termination_date ? new Date(staff.termination_date).toISOString().split('T')[0] : ""
    })
    setEditDialogOpen(true)
  }

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStaff) return
    setEditDialogLoading(true)
    try {
      const requestBody = {
        full_name: editForm.fullName,
        password: editForm.password || undefined,
        permissions: editForm.permissions,
        contract_signed_date: editForm.contractSignedDate || null,
        employment_start_date: editForm.employmentStartDate || null,
        contract_expiry_date: editForm.contractExpiryDate || null,
        work_status: editForm.workStatus || 'ACTIVE',
        national_id: editForm.nationalId || null,
        bank_account: editForm.bankAccount || null,
        bank_name: editForm.bankName || null,
        permanent_address: editForm.permanentAddress || null,
        education_level: editForm.educationLevel || null,
        emergency_contact_name: editForm.emergencyContactName || null,
        emergency_contact_phone: editForm.emergencyContactPhone || null,
        termination_date: editForm.terminationDate || null
      }
      console.log("[STORE USERS] Sending update request with permissions:", editForm.permissions)
      console.log("[STORE USERS] Full request body:", requestBody)
      const response = await mobileFetch(`/api/warehouse-users/${editingStaff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      })
      const data = await response.json()
      console.log("[STORE USERS] Update response:", data)
      if (data.success) {
        console.log("[STORE USERS] Update successful, staff data returned:", data.data)
        setEditDialogOpen(false)
        setEditingStaff(null)
        await fetchStaffUsers()
      } else {
        toast.error(data.error || "Không thể cập nhật nhân viên")
      }
    } catch (error) {
      console.error("Error updating staff:", error)
      toast.error((error as Error).message)
    } finally {
      setEditDialogLoading(false)
    }
  }

  const togglePermission = (permissionId: string) => {
    setEditForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }))
  }

  if (authLoading) {
    return <div className="p-8">Đang tải...</div>
  }

  if (!user || !canManageUsers) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Users}
        title="Quản Lý Nhân Viên"
        subtitle="Quản lý tài khoản nhân viên"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold">Quản Lý Nhân Viên</h1>
            <p className="text-muted-foreground mt-2">Tạo và quản lý tài khoản nhân viên cho kho của bạn</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <UserPlus className="w-5 h-5" />
                <span>Tạo Nhân Viên Mới</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tạo Tài Khoản Nhân Viên Mới</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreateStaff} className="space-y-6">
                {/* Thông tin bắt buộc */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <h3 className="text-lg font-semibold">Thông Tin Bắt Buộc</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">
                        Số Điện Thoại
                      </Label>
                      <Input
                        id="phoneNumber"
                        placeholder="0901234567"
                        value={formData.phoneNumber}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setFormData({ ...formData, phoneNumber: value })
                        }}
                        disabled={loading}
                        maxLength={11}
                      />
                      <p className="text-xs text-muted-foreground">Dùng để đăng nhập</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">
                        Tên Nhân Viên <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="fullName"
                        placeholder="Nguyễn Văn A"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">
                        Mật Khẩu <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accountType">
                        Vai Trò <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.accountType}
                        onValueChange={(value: "STAFF" | "ATTENDANCE_STAFF") => setFormData({ ...formData, accountType: value })}
                        disabled={loading}
                      >
                        <SelectTrigger id="accountType">
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STAFF">Nhân viên bán hàng</SelectItem>
                          <SelectItem value="ATTENDANCE_STAFF">Nhân viên (Chấm công)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {formData.accountType === "STAFF"
                          ? "Bán hàng, kho, nhập hàng, kiểm kê, ..."
                          : "Chỉ chấm công vào/ra ca"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={loading}
                      />
                      <p className="text-xs text-muted-foreground">Có thể dùng đăng nhập thay SĐT</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="employmentType">
                        Loại Hình Làm Việc <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.employmentType}
                        onValueChange={(value: "FULLTIME" | "PARTTIME") => setFormData({ ...formData, employmentType: value })}
                        disabled={loading}
                      >
                        <SelectTrigger id="employmentType">
                          <SelectValue placeholder="Chọn loại hình" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FULLTIME">Toàn thời gian</SelectItem>
                          <SelectItem value="PARTTIME">Bán thời gian</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {formData.employmentType === "FULLTIME"
                          ? "Fulltime: 22 ngày/tháng, có phép 2 ngày"
                          : "Parttime: Đăng ký linh hoạt"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Thông tin cá nhân */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <h3 className="text-lg font-semibold">Thông Tin Cá Nhân</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nationalId">Số CCCD/CMND</Label>
                      <Input
                        id="nationalId"
                        placeholder="001234567890"
                        value={formData.nationalId}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setFormData({ ...formData, nationalId: value })
                        }}
                        disabled={loading}
                        maxLength={12}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="permanentAddress">Địa Chỉ Thường Trú</Label>
                      <Input
                        id="permanentAddress"
                        placeholder="123 Đường ABC, Quận XYZ"
                        value={formData.permanentAddress}
                        onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="educationLevel">Bằng Cấp</Label>
                      <Select
                        value={formData.educationLevel || "__none__"}
                        onValueChange={(value) => setFormData({ ...formData, educationLevel: value === "__none__" ? "" : value })}
                        disabled={loading}
                      >
                        <SelectTrigger id="educationLevel">
                          <SelectValue placeholder="Chọn bằng cấp" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Không chọn</SelectItem>
                          {EDUCATION_LEVELS.map(level => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactName">Tên Người Thân</Label>
                      <Input
                        id="emergencyContactName"
                        placeholder="Nguyễn Văn B"
                        value={formData.emergencyContactName}
                        onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone">Số Điện Thoại Người Thân</Label>
                      <Input
                        id="emergencyContactPhone"
                        placeholder="0901234567"
                        value={formData.emergencyContactPhone}
                        onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Thông tin ngân hàng */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <h3 className="text-lg font-semibold">Thông Tin Ngân Hàng</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bankName">Tên Ngân Hàng</Label>
                      <Input
                        id="bankName"
                        placeholder="VD: Vietcombank, Techcombank..."
                        value={formData.bankName}
                        onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bankAccount">Số Tài Khoản</Label>
                      <Input
                        id="bankAccount"
                        placeholder="1234567890"
                        value={formData.bankAccount}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setFormData({ ...formData, bankAccount: value })
                        }}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Tình trạng công việc */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <h3 className="text-lg font-semibold">Tình Trạng Công Việc</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contractSignedDate">Ngày Ký Hợp Đồng</Label>
                      <Input
                        id="contractSignedDate"
                        type="date"
                        value={formData.contractSignedDate}
                        onChange={(e) => setFormData({ ...formData, contractSignedDate: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="employmentStartDate">Ngày Vào Làm</Label>
                      <Input
                        id="employmentStartDate"
                        type="date"
                        value={formData.employmentStartDate}
                        onChange={(e) => setFormData({ ...formData, employmentStartDate: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contractExpiryDate">Ngày Hết Hạn HĐ</Label>
                      <Input
                        id="contractExpiryDate"
                        type="date"
                        value={formData.contractExpiryDate}
                        onChange={(e) => setFormData({ ...formData, contractExpiryDate: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="workStatus">Trạng Thái Công Việc</Label>
                      <Select
                        value={formData.workStatus}
                        onValueChange={(value: "ACTIVE" | "INACTIVE") => setFormData({ ...formData, workStatus: value })}
                        disabled={loading}
                      >
                        <SelectTrigger id="workStatus">
                          <SelectValue placeholder="Chọn trạng thái" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Hoạt Động</SelectItem>
                          <SelectItem value="INACTIVE">Ngưng Hoạt Động</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                    disabled={loading}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Đang tạo..." : "Tạo Nhân Viên"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh Sách Nhân Viên</CardTitle>
            <CardDescription>Danh sách tất cả nhân viên trong kho</CardDescription>
          </CardHeader>
          <CardContent>
            {staffUsers.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Chưa có nhân viên nào. Tạo nhân viên đầu tiên bằng form phía trên.
              </div>
            ) : (
              <ResponsiveTable
                data={staffUsers}
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
                    key: 'employment_type',
                    label: 'Loại Hình',
                    render: (staff) => (
                      <Badge variant="outline" className={staff.employment_type === 'FULLTIME' ? 'border-green-500 text-green-700' : 'border-orange-500 text-orange-700'}>
                        {staff.employment_type === 'FULLTIME' ? 'Fulltime' : 'Parttime'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'role',
                    label: 'Vai Trò',
                    render: (staff) => {
                      let label = 'Khác';
                      let className = 'bg-gray-50 text-gray-700';

                      if (staff.role === 'STAFF') {
                        label = 'Bán Hàng';
                        className = 'bg-green-50 text-green-700';
                      } else if (staff.role === 'WAREHOUSE_STAFF' || staff.role === 'ATTENDANCE_STAFF') {
                        label = 'Chấm Công';
                        className = 'bg-orange-50 text-orange-700';
                      } else {
                        label = staff.role;
                      }

                      return (
                        <Badge variant="secondary" className={className}>
                          {label}
                        </Badge>
                      )
                    },
                  },
                  {
                    key: 'contract_signed_date',
                    label: 'Ngày Ký',
                    render: (staff) => (
                      <span className="text-xs md:text-sm">
                        {staff.contract_signed_date ? formatDbDateToDisplay(staff.contract_signed_date) : '-'}
                      </span>
                    ),
                  },
                  {
                    key: 'employment_start_date',
                    label: 'Vào Làm',
                    render: (staff) => (
                      <span className="text-xs md:text-sm">
                        {staff.employment_start_date ? formatDbDateToDisplay(staff.employment_start_date) : '-'}
                      </span>
                    ),
                  },
                  {
                    key: 'contract_expiry_date',
                    label: 'Hết Hạn',
                    render: (staff) => (
                      <span className="text-xs md:text-sm">
                        {staff.contract_expiry_date ? formatDbDateToDisplay(staff.contract_expiry_date) : '-'}
                      </span>
                    ),
                  },
                  {
                    key: 'work_status',
                    label: 'Công Việc',
                    render: (staff) => (
                      <Badge
                        variant={staff.work_status === 'ACTIVE' ? 'default' : 'destructive'}
                        className={staff.work_status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}
                      >
                        {staff.work_status === 'ACTIVE' ? 'Hoạt Động' : 'Ngưng'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'created_at',
                    label: 'Ngày Tạo',
                    render: (staff) => <span>{formatDbDateToDisplay(staff.created_at)}</span>,
                  },
                ]}
                actions={[
                  {
                    label: 'Chỉnh Sửa',
                    icon: <Edit className="w-4 h-4" />,
                    onClick: (staff) => handleOpenEditDialog(staff),
                  },
                ]}
                keyExtractor={(staff) => staff.id}
                loading={loading}
                emptyMessage="Chưa có nhân viên nào"
                mobileCardTitle={(staff) => staff.full_name}
                mobileCardBadge={(staff) => (
                  <Badge variant={staff.is_active ? 'default' : 'secondary'} className={staff.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-700'}>
                    {staff.is_active ? "Hoạt Động" : "Tắt"}
                  </Badge>
                )}
                mobileCardMeta={(staff) => [
                  <>📧 {staff.email}</>,
                  <>{(staff.role === 'WAREHOUSE_STAFF' || staff.role === 'ATTENDANCE_STAFF') ? '⏰ Chấm Công' : (staff.role === 'STAFF' ? '🛍️ Bán Hàng' : '👤 ' + staff.role)}</>,
                  <>📅 {formatDbDateToDisplay(staff.created_at)}</>,
                ]}
              />
            )}
          </CardContent>
        </Card>

        {/* Edit Staff Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Chỉnh Sửa Tài Khoản Nhân Viên</DialogTitle>
            </DialogHeader>

            {editingStaff && (
              <form onSubmit={handleUpdateStaff} className="space-y-4">
                {/* Staff Info */}
                <div>
                  <div className="flex items-center gap-2 pb-1.5 border-b mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    <h3 className="text-sm font-semibold">Thông Tin Nhân Viên</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="edit-email" className="text-xs">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editingStaff.email}
                        disabled
                        className="bg-gray-100 h-9 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="edit-fullName" className="text-xs">Tên Nhân Viên</Label>
                        <Input
                          id="edit-fullName"
                          value={editForm.fullName}
                          onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-password" className="text-xs">Mật Khẩu Mới</Label>
                        <Input
                          id="edit-password"
                          type="password"
                          placeholder="Để trống nếu không đổi"
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Info */}
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                    <h3 className="text-sm font-semibold">Thông Tin Cá Nhân</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-nationalId" className="text-xs">Số CCCD/CMND</Label>
                      <Input
                        id="edit-nationalId"
                        placeholder="001234567890"
                        value={editForm.nationalId}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setEditForm({ ...editForm, nationalId: value })
                        }}
                        maxLength={12}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-permanentAddress" className="text-xs">Địa Chỉ Thường Trú</Label>
                      <Input
                        id="edit-permanentAddress"
                        placeholder="123 Đường ABC, Quận XYZ"
                        value={editForm.permanentAddress}
                        onChange={(e) => setEditForm({ ...editForm, permanentAddress: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-educationLevel" className="text-xs">Bằng Cấp</Label>
                      <Select
                        value={editForm.educationLevel || "__none__"}
                        onValueChange={(value) => setEditForm({ ...editForm, educationLevel: value === "__none__" ? "" : value })}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Chọn bằng cấp" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Không chọn</SelectItem>
                          {EDUCATION_LEVELS.map(level => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit-emergencyContactName" className="text-xs">Tên Người Thân</Label>
                      <Input
                        id="edit-emergencyContactName"
                        placeholder="Nguyễn Văn B"
                        value={editForm.emergencyContactName}
                        onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-emergencyContactPhone" className="text-xs">Số Điện Thoại Người Thân</Label>
                      <Input
                        id="edit-emergencyContactPhone"
                        placeholder="0901234567"
                        value={editForm.emergencyContactPhone}
                        onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Info */}
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    <h3 className="text-sm font-semibold">Thông Tin Ngân Hàng</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-bankName" className="text-xs">Tên Ngân Hàng</Label>
                      <Input
                        id="edit-bankName"
                        placeholder="VD: Vietcombank, Techcombank..."
                        value={editForm.bankName}
                        onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-bankAccount" className="text-xs">Số Tài Khoản</Label>
                      <Input
                        id="edit-bankAccount"
                        placeholder="1234567890"
                        value={editForm.bankAccount}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setEditForm({ ...editForm, bankAccount: value })
                        }}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Work Status */}
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                    <h3 className="text-sm font-semibold">Tình Trạng Công Việc</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="edit-contractSignedDate" className="text-xs">Ngày Ký Hợp Đồng</Label>
                        <Input
                          id="edit-contractSignedDate"
                          type="date"
                          value={editForm.contractSignedDate}
                          onChange={(e) => setEditForm({ ...editForm, contractSignedDate: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-employmentStartDate" className="text-xs">Ngày Vào Làm</Label>
                        <Input
                          id="edit-employmentStartDate"
                          type="date"
                          value={editForm.employmentStartDate}
                          onChange={(e) => setEditForm({ ...editForm, employmentStartDate: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="edit-contractExpiryDate" className="text-xs">Ngày Hết Hạn HĐ</Label>
                        <Input
                          id="edit-contractExpiryDate"
                          type="date"
                          value={editForm.contractExpiryDate}
                          onChange={(e) => setEditForm({ ...editForm, contractExpiryDate: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-workStatus" className="text-xs">Trạng Thái</Label>
                        <Select
                          value={editForm.workStatus}
                          onValueChange={(value: "ACTIVE" | "INACTIVE") => setEditForm({ ...editForm, workStatus: value })}
                        >
                          <SelectTrigger id="edit-workStatus" className="w-full h-9 text-sm">
                            <SelectValue placeholder="Chọn trạng thái" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Hoạt Động</SelectItem>
                            <SelectItem value="INACTIVE">Ngưng Hoạt Động</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Ngày nghỉ việc - chỉ hiển thị khi workStatus = INACTIVE */}
                    {editForm.workStatus === 'INACTIVE' && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                        <div className="space-y-2">
                          <Label htmlFor="edit-terminationDate" className="text-sm font-semibold text-red-900">
                            Ngày Nghỉ Việc <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="edit-terminationDate"
                            type="date"
                            value={editForm.terminationDate}
                            onChange={(e) => setEditForm({ ...editForm, terminationDate: e.target.value })}
                            className="border-red-300 h-9 text-sm"
                          />
                          <p className="text-xs text-red-600">Vui lòng chọn ngày nhân viên nghỉ việc</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Permissions - Only show for STAFF (not ATTENDANCE_STAFF) */}
                {editingStaff.role !== 'ATTENDANCE_STAFF' && (
                  <div className="border-t pt-3">
                    <div className="flex items-center gap-2 pb-1.5 border-b mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                      <h3 className="text-sm font-semibold">Phân Quyền</h3>
                    </div>
                    <div className="space-y-2">
                      {AVAILABLE_PERMISSIONS.map((perm) => (
                        <div key={perm.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`perm-${perm.id}`}
                            checked={editForm.permissions.includes(perm.id)}
                            onCheckedChange={() => togglePermission(perm.id)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor={`perm-${perm.id}`} className="cursor-pointer text-sm">
                            {perm.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex justify-end gap-2 pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                    disabled={editDialogLoading}
                    size="sm"
                  >
                    Hủy
                  </Button>
                  <Button type="submit" disabled={editDialogLoading} size="sm">
                    {editDialogLoading ? "Đang cập nhật..." : "Cập Nhật"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
