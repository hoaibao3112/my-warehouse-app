"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, Trash2, Eye, EyeOff } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import { translateError } from "@/lib/error-translator"
import { Skeleton } from "@/components/ui/skeleton"

interface Employee {
  id: string
  email: string | null
  fullName: string
  role: string
  warehouseId: string | null
  isActive: boolean
  phoneNumber: string | null
  employeeCode: string | null
  nationalId: string | null
  employmentType: string | null
  workStatus: string | null
  contractSignedDate: string | null
  employmentStartDate: string | null
  contractExpiryDate: string | null
  permanentAddress: string | null
  bankName: string | null
  bankAccount: string | null
  educationLevel: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  terminationDate: string | null
  warehouse: {
    id: string
    code: string
    name: string
    type: string
  } | null
  createdAt: Date
}

interface Warehouse {
  id: string
  code: string
  name: string
  type: string
}

// HR chỉ được tạo nhân viên chấm công (ATTENDANCE_STAFF)
// Nhân viên bán hàng và kho chỉ có ADMIN mới được tạo
const ROLES = [
  { value: "ATTENDANCE_STAFF", label: "Nhân viên (Chấm công)" },
]

const EMPLOYMENT_TYPES = [
  { value: "FULLTIME", label: "Toàn thời gian" },
  { value: "PARTTIME", label: "Bán thời gian" },
]

const WORK_STATUSES = [
  { value: "ACTIVE", label: "Đang làm việc", color: "bg-green-500" },
  { value: "INACTIVE", label: "Đã nghỉ việc", color: "bg-red-500" },
]

