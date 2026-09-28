"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Search, Eye, Plus, X, Trash2, FileText, Calendar, Download,
  ChevronDown, ChevronUp, BarChart3, Table2, Store, Filter
} from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { createStyledSheetFromJSON, applyWorksheetStyling } from "@/lib/xlsx-utils"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
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
import { AIAnalysisFAB } from "@/components/admin/ai-analysis-fab"
import { MarketingReport } from "@/components/admin/reports/marketing-report"

interface InventoryCheckProduct {
  id: string
  productId?: string
  productCode: string
  productName: string
  productUnit?: string
  productUnitId?: string
  openingBalance: number
  imports: number
  exports: number
  systemBalance: number
  actualBalance: number
  difference: number
  differencePercentage: number
  // Unit selection fields (from API)
  inputUnitId?: string
  inputUnitCode?: string
  inputValue?: number | string | null
  // Unit selection fields (for local state)
  selectedUnitId?: string
  conversionMultiplier?: number
}

interface InventoryCheck {
  id: string
  number: string
  warehouse: string
  period: string
  status: "COMPLETED" | "IN_PROGRESS"
  createdBy: string
  createdAt: string
  items: InventoryCheckProduct[]
  canDelete?: boolean
  deleteBlockedReason?: string
}

interface PromotionInvoice {
  invoiceNumber: string
  totalAmount: number
  discountAmount: number
  createdAt: string
  createdBy: string
}

interface PromotionReport {
  promotion: {
    id: string
    name: string
    discountType: string
    discountValue: number
    status: boolean
    startDate: string
    endDate: string
    affectedProducts: number
    totalDiscount: number
    createdAt: string
  }
  invoices: PromotionInvoice[]
}

interface VoucherInvoice {
  invoiceNumber: string
  voucherCode: string
  totalAmount: number
  discountAmount: number
  createdAt: string
  createdBy: string
}

interface VoucherReport {
  program: {
    id: string
    programName: string
    discountType: string
    discountValue: number
    status: boolean
    totalCodes: number
    usedCodes: number
    usageRate: number
    startDate: string
    endDate: string
    totalValue: number
    createdAt: string
  }
  invoices: VoucherInvoice[]
}

