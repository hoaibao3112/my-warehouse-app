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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { FileSpreadsheet, Calendar as CalendarIcon, Filter, RefreshCw, ChevronLeft, ChevronRight, List, X } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns"
import { vi } from "date-fns/locale"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AttendanceMonthlyTable } from "@/components/hr/attendance-monthly-table"
import * as XLSX from "xlsx"

interface AttendanceRecord {
  id: string
  sessionDate: string
  checkInTime: string | null
  checkOutTime: string | null
  duration: string | null
  status: string
  user: {
    id: string
    fullName: string
    email: string
    role: string
  }
  warehouse: {
    id: string
    code: string
    name: string
    type: string
  }
  workShift: {
    id: string
    code: string
    name: string
    startTime: string
    endTime: string
  } | null
  notes: string | null
  check_in_ip?: string | null
  check_out_ip?: string | null
  check_in_location?: any
  check_out_location?: any
  check_in_device_info?: any
  check_out_device_info?: any
}

interface Warehouse {
  id: string
  code: string
  name: string
}

interface Employee {
  id: string
  fullName: string
  email: string
}

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "ON_TIME", label: "Đúng giờ" },
  { value: "LATE_EARLY", label: "Đi trễ/Về sớm" },
  { value: "ABSENT", label: "Vắng" },
  { value: "INCOMPLETE", label: "Quên vào ca/tan ca" },
]

// Report types for export
const REPORT_TYPE_OPTIONS = [
  { value: "shift_schedule", label: "Ca làm" },
  { value: "total_hours", label: "Tổng giờ làm" },
  { value: "late_early", label: "Đi muộn/Về sớm" },
  { value: "swap_replace", label: "Đổi ca/Làm thay" },
  { value: "proxy_checkin", label: "Chấm công hộ" },
  { value: "leave", label: "Nghỉ phép" },
]