const EDUCATION_LEVELS = [
  { value: "THPT", label: "THPT (Trung học phổ thông)" },
  { value: "CAO_DANG", label: "Cao Đẳng" },
  { value: "DAI_HOC", label: "Đại Học" },
  { value: "KHAC", label: "Khác" },
]

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRole, setSelectedRole] = useState<string>("ATTENDANCE_STAFF")
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all")
  const [selectedWorkStatus, setSelectedWorkStatus] = useState<string>("ACTIVE")

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "ATTENDANCE_STAFF",
    warehouseId: "",
    phoneNumber: "",
    nationalId: "",
    permanentAddress: "",
    bankName: "",
    bankAccount: "",
    employmentType: "FULLTIME",
    workStatus: "ACTIVE",
    contractSignedDate: "",
    employmentStartDate: "",
    contractExpiryDate: "",
    employeeCode: "",
    educationLevel: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    terminationDate: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Reset password state
  const [resetPassword, setResetPassword] = useState("")
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize] = useState(20)

  useEffect(() => {
    loadEmployees()
    loadWarehouses()
  }, [page, searchTerm, selectedRole, selectedWarehouse, selectedWorkStatus])

  const loadWarehouses = async () => {
    try {
      const response = await mobileFetch('/api/warehouses')
      const data = await response.json()
      if (data.success) {
        setWarehouses(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load warehouses:', error)
      toast.error("Không thể tải danh sách kho")
    }
  }

  const loadEmployees = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      if (searchTerm) params.append('search', searchTerm)
      if (selectedRole !== 'all') params.append('role', selectedRole)
      if (selectedWarehouse !== 'all') params.append('warehouseId', selectedWarehouse)
      if (selectedWorkStatus !== 'all') params.append('workStatus', selectedWorkStatus)

      const response = await mobileFetch(`/api/hr/employees?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setEmployees(data.data || [])
        setTotal(data.total || 0)
      } else {
        toast.error(data.error || "Không thể tải danh sách nhân viên")
      }
    } catch (error) {
      toast.error("Không thể kết nối đến server")
    } finally {
      setLoading(false)
    }
  }

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields with toast messages
    if (!formData.fullName.trim()) {
      toast.error("Vui lòng nhập Tên nhân viên")
      return
    }

    if (!formData.password || formData.password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự")
      return
    }

    if (!formData.warehouseId) {
      toast.error("Vui lòng chọn Cửa Hàng/Kho làm việc")
      return
    }

    // Must have either Email or Phone for login
    const hasEmail = formData.email && formData.email.trim()
    const hasPhone = formData.phoneNumber && formData.phoneNumber.trim()

    if (!hasEmail && !hasPhone) {
      toast.error("Vui lòng nhập Email hoặc Số điện thoại để làm tài khoản đăng nhập")
      return
    }

    // Validate email format if provided
    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) {
        toast.error("Email không hợp lệ")
        return
      }
    }

    // Validate phone format if provided
    if (hasPhone) {
      const phoneRegex = /^(0|\+84)[0-9]{9,10}$/
      if (!phoneRegex.test(formData.phoneNumber.replace(/\s/g, ''))) {
        toast.error("Số điện thoại không hợp lệ (VD: 0901234567)")
        return
      }
    }

    setSubmitting(true)

    try {
      const response = await mobileFetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.fullName,
          role: 'ATTENDANCE_STAFF', // HR chỉ được tạo nhân viên chấm công
          warehouse_id: formData.warehouseId || null,
          phone_number: formData.phoneNumber || null,
          national_id: formData.nationalId || null,
          permanent_address: formData.permanentAddress || null,
          bank_name: formData.bankName || null,
          bank_account: formData.bankAccount || null,
          employment_type: formData.employmentType,
          contract_signed_date: formData.contractSignedDate || null,
          employment_start_date: formData.employmentStartDate || null,
          contract_expiry_date: formData.contractExpiryDate || null,
          employee_code: formData.employeeCode || null,
          education_level: formData.educationLevel || null,
          emergency_contact_name: formData.emergencyContactName || null,
          emergency_contact_phone: formData.emergencyContactPhone || null,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success("Đã tạo nhân viên mới")
        setAddDialogOpen(false)
        resetForm()
        loadEmployees()
      } else {
        toast.error(translateError(data.error || "Không thể tạo nhân viên"))
      }
    } catch (error) {
      toast.error(translateError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployee) return

    // Validate required fields with toast messages
    if (!formData.fullName.trim()) {
      toast.error("Vui lòng nhập Tên nhân viên")
      return
    }

    if (!formData.warehouseId) {
      toast.error("Vui lòng chọn Cửa Hàng/Kho làm việc")
      return
    }

    setSubmitting(true)

    try {
      const response = await mobileFetch('/api/hr/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedEmployee.id,
          fullName: formData.fullName,
          role: formData.role,
          warehouseId: formData.warehouseId || null,
          phoneNumber: formData.phoneNumber || null,
          nationalId: formData.nationalId || null,
          permanentAddress: formData.permanentAddress || null,
          bankName: formData.bankName || null,
          bankAccount: formData.bankAccount || null,
          employmentType: formData.employmentType,
          workStatus: formData.workStatus,
          contractSignedDate: formData.contractSignedDate || null,
          employmentStartDate: formData.employmentStartDate || null,
          contractExpiryDate: formData.contractExpiryDate || null,
          employeeCode: formData.employeeCode || null,
          educationLevel: formData.educationLevel || null,
          emergencyContactName: formData.emergencyContactName || null,
          emergencyContactPhone: formData.emergencyContactPhone || null,
          terminationDate: formData.terminationDate || null,
          isActive: formData.workStatus === 'ACTIVE', // Sync isActive with workStatus
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success("Đã cập nhật thông tin nhân viên")
        setEditDialogOpen(false)
        setSelectedEmployee(null)
        resetForm()
        loadEmployees()
      } else {
        toast.error(translateError(data.error || "Không thể cập nhật nhân viên"))
      }
    } catch (error) {
      toast.error(translateError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const openEditDialog = (employee: Employee) => {
    setSelectedEmployee(employee)
    setFormData({
      email: employee.email || "",
      password: "",
      fullName: employee.fullName,
      role: employee.role,
      warehouseId: employee.warehouseId || "",
      phoneNumber: employee.phoneNumber || "",
      nationalId: employee.nationalId || "",
      permanentAddress: employee.permanentAddress || "",
      bankName: employee.bankName || "",
      bankAccount: employee.bankAccount || "",
      employmentType: employee.employmentType || "FULLTIME",
      workStatus: employee.workStatus || "ACTIVE",
      contractSignedDate: employee.contractSignedDate ? new Date(employee.contractSignedDate).toISOString().split('T')[0] : "",
      employmentStartDate: employee.employmentStartDate ? new Date(employee.employmentStartDate).toISOString().split('T')[0] : "",
      contractExpiryDate: employee.contractExpiryDate ? new Date(employee.contractExpiryDate).toISOString().split('T')[0] : "",
      employeeCode: employee.employeeCode || "",
      educationLevel: employee.educationLevel || "",
      emergencyContactName: employee.emergencyContactName || "",
      emergencyContactPhone: employee.emergencyContactPhone || "",
      terminationDate: employee.terminationDate ? new Date(employee.terminationDate).toISOString().split('T')[0] : "",
    })
    setEditDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      fullName: "",
      role: "ATTENDANCE_STAFF",
      warehouseId: "",
      phoneNumber: "",
      nationalId: "",
      permanentAddress: "",
      bankName: "",
      bankAccount: "",
      employmentType: "FULLTIME",
      workStatus: "ACTIVE",
      contractSignedDate: "",
      employmentStartDate: "",
      contractExpiryDate: "",
      employeeCode: "",
      educationLevel: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      terminationDate: "",
    })
    setShowPassword(false)
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null)

  const confirmDelete = (employee: Employee) => {
    setEmployeeToDelete(employee)
    setDeleteDialogOpen(true)
  }

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return

    try {
      const res = await fetch(`/api/hr/employees?id=${employeeToDelete.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete employee")
      }

      toast.success("Đã xóa nhân viên thành công")

      // Remove from local list
      setEmployees(prev => prev.filter(e => e.id !== employeeToDelete.id))
    } catch (error: any) {
      toast.error(translateError(error))
    } finally {
      setDeleteDialogOpen(false)
      setEmployeeToDelete(null)
    }
  }

  const getRoleLabel = (role: string) => {
    return ROLES.find(r => r.value === role)?.label || role
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Quản Lý Nhân Viên</h1>
          <p className="text-muted-foreground mt-1">
            Tổng số: {total} nhân viên
          </p>
        </div>
        <Button onClick={() => { resetForm(); setAddDialogOpen(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Thêm Nhân Viên
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Bộ Lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tên, email, SĐT..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setPage(1)
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>Vai trò</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) => {
                  setSelectedRole(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* <SelectItem value="all">Tất cả</SelectItem> */}
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Trạng thái</Label>
              <Select
                value={selectedWorkStatus}
                onValueChange={(value) => {
                  setSelectedWorkStatus(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_STATUSES.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Kho/Cửa hàng</Label>
              <Select
                value={selectedWarehouse}
                onValueChange={(value) => {
                  setSelectedWarehouse(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {warehouses.map(warehouse => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} - {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh Sách Nhân Viên</CardTitle>
          <CardDescription>
            Hiển thị {employees.length} / {total} nhân viên
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ Tên</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Vai Trò</TableHead>
                  <TableHead>Kho/CH</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Trạng Thái</TableHead>
                  <TableHead className="text-right">Thao Tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <TableRow key={i}>
                        {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Không tìm thấy nhân viên nào
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.fullName}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getRoleLabel(employee.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        {employee.warehouse ? (
                          <span className="text-sm">
                            {employee.warehouse.code}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{employee.phoneNumber || "-"}</TableCell>
                      <TableCell>
                        {employee.workStatus === 'ACTIVE' ? (
                          <Badge className="bg-green-500">Đang làm việc</Badge>
                        ) : (
                          <Badge variant="destructive">Đã nghỉ việc</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(employee)}
                            className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDelete(employee)}
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && total > pageSize && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted-foreground">
                Trang {page} / {Math.ceil(total / pageSize)}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / pageSize)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Employee Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Tạo Tài Khoản Nhân Viên Mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddEmployee}>
            <div className="space-y-5 py-4">
              {/* Thông Tin Bắt Buộc */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Thông Tin Bắt Buộc
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-fullName" className="text-sm">
                      Tên Nhân Viên <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="add-fullName"
                      placeholder="Nguyễn Văn A"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-password" className="text-sm">
                      Mật Khẩu <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="add-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Tối thiểu 6 ký tự"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="text-sm pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-role" className="text-sm">
                      Vai Trò
                    </Label>
                    {/* HR chỉ được tạo ATTENDANCE_STAFF - hiển thị cố định, không cho chọn */}
                    <Input
                      id="edit-role"
                      value="Nhân viên (Chấm công)"
                      disabled
                      className="text-sm bg-muted cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-employmentType" className="text-sm">
                      Loại Hình Làm Việc <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.employmentType}
                      onValueChange={(value) => setFormData({ ...formData, employmentType: value })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Mã Số Nhân Viên */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Mã Số Nhân Viên
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-employeeCode" className="text-sm">Mã Số Nhân Viên (tùy chọn)</Label>
                    <Input
                      id="add-employeeCode"
                      placeholder="VD: NV001"
                      value={formData.employeeCode}
                      onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Thông Tin Đăng Nhập */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Thông Tin Đăng Nhập (Bắt buộc 1 trong 2)
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-email" className="text-sm">
                      Email <span className="text-orange-500">(Tùy chọn)</span>
                    </Label>
                    <Input
                      id="add-email"
                      type="email"
                      placeholder="nguyenvana@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-phoneNumber" className="text-sm">
                      Số Điện Thoại <span className="text-orange-500">(Tùy chọn)</span>
                    </Label>
                    <Input
                      id="add-phoneNumber"
                      placeholder="0901234567"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  * Nhân viên sẽ dùng Email hoặc Số điện thoại để đăng nhập vào hệ thống
                </p>
              </div>

              {/* Thông Tin Cá Nhân */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Thông Tin Cá Nhân
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-nationalId" className="text-sm">Số CCCD/CMND</Label>
                    <Input
                      id="add-nationalId"
                      placeholder="001234567890"
                      value={formData.nationalId}
                      onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-permanentAddress" className="text-sm">Địa Chỉ Thường Trú</Label>
                    <Input
                      id="add-permanentAddress"
                      placeholder="123 Đường ABC, Quận XYZ"
                      value={formData.permanentAddress}
                      onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-educationLevel" className="text-sm">Bằng Cấp</Label>
                    <Select
                      value={formData.educationLevel || "__none__"}
                      onValueChange={(value) => setFormData({ ...formData, educationLevel: value === "__none__" ? "" : value })}
                    >
                      <SelectTrigger className="text-sm">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="add-emergencyContactName" className="text-sm">Tên Người Thân</Label>
                    <Input
                      id="add-emergencyContactName"
                      placeholder="Nguyễn Văn B"
                      value={formData.emergencyContactName}
                      onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-emergencyContactPhone" className="text-sm">Số Điện Thoại Người Thân</Label>
                    <Input
                      id="add-emergencyContactPhone"
                      placeholder="0901234567"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Thông Tin Ngân Hàng */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                  Thông Tin Ngân Hàng
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-bankName" className="text-sm">Tên Ngân Hàng</Label>
                    <Input
                      id="edit-bankName"
                      placeholder="VD: Vietcombank"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-bankAccount" className="text-sm">Số Tài Khoản</Label>
                    <Input
                      id="edit-bankAccount"
                      placeholder="1234567890"
                      value={formData.bankAccount}
                      onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Tình Trạng Công Việc */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  Tình Trạng Công Việc
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-warehouseId" className="text-sm">
                      Cửa Hàng <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.warehouseId || "__none__"}
                      onValueChange={(value) => setFormData({ ...formData, warehouseId: value === "__none__" ? "" : value })}
                      required
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Chọn cửa hàng" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>Chọn cửa hàng</SelectItem>
                        {warehouses
                          .filter(w => w.type === 'STORE' || w.type === 'PARTNER')
                          .map(warehouse => (
                            <SelectItem key={warehouse.id} value={warehouse.id}>
                              {warehouse.code} - {warehouse.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-workStatus" className="text-sm">Trạng Thái Làm Việc</Label>
                    <Select
                      value={formData.workStatus}
                      onValueChange={(value) => setFormData({ ...formData, workStatus: value })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORK_STATUSES.map(status => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Hợp Đồng Lao Động */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Hợp Đồng Lao Động
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-contractSignedDate" className="text-sm">Ngày Ký HĐ</Label>
                    <Input
                      id="edit-contractSignedDate"
                      type="date"
                      value={formData.contractSignedDate}
                      onChange={(e) => setFormData({ ...formData, contractSignedDate: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-employmentStartDate" className="text-sm">Ngày Bắt Đầu</Label>
                    <Input
                      id="edit-employmentStartDate"
                      type="date"
                      value={formData.employmentStartDate}
                      onChange={(e) => setFormData({ ...formData, employmentStartDate: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-contractExpiryDate" className="text-sm">Ngày Hết Hạn</Label>
                    <Input
                      id="edit-contractExpiryDate"
                      type="date"
                      value={formData.contractExpiryDate}
                      onChange={(e) => setFormData({ ...formData, contractExpiryDate: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={submitting} className="bg-orange-500 hover:bg-orange-600">
                {submitting ? "Đang xử lý..." : "Tạo Nhân Viên"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh Sửa Nhân Viên</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin nhân viên {selectedEmployee?.fullName}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditEmployee}>
            <div className="space-y-6 py-4">
              {/* Thông tin cơ bản */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Thông tin cơ bản</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-fullName">Họ và tên *</Label>
                    <Input
                      id="edit-fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-phoneNumber">Số điện thoại</Label>
                    <Input
                      id="edit-phoneNumber"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-warehouseId">Cửa hàng</Label>
                    <Select
                      value={formData.warehouseId || "__none__"}
                      onValueChange={(value) => setFormData({ ...formData, warehouseId: value === "__none__" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn cửa hàng" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Không chọn</SelectItem>
                        {warehouses
                          .filter(w => w.type === 'STORE' || w.type === 'PARTNER')
                          .map(warehouse => (
                            <SelectItem key={warehouse.id} value={warehouse.id}>
                              {warehouse.code} - {warehouse.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-employmentType">Loại hợp đồng</Label>
                    <Select
                      value={formData.employmentType}
                      onValueChange={(value) => setFormData({ ...formData, employmentType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-nationalId">CMND/CCCD</Label>
                    <Input
                      id="edit-nationalId"
                      value={formData.nationalId}
                      onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-employeeCode">Mã số nhân viên</Label>
                    <Input
                      id="edit-employeeCode"
                      placeholder="VD: NV001"
                      value={formData.employeeCode}
                      onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    />
                  </div>
                </div>


                <div className="space-y-2">
                  <Label htmlFor="edit-permanentAddress">Địa chỉ thường trú</Label>
                  <Input
                    id="edit-permanentAddress"
                    value={formData.permanentAddress}
                    onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-educationLevel">Bằng Cấp</Label>
                    <Select
                      value={formData.educationLevel || "__none__"}
                      onValueChange={(value) => setFormData({ ...formData, educationLevel: value === "__none__" ? "" : value })}
                    >
                      <SelectTrigger>
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
                    <Label htmlFor="edit-emergencyContactName">Tên Người Thân</Label>
                    <Input
                      id="edit-emergencyContactName"
                      placeholder="Nguyễn Văn B"
                      value={formData.emergencyContactName}
                      onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-emergencyContactPhone">Số Điện Thoại Người Thân</Label>
                    <Input
                      id="edit-emergencyContactPhone"
                      placeholder="0901234567"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-bankName">Tên ngân hàng</Label>
                    <Input
                      id="edit-bankName"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-bankAccount">Số tài khoản</Label>
                    <Input
                      id="edit-bankAccount"
                      value={formData.bankAccount}
                      onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                    />
                  </div>
                </div>

                {/* Hợp đồng & Trạng thái */}
                <h3 className="text-sm font-semibold text-foreground border-b pb-2 pt-2">Hợp đồng & Trạng thái</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-contractSignedDate">Ngày ký hợp đồng</Label>
                    <Input
                      id="edit-contractSignedDate"
                      type="date"
                      value={formData.contractSignedDate}
                      onChange={(e) => setFormData({ ...formData, contractSignedDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-employmentStartDate">Ngày bắt đầu làm việc</Label>
                    <Input
                      id="edit-employmentStartDate"
                      type="date"
                      value={formData.employmentStartDate}
                      onChange={(e) => setFormData({ ...formData, employmentStartDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-contractExpiryDate">Ngày hết hạn hợp đồng</Label>
                    <Input
                      id="edit-contractExpiryDate"
                      type="date"
                      value={formData.contractExpiryDate}
                      onChange={(e) => setFormData({ ...formData, contractExpiryDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-workStatus">Trạng thái làm việc</Label>
                    <Select
                      value={formData.workStatus}
                      onValueChange={(value) => setFormData({ ...formData, workStatus: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORK_STATUSES.map(status => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Ngày nghỉ việc - chỉ hiển thị khi workStatus = INACTIVE */}
                {formData.workStatus === 'INACTIVE' && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <div className="space-y-2">
                      <Label htmlFor="edit-terminationDate" className="text-sm font-semibold text-red-900">
                        Ngày Nghỉ Việc <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="edit-terminationDate"
                        type="date"
                        value={formData.terminationDate}
                        onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value })}
                        className="border-red-300"
                      />
                      <p className="text-xs text-red-600">Vui lòng chọn ngày nhân viên nghỉ việc</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reset Password Section */}
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Đặt lại mật khẩu
              </h3>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)..."
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!resetPassword || resetPassword.length < 6 || resetPasswordSubmitting}
                  onClick={async () => {
                    if (!resetPassword || !selectedEmployee) return
                    setResetPasswordSubmitting(true)
                    try {
                      const res = await mobileFetch(`/api/users/${selectedEmployee.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: resetPassword })
                      })
                      const json = await res.json()
                      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                      toast.success("Đã đặt lại mật khẩu thành công")
                      setResetPassword("")
                    } catch (err) {
                      toast.error(translateError(err))
                    } finally {
                      setResetPasswordSubmitting(false)
                    }
                  }}
                >
                  {resetPasswordSubmitting ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang xử lý..." : "Cập Nhật"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Xóa nhân viên"
        description={`Bạn có chắc chắn muốn xóa nhân viên "${employeeToDelete?.fullName}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDeleteEmployee}
        confirmText="Xóa nhân viên"
        cancelText="Hủy"
      />
    </div >
  )
}
