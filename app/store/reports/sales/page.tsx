"use client"

import { mobileFetch } from "@/lib/mobile/api-client"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  Package,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Table2,
  Filter,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import * as XLSX from "xlsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ShiftRevenueChart } from "@/components/store/shift-revenue-chart"
import { WeekComparisonChart } from "@/components/store/week-comparison-chart"

interface ProductSale {
  recipe_id: string
  recipe_name: string
  product_code: string | null
  product_name: string | null
  category_name: string | null
  menu_type_name: string | null
  quantity_sold: number
  total_revenue: number
}

interface InvoiceItem {
  recipe_name: string
  product_code: string | null
  product_name: string | null
  category_name: string | null
  menu_type_name: string | null
  quantity: number
  unit_price: number
  line_total: number
}

interface Invoice {
  id: string
  invoice_number: string
  total_amount: number
  discount_amount: number
  voucher_code: string | null
  voucher_program_name: string | null
  created_by_name: string
  warehouse_name: string
  created_at: string | null
  items: InvoiceItem[]
  has_vat?: boolean
  vat_amount?: number
}

interface SalesReport {
  summary: {
    gross_revenue?: number // Before discounts
    total_revenue: number // Net revenue (backward compatible)
    total_discount: number // Includes gifts
    total_gift_value?: number // Value of all gifts
    net_revenue: number // Actual money received
    total_vat?: number // VAT amount
    total_invoices: number
  }
  product_sales: ProductSale[]
  invoices: Invoice[]
}

interface MenuType {
  id: string
  name: string
  categories: { id: string; name: string }[]
}

interface Category {
  id: string
  name: string
  menu_type_id: string | null
}

interface Promotion {
  id: string
  name: string
  promotion_type: string
  is_active: boolean
}