export default function AttendanceReportsPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [swapRequests, setSwapRequests] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // View mode: calendar (default) or table
  const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar")

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Filters
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all")
  const [employeeSearch, setEmployeeSearch] = useState<string>("")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [selectedReportType, setSelectedReportType] = useState<string>("shift_schedule")

  // Map selectedReportType to reportMode for calendar view
  const reportMode: "normal" | "late" | "summary" | "swap" | "proxy" | "leave" = (() => {
    switch (selectedReportType) {
      case 'total_hours': return 'summary'
      case 'late_early': return 'late'
      case 'swap_replace': return 'swap'
      case 'proxy_checkin': return 'proxy'
      case 'leave': return 'leave'
      default: return 'normal' // shift_schedule
    }
  })()

  useEffect(() => {
    loadWarehouses()
    loadEmployees()
  }, [])

  useEffect(() => {
    loadAttendanceRecords()
    loadLeaveRequests()
    loadSwapRequests()
  }, [selectedWarehouse, employeeSearch, selectedStatus, startDate, endDate])

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
      const response = await mobileFetch('/api/hr/employees?pageSize=1000')
      const data = await response.json()
      if (data.success) {
        setEmployees(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load employees:', error)
      toast.error("Không thể tải danh sách nhân viên")
    }
  }

  const loadAttendanceRecords = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (selectedWarehouse !== 'all') params.append('warehouseId', selectedWarehouse)
      if (employeeSearch.trim()) params.append('employeeSearch', employeeSearch.trim())
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      if (startDate) params.append('startDate', startDate.toISOString())
      if (endDate) params.append('endDate', endDate.toISOString())

      const response = await mobileFetch(`/api/hr/attendance/reports?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setRecords(data.data || [])
      } else {
        toast.error(data.error || "Không thể tải báo cáo chấm công")
      }
    } catch (error) {
      toast.error("Không thể kết nối đến server")
    } finally {
      setLoading(false)
    }
  }

  const loadLeaveRequests = async () => {
    try {
      const params = new URLSearchParams({ type: 'all' })
      if (startDate) params.append('startDate', startDate.toISOString())
      if (endDate) params.append('endDate', endDate.toISOString())

      const response = await mobileFetch(`/api/shifts/leave?${params.toString()}`)
      const data = await response.json()
      if (data.success) {
        setLeaveRequests(data.data?.requests || [])
      }
    } catch (error) {
      console.error('Failed to load leave requests:', error)
    }
  }

  const loadSwapRequests = async () => {
    try {
      const params = new URLSearchParams({ type: 'all' })
      if (startDate) params.append('startDate', startDate.toISOString().split('T')[0])
      if (endDate) params.append('endDate', endDate.toISOString().split('T')[0])

      const response = await mobileFetch(`/api/shifts/swap?${params.toString()}`)
      const data = await response.json()
      if (data.success) {
        setSwapRequests(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load swap requests:', error)
    }
  }

  const handleExportToExcel = async () => {
    try {
      setExporting(true)
      const params = new URLSearchParams({ format: 'xlsx', layout: 'horizontal' })

      // Add sheetType to export only the selected report type
      params.append('sheetType', selectedReportType)

      if (selectedWarehouse !== 'all') params.append('warehouseId', selectedWarehouse)
      if (employeeSearch.trim()) params.append('employeeSearch', employeeSearch.trim())
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      if (startDate) params.append('startDate', startDate.toISOString())
      if (endDate) params.append('endDate', endDate.toISOString())

      const response = await mobileFetch(`/api/hr/attendance/reports?${params.toString()}`)

      // Handle error responses (status 4xx/5xx)
      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const data = await response.json()
          toast.error(data.error || "Không thể xuất báo cáo")
        } else {
          toast.error("Không thể xuất báo cáo")
        }
        return
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bao-cao-cham-cong-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success("Đã xuất báo cáo Excel")
    } catch (error) {
      toast.error("Không thể xuất báo cáo")
    } finally {
      setExporting(false)
    }
  }

  const resetFilters = () => {
    setSelectedWarehouse("all")
    setEmployeeSearch("")
    setSelectedStatus("all")
    setStartDate(undefined)
    setEndDate(undefined)
    setSelectedReportType("shift_schedule")
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return <Badge className="bg-blue-500">Đang làm</Badge>
      case "PENDING_APPROVAL":
        return <Badge className="bg-yellow-500">Chờ duyệt</Badge>
      case "COMPLETED":
        return <Badge className="bg-green-500">Hoàn thành</Badge>
      case "REJECTED":
        return <Badge variant="destructive">Từ chối</Badge>
      case "ABSENT":
        return <Badge className="bg-red-500">Vắng mặt</Badge>
      case "NO_RECORD":
        return <Badge className="bg-gray-400">Chưa có dữ liệu</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-"
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: vi })
    } catch {
      return "-"
    }
  }



  // Get records for a specific day
  const getRecordsForDay = (date: Date) => {
    return records.filter(record => {
      if (!record.sessionDate) return false
      return isSameDay(new Date(record.sessionDate), date)
    })
  }

  // Render calendar view
  const renderCalendarView = () => {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Bảng Chấm Công Theo Tháng
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium min-w-[140px] text-center capitalize">
                  {format(currentMonth, "MMMM yyyy", { locale: vi })}
                </span>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <AttendanceMonthlyTable
          currentMonth={currentMonth}
          records={records}
          loading={loading}
          startDate={startDate}
          endDate={endDate}
          onRefresh={loadAttendanceRecords}
          reportMode={reportMode}
          leaveRequests={leaveRequests}
          swapRequests={swapRequests}
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Báo Cáo Chấm Công</h1>
          <p className="text-muted-foreground mt-1">
            Tổng số: {records.length} bản ghi
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "calendar" | "table")}>
            <TabsList>
              <TabsTrigger value="calendar">
                <CalendarIcon className="w-4 h-4 mr-2" />
                Lịch
              </TabsTrigger>
              <TabsTrigger value="table">
                <List className="w-4 h-4 mr-2" />
                Bảng
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button onClick={handleExportToExcel} disabled={exporting || records.length === 0} variant="outline">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                <CardTitle>Bộ Lọc</CardTitle>
              </div>
              <CardDescription className="mt-1">
                Lọc báo cáo chấm công theo kho, nhân viên, trạng thái và khoảng thời gian
              </CardDescription>
            </div>
            <Button variant="outline" onClick={resetFilters} size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Xóa bộ lọc
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Row 1: Warehouse and Employee */}
            <div className="space-y-2">
              <Label>Kho/Cửa hàng</Label>
              <div className="flex gap-2">
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn kho..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả kho</SelectItem>
                    {warehouses.map(warehouse => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.code} - {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWarehouse !== "all" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedWarehouse("all")}
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tìm nhân viên</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nhập tên hoặc email..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="flex-1"
                />
                {employeeSearch && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEmployeeSearch("")}
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Row 2: Status */}
            <div className="space-y-2">
              <Label>Trạng thái</Label>
              <div className="flex gap-2">
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn trạng thái..." />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStatus !== "all" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedStatus("all")}
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Row 2: Date Range */}
            <div className="space-y-2">
              <Label>Khoảng thời gian</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy", { locale: vi }) : "Từ ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy", { locale: vi }) : "Đến ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setStartDate(undefined)
                      setEndDate(undefined)
                    }}
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Row 3: Loại báo cáo (for viewing and export) */}
            <div className="space-y-2">
              <Label>Loại báo cáo</Label>
              <div className="flex gap-2">
                <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn loại báo cáo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display based on view mode */}
      {viewMode === "calendar" ? (
        renderCalendarView()
      ) : (
        /* Attendance Records Table */
        <Card>
          <CardHeader>
            <CardTitle>Danh Sách Chấm Công</CardTitle>
            <CardDescription>
              Hiển thị {records.length} bản ghi chấm công
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Nhân Viên</TableHead>
                    <TableHead>Kho/CH</TableHead>
                    <TableHead>Ca Làm</TableHead>
                    <TableHead>Giờ Vào</TableHead>
                    <TableHead>Giờ Ra</TableHead>
                    <TableHead>Số Giờ</TableHead>
                    <TableHead>Trạng Thái</TableHead>

                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <TableRow key={i}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </>
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Không tìm thấy bản ghi chấm công nào
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {record.sessionDate ? format(new Date(record.sessionDate), "dd/MM/yyyy", { locale: vi }) : "-"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.user.fullName}</div>
                            <div className="text-xs text-muted-foreground">{record.user.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.warehouse.code}</div>
                            <div className="text-xs text-muted-foreground">{record.warehouse.name}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {record.workShift ? (
                            <div>
                              <div className="font-medium">{record.workShift.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {record.workShift.startTime} - {record.workShift.endTime}
                              </div>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {record.checkInTime ? format(new Date(record.checkInTime), "HH:mm", { locale: vi }) : "-"}
                        </TableCell>
                        <TableCell>
                          {record.checkOutTime ? format(new Date(record.checkOutTime), "HH:mm", { locale: vi }) : "-"}
                        </TableCell>
                        <TableCell>
                          {record.duration ? `${record.duration}h` : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(record.status)}</TableCell>

                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