export default function ReportsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const isWarehouseRoute = pathname.startsWith('/warehouse')
  const [activeTab, setActiveTab] = useState(isWarehouseRoute ? "inventory-check" : "revenue")
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState("")
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([])
  const [promotions, setPromotions] = useState<PromotionReport[]>([])
  const [vouchers, setVouchers] = useState<VoucherReport[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [expandedPromotionId, setExpandedPromotionId] = useState<string | null>(null)
  const [expandedVoucherId, setExpandedVoucherId] = useState<string | null>(null)
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<any | null>(null)
  const [selectedPromotionForExport, setSelectedPromotionForExport] = useState<string>("all")
  const [selectedVoucherForExport, setSelectedVoucherForExport] = useState<string>("all")

  // Sales Report states (for Revenue tab)
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")
  const [salesReport, setSalesReport] = useState<any>(null)
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesSubTab, setSalesSubTab] = useState<"chart" | "data">("chart")
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set())
  const [startTime, setStartTime] = useState("00:00:00")
  const [endTime, setEndTime] = useState("23:59:59")
  const [selectedCategoryType, setSelectedCategoryType] = useState<string>("")
  const [invoicePage, setInvoicePage] = useState(1)
  const invoicesPerPage = 10

  // Unit conversion state for inventory checks
  const [unitsMap, setUnitsMap] = useState<Record<string, any[]>>({})

  // Define tabs based on user role and route
  // Warehouse route shows only Kiểm Kê tab
  // Admin route shows Revenue, Voucher and Promotion tabs (no Kiểm Kê)
  const tabs = (user?.role === "WAREHOUSE_STAFF" || isWarehouseRoute)
    ? [{ id: "inventory-check", label: "Kiểm Kê" }]
    : [
      { id: "revenue", label: "Doanh Thu" },
      { id: "marketing", label: "Marketing & Khuyến Mãi" },
    ]

  // Handle tab change
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
  }

  // Fetch warehouses (stores) on mount for revenue comparison
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await mobileFetch('/api/warehouses?type=STORE')
        const json = await res.json()
        if (json.success) {
          // Explicitly filter out PARTNER warehouses just in case, requested by user
          const storesOnly = (json.data || []).filter((w: any) => w.type !== 'PARTNER')
          setWarehouses(storesOnly)
        }
      } catch (err) {
        console.error("Failed to fetch warehouses:", err)
      }
    }
    fetchWarehouses()
  }, [])

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

  // Auto-select first warehouse when loaded
  useEffect(() => {
    if (warehouses.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0].id)
    }
  }, [warehouses, selectedWarehouseId])

  // Fetch sales report data for selected warehouse
  const fetchSalesReport = async () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn khoảng thời gian")
      return
    }
    if (!selectedWarehouseId) {
      toast.error("Vui lòng chọn cửa hàng")
      return
    }

    setSalesLoading(true)
    try {
      const startDateTime = `${startDate}T${startTime}`
      const endDateTime = `${endDate}T${endTime}`

      const params = new URLSearchParams({
        startDate: startDateTime,
        endDate: endDateTime,
        warehouseId: selectedWarehouseId,
      })

      const response = await mobileFetch(`/api/reports/sales?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setSalesReport(result.data)
      } else {
        toast.error(result.error || "Lỗi tải báo cáo")
      }
    } catch (err) {
      console.error("Failed to fetch sales report:", err)
      toast.error("Lỗi tải dữ liệu báo cáo")
    } finally {
      setSalesLoading(false)
    }
  }

  // Auto-fetch when warehouse or dates change
  useEffect(() => {
    if (startDate && endDate && selectedWarehouseId && activeTab === "revenue") {
      fetchSalesReport()
    }
  }, [startDate, endDate, selectedWarehouseId, activeTab])

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount)
  }

  // Helper to format quantity based on selected unit
  const formatDisplayQuantity = (value: number | null | undefined, multiplier: number = 1) => {
    if (value === null || value === undefined) return '-'
    // Convert to selected unit
    const converted = Number(value) / multiplier
    // Format with up to 6 decimals, avoid trailing zeros, disable grouping
    return new Intl.NumberFormat('vi-VN', {
      maximumFractionDigits: 6,
      minimumFractionDigits: 0,
      useGrouping: false
    }).format(converted)
  }

  // Toggle invoice expansion
  const toggleInvoice = (invoiceId: string) => {
    const newExpanded = new Set(expandedInvoices)
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId)
    } else {
      newExpanded.add(invoiceId)
    }
    setExpandedInvoices(newExpanded)
  }

  // Export sales to Excel
  const exportSalesToExcel = () => {
    if (!salesReport) {
      toast.error("Không có dữ liệu để xuất")
      return
    }

    try {
      const workbook = XLSX.utils.book_new()
      const warehouseName = warehouses.find(w => w.id === selectedWarehouseId)?.name || "Unknown"

      // Sheet 1: Summary
      const summaryData = [
        { "Chỉ số": "Cửa Hàng", "Giá trị": warehouseName },
        { "Chỉ số": "Doanh thu gốc (trước giảm/tặng)", "Giá trị": salesReport.summary?.gross_revenue || ((salesReport.summary?.total_revenue || 0) + (salesReport.summary?.total_discount || 0)) },
        { "Chỉ số": "Tổng giảm giá + quà tặng", "Giá trị": salesReport.summary?.total_discount || 0 },
        { "Chỉ số": "Giá trị quà tặng (Voucher + KM)", "Giá trị": salesReport.summary?.total_gift_value || 0 },
        { "Chỉ số": "Doanh thu thực (tiền thu)", "Giá trị": salesReport.summary?.net_revenue || salesReport.summary?.total_revenue || 0 },
        { "Chỉ số": "VAT (Thu hộ)", "Giá trị": salesReport.summary?.total_vat || 0 },
        { "Chỉ số": "Số hóa đơn", "Giá trị": salesReport.summary?.total_invoices || 0 },
      ]
      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Tổng Quan")

      // Sheet 2: Products
      const productData = (salesReport.product_sales || []).map((p: any, idx: number) => ({
        STT: idx + 1,
        "Tên Sản Phẩm": p.recipe_name,
        "Số Lượng Bán": p.quantity_sold,
        "Doanh Thu": p.total_revenue,
      }))
      const productSheet = XLSX.utils.json_to_sheet(productData)
      XLSX.utils.book_append_sheet(workbook, productSheet, "Sản Phẩm")

      const filename = `bao-cao-doanh-so-${warehouseName}-${startDate}-${endDate}.xlsx`
      XLSX.writeFile(workbook, filename)
      toast.success("Đã xuất báo cáo thành công")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Lỗi xuất file Excel")
    }
  }

  // Export Promotions Report to Excel
  const handleExportPromotionsExcel = () => {
    if (!promotions || promotions.length === 0) {
      toast.error("Không có dữ liệu khuyến mãi để xuất")
      return
    }

    try {
      const workbook = XLSX.utils.book_new()

      // Filter promotions based on selection
      const filteredPromotions = selectedPromotionForExport === "all"
        ? promotions
        : promotions.filter((p: any) => p.promotion.id === selectedPromotionForExport)

      if (filteredPromotions.length === 0) {
        toast.error("Không có dữ liệu để xuất")
        return
      }

      // Sheet 1: Summary for all promotions
      const summaryData = filteredPromotions.map((report: any) => ({
        "Tên Khuyến Mãi": report.promotion.name,
        "Loại KM": report.promotion.promotionType === 'DISCOUNT' ? 'Giảm Giá' : 'Quà Tặng',
        "Loại Giảm": report.promotion.discountType === 'PERCENTAGE' ? 'Phần Trăm' : 'Số Tiền',
        "Giá Trị": `${report.promotion.discountValue}${report.promotion.discountType === 'PERCENTAGE' ? '%' : 'đ'}`,
        "Số HĐ": report.promotion.invoiceCount || 0,
        "Doanh Thu Gốc": report.promotion.grossRevenue || 0,
        "Tổng Giảm": report.promotion.totalDiscount || 0,
        "Giá Trị Quà": report.promotion.totalGiftValue || 0,
        "Doanh Thu Thực": report.promotion.netRevenue || 0,
        "Trạng Thái": report.promotion.status ? 'Hoạt động' : 'Kết thúc'
      }))

      const summarySheet = createStyledSheetFromJSON(summaryData, [
        { key: "Tên Khuyến Mãi", label: "Tên Khuyến Mãi", width: 25 },
        { key: "Loại KM", label: "Loại KM", width: 12 },
        { key: "Loại Giảm", label: "Loại Giảm", width: 12 },
        { key: "Giá Trị", label: "Giá Trị", width: 12 },
        { key: "Số HĐ", label: "Số HĐ", width: 10 },
        { key: "Doanh Thu Gốc", label: "Doanh Thu Gốc", width: 15 },
        { key: "Tổng Giảm", label: "Tổng Giảm", width: 15 },
        { key: "Giá Trị Quà", label: "Giá Trị Quà", width: 15 },
        { key: "Doanh Thu Thực", label: "Doanh Thu Thực", width: 15 },
        { key: "Trạng Thái", label: "Trạng Thái", width: 12 }
      ])
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Tổng Quan")

      // Sheet 2: Detailed invoices for each promotion
      const allInvoices: any[] = []
      filteredPromotions.forEach((report: any) => {
        report.invoices.forEach((invoice: any) => {
          // Add invoice items
          invoice.items?.forEach((item: any) => {
            allInvoices.push({
              "Khuyến Mãi": report.promotion.name,
              "Số HĐ": invoice.invoiceNumber,
              "Loại": "Sản phẩm",
              "Tên": item.recipe_name,
              "SL": item.quantity,
              "Đơn Giá": item.unit_price,
              "Thành Tiền": item.line_total,
              "Ngày": new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
              "Người Bán": invoice.createdBy
            })
          })

          // Add gift items
          invoice.giftItems?.forEach((gift: any) => {
            allInvoices.push({
              "Khuyến Mãi": report.promotion.name,
              "Số HĐ": invoice.invoiceNumber,
              "Loại": "🎁 Quà tặng",
              "Tên": gift.name,
              "SL": gift.quantity,
              "Đơn Giá": gift.unit_price,
              "Thành Tiền": gift.line_total,
              "Ngày": new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
              "Người Bán": invoice.createdBy
            })
          })

          // Add discount row if applicable
          if (invoice.discountAmount > 0) {
            allInvoices.push({
              "Khuyến Mãi": report.promotion.name,
              "Số HĐ": invoice.invoiceNumber,
              "Loại": "Giảm giá",
              "Tên": `Giảm ${report.promotion.discountValue}${report.promotion.discountType === 'PERCENTAGE' ? '%' : 'đ'}`,
              "SL": "-",
              "Đơn Giá": "-",
              "Thành Tiền": -invoice.discountAmount,
              "Ngày": new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
              "Người Bán": invoice.createdBy
            })
          }
        })
      })

      const detailSheet = createStyledSheetFromJSON(allInvoices, [
        { key: "Khuyến Mãi", label: "Khuyến Mãi", width: 25 },
        { key: "Số HĐ", label: "Số HĐ", width: 18 },
        { key: "Loại", label: "Loại", width: 12 },
        { key: "Tên", label: "Tên Sản Phẩm / Quà", width: 30 },
        { key: "SL", label: "SL", width: 8 },
        { key: "Đơn Giá", label: "Đơn Giá", width: 12 },
        { key: "Thành Tiền", label: "Thành Tiền", width: 15 },
        { key: "Ngày", label: "Ngày", width: 12 },
        { key: "Người Bán", label: "Người Bán", width: 18 }
      ])
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Chi Tiết")

      const filename = `bao-cao-khuyen-mai-${startDate}-${endDate}.xlsx`
      XLSX.writeFile(workbook, filename)
      toast.success("Đã xuất báo cáo khuyến mãi thành công")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Lỗi xuất file Excel")
    }
  }

  // Export Vouchers Report to Excel
  const handleExportVouchersExcel = () => {
    if (!vouchers || vouchers.length === 0) {
      toast.error("Không có dữ liệu voucher để xuất")
      return
    }

    try {
      const workbook = XLSX.utils.book_new()

      // Filter vouchers based on selection
      const filteredVouchers = selectedVoucherForExport === "all"
        ? vouchers
        : vouchers.filter((v: any) => v.program.id === selectedVoucherForExport)

      if (filteredVouchers.length === 0) {
        toast.error("Không có dữ liệu để xuất")
        return
      }

      // Sheet 1: Summary for all voucher programs
      const summaryData = filteredVouchers.map((report: any) => ({
        "Tên Chương Trình": report.program.programName,
        "Loại Giảm": report.program.discountType === 'PERCENTAGE' ? 'Phần Trăm' : report.program.discountType === 'FIXED' ? 'Số Tiền' : 'Quà Tặng',
        "Giá Trị": `${report.program.discountValue}${report.program.discountType === 'PERCENTAGE' ? '%' : 'đ'}`,
        "Tổng Mã": report.program.totalCodes || 0,
        "Đã Dùng": report.program.usedCodes || 0,
        "Tỷ Lệ SD": `${((report.program.usageRate || 0) * 100).toFixed(1)}%`,
        "Số HĐ": report.program.invoiceCount || 0,
        "Doanh Thu Gốc": report.program.grossRevenue || 0,
        "Tổng Giảm": report.program.totalValue || 0,
        "Giá Trị Quà": report.program.totalGiftValue || 0,
        "Doanh Thu Thực": report.program.netRevenue || 0,
        "Trạng Thái": report.program.status ? 'Hoạt động' : 'Kết thúc'
      }))

      const summarySheet = createStyledSheetFromJSON(summaryData, [
        { key: "Tên Chương Trình", label: "Tên Chương Trình", width: 25 },
        { key: "Loại Giảm", label: "Loại Giảm", width: 12 },
        { key: "Giá Trị", label: "Giá Trị", width: 12 },
        { key: "Tổng Mã", label: "Tổng Mã", width: 10 },
        { key: "Đã Dùng", label: "Đã Dùng", width: 10 },
        { key: "Tỷ Lệ SD", label: "Tỷ Lệ SD", width: 10 },
        { key: "Số HĐ", label: "Số HĐ", width: 10 },
        { key: "Doanh Thu Gốc", label: "Doanh Thu Gốc", width: 15 },
        { key: "Tổng Giảm", label: "Tổng Giảm", width: 15 },
        { key: "Giá Trị Quà", label: "Giá Trị Quà", width: 15 },
        { key: "Doanh Thu Thực", label: "Doanh Thu Thực", width: 15 },
        { key: "Trạng Thái", label: "Trạng Thái", width: 12 }
      ])
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Tổng Quan")

      // Sheet 2: Detailed invoices for each voucher program
      const allInvoices: any[] = []
      filteredVouchers.forEach((report: any) => {
        report.invoices.forEach((invoice: any) => {
          // Add invoice items
          invoice.items?.forEach((item: any) => {
            allInvoices.push({
              "Chương Trình": report.program.programName,
              "Mã Voucher": invoice.voucherCode || '',
              "Số HĐ": invoice.invoiceNumber,
              "Loại": "Sản phẩm",
              "Tên": item.recipe_name,
              "SL": item.quantity,
              "Đơn Giá": item.unit_price,
              "Thành Tiền": item.line_total,
              "Ngày": new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
              "Người Bán": invoice.createdBy
            })
          })

          // Add gift items
          invoice.giftItems?.forEach((gift: any) => {
            allInvoices.push({
              "Chương Trình": report.program.programName,
              "Mã Voucher": invoice.voucherCode || '',
              "Số HĐ": invoice.invoiceNumber,
              "Loại": "🎁 Quà tặng",
              "Tên": gift.name,
              "SL": gift.quantity,
              "Đơn Giá": gift.unit_price,
              "Thành Tiền": gift.line_total,
              "Ngày": new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
              "Người Bán": invoice.createdBy
            })
          })

          // Add discount row if applicable
          if (invoice.discountAmount > 0) {
            allInvoices.push({
              "Chương Trình": report.program.programName,
              "Mã Voucher": invoice.voucherCode || '',
              "Số HĐ": invoice.invoiceNumber,
              "Loại": "Giảm giá",
              "Tên": `Giảm ${report.program.discountValue}${report.program.discountType === 'PERCENTAGE' ? '%' : 'đ'}`,
              "SL": "-",
              "Đơn Giá": "-",
              "Thành Tiền": -invoice.discountAmount,
              "Ngày": new Date(invoice.createdAt).toLocaleDateString('vi-VN'),
              "Người Bán": invoice.createdBy
            })
          }
        })
      })

      const detailSheet = createStyledSheetFromJSON(allInvoices, [
        { key: "Chương Trình", label: "Chương Trình", width: 25 },
        { key: "Mã Voucher", label: "Mã Voucher", width: 18 },
        { key: "Số HĐ", label: "Số HĐ", width: 18 },
        { key: "Loại", label: "Loại", width: 12 },
        { key: "Tên", label: "Tên Sản Phẩm / Quà", width: 30 },
        { key: "SL", label: "SL", width: 8 },
        { key: "Đơn Giá", label: "Đơn Giá", width: 12 },
        { key: "Thành Tiền", label: "Thành Tiền", width: 15 },
        { key: "Ngày", label: "Ngày", width: 12 },
        { key: "Người Bán", label: "Người Bán", width: 18 }
      ])
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Chi Tiết")

      const filename = `bao-cao-voucher-${startDate}-${endDate}.xlsx`
      XLSX.writeFile(workbook, filename)
      toast.success("Đã xuất báo cáo voucher thành công")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Lỗi xuất file Excel")
    }
  }


  // Load inventory checks from database on tab switch
  useEffect(() => {
    if (activeTab === "inventory-check") {
      const fetchInventoryChecks = async () => {
        setLoading(true)
        try {
          // Admin should only see inventory checks from MAIN warehouse
          // Get MAIN warehouse ID first
          const whResponse = await mobileFetch("/api/warehouses?type=MAIN")
          const whResult = await whResponse.json()

          if (!whResult.success || !whResult.data || whResult.data.length === 0) {
            console.error("Cannot find MAIN warehouse")
            setInventoryChecks([])
            setLoading(false)
            return
          }

          const mainWarehouseId = whResult.data[0].id

          // Fetch inventory checks filtered by MAIN warehouse
          const response = await mobileFetch(`/api/inventory-checks?warehouseId=${mainWarehouseId}`)
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          const result = await response.json()
          if (result.success) {
            // Populate inputValue from actualBalance if not set
            const checksWithInputValues = (result.data || []).map((check: InventoryCheck) => ({
              ...check,
              items: check.items.map(item => ({
                ...item,
                inputValue: item.inputValue ?? item.actualBalance
              }))
            }))
            setInventoryChecks(checksWithInputValues)
          } else {
            console.error("Error fetching inventory checks:", result.error)
            setInventoryChecks([])
          }
        } catch (error) {
          console.error("Error fetching inventory checks:", error)
          setInventoryChecks([])
        } finally {
          setLoading(false)
        }
      }
      fetchInventoryChecks()
    }
  }, [activeTab])

  // Fetch units for products when a check is selected
  // Only re-fetch when selectedCheckId changes, not when inventoryChecks changes
  useEffect(() => {
    if (!selectedCheckId) {
      // Don't clear unitsMap to cache results
      return
    }
    const check = inventoryChecks.find(c => c.id === selectedCheckId)
    if (!check || !check.items || check.items.length === 0) return

    const productIds = check.items
      .filter(item => item.productId)
      .map(item => item.productId!)

    if (productIds.length === 0) return

    // Filter out products that already have units in the cache
    const missingProductIds = productIds.filter(id => !unitsMap[id])

    // Helper to update checks with unit info
    const updateCheckWithUnits = (currentUnitsMap: Record<string, any[]>) => {
      const updatedChecks = inventoryChecks.map((c) => {
        if (c.id !== selectedCheckId) return c
        return {
          ...c,
          items: c.items.map(item => {
            if (!item.productId) return item

            const units = currentUnitsMap[item.productId] || []
            const unitId = item.selectedUnitId || item.inputUnitId || item.productUnitId

            if (!unitId) return item

            const unit = units.find(u => u.id === unitId)
            const multiplier = unit?.multiplier || 1

            // If different from current, update
            if (item.conversionMultiplier !== multiplier) {
              return {
                ...item,
                conversionMultiplier: multiplier,
                selectedUnitId: item.selectedUnitId || item.inputUnitId
              }
            }

            return item
          })
        }
      })
      setInventoryChecks(updatedChecks)
    }

    // If no missing products, just update with existing cache and return
    if (missingProductIds.length === 0) {
      updateCheckWithUnits(unitsMap)
      return
    }

    const fetchUnits = async () => {
      try {
        // API has limit of 200 products per request, so batch if needed
        const batchSize = 200
        const batches: string[][] = []
        for (let i = 0; i < missingProductIds.length; i += batchSize) {
          batches.push(missingProductIds.slice(i, i + batchSize))
        }

        const additionalUnitsMap: Record<string, any[]> = {}

        // Fetch all batches
        for (const batch of batches) {
          const response = await mobileFetch('/api/products/batch-units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds: batch })
          })
          const result = await response.json()
          if (result.success && result.data) {
            // Merge results from this batch
            for (const productId of batch) {
              if (result.data[productId]) {
                additionalUnitsMap[productId] = result.data[productId].units || []
              }
            }
          }
        }

        // Update cache by merging
        const combinedMap = { ...unitsMap, ...additionalUnitsMap }
        setUnitsMap(combinedMap)

        // After fetching units, populate conversionMultiplier for items
        updateCheckWithUnits(combinedMap)
      } catch (error) {
        console.error('Error fetching units:', error)
      }
    }
    fetchUnits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCheckId])

  // Helper to get conversion multiplier for a product's selected unit
  const getConversionMultiplier = (productId: string | undefined, selectedUnitId: string | undefined): number => {
    if (!productId || !selectedUnitId) return 1
    const units = unitsMap[productId] || []
    const unit = units.find(u => u.id === selectedUnitId)
    return unit?.multiplier || 1
  }

  const handleCreateCheck = async () => {
    try {
      setCreating(true)

      // Get Main warehouse (Kho Tổng)
      const response = await mobileFetch("/api/warehouses?type=MAIN")
      const warehousesResult = await response.json()

      if (!warehousesResult.success || !warehousesResult.data || warehousesResult.data.length === 0) {
        toast.error("Không tìm thấy kho chính")
        return
      }

      const mainWarehouse = warehousesResult.data[0]

      // Create inventory check for main warehouse
      const createResponse = await mobileFetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: mainWarehouse.id }),
      })
      const result = await createResponse.json()

      // Check for HTTP error status (including 409 Conflict)
      if (!createResponse.ok) {
        toast.error(result.error || "Không thể tạo báo cáo kiểm kê")
        return
      }

      if (result.success && result.data) {
        // Reload inventory checks from database
        const reloadResponse = await mobileFetch("/api/inventory-checks")
        const reloadResult = await reloadResponse.json()
        if (reloadResult.success) {
          // Populate inputValue from actualBalance if not set
          const checksWithInputValues = (reloadResult.data || []).map((check: InventoryCheck) => ({
            ...check,
            items: check.items.map(item => ({
              ...item,
              inputValue: item.inputValue ?? item.actualBalance
            }))
          }))
          setInventoryChecks(checksWithInputValues)
        }

        // Automatically open the newly created check in modal
        setSelectedCheckId(result.data.id)
        toast.success(`Tạo báo cáo kiểm kê thành công: ${result.data.number}`)
      } else {
        toast.error(result.error || "Lỗi tạo báo cáo kiểm kê")
      }
    } catch (error) {
      console.error("Error creating inventory check:", error)
      toast.error("Lỗi tạo báo cáo kiểm kê")
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteCheck = async () => {
    if (!deleteConfirmId) return

    try {
      setDeleting(true)

      // Call API to delete from database
      const deleteResponse = await mobileFetch(`/api/inventory-checks/${deleteConfirmId}`, {
        method: "DELETE",
      })
      const result = await deleteResponse.json()

      if (result.success) {
        // Reload checks from server to get updated canDelete status
        const reloadResponse = await mobileFetch("/api/inventory-checks")
        const reloadResult = await reloadResponse.json()
        if (reloadResult.success) {
          // Populate inputValue from actualBalance if not set (same as in handleCreateCheck)
          const checksWithInputValues = (reloadResult.data || []).map((check: InventoryCheck) => ({
            ...check,
            items: check.items.map(item => ({
              ...item,
              inputValue: item.inputValue ?? item.actualBalance
            }))
          }))
          setInventoryChecks(checksWithInputValues)
        }
        toast.success("Xóa báo cáo thành công")
      } else {
        console.error("Error deleting inventory check:", result.error)
      }

      setDeleteConfirmId(null)
    } catch (error) {
      console.error("Error deleting inventory check:", error)
    } finally {
      setDeleting(false)
    }
  }

  const handleFetchPromotions = async () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn cả từ ngày và đến ngày")
      return
    }

    try {
      setLoading(true)
      const response = await mobileFetch(`/api/reports/promotions?startDate=${startDate}&endDate=${endDate}`
      )
      const result = await response.json()

      if (result.success) {
        setPromotions(result.data || [])
        if ((result.data || []).length === 0) {
          toast.info("Không có dữ liệu khuyến mại trong khoảng thời gian này")
        }
      } else {
        toast.error(result.error || "Lỗi tải dữ liệu khuyến mại")
      }
    } catch (error) {
      console.error("Error fetching promotions:", error)
      toast.error("Lỗi tải dữ liệu khuyến mại")
    } finally {
      setLoading(false)
    }
  }

  const handleFetchVouchers = async () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn cả từ ngày và đến ngày")
      return
    }

    try {
      setLoading(true)
      const response = await mobileFetch(`/api/reports/vouchers?startDate=${startDate}&endDate=${endDate}`
      )
      const result = await response.json()

      if (result.success) {
        setVouchers(result.data || [])
        if ((result.data || []).length === 0) {
          toast.info("Không có dữ liệu voucher trong khoảng thời gian này")
        }
      } else {
        toast.error(result.error || "Lỗi tải dữ liệu voucher")
      }
    } catch (error) {
      console.error("Error fetching vouchers:", error)
      toast.error("Lỗi tải dữ liệu voucher")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={FileText}
        title="Báo Cáo"
        subtitle="Xem và quản lý báo cáo"
      />

      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Báo Cáo</h1>
          <p className="text-muted-foreground mt-2">Xem và quản lý báo cáo hàng tồn kho</p>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-1 md:gap-2 border-b border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 md:px-4 py-2 text-sm md:text-base font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card className="p-6">
          <div className="mb-6 flex gap-4 items-center justify-end">
            {activeTab === "inventory-check" && (
              <Button className="gap-2" onClick={handleCreateCheck} disabled={creating}>
                <Plus className="w-4 h-4" />
                {creating ? "Đang tạo..." : "Tạo Kiểm Kê"}
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            {/* Sales Report Tab (Revenue) */}
            {activeTab === "revenue" && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="space-y-4">
                  {/* Warehouse Selector */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Store className="w-4 h-4" />
                      Cửa Hàng
                    </Label>
                    <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                      <SelectTrigger className="w-full md:w-64">
                        <SelectValue placeholder="Chọn cửa hàng" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id}>
                            {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={fetchSalesReport} disabled={salesLoading} className="flex-1 md:flex-none">
                      {salesLoading ? "Đang tải..." : "Xem Báo Cáo"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={exportSalesToExcel}
                      disabled={!salesReport || salesLoading}
                      className="gap-2 flex-1 md:flex-none"
                    >
                      <Download className="w-4 h-4" />
                      Xuất Excel
                    </Button>
                  </div>
                </div>

                {/* Sub Tabs */}
                <div className="flex gap-2 border-b border-border">
                  <button
                    onClick={() => setSalesSubTab("chart")}
                    className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors ${salesSubTab === "chart"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Biểu Đồ
                  </button>
                  <button
                    onClick={() => setSalesSubTab("data")}
                    className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors ${salesSubTab === "data"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <Table2 className="w-4 h-4" />
                    Số Liệu
                  </button>
                </div>

                {/* Content */}
                {salesLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Đang tải dữ liệu...
                  </div>
                ) : !salesReport ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Chọn cửa hàng và khoảng thời gian để xem báo cáo
                  </div>
                ) : (
                  <>
                    {/* Chart Tab */}
                    {salesSubTab === "chart" && (
                      <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
                          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Doanh Thu Gốc</p>
                            <p className="text-lg md:text-xl font-bold text-blue-800 dark:text-blue-200 mt-1">
                              {formatCurrency(salesReport.summary?.gross_revenue || ((salesReport.summary?.total_revenue || 0) + (salesReport.summary?.total_discount || 0)))}
                            </p>
                            <p className="text-xs text-blue-500 mt-1">(Trước giảm/tặng)</p>
                          </Card>
                          <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
                            <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Giảm + Tặng</p>
                            <p className="text-lg md:text-xl font-bold text-orange-800 dark:text-orange-200 mt-1">
                              {formatCurrency(salesReport.summary?.total_discount || 0)}
                            </p>
                            <p className="text-xs text-orange-500 mt-1">(KM + Quà)</p>
                          </Card>
                          <Card className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900 border-pink-200 dark:border-pink-800">
                            <p className="text-xs text-pink-600 dark:text-pink-400 font-medium">Giá Trị Quà</p>
                            <p className="text-lg md:text-xl font-bold text-pink-800 dark:text-pink-200 mt-1">
                              {formatCurrency(salesReport.summary?.total_gift_value || 0)}
                            </p>
                            <p className="text-xs text-pink-500 mt-1">(Voucher + KM)</p>
                          </Card>
                          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Doanh Thu Thực</p>
                            <p className="text-lg md:text-xl font-bold text-green-800 dark:text-green-200 mt-1">
                              {formatCurrency(salesReport.summary?.net_revenue || salesReport.summary?.total_revenue || 0)}
                            </p>
                            <p className="text-xs text-green-500 mt-1">(Tiền thu)</p>
                          </Card>
                          <Card className="p-4 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 border-rose-200 dark:border-rose-800">
                            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">VAT (Thu Hộ)</p>
                            <p className="text-lg md:text-xl font-bold text-rose-800 dark:text-rose-200 mt-1">
                              {formatCurrency(salesReport.summary?.total_vat || 0)}
                            </p>
                            <p className="text-xs text-rose-500 mt-1">(Tiền thuế)</p>
                          </Card>
                          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
                            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Số Hóa Đơn</p>
                            <p className="text-lg md:text-xl font-bold text-purple-800 dark:text-purple-200 mt-1">
                              {salesReport.summary?.total_invoices || 0}
                            </p>
                          </Card>
                        </div>

                        {/* Daily Breakdown Charts - Only show for multi-day reports */}
                        {(salesReport.daily_breakdown || []).length > 1 && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Daily Revenue Line Chart */}
                            <Card className="p-4 md:p-6">
                              <h3 className="text-lg font-semibold mb-4">Doanh Thu Theo Ngày</h3>
                              <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={salesReport.daily_breakdown}>
                                  <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                                  <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(value) => {
                                      const date = new Date(value)
                                      return `${date.getDate()}/${date.getMonth() + 1}`
                                    }}
                                  />
                                  <YAxis
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(value) => {
                                      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                                      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                                      return value
                                    }}
                                    width={50}
                                  />
                                  <Tooltip
                                    formatter={(value: number) => [formatCurrency(value), "Doanh thu"]}
                                    labelFormatter={(label) => {
                                      const date = new Date(label)
                                      return date.toLocaleDateString("vi-VN", { weekday: 'short', day: '2-digit', month: '2-digit' })
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#22c55e"
                                    strokeWidth={2}
                                    dot={{ fill: "#22c55e", strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, fill: "#16a34a" }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </Card>

                            {/* Daily Order Count Line Chart */}
                            <Card className="p-4 md:p-6">
                              <h3 className="text-lg font-semibold mb-4">Số Đơn Hàng Theo Ngày</h3>
                              <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={salesReport.daily_breakdown}>
                                  <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                                  <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(value) => {
                                      const date = new Date(value)
                                      return `${date.getDate()}/${date.getMonth() + 1}`
                                    }}
                                  />
                                  <YAxis tick={{ fontSize: 11 }} width={40} />
                                  <Tooltip
                                    formatter={(value: number) => [value, "Số đơn"]}
                                    labelFormatter={(label) => {
                                      const date = new Date(label)
                                      return date.toLocaleDateString("vi-VN", { weekday: 'short', day: '2-digit', month: '2-digit' })
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="invoiceCount"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={{ fill: "#8b5cf6", strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, fill: "#7c3aed" }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </Card>
                          </div>
                        )}

                        {/* Hourly Order Distribution Chart */}
                        {(salesReport.hourly_breakdown || []).some((h: any) => h.invoiceCount > 0) && (
                          <Card className="p-4 md:p-6">
                            <h3 className="text-lg font-semibold mb-4">Phân Bố Đơn Hàng Theo Giờ</h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={salesReport.hourly_breakdown}>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fontSize: 10 }}
                                  interval={1}
                                />
                                <YAxis tick={{ fontSize: 11 }} width={35} />
                                <Tooltip
                                  formatter={(value: number, name: string) => {
                                    if (name === "invoiceCount") return [value, "Số đơn"]
                                    return [formatCurrency(value), "Doanh thu"]
                                  }}
                                  labelFormatter={(label) => `Khung giờ: ${label}`}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="invoiceCount"
                                  stroke="#f97316"
                                  strokeWidth={2}
                                  dot={{ fill: "#f97316", strokeWidth: 2, r: 3 }}
                                  activeDot={{ r: 5, fill: "#ea580c" }}
                                  name="invoiceCount"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </Card>
                        )}

                        {/* Top Products Bar Chart */}
                        <Card className="p-4 md:p-6">
                          <h3 className="text-lg font-semibold mb-4">Top Sản Phẩm Bán Chạy</h3>
                          {(salesReport.product_sales || []).length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">Không có dữ liệu</p>
                          ) : (
                            <div className="space-y-3">
                              {(salesReport.product_sales || []).slice(0, 10).map((product: any, idx: number) => {
                                const maxRevenue = Math.max(...(salesReport.product_sales || []).map((p: any) => p.total_revenue))
                                const percentage = maxRevenue > 0 ? (product.total_revenue / maxRevenue) * 100 : 0
                                return (
                                  <div key={product.recipe_id || idx} className="space-y-1">
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

                        {/* Revenue Distribution by Category - Pie Chart */}
                        <Card className="p-4 md:p-6">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                            <h3 className="text-lg font-semibold">Phân Bổ Doanh Thu Theo Sản Phẩm</h3>
                            {(() => {
                              // Get unique categories from product_sales
                              const categories = Array.from(new Set(
                                (salesReport.product_sales || [])
                                  .map((p: any) => p.menu_type_name || p.category_name || "Khác")
                                  .filter((c: string) => c)
                              )) as string[]

                              // Auto-select first category if not selected
                              if (categories.length > 0 && !selectedCategoryType) {
                                setTimeout(() => setSelectedCategoryType(categories[0]), 0)
                              }

                              return (
                                <Select value={selectedCategoryType} onValueChange={setSelectedCategoryType}>
                                  <SelectTrigger className="w-full md:w-48">
                                    <SelectValue placeholder="Chọn loại hàng" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categories.map((cat) => (
                                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )
                            })()}
                          </div>

                          {(() => {
                            // Filter products by selected category
                            const filteredProducts = (salesReport.product_sales || [])
                              .filter((p: any) => (p.menu_type_name || p.category_name || "Khác") === selectedCategoryType)
                              .sort((a: any, b: any) => b.total_revenue - a.total_revenue)
                              .slice(0, 8)

                            const totalRevenue = filteredProducts.reduce((sum: number, p: any) => sum + (p.total_revenue || 0), 0)

                            if (filteredProducts.length === 0) {
                              return <p className="text-center py-8 text-muted-foreground">Chọn loại hàng để xem phân bổ</p>
                            }

                            const pieColors = [
                              '#22c55e', '#3b82f6', '#a855f7', '#f97316',
                              '#ec4899', '#06b6d4', '#eab308', '#ef4444'
                            ]

                            // Calculate angles for CSS conic gradient pie chart
                            let currentAngle = 0
                            const segments = filteredProducts.map((p: any, idx: number) => {
                              const percentage = totalRevenue > 0 ? (p.total_revenue / totalRevenue) * 100 : 0
                              const startAngle = currentAngle
                              currentAngle += (percentage / 100) * 360
                              return {
                                ...p,
                                percentage,
                                startAngle,
                                endAngle: currentAngle,
                                color: pieColors[idx % pieColors.length]
                              }
                            })

                            // Build conic gradient string
                            let gradientParts: string[] = []
                            let currentDeg = 0
                            segments.forEach((seg: any) => {
                              gradientParts.push(`${seg.color} ${currentDeg}deg ${seg.endAngle}deg`)
                              currentDeg = seg.endAngle
                            })
                            const conicGradient = gradientParts.join(', ')

                            // Prepare data for Recharts
                            const pieData = filteredProducts.map((p: any, idx: number) => ({
                              name: p.recipe_name,
                              value: p.total_revenue || 0,
                              percentage: totalRevenue > 0 ? ((p.total_revenue || 0) / totalRevenue) * 100 : 0,
                              color: pieColors[idx % pieColors.length],
                            }))

                            // Custom tooltip with high z-index
                            const CustomTooltip = ({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-sm z-50 relative">
                                    <p className="font-semibold">{data.name}</p>
                                    <p>Doanh thu: {formatCurrency(data.value)}</p>
                                    <p>Tỷ lệ: {data.percentage.toFixed(1)}%</p>
                                  </div>
                                )
                              }
                              return null
                            }

                            return (
                              <div className="flex flex-col items-center">
                                <div className="relative w-full" style={{ height: 320 }}>
                                  <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                      <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius="55%"
                                        outerRadius="85%"
                                        dataKey="value"
                                        nameKey="name"
                                        paddingAngle={2}
                                      >
                                        {pieData.map((entry: any, index: number) => (
                                          <Cell
                                            key={`cell-${index}`}
                                            fill={entry.color}
                                            className="cursor-pointer hover:opacity-80 transition-opacity"
                                          />
                                        ))}
                                      </Pie>
                                      <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                  </ResponsiveContainer>
                                  {/* Center label positioned absolutely in the middle of the pie */}
                                  <div
                                    className="absolute left-1/2 pointer-events-none z-10"
                                    style={{ top: 125, transform: 'translate(-50%, -50%)' }}
                                  >
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Tổng</p>
                                      <p className="text-base font-bold">{formatCurrency(totalRevenue)}</p>
                                    </div>
                                  </div>
                                </div>
                                {/* Legend below the chart - Responsive Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 px-4 mt-4 justify-items-start">
                                  {pieData.slice(0, 8).map((entry: any, index: number) => (
                                    <div key={index} className="flex items-center gap-2 min-w-0">
                                      <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: entry.color }}
                                      />
                                      <span className="text-sm text-muted-foreground truncate">
                                        {entry.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                        </Card>

                        {/* Shift Revenue Chart */}
                        <ShiftRevenueChart
                          warehouseId={selectedWarehouseId || null}
                          date={startDate || undefined}
                        />

                        {/* Week Comparison Chart */}
                        <WeekComparisonChart
                          warehouseId={selectedWarehouseId || null}
                        />
                      </div>
                    )}

                    {/* Data Tab */}
                    {salesSubTab === "data" && (
                      <div className="space-y-6">
                        {/* Products Table */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">
                            Sản Phẩm Bán Ra ({(salesReport.product_sales || []).length} sản phẩm)
                          </h3>
                          {(salesReport.product_sales || []).length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">
                              Không có dữ liệu sản phẩm
                            </p>
                          ) : (
                            <div className="overflow-x-auto border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-12">STT</TableHead>
                                    <TableHead>Sản Phẩm</TableHead>
                                    <TableHead className="text-center">SL Bán</TableHead>
                                    <TableHead className="text-right">Doanh Thu</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(salesReport.product_sales || []).map((product: any, idx: number) => (
                                    <TableRow key={product.recipe_id || idx}>
                                      <TableCell className="font-medium">{idx + 1}</TableCell>
                                      <TableCell>
                                        <p className="font-medium">{product.recipe_name}</p>
                                        {product.product_name && (
                                          <p className="text-xs text-muted-foreground">{product.product_name}</p>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-center font-medium">
                                        {product.quantity_sold}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold text-green-600">
                                        {formatCurrency(product.total_revenue)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>

                        {/* Invoices */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">
                            Chi Tiết Hóa Đơn ({(salesReport.invoices || []).length} hóa đơn)
                          </h3>
                          {(salesReport.invoices || []).length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">
                              Không có hóa đơn
                            </p>
                          ) : (() => {
                            const allInvoices = salesReport.invoices || []
                            const totalPages = Math.ceil(allInvoices.length / invoicesPerPage)
                            const startIdx = (invoicePage - 1) * invoicesPerPage
                            const paginatedInvoices = allInvoices.slice(startIdx, startIdx + invoicesPerPage)

                            return (
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  {paginatedInvoices.map((invoice: any) => (
                                    <Collapsible key={invoice.id} open={expandedInvoices.has(invoice.id)}>
                                      <CollapsibleTrigger
                                        onClick={() => toggleInvoice(invoice.id)}
                                        className="w-full"
                                      >
                                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                                          <div className="flex items-center gap-3">
                                            {expandedInvoices.has(invoice.id) ? (
                                              <ChevronUp className="w-4 h-4" />
                                            ) : (
                                              <ChevronDown className="w-4 h-4" />
                                            )}
                                            <div className="text-left">
                                              <p className="font-medium">{invoice.invoice_number}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {invoice.created_at ? new Date(invoice.created_at).toLocaleString("vi-VN") : "-"} • {invoice.created_by_name}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <p className="font-semibold text-green-600">
                                              {formatCurrency(invoice.total_amount)}
                                            </p>
                                            {invoice.discount_amount > 0 && (
                                              <p className="text-xs text-orange-600">
                                                -{formatCurrency(invoice.discount_amount)}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="p-3 border border-t-0 rounded-b-lg space-y-2">
                                          {(invoice.items || []).map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between text-sm">
                                              <div className="flex-1">
                                                <span>{item.recipe_name}</span>
                                                <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                                              </div>
                                              <span className="font-medium">{formatCurrency(item.line_total)}</span>
                                            </div>
                                          ))}
                                          {invoice.voucher_code && (
                                            <div className="pt-2 border-t">
                                              <Badge variant="outline" className="text-xs">
                                                Voucher: {invoice.voucher_code}
                                              </Badge>
                                            </div>
                                          )}
                                          {invoice.vat_amount && invoice.vat_amount > 0 && (
                                            <div className="flex justify-between items-center text-rose-600 text-sm pt-2 border-t">
                                              <span>VAT (8%)</span>
                                              <span>{formatCurrency(invoice.vat_amount)}</span>
                                            </div>
                                          )}
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  ))}
                                </div>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                  <div className="flex items-center justify-between pt-4 border-t">
                                    <p className="text-sm text-muted-foreground">
                                      Trang {invoicePage} / {totalPages} ({allInvoices.length} hóa đơn)
                                    </p>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))}
                                        disabled={invoicePage === 1}
                                      >
                                        Trước
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setInvoicePage(Math.min(totalPages, invoicePage + 1))}
                                        disabled={invoicePage === totalPages}
                                      >
                                        Sau
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}


            {activeTab === "inventory-check" && (
              <div>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Đang tải dữ liệu...
                  </div>
                ) : inventoryChecks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chưa có phiếu kiểm kê nào
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Số Kiểm Kê</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Kho</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Kỳ</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày Tạo</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Người Tạo</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryChecks.map((check) => (
                        <tr key={check.id} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium text-foreground">{check.number}</td>
                          <td className="py-3 px-4 text-foreground">{check.warehouse}</td>
                          <td className="py-3 px-4 text-foreground text-sm">{check.period}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {check.createdAt ? new Date(check.createdAt).toLocaleString("vi-VN") : "-"}
                          </td>
                          <td className="py-3 px-4 text-sm text-foreground">{check.createdBy || "-"}</td>
                          <td className="py-3 px-4">
                            <Badge className={check.status === "COMPLETED" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                              {check.status === "COMPLETED" ? "Hoàn Thành" : "Đang Tiến Hành"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedCheckId(check.id)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {check.canDelete !== false ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteConfirmId(check.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-gray-300 cursor-not-allowed"
                                title={check.deleteBlockedReason || "Không thể xóa"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Marketing Tab */}
            {activeTab === "marketing" && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="bg-card rounded-lg border p-4 shadow-sm space-y-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Warehouse Selector */}
                    <div className="flex-1 space-y-2">
                      <Label className="text-sm font-medium">Cửa Hàng</Label>
                      <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn cửa hàng" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả cửa hàng</SelectItem>
                          {warehouses.map((wh) => (
                            <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Start Date */}
                    <div className="flex-1 space-y-2">
                      <Label className="text-sm font-medium">Từ Ngày</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>

                    {/* End Date */}
                    <div className="flex-1 space-y-2">
                      <Label className="text-sm font-medium">Đến Ngày</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                </div>

                <MarketingReport
                  startDate={startDate}
                  endDate={endDate}
                  warehouseId={selectedWarehouseId === "all" ? undefined : selectedWarehouseId}
                />
              </div>
            )}

          </div>

        </Card>

        {/* Detail Modal for Inventory Check */}
        {selectedCheckId && (
          <Dialog open={!!selectedCheckId} onOpenChange={(open) => !open && setSelectedCheckId(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
              <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0 text-left">
                <DialogTitle className="text-left">Chi Tiết Kiểm Kê</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {inventoryChecks.find((c) => c.id === selectedCheckId)?.number} - {inventoryChecks.find((c) => c.id === selectedCheckId)?.period}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Người tạo: {inventoryChecks.find((c) => c.id === selectedCheckId)?.createdBy || "-"} • Ngày tạo: {inventoryChecks.find((c) => c.id === selectedCheckId)?.createdAt ? new Date(inventoryChecks.find((c) => c.id === selectedCheckId)!.createdAt).toLocaleString("vi-VN") : "-"}
                </p>
              </DialogHeader>

              {inventoryChecks.find((c) => c.id === selectedCheckId) && (
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-4 px-6 py-4">
                    {/* Search/Filter */}
                    <div className="flex gap-2">
                      <Search className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-2.5" />
                      <Input
                        placeholder="Tìm kiếm sản phẩm..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="flex-1"
                      />
                    </div>

                    {/* Products Table - Desktop */}
                    <div className="hidden md:block overflow-x-auto border border-border rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted border-b border-border">
                            <th className="text-left py-3 px-4 font-semibold text-foreground">Mã SP</th>
                            <th className="text-left py-3 px-4 font-semibold text-foreground">Sản Phẩm</th>
                            <th className="text-left py-3 px-4 font-semibold text-foreground">Đơn Vị</th>
                            <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Đầu</th>
                            <th className="text-center py-3 px-4 font-semibold text-foreground">Nhập</th>
                            <th className="text-center py-3 px-4 font-semibold text-foreground">Xuất</th>
                            <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Hệ Thống</th>
                            <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Thực Tế</th>
                            {inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "COMPLETED" && (
                              <>
                                <th className="text-center py-3 px-4 font-semibold text-foreground">Chênh Lệch</th>
                                <th className="text-center py-3 px-4 font-semibold text-foreground">Chú Thích</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryChecks
                            .find((c) => c.id === selectedCheckId)
                            ?.items.filter(
                              (item) =>
                                item.productCode.toLowerCase().includes(searchFilter.toLowerCase()) ||
                                item.productName.toLowerCase().includes(searchFilter.toLowerCase())
                            )
                            .map((item, idx) => {
                              const check = inventoryChecks.find((c) => c.id === selectedCheckId)
                              const isCompleted = check?.status === "COMPLETED"

                              // Calculate multiplier for display
                              const currentUnitId = item.selectedUnitId || item.inputUnitId || item.productUnitId
                              const multiplier = getConversionMultiplier(item.productId, currentUnitId)
                              const unit = item.productId && unitsMap[item.productId] ? unitsMap[item.productId].find((u: any) => u.id === currentUnitId) : null

                              return (
                                <tr key={item.id} className="border-b border-border hover:bg-muted/50">
                                  <td className="py-3 px-4 text-sm font-medium text-muted-foreground">{item.productCode}</td>
                                  <td className="py-3 px-4 font-medium text-foreground">{item.productName}</td>
                                  <td className="py-3 px-4 text-sm text-foreground">
                                    {isEditing && item.productId && (unitsMap[item.productId]?.length ?? 0) > 1 ? (
                                      <select
                                        value={item.selectedUnitId || item.inputUnitId || item.productUnitId || ''}
                                        onChange={(e) => {
                                          const newUnitId = e.target.value
                                          const newMultiplier = getConversionMultiplier(item.productId, newUnitId)
                                          const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                          const itemIdx = newItems.findIndex(i => i.id === item.id)
                                          if (itemIdx >= 0) {
                                            // Keep actualBalance (already in base unit) unchanged
                                            // Recalculate inputValue = actualBalance / newMultiplier
                                            const currentActualBalance = newItems[itemIdx].actualBalance ?? 0
                                            const newInputValue = newMultiplier > 1
                                              ? currentActualBalance / newMultiplier
                                              : currentActualBalance

                                            const newUnit = item.productId ? unitsMap[item.productId]?.find((u: any) => u.id === newUnitId) : null
                                            newItems[itemIdx] = {
                                              ...newItems[itemIdx],
                                              selectedUnitId: newUnitId,
                                              inputUnitCode: newUnit?.code || newUnit?.name,
                                              conversionMultiplier: newMultiplier,
                                              inputValue: newInputValue !== 0 ? newInputValue : null,
                                              actualBalance: currentActualBalance
                                            }
                                            const updatedChecks = inventoryChecks.map((c) =>
                                              c.id === selectedCheckId ? { ...c, items: newItems } : c
                                            )
                                            setInventoryChecks(updatedChecks)
                                          }
                                        }}
                                        className="px-2 py-1 border border-input rounded text-sm bg-background"
                                      >
                                        {unitsMap[item.productId]?.map((unit: any) => (
                                          <option key={unit.id} value={unit.id}>
                                            {unit.code || unit.name}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      // View mode: show unit from currentUnitId
                                      (unit?.code || item.inputUnitCode || item.productUnit || '-')
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center text-foreground">{formatDisplayQuantity(item.openingBalance, multiplier)}</td>
                                  <td className="py-3 px-4 text-center text-green-600 font-medium">+{formatDisplayQuantity(item.imports, multiplier)}</td>
                                  <td className="py-3 px-4 text-center text-red-600 font-medium">-{formatDisplayQuantity(item.exports, multiplier)}</td>
                                  <td className="py-3 px-4 text-center text-foreground font-medium">{formatDisplayQuantity(item.systemBalance, multiplier)}</td>
                                  <td className="py-3 px-4 text-center">
                                    {isEditing ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="Nhập"
                                          value={item.inputValue === null || item.inputValue === undefined ? '' : String(item.inputValue).replace('.', ',')}
                                          className="w-20 px-2 py-1 border border-input rounded text-center text-sm"
                                          onBlur={(e) => {
                                            if (e.target.value === '' || e.target.value === null) {
                                              const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                              const itemIdx = newItems.findIndex(i => i.id === item.id)
                                              if (itemIdx >= 0) {
                                                newItems[itemIdx] = { ...newItems[itemIdx], inputValue: 0, actualBalance: 0 }
                                                const updatedChecks = inventoryChecks.map((c) =>
                                                  c.id === selectedCheckId ? { ...c, items: newItems } : c
                                                )
                                                setInventoryChecks(updatedChecks)
                                              }
                                            }
                                          }}
                                          onChange={(e) => {
                                            // Auto-convert dot to comma
                                            const rawValue = e.target.value.replace('.', ',')

                                            // Allow positive decimal numbers with comma (digits and single comma)
                                            if (rawValue !== '' && !/^\d+(,\d*)?$/.test(rawValue) && !/^,\d*$/.test(rawValue)) {
                                              return
                                            }

                                            if (rawValue === '') {
                                              const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                              const itemIdx = newItems.findIndex(i => i.id === item.id)
                                              if (itemIdx >= 0) {
                                                newItems[itemIdx] = { ...newItems[itemIdx], inputValue: null, actualBalance: 0 }
                                                const updatedChecks = inventoryChecks.map((c) =>
                                                  c.id === selectedCheckId ? { ...c, items: newItems } : c
                                                )
                                                setInventoryChecks(updatedChecks)
                                              }
                                              return
                                            }

                                            const numValue = Number(rawValue.replace(',', '.'))

                                            const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                            const itemIdx = newItems.findIndex(i => i.id === item.id)
                                            if (itemIdx >= 0) {
                                              const multiplier = newItems[itemIdx].conversionMultiplier || getConversionMultiplier(item.productId, item.selectedUnitId || item.inputUnitId)

                                              // No rounding here to preserve precision
                                              const convertedValue = numValue * multiplier

                                              newItems[itemIdx] = {
                                                ...newItems[itemIdx],
                                                inputValue: rawValue, // Store rawValue
                                                actualBalance: convertedValue
                                              }
                                              const updatedChecks = inventoryChecks.map((c) =>
                                                c.id === selectedCheckId ? { ...c, items: newItems } : c
                                              )
                                              setInventoryChecks(updatedChecks)
                                            }
                                          }}
                                        />
                                        {/* Conversion preview when editing */}
                                        {item.conversionMultiplier && item.conversionMultiplier !== 1 && Number(String(item.inputValue ?? 0).replace(',', '.')) > 0 && (
                                          <div className="text-center">
                                            <span className="text-xs text-blue-600 font-medium">
                                              {item.inputValue ?? 0} {unit?.code || ''} → {new Intl.NumberFormat('vi-VN', {
                                                maximumFractionDigits: 6,
                                                minimumFractionDigits: 0,
                                                useGrouping: false
                                              }).format(Number(String(item.inputValue ?? 0).replace(',', '.')) * item.conversionMultiplier)} {item.productUnit}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      /* View mode: show input value + input unit with conversion note */
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="font-medium text-foreground">
                                          {item.inputValue !== null && item.inputValue !== undefined ? item.inputValue : formatDisplayQuantity(item.actualBalance, multiplier)} {unit?.code || item.inputUnitCode || item.productUnit || ''}
                                        </span>
                                        {/* Show conversion note if different unit was used */}
                                        {item.inputUnitId && item.inputUnitId !== item.productUnitId && item.inputValue && (
                                          <span className="text-xs text-muted-foreground">
                                            (= {formatDisplayQuantity(item.actualBalance, 1)} {item.productUnit})
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  {isCompleted && (
                                    <>
                                      <td className="py-3 px-4 text-center">
                                        <span
                                          className={`font-semibold ${item.difference >= 0 ? "text-green-600" : "text-red-600"
                                            }`}
                                        >
                                          {item.difference > 0 ? "+" : ""}
                                          {formatDisplayQuantity(item.difference, 1)} ({item.differencePercentage > 0 ? "+" : ""}
                                          {item.differencePercentage}%)
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <span
                                          className={`text-sm font-medium ${item.difference > 0 ? "text-blue-600" : item.difference < 0 ? "text-orange-600" : "text-muted-foreground"
                                            }`}
                                        >
                                          {item.difference > 0 && "NHẬP ĐIỀU CHỈNH"}
                                          {item.difference < 0 && "XUẤT ĐIỀU CHỈNH"}
                                          {item.difference === 0 && "-"}
                                        </span>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards - Optimized for Data Entry */}
                    <div className="md:hidden space-y-3">
                      {inventoryChecks
                        .find((c) => c.id === selectedCheckId)
                        ?.items.filter(
                          (item) =>
                            item.productCode.toLowerCase().includes(searchFilter.toLowerCase()) ||
                            item.productName.toLowerCase().includes(searchFilter.toLowerCase())
                        )
                        .map((item, idx) => {
                          const check = inventoryChecks.find((c) => c.id === selectedCheckId)
                          const isCompleted = check?.status === "COMPLETED"

                          // Calculate multiplier for display
                          const currentUnitId = item.selectedUnitId || item.inputUnitId || item.productUnitId
                          const multiplier = getConversionMultiplier(item.productId, currentUnitId)
                          const unit = item.productId && unitsMap[item.productId] ? unitsMap[item.productId].find((u: any) => u.id === currentUnitId) : null

                          return (
                            <div key={item.id} className="border border-border rounded-lg p-4 bg-card space-y-3">
                              {/* Product Info */}
                              <div className="flex items-start justify-between gap-2 pb-3 border-b border-border">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-base text-foreground truncate">{item.productName}</h3>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-muted-foreground">Mã: {item.productCode}</span>
                                    <span className="text-xs text-muted-foreground">• ĐV: {item.productUnit ?? '-'}</span>
                                  </div>
                                </div>
                                {isCompleted && item.difference !== 0 && (
                                  <Badge className={item.difference > 0 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                                    {item.difference > 0 ? "Nhập ĐC" : "Xuất ĐC"}
                                  </Badge>
                                )}
                              </div>

                              {/* Stock Info Grid */}
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-muted/50 rounded-lg p-2">
                                  <div className="text-xs text-muted-foreground mb-1">Tồn Đầu</div>
                                  <div className="text-sm font-medium">{formatDisplayQuantity(item.openingBalance, multiplier)}</div>
                                </div>
                                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2">
                                  <div className="text-xs text-green-600 dark:text-green-400 mb-1">Nhập</div>
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">+{formatDisplayQuantity(item.imports, multiplier)}</div>
                                </div>
                                <div className="bg-red-50 dark:bg-red-950 rounded-lg p-2">
                                  <div className="text-xs text-red-600 dark:text-red-400 mb-1">Xuất</div>
                                  <div className="text-sm font-semibold text-red-600 dark:text-red-400">-{formatDisplayQuantity(item.exports, multiplier)}</div>
                                </div>
                              </div>

                              <div className="flex items-center justify-center gap-2 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Tồn Hệ Thống:</span>
                                <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatDisplayQuantity(item.systemBalance, multiplier)}</span>
                              </div>

                              {/* Input Field - Large and Prominent */}
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                                  <span className={isEditing ? "text-green-600" : ""}>Tồn Thực Tế</span>
                                  {isEditing && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">Đang nhập</Badge>}
                                </label>

                                {/* Unit selector for mobile */}
                                {isEditing && item.productId && (unitsMap[item.productId]?.length ?? 0) > 1 && (
                                  <select
                                    value={item.selectedUnitId || item.inputUnitId || item.productUnitId || ''}
                                    onChange={(e) => {
                                      const newUnitId = e.target.value
                                      const newMultiplier = getConversionMultiplier(item.productId, newUnitId)
                                      const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                      const itemIdx = newItems.findIndex(i => i.id === item.id)
                                      if (itemIdx >= 0) {
                                        // Keep actualBalance (already in base unit) unchanged
                                        // Recalculate inputValue = actualBalance / newMultiplier
                                        const currentActualBalance = newItems[itemIdx].actualBalance ?? 0
                                        const newInputValue = newMultiplier > 1
                                          ? currentActualBalance / newMultiplier
                                          : currentActualBalance

                                        const newUnit = item.productId ? unitsMap[item.productId]?.find((u: any) => u.id === newUnitId) : null
                                        newItems[itemIdx] = {
                                          ...newItems[itemIdx],
                                          selectedUnitId: newUnitId,
                                          inputUnitCode: newUnit?.code || newUnit?.name,
                                          conversionMultiplier: newMultiplier,
                                          inputValue: newInputValue !== 0 ? newInputValue : null,
                                          actualBalance: currentActualBalance
                                        }
                                        const updatedChecks = inventoryChecks.map((c) =>
                                          c.id === selectedCheckId ? { ...c, items: newItems } : c
                                        )
                                        setInventoryChecks(updatedChecks)
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background mb-2"
                                  >
                                    {unitsMap[item.productId]?.map((unit: any) => (
                                      <option key={unit.id} value={unit.id}>
                                        {unit.code || unit.name}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {isEditing ? (
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="Nhập số lượng kiểm kê"
                                      value={item.inputValue === null || item.inputValue === undefined ? '' : String(item.inputValue).replace('.', ',')}
                                      className="w-full px-4 py-3 text-lg font-semibold text-center border-2 border-input rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                      onBlur={(e) => {
                                        if (e.target.value === '' || e.target.value === null) {
                                          const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                          const itemIdx = newItems.findIndex(i => i.id === item.id)
                                          if (itemIdx >= 0) {
                                            newItems[itemIdx] = { ...newItems[itemIdx], inputValue: 0, actualBalance: 0 }
                                            const updatedChecks = inventoryChecks.map((c) =>
                                              c.id === selectedCheckId ? { ...c, items: newItems } : c
                                            )
                                            setInventoryChecks(updatedChecks)
                                          }
                                        }
                                      }}
                                      onChange={(e) => {
                                        // Auto-convert dot to comma
                                        const rawValue = e.target.value.replace('.', ',')

                                        // Allow positive decimal numbers with comma (digits and single comma)
                                        if (rawValue !== '' && !/^\d+(,\d*)?$/.test(rawValue) && !/^,\d*$/.test(rawValue)) {
                                          return
                                        }

                                        if (rawValue === '') {
                                          const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                          const itemIdx = newItems.findIndex(i => i.id === item.id)
                                          if (itemIdx >= 0) {
                                            newItems[itemIdx] = { ...newItems[itemIdx], inputValue: null, actualBalance: 0 }
                                            const updatedChecks = inventoryChecks.map((c) =>
                                              c.id === selectedCheckId ? { ...c, items: newItems } : c
                                            )
                                            setInventoryChecks(updatedChecks)
                                          }
                                          return
                                        }

                                        const numValue = Number(rawValue.replace(',', '.'))

                                        const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                        const itemIdx = newItems.findIndex(i => i.id === item.id)
                                        if (itemIdx >= 0) {
                                          const multiplier = newItems[itemIdx].conversionMultiplier || getConversionMultiplier(item.productId, item.selectedUnitId || item.inputUnitId)

                                          // No rounding here to preserve precision
                                          const convertedValue = numValue * multiplier

                                          newItems[itemIdx] = {
                                            ...newItems[itemIdx],
                                            inputValue: rawValue, // Store rawValue
                                            actualBalance: convertedValue
                                          }
                                          const updatedChecks = inventoryChecks.map((c) =>
                                            c.id === selectedCheckId ? { ...c, items: newItems } : c
                                          )
                                          setInventoryChecks(updatedChecks)
                                        }
                                      }}
                                    />
                                    {/* Conversion preview when editing */}
                                    {item.conversionMultiplier && item.conversionMultiplier !== 1 && Number(String(item.inputValue ?? 0).replace(',', '.')) > 0 && (
                                      <div className="text-center">
                                        <span className="text-sm text-blue-600 font-medium">
                                          {item.inputValue ?? 0} {unit?.code || ''} → {new Intl.NumberFormat('vi-VN', {
                                            maximumFractionDigits: 6,
                                            minimumFractionDigits: 0,
                                            useGrouping: false
                                          }).format(Number(String(item.inputValue ?? 0).replace(',', '.')) * item.conversionMultiplier)} {item.productUnit}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* View mode */
                                  <div className="w-full px-4 py-3 text-lg font-semibold text-center border-2 border-input rounded-lg bg-muted">
                                    <div>{item.inputValue !== null && item.inputValue !== undefined ? item.inputValue : formatDisplayQuantity(item.actualBalance, multiplier)} {unit?.code || item.inputUnitCode || item.productUnit || ''}</div>
                                    {item.inputUnitId && item.inputUnitId !== item.productUnitId && item.inputValue && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        (= {formatDisplayQuantity(item.actualBalance, 1)} {item.productUnit})
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Difference Display - Only when Completed */}
                              {isCompleted && (
                                <div className={`p-3 rounded-lg ${item.difference > 0 ? 'bg-green-50 dark:bg-green-950' :
                                  item.difference < 0 ? 'bg-red-50 dark:bg-red-950' :
                                    'bg-muted/50'
                                  }`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">Chênh lệch:</span>
                                    <span className={`text-base font-bold ${item.difference >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                      }`}>
                                      {item.difference > 0 ? "+" : ""}{formatDisplayQuantity(item.difference, 1)}
                                      <span className="text-sm ml-1">
                                        ({item.differencePercentage > 0 ? "+" : ""}{item.differencePercentage}%)
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>

                  </div>
                </div>
              )}

              {/* Fixed Footer with Buttons */}
              {inventoryChecks.find((c) => c.id === selectedCheckId) && (
                inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "IN_PROGRESS" ||
                inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "COMPLETED"
              ) ? (
                <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCheckId(null)
                      setIsEditing(false)
                    }}
                  >
                    Hủy
                  </Button>
                  {!isEditing && (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      Chỉnh Sửa
                    </Button>
                  )}
                  {isEditing && (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                    >
                      Xong Chỉnh Sửa
                    </Button>
                  )}
                  <Button
                    disabled={isEditing || isSaving}
                    onClick={async () => {
                      const check = inventoryChecks.find((c) => c.id === selectedCheckId)
                      if (!check) return

                      // Validate all items have actual_balance value (allow 0 and negative values)
                      const allFilled = check.items.every((it) => typeof it.actualBalance === 'number')
                      if (!allFilled) {
                        toast.error("Vui lòng nhập đầy đủ 'Tồn Thực Tế' cho tất cả sản phẩm")
                        return
                      }

                      try {
                        setIsSaving(true)
                        const res = await mobileFetch(`/api/inventory-checks/${selectedCheckId}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            items: check.items.map((it) => ({
                              id: it.id,
                              actual_balance: it.actualBalance,
                              input_unit_id: it.selectedUnitId || it.inputUnitId || null,
                              input_value: it.inputValue !== null && it.inputValue !== undefined
                                ? Number(String(it.inputValue).replace(',', '.'))
                                : null,
                            })),
                            status: "COMPLETED",
                          }),
                        })
                        const json = await res.json()
                        if (res.ok && json.success) {
                          // Reload inventory checks
                          const reloadRes = await mobileFetch("/api/inventory-checks")
                          const reloadJson = await reloadRes.json()
                          if (reloadJson.success) {
                            // Populate inputValue from actualBalance if not set
                            const checksWithInputValues = (reloadJson.data || []).map((check: InventoryCheck) => ({
                              ...check,
                              items: check.items.map(item => ({
                                ...item,
                                inputValue: item.inputValue ?? item.actualBalance
                              }))
                            }))
                            setInventoryChecks(checksWithInputValues)
                            setSelectedCheckId(null)
                            setIsEditing(false)
                            toast.success("Tính toán kiểm kê thành công!")
                          }
                        } else {
                          toast.error(json.error || "Lỗi tính toán kiểm kê")
                        }
                      } catch (err) {
                        toast.error("Lỗi khi tính toán kiểm kê")
                      } finally {
                        setIsSaving(false)
                      }
                    }}
                  >
                    {isSaving ? "Đang tính toán..." : "Tính Toán Kiểm Kê"}
                  </Button>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        )}

        {/* Invoice Detail Dialog */}
        <Dialog open={!!selectedInvoiceDetail} onOpenChange={(open) => !open && setSelectedInvoiceDetail(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chi Tiết Hóa Đơn #{selectedInvoiceDetail?.invoiceNumber}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {selectedInvoiceDetail?.createdAt && new Date(selectedInvoiceDetail.createdAt).toLocaleString('vi-VN')} • {selectedInvoiceDetail?.createdBy}
              </p>
            </DialogHeader>

            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Tổng Tiền</p>
                  <p className="font-semibold text-lg text-blue-600">{formatCurrency(selectedInvoiceDetail?.totalAmount || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Giảm Giá</p>
                  <p className="font-semibold text-lg text-orange-600">{formatCurrency(selectedInvoiceDetail?.discountAmount || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Giá Trị Quà</p>
                  <p className="font-semibold text-lg text-pink-600">{formatCurrency(selectedInvoiceDetail?.giftValue || 0)}</p>
                </div>
              </div>

              {/* Items */}
              {selectedInvoiceDetail?.items && selectedInvoiceDetail.items.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Sản phẩm</h4>
                  <div className="border rounded-lg divide-y">
                    {selectedInvoiceDetail.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-3">
                        <div>
                          <p className="font-medium">{item.recipe_name}</p>
                          <p className="text-sm text-muted-foreground">x{item.quantity} × {formatCurrency(item.unit_price)}</p>
                        </div>
                        <p className="font-semibold">{formatCurrency(item.line_total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gift Items */}
              {selectedInvoiceDetail?.giftItems && selectedInvoiceDetail.giftItems.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-pink-600">🎁 Quà Tặng</h4>
                  <div className="border border-pink-200 rounded-lg divide-y divide-pink-200 bg-pink-50">
                    {selectedInvoiceDetail.giftItems.map((gift: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-3">
                        <div>
                          <p className="font-medium">{gift.name}</p>
                          <p className="text-sm text-muted-foreground">x{gift.quantity} × {formatCurrency(gift.unit_price)}</p>
                        </div>
                        <p className="font-semibold">{formatCurrency(gift.line_total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedInvoiceDetail?.voucherCode && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Mã Voucher:</strong> <span className="font-mono">{selectedInvoiceDetail.voucherCode}</span>
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa phiếu kiểm kê</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa phiếu kiểm kê <strong>{inventoryChecks.find((c) => c.id === deleteConfirmId)?.number}</strong> này? Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCheck}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Đang xóa..." : "Xóa"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
        {/* AI Analysis FAB - Only on Revenue tab */}
        {activeTab === "revenue" && salesReport && (
          <AIAnalysisFAB
            salesData={salesReport}
            warehouseName={warehouses.find(w => w.id === selectedWarehouseId)?.name}
            dateRange={{ startDate, endDate }}
          />
        )}

      </div>
    </div>
  )
}