export default function SalesReportPage() {
  const { user } = useAuth()
  const router = useRouter()
  const selectedWarehouseId = useSelectedWarehouse()
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<SalesReport | null>(null)
  const [startDate, setStartDate] = useState("")

  // Check if user is a manager (only managers can view sales reports)
  const isManager = user?.role === 'WAREHOUSE_MANAGER' || user?.role === 'GENERAL_MANAGER' || user?.role === 'ADMIN' || user?.role === 'HR'

  // Redirect non-managers to inventory check page
  useEffect(() => {
    if (user && !isManager) {
      router.replace('/store/reports')
    }
  }, [user, isManager, router])
  const [startTime, setStartTime] = useState("00:00:00")
  const [endDate, setEndDate] = useState("")
  const [endTime, setEndTime] = useState("23:59:59")
  const [activeTab, setActiveTab] = useState<"chart" | "data">("chart")
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set())

  // Filter states
  const [menuTypes, setMenuTypes] = useState<MenuType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [selectedMenuTypeId, setSelectedMenuTypeId] = useState<string>("all")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all")
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>("all")
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([])
  const [showFilters, setShowFilters] = useState(false)

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount)
  }

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Set default dates to today (local timezone)
  useEffect(() => {
    const now = new Date()

    // Format as YYYY-MM-DD using local timezone (not UTC)
    const formatDate = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const today = formatDate(now)
    setStartDate(today)
    setEndDate(today)
  }, [])

  // Fetch filter options (menu types, categories, promotions)
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [menuTypesRes, categoriesRes, promotionsRes] = await Promise.all([
          mobileFetch("/api/menu-types"),
          mobileFetch("/api/categories"),
          mobileFetch("/api/promotions?includeExpired=true&pageSize=100"),
        ])

        const menuTypesData = await menuTypesRes.json()
        const categoriesData = await categoriesRes.json()
        const promotionsData = await promotionsRes.json()

        if (menuTypesData.success) {
          setMenuTypes(menuTypesData.data || [])
        }
        if (categoriesData.success) {
          setCategories(categoriesData.data || [])
          setFilteredCategories(categoriesData.data || [])
        }
        if (promotionsData.success) {
          setPromotions(promotionsData.data || [])
        }
      } catch (error) {
        console.error("Error fetching filter options:", error)
      }
    }

    fetchFilterOptions()
  }, [])

  // Filter categories based on selected menu type
  useEffect(() => {
    if (selectedMenuTypeId && selectedMenuTypeId !== "all") {
      setFilteredCategories(
        categories.filter((cat) => cat.menu_type_id === selectedMenuTypeId)
      )
      setSelectedCategoryId("all") // Reset category when menu type changes
    } else {
      setFilteredCategories(categories)
    }
  }, [selectedMenuTypeId, categories])

  // Fetch report data
  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn khoảng thời gian")
      return
    }

    setLoading(true)
    try {
      // Combine date and time for API call
      const startDateTime = `${startDate}T${startTime}`
      const endDateTime = `${endDate}T${endTime}`

      const params = new URLSearchParams({
        startDate: startDateTime,
        endDate: endDateTime,
      })

      // For GENERAL_MANAGER, use selected warehouse; for others use their assigned warehouse
      const currentWarehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : user?.warehouseId
      if (currentWarehouseId) {
        params.set("warehouseId", currentWarehouseId)
      } else if (user?.role === 'GENERAL_MANAGER') {
        // If GM hasn't selected a warehouse yet (and no default), don't fetch or show error
        // But usually selectedWarehouseId should have a value (defaulted)
        console.warn('[SalesReport] No warehouse selected for GM')
      }

      // Add filter params
      if (selectedCategoryId && selectedCategoryId !== "all") {
        params.set("categoryId", selectedCategoryId)
      }
      if (selectedMenuTypeId && selectedMenuTypeId !== "all") {
        params.set("menuTypeId", selectedMenuTypeId)
      }
      if (selectedPromotionId && selectedPromotionId !== "all") {
        params.set("promotionId", selectedPromotionId)
      }

      const response = await mobileFetch(`/api/reports/sales?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setReport(result.data)
      } else {
        toast.error(result.error || "Lỗi tải báo cáo")
      }
    } catch (error) {
      console.error("Error fetching report:", error)
      toast.error("Lỗi tải báo cáo")
    } finally {
      setLoading(false)
    }
  }, [startDate, startTime, endDate, endTime, selectedWarehouseId, user, selectedCategoryId, selectedMenuTypeId, selectedPromotionId])

  // Auto-fetch when dates or warehouse or filters change
  useEffect(() => {
    if (startDate && endDate) {
      fetchReport()
    }
  }, [fetchReport, startDate, endDate])

  // Export to XLSX
  const exportToExcel = () => {
    if (!report) {
      toast.error("Không có dữ liệu để xuất")
      return
    }

    try {
      const workbook = XLSX.utils.book_new()

      // Sheet 1: Tổng quan
      const summaryData = [
        {
          "Chỉ số": "Doanh thu gốc (trước giảm/tặng)",
          "Giá trị": report.summary.gross_revenue || (report.summary.total_revenue + report.summary.total_discount),
          "Định dạng": formatCurrency(report.summary.gross_revenue || (report.summary.total_revenue + report.summary.total_discount)),
        },
        {
          "Chỉ số": "Tổng giảm giá + quà tặng",
          "Giá trị": report.summary.total_discount,
          "Định dạng": formatCurrency(report.summary.total_discount),
        },
        {
          "Chỉ số": "Doanh thu thực (tiền thu)",
          "Giá trị": report.summary.net_revenue,
          "Định dạng": formatCurrency(report.summary.net_revenue),
        },
        {
          "Chỉ số": "Số hóa đơn",
          "Giá trị": report.summary.total_invoices,
          "Định dạng": report.summary.total_invoices.toString(),
        },
      ]
      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      summarySheet["!cols"] = [{ wch: 32 }, { wch: 15 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Tổng Quan")

      // Sheet 2: Sản phẩm bán ra
      const productData = report.product_sales.map((p, idx) => ({
        STT: idx + 1,
        "Mã SP": p.product_code || "-",
        "Tên Sản Phẩm": p.recipe_name,
        "Loại Hàng": p.menu_type_name || "-",
        "Nhóm Hàng": p.category_name || "-",
        "Nguyên Liệu": p.product_name || "-",
        "Số Lượng Bán": p.quantity_sold,
        "Doanh Thu (VND)": p.total_revenue,
      }))
      const productSheet = XLSX.utils.json_to_sheet(productData)
      productSheet["!cols"] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 25 },
        { wch: 15 },
        { wch: 15 },
        { wch: 25 },
        { wch: 12 },
        { wch: 18 },
      ]
      XLSX.utils.book_append_sheet(workbook, productSheet, "Sản Phẩm Bán Ra")

      // Sheet 3: Chi tiết hóa đơn
      const invoiceData: any[] = []
      report.invoices.forEach((inv) => {
        // Add invoice header row
        invoiceData.push({
          "Số Hóa Đơn": inv.invoice_number,
          "Sản Phẩm": "",
          "Số Lượng": "",
          "Đơn Giá": "",
          "Thành Tiền": "",
          "Tổng Tiền": inv.total_amount,
          "Tiền VAT": inv.vat_amount || 0,
          "Giảm Giá": inv.discount_amount,
          "Voucher": inv.voucher_code || "-",
          "Người Bán": inv.created_by_name,
          "Thời Gian": inv.created_at
            ? new Date(inv.created_at).toLocaleString("vi-VN")
            : "-",
        })
        // Add item rows
        inv.items.forEach((item) => {
          invoiceData.push({
            "Số Hóa Đơn": "",
            "Sản Phẩm": item.recipe_name,
            "Số Lượng": item.quantity,
            "Đơn Giá": item.unit_price,
            "Thành Tiền": item.line_total,
            "Tổng Tiền": "",
            "Tiền VAT": "",
            "Giảm Giá": "",
            "Voucher": "",
            "Người Bán": "",
            "Thời Gian": "",
          })
        })
      })
      const invoiceSheet = XLSX.utils.json_to_sheet(invoiceData)
      invoiceSheet["!cols"] = [
        { wch: 18 },
        { wch: 25 },
        { wch: 10 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 }, // VAT
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 },
      ]
      XLSX.utils.book_append_sheet(workbook, invoiceSheet, "Chi Tiết Hóa Đơn")

      // Generate filename
      const timestamp = new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")
      const filename = `bao-cao-doanh-so-${startDate}-${endDate}-${timestamp}.xlsx`

      XLSX.writeFile(workbook, filename)
      toast.success("Đã xuất báo cáo thành công")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Lỗi xuất file Excel")
    }
  }

  const toggleInvoice = (invoiceId: string) => {
    const newExpanded = new Set(expandedInvoices)
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId)
    } else {
      newExpanded.add(invoiceId)
    }
    setExpandedInvoices(newExpanded)
  }

  const tabs = [
    { id: "chart" as const, label: "Biểu Đồ", icon: BarChart3 },
    { id: "data" as const, label: "Số Liệu", icon: Table2 },
  ]

  // Show loading state while checking permissions or redirecting
  if (!user || !isManager) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={FileText}
        title="Báo Cáo Doanh Số"
        subtitle="Thống kê doanh thu và sản phẩm bán ra"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Báo Cáo Doanh Số</h1>
          <p className="text-muted-foreground mt-2">
            Thống kê doanh thu và sản phẩm bán ra
          </p>
        </div>

        {/* Main Report Type Tabs */}
        <div className="flex gap-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => router.push("/store/reports")}
            className="flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap border-transparent text-muted-foreground hover:text-foreground"
          >
            Kiểm Kê
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap border-primary text-primary"
          >
            Doanh Số
          </button>
        </div>

        {/* Date Filter */}
        <Card className="p-4">
          <div className="flex flex-col gap-4">
            {/* Start Date & Time */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="w-4 h-4" />
                Từ
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm"
                />
                <Input
                  type="time"
                  step="1"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* End Date & Time */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="w-4 h-4" />
                Đến
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm"
                />
                <Input
                  type="time"
                  step="1"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Advanced Filters Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 w-fit text-muted-foreground hover:text-foreground"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? "Ẩn bộ lọc" : "Bộ lọc nâng cao"}
              {(selectedMenuTypeId !== "all" || selectedCategoryId !== "all" || selectedPromotionId !== "all") &&
                (selectedMenuTypeId !== "" || selectedCategoryId !== "" || selectedPromotionId !== "") && (
                  <Badge variant="secondary" className="ml-1">
                    {[selectedMenuTypeId, selectedCategoryId, selectedPromotionId].filter(v => v && v !== "all").length}
                  </Badge>
                )}
            </Button>

            {/* Advanced Filters */}
            {showFilters && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border">
                {/* Menu Type (Loại Hàng) */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Loại Hàng</Label>
                  <Select
                    value={selectedMenuTypeId}
                    onValueChange={setSelectedMenuTypeId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Tất cả loại hàng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả loại hàng</SelectItem>
                      {menuTypes.map((mt) => (
                        <SelectItem key={mt.id} value={mt.id}>
                          {mt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Category (Nhóm Hàng) */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nhóm Hàng</Label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Tất cả nhóm hàng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả nhóm hàng</SelectItem>
                      {filteredCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Promotion (Chương Trình) */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Chương Trình KM</Label>
                  <Select
                    value={selectedPromotionId}
                    onValueChange={setSelectedPromotionId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Tất cả chương trình" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả chương trình</SelectItem>
                      {promotions.map((promo) => (
                        <SelectItem key={promo.id} value={promo.id}>
                          {promo.name}
                          {promo.is_active && (
                            <Badge variant="outline" className="ml-2 text-xs">Đang áp dụng</Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear Filters Button */}
                {(selectedMenuTypeId !== "all" || selectedCategoryId !== "all" || selectedPromotionId !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedMenuTypeId("all")
                      setSelectedCategoryId("all")
                      setSelectedPromotionId("all")
                    }}
                    className="w-full"
                  >
                    Xóa bộ lọc
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={fetchReport} disabled={loading} className="flex-1 md:flex-none">
                {loading ? "Đang tải..." : "Xem Báo Cáo"}
              </Button>
              <Button
                variant="outline"
                onClick={exportToExcel}
                disabled={!report || loading}
                className="gap-2 flex-1 md:flex-none"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Xuất Excel</span>
                <span className="sm:hidden">Excel</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Đang tải dữ liệu...
          </div>
        ) : !report ? (
          <div className="text-center py-12 text-muted-foreground">
            Chọn khoảng thời gian để xem báo cáo
          </div>
        ) : (
          <>
            {/* Chart Tab */}
            {activeTab === "chart" && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
                  <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Doanh Thu Gốc</p>
                    <p className="text-lg md:text-xl font-bold text-blue-800 dark:text-blue-200 mt-1">
                      {formatCurrency(report.summary.gross_revenue || (report.summary.total_revenue + report.summary.total_discount))}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">(Trước giảm/tặng)</p>
                  </Card>
                  <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Giảm + Tặng</p>
                    <p className="text-lg md:text-xl font-bold text-orange-800 dark:text-orange-200 mt-1">
                      {formatCurrency(report.summary.total_discount)}
                    </p>
                    <p className="text-xs text-orange-500 mt-1">(KM + Quà)</p>
                  </Card>
                  <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">Doanh Thu Thực</p>
                    <p className="text-lg md:text-xl font-bold text-green-800 dark:text-green-200 mt-1">
                      {formatCurrency(report.summary.net_revenue)}
                    </p>
                    <p className="text-xs text-green-500 mt-1">(Tiền thu)</p>
                  </Card>
                  <Card className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900 border-pink-200 dark:border-pink-800">
                    <p className="text-xs text-pink-600 dark:text-pink-400 font-medium">VAT (Thu Hộ)</p>
                    <p className="text-lg md:text-xl font-bold text-pink-800 dark:text-pink-200 mt-1">
                      {formatCurrency(report.summary.total_vat || 0)}
                    </p>
                    <p className="text-xs text-pink-500 mt-1">(Tiền thuế)</p>
                  </Card>
                  <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Số Hóa Đơn</p>
                    <p className="text-lg md:text-xl font-bold text-purple-800 dark:text-purple-200 mt-1">
                      {report.summary.total_invoices}
                    </p>
                  </Card>
                </div>

                {/* Product Sales Bar Chart */}
                <Card className="p-4 md:p-6">
                  <h3 className="text-lg font-semibold mb-4">Top Sản Phẩm Bán Chạy</h3>
                  {report.product_sales.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Không có dữ liệu</p>
                  ) : (
                    <div className="space-y-3">
                      {report.product_sales.slice(0, 10).map((product, idx) => {
                        const maxRevenue = Math.max(...report.product_sales.map(p => p.total_revenue))
                        const percentage = maxRevenue > 0 ? (product.total_revenue / maxRevenue) * 100 : 0
                        return (
                          <div key={product.recipe_id} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium truncate flex-1 mr-2">
                                {idx + 1}. {product.recipe_name}
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                x{product.quantity_sold} • {formatCurrency(product.total_revenue)}
                              </span>
                            </div>
                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>

                {/* Revenue by Product Pie representation */}
                <Card className="p-4 md:p-6">
                  <h3 className="text-lg font-semibold mb-4">Phân Bổ Doanh Thu</h3>
                  {report.product_sales.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Không có dữ liệu</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {report.product_sales.slice(0, 8).map((product, idx) => {
                        const percentage = report.summary.total_revenue > 0
                          ? (product.total_revenue / report.summary.total_revenue) * 100
                          : 0
                        const colors = [
                          'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500',
                          'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500'
                        ]
                        return (
                          <div key={product.recipe_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{product.recipe_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {percentage.toFixed(1)}% • {formatCurrency(product.total_revenue)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>

                {/* Shift Revenue Chart */}
                <ShiftRevenueChart
                  warehouseId={user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : (user?.warehouseId || null)}
                  date={startDate || undefined}
                />

                {/* Week Comparison Chart */}
                <WeekComparisonChart
                  warehouseId={user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : (user?.warehouseId || null)}
                />
              </div>
            )}

            {/* Data Tab */}
            {activeTab === "data" && (
              <div className="space-y-6">
                {/* Products Table */}
                <Card className="p-4 md:p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    Sản Phẩm Bán Ra ({report.product_sales.length} sản phẩm)
                  </h3>
                  {report.product_sales.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      Không có dữ liệu sản phẩm
                    </p>
                  ) : (
                    <>
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">STT</TableHead>
                              <TableHead>Sản Phẩm</TableHead>
                              <TableHead>Nguyên Liệu</TableHead>
                              <TableHead className="text-center">SL Bán</TableHead>
                              <TableHead className="text-right">Doanh Thu</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {report.product_sales.map((product, idx) => (
                              <TableRow key={product.recipe_id}>
                                <TableCell className="font-medium">{idx + 1}</TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{product.recipe_name}</p>
                                    {product.product_code && (
                                      <p className="text-xs text-muted-foreground">
                                        Mã: {product.product_code}
                                      </p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {product.product_name || "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="secondary">{product.quantity_sold}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium text-green-600">
                                  {formatCurrency(product.total_revenue)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Cards */}
                      <div className="md:hidden space-y-3">
                        {report.product_sales.map((product, idx) => (
                          <div
                            key={product.recipe_id}
                            className="border border-border rounded-lg p-4 bg-card"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    #{idx + 1}
                                  </span>
                                  <Badge variant="secondary" className="text-xs">
                                    x{product.quantity_sold}
                                  </Badge>
                                </div>
                                <p className="font-semibold text-foreground truncate">
                                  {product.recipe_name}
                                </p>
                                {product.product_code && (
                                  <p className="text-xs text-muted-foreground">
                                    Mã: {product.product_code}
                                  </p>
                                )}
                                {product.product_name && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    NVL: {product.product_name}
                                  </p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-green-600">
                                  {formatCurrency(product.total_revenue)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                {/* Invoices List */}
                <Card className="p-4 md:p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    Chi Tiết Hóa Đơn ({report.invoices.length} hóa đơn)
                  </h3>
                  {report.invoices.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      Không có hóa đơn trong khoảng thời gian này
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {report.invoices.map((invoice) => (
                        <Collapsible
                          key={invoice.id}
                          open={expandedInvoices.has(invoice.id)}
                          onOpenChange={() => toggleInvoice(invoice.id)}
                        >
                          <div className="border border-border rounded-lg overflow-hidden">
                            <CollapsibleTrigger className="w-full">
                              <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-4 flex-1 text-left">
                                  <div>
                                    <p className="font-semibold">
                                      {invoice.invoice_number}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {formatDate(invoice.created_at)} •{" "}
                                      {invoice.created_by_name}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="font-semibold text-green-600">
                                      {formatCurrency(invoice.total_amount)}
                                    </p>
                                    {invoice.discount_amount > 0 && (
                                      <p className="text-xs text-orange-600">
                                        -{formatCurrency(invoice.discount_amount)}
                                      </p>
                                    )}
                                    {invoice.vat_amount && invoice.vat_amount > 0 && (
                                      <p className="text-xs text-pink-600">
                                        +VAT: {formatCurrency(invoice.vat_amount)}
                                      </p>
                                    )}
                                  </div>
                                  {expandedInvoices.has(invoice.id) ? (
                                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t border-border p-4 bg-muted/30">
                                {/* Desktop Table */}
                                <div className="hidden sm:block">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Sản Phẩm</TableHead>
                                        <TableHead className="text-center">SL</TableHead>
                                        <TableHead className="text-right">Đơn Giá</TableHead>
                                        <TableHead className="text-right">Thành Tiền</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {invoice.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell>
                                            <div>
                                              <p className="font-medium">{item.recipe_name}</p>
                                              {item.product_code && (
                                                <p className="text-xs text-muted-foreground">
                                                  {item.product_code}
                                                </p>
                                              )}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-center">
                                            {item.quantity}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {formatCurrency(item.unit_price)}
                                          </TableCell>
                                          <TableCell className="text-right font-medium">
                                            {formatCurrency(item.line_total)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>

                                {/* Mobile List */}
                                <div className="sm:hidden space-y-2">
                                  {invoice.items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{item.recipe_name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {item.quantity} x {formatCurrency(item.unit_price)}
                                        </p>
                                      </div>
                                      <p className="font-medium text-sm text-green-600 flex-shrink-0 ml-2">
                                        {formatCurrency(item.line_total)}
                                      </p>
                                    </div>
                                  ))}
                                </div>

                                {invoice.voucher_code && (
                                  <div className="mt-3 flex items-center gap-2">
                                    <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                                      Voucher: {invoice.voucher_code}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
