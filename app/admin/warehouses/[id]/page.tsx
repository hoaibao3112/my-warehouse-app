"use client"

import React from "react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft, Search, Package, TrendingUp, Users, Clock, ShoppingCart,
  Receipt, FileText, Settings, Target, Wrench, ClipboardList, PackagePlus,
  MapPin, Loader2, Check, AlertCircle, Navigation, Printer, Eye, Trash2,
  Plus, RefreshCw, Edit, ExternalLink, ChevronDown
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatVietnamDate, formatVietnamDateOnly } from "@/lib/timezone"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { SalesTargetsTab } from "./components/sales-targets-tab"

// Tab definitions based on warehouse type
const MAIN_TABS = [
  { id: "stock", label: "Tồn Kho", icon: Package },
  { id: "transfers", label: "Xuất Hàng", icon: TrendingUp },
  { id: "reports", label: "Báo Cáo", icon: FileText },
]

const STORE_TABS = [
  { id: "stock", label: "Tồn Kho", icon: Package },
  { id: "staff", label: "Nhân Viên", icon: Users },
  { id: "invoices", label: "Hóa Đơn", icon: Receipt },
  { id: "reports", label: "Báo Cáo", icon: FileText },
  { id: "target", label: "Target", icon: Target },
]

export default function AdminWarehouseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const warehouseId = params.id as string

  const [warehouse, setWarehouse] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("stock")

  // Data states for various tabs - Stock Tab (now showing Products with Stock)
  const [stockProducts, setStockProducts] = useState<any[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [stockSearch, setStockSearch] = useState("")
  const [stockLoading, setStockLoading] = useState(false)
  const [stockPage, setStockPage] = useState(1)
  const [stockPageSize, setStockPageSize] = useState(25)
  const [stockTotal, setStockTotal] = useState(0)
  const [stockTotalPages, setStockTotalPages] = useState(1)
  const [stockCategoryIds, setStockCategoryIds] = useState<string[]>([])
  const [stockCategories, setStockCategories] = useState<any[]>([])
  const [stockUnits, setStockUnits] = useState<any[]>([])
  const [stockUnitIds, setStockUnitIds] = useState<string[]>([])

  // Product edit/delete states
  const [editProductOpen, setEditProductOpen] = useState(false)
  const [deleteProductOpen, setDeleteProductOpen] = useState(false)
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [editFormData, setEditFormData] = useState({ code: '', name: '', price: '', categoryId: '', unitId: '' })
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false)
  const [isDeletingProduct, setIsDeletingProduct] = useState(false)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)

  const [staff, setStaff] = useState<any[]>([])
  const [staffLoading, setStaffLoading] = useState(false)

  const [intakes, setIntakes] = useState<any[]>([])
  const [intakeLoading, setIntakeLoading] = useState(false)
  const [viewIntake, setViewIntake] = useState<any | null>(null)
  const [viewIntakeOpen, setViewIntakeOpen] = useState(false)
  const [viewingIntakeId, setViewingIntakeId] = useState<string | null>(null)

  const [transfers, setTransfers] = useState<any[]>([])
  const [transfersLoading, setTransfersLoading] = useState(false)

  const [requests, setRequests] = useState<any[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)

  const [invoices, setInvoices] = useState<any[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoiceStartDate, setInvoiceStartDate] = useState("")
  const [invoiceEndDate, setInvoiceEndDate] = useState("")

  // GPS Settings state
  const [gpsLatitude, setGpsLatitude] = useState("")
  const [gpsLongitude, setGpsLongitude] = useState("")
  const [gpsRadius, setGpsRadius] = useState("3000")
  const [gpsSaving, setGpsSaving] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  // Reports state
  const [inventoryChecks, setInventoryChecks] = useState<any[]>([])
  const [checkLoading, setCheckLoading] = useState(false)
  const [viewCheck, setViewCheck] = useState<any | null>(null)
  const [viewCheckOpen, setViewCheckOpen] = useState(false)
  const [viewingCheckId, setViewingCheckId] = useState<string | null>(null)

  // Fetch warehouse info on mount
  useEffect(() => {
    if (!warehouseId) return

    const fetchWarehouse = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await mobileFetch(`/api/warehouses/${warehouseId}`)
        const json = await res.json()
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch warehouse')
        setWarehouse(json.data)

        // Set GPS data
        if (json.data.latitude) setGpsLatitude(json.data.latitude.toString())
        if (json.data.longitude) setGpsLongitude(json.data.longitude.toString())
        if (json.data.checkin_radius_meters) setGpsRadius(json.data.checkin_radius_meters.toString())
      } catch (err: any) {
        setError(err?.message || String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchWarehouse()
  }, [warehouseId])

  // Fetch tab data when tab changes
  useEffect(() => {
    if (!warehouseId || !warehouse) return

    const fetchTabData = async () => {
      switch (activeTab) {
        case "stock":
          await loadStockFilters()
          await fetchStock()
          break
        case "staff":
          await fetchStaff()
          break
        case "transfers":
          await fetchTransfers()
          break
        case "requests":
          await fetchRequests()
          break
        case "invoices":
          await fetchInvoices()
          break
        case "reports":
          await fetchInventoryChecks()
          break
      }
    }

    fetchTabData()
  }, [activeTab, warehouseId, warehouse])

  // Data fetch functions - Stock Tab now fetches PRODUCTS with stock info (like /admin/products)
  const fetchStock = async (page = stockPage, pageSize = stockPageSize, search = stockSearch, categoryIds = stockCategoryIds, unitIds = stockUnitIds) => {
    setStockLoading(true)
    try {
      // 1. Fetch products with pagination and filters
      const q = new URLSearchParams()
      q.set('page', String(page))
      q.set('pageSize', String(pageSize))
      if (search) q.set('search', search)
      if (categoryIds.length > 0) q.set('categoryId', categoryIds.join(','))
      if (unitIds.length > 0) q.set('unitId', unitIds.join(','))

      const res = await mobileFetch(`/api/products?${q.toString()}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to fetch products')

      const products = json.data || []
      setStockProducts(products)
      setStockTotal(json.total || 0)
      setStockTotalPages(json.totalPages || 1)
      setStockPage(json.page || page)

      // 2. Fetch stock for this specific warehouse
      const stockRes = await mobileFetch(`/api/warehouse-stock?warehouseId=${warehouseId}&page=1&pageSize=10000`)
      const stockJson = await stockRes.json()
      if (stockRes.ok && stockJson?.success) {
        const stocks: any[] = stockJson.data || []
        const map: Record<string, number> = {}
        for (const s of stocks) {
          const pid = s.product_id || s.productId
          if (pid) {
            map[pid] = Number(s.quantity || 0)
          }
        }
        setStockMap(map)
      }
    } catch (err) {
      console.error("Failed to fetch stock:", err)
      toast.error("Không thể tải tồn kho")
    } finally {
      setStockLoading(false)
    }
  }

  const fetchInventoryChecks = async () => {
    setCheckLoading(true)
    try {
      // Removed pageSize limit to load all inventory checks for this warehouse
      const res = await mobileFetch(`/api/inventory-checks?warehouseId=${warehouseId}`)
      const json = await res.json()
      if (json.success) setInventoryChecks(json.data || [])
    } catch (err) {
      console.error(err)
      toast.error('Lỗi tải báo cáo kiểm kê')
    } finally {
      setCheckLoading(false)
    }
  }

  // Handle product edit
  const handleEditProduct = async () => {
    if (!selectedProduct?.id) return
    setIsUpdatingProduct(true)
    try {
      const res = await mobileFetch(`/api/products/${selectedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editFormData.code,
          name: editFormData.name,
          price: Number(editFormData.price) || 0,
          categoryId: editFormData.categoryId || selectedProduct.category_id,
          unitId: editFormData.unitId || selectedProduct.unit_id,
        })
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Cập nhật sản phẩm thành công')
        setEditProductOpen(false)
        setSelectedProduct(null)
        await fetchStock(stockPage, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds)
      } else {
        toast.error(json.error || 'Lỗi cập nhật sản phẩm')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsUpdatingProduct(false)
    }
  }

  // Handle product create
  const handleCreateProduct = async () => {
    if (!editFormData.code || !editFormData.name) {
      toast.error('Vui lòng nhập mã và tên sản phẩm')
      return
    }
    setIsCreatingProduct(true)
    try {
      const res = await mobileFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editFormData.code,
          name: editFormData.name,
          price: Number(editFormData.price) || 0,
          categoryId: editFormData.categoryId,
          unitId: editFormData.unitId,
        })
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Thêm sản phẩm thành công')
        setCreateProductOpen(false)
        setEditFormData({ code: '', name: '', price: '', categoryId: '', unitId: '' })
        await fetchStock(stockPage, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds)
      } else {
        toast.error(json.error || 'Lỗi thêm sản phẩm')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsCreatingProduct(false)
    }
  }

  // Handle product delete
  const handleDeleteProduct = async () => {
    if (!selectedProduct?.id) return
    setIsDeletingProduct(true)
    try {
      const res = await mobileFetch(`/api/products/${selectedProduct.id}`, {
        method: 'DELETE'
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Xóa sản phẩm thành công')
        setDeleteProductOpen(false)
        setSelectedProduct(null)
        await fetchStock(stockPage, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds)
      } else {
        toast.error(json.error || 'Lỗi xóa sản phẩm')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi kết nối')
    } finally {
      setIsDeletingProduct(false)
    }
  }

  // Load categories and units for stock tab filters
  const loadStockFilters = async () => {
    try {
      const [catsRes, unitsRes] = await Promise.all([
        mobileFetch('/api/categories'),
        mobileFetch('/api/product-units')
      ])

      if (catsRes.ok) {
        const catsJson = await catsRes.json()
        if (catsJson.success) {
          setStockCategories(catsJson.data || [])
        }
      }

      if (unitsRes.ok) {
        const unitsJson = await unitsRes.json()
        if (unitsJson.success) {
          setStockUnits(unitsJson.data || [])
        }
      }
    } catch (err) {
      console.warn('Failed to load stock filters:', err)
    }
  }

  const fetchStaff = async () => {
    setStaffLoading(true)
    try {
      const res = await mobileFetch(`/api/warehouse-users?warehouseId=${warehouseId}&pageSize=100`)
      const json = await res.json()
      if (json.success) setStaff(json.data || [])
    } catch (err) {
      console.error("Failed to fetch staff:", err)
      toast.error("Không thể tải nhân viên")
    } finally {
      setStaffLoading(false)
    }
  }

  const fetchIntakes = async () => {
    setIntakeLoading(true)
    try {
      // For MAIN: fetch from suppliers (inventory-intake)
      // For STORE: fetch internal transfers TO this warehouse
      if (warehouse?.type === "MAIN") {
        const res = await mobileFetch(`/api/inventory-intake?warehouseId=${warehouseId}&pageSize=100`)
        const json = await res.json()
        if (json.success) setIntakes(json.data || [])
      } else {
        const res = await mobileFetch(`/api/warehouse-transfers?toWarehouseId=${warehouseId}&pageSize=100`)
        const json = await res.json()
        if (json.success) setIntakes(json.data || [])
      }
    } catch (err) {
      console.error("Failed to fetch intakes:", err)
      toast.error("Không thể tải phiếu nhập")
    } finally {
      setIntakeLoading(false)
    }
  }

  const fetchTransfers = async () => {
    setTransfersLoading(true)
    try {
      // Internal transfers FROM this warehouse
      const res = await mobileFetch(`/api/warehouse-transfers?fromWarehouseId=${warehouseId}&pageSize=100`)
      const json = await res.json()
      if (json.success) setTransfers(json.data || [])
    } catch (err) {
      console.error("Failed to fetch transfers:", err)
      toast.error("Không thể tải phiếu xuất")
    } finally {
      setTransfersLoading(false)
    }
  }

  const fetchRequests = async () => {
    setRequestsLoading(true)
    try {
      // Stock transfer requests TO this warehouse (from stores)
      const res = await mobileFetch(`/api/stock-transfer-requests?toWarehouseId=${warehouseId}&pageSize=100`)
      const json = await res.json()
      if (json.success) setRequests(json.data || [])
    } catch (err) {
      console.error("Failed to fetch requests:", err)
      toast.error("Không thể tải yêu cầu")
    } finally {
      setRequestsLoading(false)
    }
  }

  const fetchInvoices = async (startDate = invoiceStartDate, endDate = invoiceEndDate) => {
    setInvoicesLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('warehouseId', warehouseId)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await mobileFetch(`/api/sales/invoices?${params.toString()}`)
      const json = await res.json()
      if (json.success) setInvoices(json.data || [])
    } catch (err) {
      console.error("Failed to fetch invoices:", err)
      toast.error("Không thể tải hóa đơn")
    } finally {
      setInvoicesLoading(false)
    }
  }

  // GPS functions
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị")
      return
    }

    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLatitude(position.coords.latitude.toString())
        setGpsLongitude(position.coords.longitude.toString())
        setGettingLocation(false)
        toast.success("Đã lấy vị trí hiện tại")
      },
      (error) => {
        setGettingLocation(false)
        toast.error("Không thể lấy vị trí: " + error.message)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSaveGPS = async () => {
    setGpsSaving(true)
    try {
      const res = await mobileFetch(`/api/warehouses/${warehouseId}/gps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: parseFloat(gpsLatitude) || null,
          longitude: parseFloat(gpsLongitude) || null,
          checkin_radius_meters: parseInt(gpsRadius) || 3000,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success("Lưu cài đặt GPS thành công")
      } else {
        toast.error(json.error || "Lỗi lưu GPS")
      }
    } catch (err) {
      toast.error("Lỗi lưu GPS")
    } finally {
      setGpsSaving(false)
    }
  }

  // Get tabs based on warehouse type
  const tabs = warehouse?.type === "MAIN" ? MAIN_TABS : STORE_TABS

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !warehouse) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Quay lại
        </Button>
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">{error || "Không tìm thấy kho hàng"}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header + Tabs */}
      <div className="sticky top-0 z-50 bg-card border-b shadow-sm">
        {/* Header */}
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Quay lại
            </Button>
            <Badge variant={warehouse.type === "MAIN" ? "default" : "secondary"} className="text-xs">
              {warehouse.type === "MAIN" ? "Kho Tổng" : "Cửa Hàng"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{warehouse.name}</h1>
              <p className="text-muted-foreground text-xs">Mã: {warehouse.code}</p>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-t bg-card/95">
          <div className="container mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="container mx-auto p-4">
        {/* Stock Tab - Shows ALL products with stock info */}
        {activeTab === "stock" && (
          <Card className="p-6">
            <div className="flex flex-col gap-4 mb-4">
              {/* Title and Actions Row */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Sản Phẩm & Tồn Kho ({stockTotal})</h2>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Tìm mã/tên sản phẩm..."
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setStockPage(1)
                          fetchStock(1, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds)
                        }
                      }}
                      className="pl-9 w-48 sm:w-64"
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setStockPage(1); fetchStock(1, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds) }}>Tìm</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setStockSearch(''); setStockCategoryIds([]); setStockUnitIds([]); setStockPage(1); fetchStock(1, stockPageSize, '', [], []) }}>Xóa</Button>
                  <Button size="sm" onClick={() => { setEditFormData({ code: '', name: '', price: '', categoryId: '', unitId: '' }); setCreateProductOpen(true) }}>
                    <Plus className="w-4 h-4 mr-1" /> Thêm SP
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => fetchStock(stockPage, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds)} disabled={stockLoading}>
                    <RefreshCw className={`w-4 h-4 ${stockLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Filters Row - Custom Dropdown with Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Category Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nhóm Hàng</label>
                  <Popover modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {stockCategoryIds.length === 0
                            ? "Chọn nhóm hàng..."
                            : stockCategoryIds.length === stockCategories.length
                              ? "Tất cả"
                              : `${stockCategoryIds.length} đã chọn`}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0 z-40" align="start" sideOffset={4} side="bottom">
                      <div className="p-2 border-b sticky top-0 bg-background z-10">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              const allIds = stockCategories.map((c: any) => c.id)
                              setStockCategoryIds(allIds)
                              setStockPage(1)
                              fetchStock(1, stockPageSize, stockSearch, allIds, stockUnitIds)
                            }}
                          >
                            Chọn tất cả
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              setStockCategoryIds([])
                              setStockPage(1)
                              fetchStock(1, stockPageSize, stockSearch, [], stockUnitIds)
                            }}
                          >
                            Bỏ chọn
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2">
                        {stockCategories.map((cat: any) => (
                          <label
                            key={cat.id}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={stockCategoryIds.includes(cat.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked
                                  ? [...stockCategoryIds, cat.id]
                                  : stockCategoryIds.filter(id => id !== cat.id)
                                setStockCategoryIds(newIds)
                                setStockPage(1)
                                fetchStock(1, stockPageSize, stockSearch, newIds, stockUnitIds)
                              }}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">{cat.name}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Unit Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Đơn Vị</label>
                  <Popover modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {stockUnitIds.length === 0
                            ? "Chọn đơn vị..."
                            : stockUnitIds.length === stockUnits.length
                              ? "Tất cả"
                              : `${stockUnitIds.length} đã chọn`}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0 z-40" align="start" sideOffset={4} side="bottom">
                      <div className="p-2 border-b sticky top-0 bg-background z-10">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              const allIds = stockUnits.map((u: any) => u.id)
                              setStockUnitIds(allIds)
                              setStockPage(1)
                              fetchStock(1, stockPageSize, stockSearch, stockCategoryIds, allIds)
                            }}
                          >
                            Chọn tất cả
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => {
                              setStockUnitIds([])
                              setStockPage(1)
                              fetchStock(1, stockPageSize, stockSearch, stockCategoryIds, [])
                            }}
                          >
                            Bỏ chọn
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2">
                        {stockUnits.map((unit: any) => (
                          <label
                            key={unit.id}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={stockUnitIds.includes(unit.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked
                                  ? [...stockUnitIds, unit.id]
                                  : stockUnitIds.filter(id => id !== unit.id)
                                setStockUnitIds(newIds)
                                setStockPage(1)
                                fetchStock(1, stockPageSize, stockSearch, stockCategoryIds, newIds)
                              }}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">{unit.name}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {stockLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : stockProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có sản phẩm</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">Mã SP</th>
                      <th className="text-left py-3 px-4 font-semibold">Tên Sản Phẩm</th>
                      <th className="text-left py-3 px-4 font-semibold">Danh Mục</th>
                      <th className="text-left py-3 px-4 font-semibold">Đơn Vị</th>
                      <th className="text-right py-3 px-4 font-semibold">Giá</th>
                      <th className="text-right py-3 px-4 font-semibold">Tồn Kho</th>
                      <th className="text-center py-3 px-4 font-semibold">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockProducts.map((item: any, index: number) => (
                      <tr key={item.id || `stock-${index}`} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono">{item.code || "-"}</td>
                        <td className="py-3 px-4">{item.name || "-"}</td>
                        <td className="py-3 px-4">{item.category_name || "-"}</td>
                        <td className="py-3 px-4">{item.unit_name || "-"}</td>
                        <td className="py-3 px-4 text-right">{item.price ? Number(item.price).toLocaleString('vi-VN') : '-'}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {typeof stockMap[item.id] === 'number' ? stockMap[item.id].toLocaleString() : '0'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedProduct(item)
                                setEditFormData({
                                  code: item.code || '',
                                  name: item.name || '',
                                  price: String(item.price || 0),
                                  categoryId: item.category_id || '',
                                  unitId: item.unit_id || ''
                                })
                                setEditProductOpen(true)
                              }}
                              title="Sửa sản phẩm"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setSelectedProduct(item)
                                setDeleteProductOpen(true)
                              }}
                              title="Xóa sản phẩm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">Trang {stockPage}/{stockTotalPages} • {stockTotal} sản phẩm</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { const p = stockPage - 1; setStockPage(p); fetchStock(p, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds) }} disabled={stockPage <= 1 || stockLoading}>Trước</Button>
                <Button size="sm" variant="outline" onClick={() => { const p = stockPage + 1; setStockPage(p); fetchStock(p, stockPageSize, stockSearch, stockCategoryIds, stockUnitIds) }} disabled={stockPage >= stockTotalPages || stockLoading}>Tiếp</Button>
                <select className="ml-2 p-1.5 text-sm border rounded" value={stockPageSize} onChange={(e) => { const ps = Number(e.target.value); setStockPageSize(ps); setStockPage(1); fetchStock(1, ps, stockSearch, stockCategoryIds, stockUnitIds) }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </Card>
        )}

        {/* Staff Tab (STORE only) */}
        {activeTab === "staff" && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Nhân Viên ({staff.length})</h2>
              <Button size="icon" variant="outline" onClick={fetchStaff} disabled={staffLoading}>
                <RefreshCw className={`w - 4 h - 4 ${staffLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {staffLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : staff.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Chưa có nhân viên</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">Tên</th>
                      <th className="text-left py-3 px-4 font-semibold">Email</th>
                      <th className="text-left py-3 px-4 font-semibold">Vai Trò</th>
                      <th className="text-left py-3 px-4 font-semibold">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((user, index) => (
                      <tr key={user.id || `user-${index}`} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{user.full_name}</td>
                        <td className="py-3 px-4 font-mono text-sm">{user.email}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={user.is_active ? "default" : "secondary"}>
                            {user.is_active ? "Hoạt động" : "Vô hiệu"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Shifts Tab (STORE only) */}
        {activeTab === "shifts" && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Quản Lý Ca Làm</h2>
            <p className="text-muted-foreground">
              Tính năng quản lý ca làm sẽ được mở trong trang riêng.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push(`/ admin / shifts / calendar ? warehouseId = ${warehouseId}`)}
            >
              <Clock className="w-4 h-4 mr-2" />
              Mở Quản Lý Ca Làm
            </Button>
          </Card>
        )}

        {/* Sales Tab (STORE only) */}
        {activeTab === "sales" && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Bán Hàng</h2>
            <p className="text-muted-foreground">
              Trang bán hàng cần được mở riêng với giao diện POS đầy đủ.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.open(`/ store / sales ? warehouseId = ${warehouseId}`, '_blank')}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Mở Trang Bán Hàng
            </Button>
          </Card>
        )}

        {/* Invoices Tab (STORE only) */}
        {activeTab === "invoices" && warehouse?.type === "STORE" && (
          <Card className="p-6">
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Hóa Đơn ({invoices.length})</h2>
                <Button size="icon" variant="outline" onClick={() => fetchInvoices(invoiceStartDate, invoiceEndDate)} disabled={invoicesLoading}>
                  <RefreshCw className={`w-4 h-4 ${invoicesLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {/* Date Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="invoice-start-date" className="text-sm mb-1 block">Từ ngày</Label>
                  <Input
                    id="invoice-start-date"
                    type="date"
                    value={invoiceStartDate}
                    onChange={(e) => setInvoiceStartDate(e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="invoice-end-date" className="text-sm mb-1 block">Đến ngày</Label>
                  <Input
                    id="invoice-end-date"
                    type="date"
                    value={invoiceEndDate}
                    onChange={(e) => setInvoiceEndDate(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => fetchInvoices(invoiceStartDate, invoiceEndDate)}
                  disabled={invoicesLoading}
                >
                  Lọc
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setInvoiceStartDate("")
                    setInvoiceEndDate("")
                    fetchInvoices("", "")
                  }}
                  disabled={invoicesLoading}
                >
                  Xóa lọc
                </Button>
              </div>
            </div>

            {invoicesLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : invoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Chưa có hóa đơn</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">Mã HĐ</th>
                      <th className="text-left py-3 px-4 font-semibold">Ngày giờ</th>
                      <th className="text-left py-3 px-4 font-semibold">Khách Hàng</th>
                      <th className="text-right py-3 px-4 font-semibold">Tổng Tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice: any, index: number) => (
                      <tr key={invoice.id || `invoice-${index}`} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono">{invoice.order_number || invoice.id?.slice(0, 8)}</td>
                        <td className="py-3 px-4">{invoice.created_at ? formatVietnamDate(invoice.created_at) : "-"}</td>
                        <td className="py-3 px-4">{invoice.customer_name || "Khách lẻ"}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {Number(invoice.total_amount || 0).toLocaleString()}đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Intake Tab */}
        {activeTab === "intake" && (
          <>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {warehouse.type === "MAIN" ? "Nhập Hàng Từ NCC" : "Nhập Hàng Nội Bộ"} ({intakes.length})
                </h2>
                <Button size="icon" variant="outline" onClick={fetchIntakes} disabled={intakeLoading}>
                  <RefreshCw className={`w - 4 h - 4 ${intakeLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {intakeLoading ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : intakes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Chưa có phiếu nhập hàng</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold">Số Phiếu</th>
                        <th className="text-left py-3 px-4 font-semibold">Ngày</th>
                        <th className="text-left py-3 px-4 font-semibold">Chi Tiết</th>
                        <th className="text-left py-3 px-4 font-semibold">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intakes.map((intake: any, index: number) => (
                        <tr key={intake.intakeId || intake.id || `intake-${index}`} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-mono">
                            {intake.intakeNumber || intake.intake_number || (intake.intakeId || intake.id)?.slice(0, 8)}
                          </td>
                          <td className="py-3 px-4">
                            {(intake.createdAt || intake.created_at) ? formatVietnamDateOnly(intake.createdAt || intake.created_at) : "-"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{intake.items?.length || intake.totalQuantity || 0} sản phẩm</Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={viewingIntakeId === (intake.intakeId || intake.id)}
                              onClick={async () => {
                                const intakeId = intake.intakeId || intake.id
                                setViewingIntakeId(intakeId)
                                try {
                                  const res = await mobileFetch(`/api/inventory-intake/${intakeId}`)
                                  const json = await res.json()
                                  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
                                  setViewIntake(json.data)
                                  setViewIntakeOpen(true)
                                } catch (err) {
                                  toast.error('Không thể tải chi tiết phiếu', {
                                    description: (err as any)?.message || String(err)
                                  })
                                } finally {
                                  setViewingIntakeId(null)
                                }
                              }}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              {viewingIntakeId === (intake.intakeId || intake.id) ? 'Đang tải...' : 'Xem Chi Tiết'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Intake Detail Dialog */}
            <Dialog open={viewIntakeOpen} onOpenChange={(o) => { if (!o) setViewIntake(null); setViewIntakeOpen(o) }}>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Chi tiết phiếu nhập</DialogTitle>
                  <DialogDescription>Thông tin chi tiết sản phẩm và số lượng</DialogDescription>
                </DialogHeader>
                <div className="mt-4 overflow-y-auto flex-1">
                  {viewIntake ? (
                    <div className="space-y-4">
                      {/* Header Info */}
                      <div className="flex justify-between items-center border-b pb-3">
                        <div>
                          <p className="text-sm text-muted-foreground">ID Phiếu</p>
                          <p className="font-semibold font-mono text-sm">{viewIntake?.intakeNumber || viewIntake?.intakeId?.substring(0, 8) || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Ngày tạo</p>
                          <p className="font-medium">{formatVietnamDate(viewIntake?.createdAt)}</p>
                        </div>
                      </div>

                      {/* Products List */}
                      <div>
                        <Label className="text-base font-semibold mb-3">Danh sách sản phẩm</Label>
                        <div className="space-y-3 mt-3 max-h-[50vh] overflow-y-auto pr-2">
                          {viewIntake.items?.map((item: any, i: number) => (
                            <div
                              key={item.id || i}
                              className="p-4 border border-border rounded-lg bg-muted/30"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-foreground">
                                    {item.productName || item.productId}
                                  </p>
                                  {item.productCode && (
                                    <p className="text-sm text-muted-foreground">
                                      Mã: {item.productCode}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Số lượng:</span>
                                    <Badge variant="outline" className="font-semibold">
                                      {item.quantity}
                                    </Badge>
                                  </div>
                                  {item.currentStock !== undefined && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">Tồn kho:</span>
                                      <Badge className="bg-green-100 text-green-800 font-semibold">
                                        {item.currentStock}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-muted-foreground">Đang tải...</p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setViewIntakeOpen(false)}>Đóng</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Transfers Tab (MAIN only) */}
        {activeTab === "transfers" && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Xuất Hàng Nội Bộ ({transfers.length})</h2>
              <Button size="icon" variant="outline" onClick={fetchTransfers} disabled={transfersLoading}>
                <RefreshCw className={`w - 4 h - 4 ${transfersLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {transfersLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : transfers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Chưa có phiếu xuất hàng</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">Số Phiếu</th>
                      <th className="text-left py-3 px-4 font-semibold">Kho Nhận</th>
                      <th className="text-left py-3 px-4 font-semibold">Ngày</th>
                      <th className="text-left py-3 px-4 font-semibold">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((transfer: any, index: number) => (
                      <tr key={transfer.id || `transfer-${index}`} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono">
                          {transfer.transfer_number || transfer.id?.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4">{transfer.to_warehouse_name || transfer.to_warehouse_id?.slice(0, 8)}</td>
                        <td className="py-3 px-4">
                          {transfer.created_at ? formatVietnamDateOnly(transfer.created_at) : "-"}
                        </td>
                        <td className="py-3 px-4">
                          <Badge>{transfer.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}





        {/* Reports Tab */}
        {activeTab === "reports" && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Báo Cáo Kiểm Kê ({inventoryChecks.length})</h2>
              <Button size="icon" variant="outline" onClick={fetchInventoryChecks} disabled={checkLoading}>
                <RefreshCw className={`w-4 h-4 ${checkLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {checkLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : inventoryChecks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Chưa có phiếu kiểm kê</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">Số Phiếu</th>
                      <th className="text-left py-3 px-4 font-semibold">Người Tạo</th>
                      <th className="text-left py-3 px-4 font-semibold">Ngày</th>
                      <th className="text-left py-3 px-4 font-semibold">Trạng Thái</th>
                      <th className="text-left py-3 px-4 font-semibold">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryChecks.map((check: any, index: number) => (
                      <tr key={check.id || index} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono">{check.number}</td>
                        <td className="py-3 px-4">{check.createdByName || check.createdBy}</td>
                        <td className="py-3 px-4">{check.createdAt ? formatVietnamDate(check.createdAt) : "-"}</td>
                        <td className="py-3 px-4">
                          <Badge variant={check.status === "COMPLETED" ? "default" : check.status === "IN_PROGRESS" ? "secondary" : "outline"}>
                            {check.status === "COMPLETED" ? "Hoàn thành" : check.status === "IN_PROGRESS" ? "Đang kiểm" : "Chờ duyệt"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setViewCheck(check)
                              setViewCheckOpen(true)
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Xem
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Products Tab (MAIN only) */}
        {activeTab === "products" && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Sản Phẩm & Công Cụ</h2>
            <p className="text-muted-foreground">
              Quản lý sản phẩm trên toàn hệ thống.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push('/admin/products')}
            >
              <Package className="w-4 h-4 mr-2" />
              Quản Lý Sản Phẩm
            </Button>
          </Card>
        )}

        {/* Target Tab (STORE only) */}
        {activeTab === "target" && (
          <SalesTargetsTab warehouseId={warehouseId} warehouseName={warehouse?.name || ""} />
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* GPS Settings */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Navigation className="w-5 h-5" />
                Cài Đặt GPS
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Vĩ độ (Latitude)</Label>
                  <Input
                    value={gpsLatitude}
                    onChange={(e) => setGpsLatitude(e.target.value)}
                    placeholder="10.762622"
                  />
                </div>
                <div>
                  <Label>Kinh độ (Longitude)</Label>
                  <Input
                    value={gpsLongitude}
                    onChange={(e) => setGpsLongitude(e.target.value)}
                    placeholder="106.660172"
                  />
                </div>
                <div>
                  <Label>Bán kính (m)</Label>
                  <Input
                    value={gpsRadius}
                    onChange={(e) => setGpsRadius(e.target.value)}
                    placeholder="3000"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={handleGetCurrentLocation} disabled={gettingLocation}>
                  {gettingLocation ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  Lấy Vị Trí Hiện Tại
                </Button>
                <Button onClick={handleSaveGPS} disabled={gpsSaving}>
                  {gpsSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Lưu GPS
                </Button>
              </div>
            </Card>

            {/* Printer Settings */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Printer className="w-5 h-5" />
                Cài Đặt Máy In
              </h2>
              <p className="text-muted-foreground">
                Cài đặt máy in cho kho hàng này.
              </p>
              <Button
                className="mt-4"
                onClick={() => router.push(`/ admin / settings / printers ? warehouseId = ${warehouseId}`)}
              >
                <Printer className="w-4 h-4 mr-2" />
                Quản Lý Máy In
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* Edit Product Dialog */}
      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa Sản Phẩm</DialogTitle>
            <DialogDescription>Cập nhật thông tin sản phẩm</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-code">Mã Sản Phẩm</Label>
              <Input id="edit-code" value={editFormData.code} onChange={(e) => setEditFormData({ ...editFormData, code: e.target.value })} placeholder="Nhập mã sản phẩm" />
            </div>
            <div>
              <Label htmlFor="edit-name">Tên Sản Phẩm</Label>
              <Input id="edit-name" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} placeholder="Nhập tên sản phẩm" />
            </div>
            <div>
              <Label htmlFor="edit-price">Giá</Label>
              <Input id="edit-price" type="number" value={editFormData.price} onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })} placeholder="Nhập giá" />
            </div>
            <div>
              <Label>Nhóm Hàng</Label>
              <select value={editFormData.categoryId} onChange={(e) => setEditFormData({ ...editFormData, categoryId: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                <option value="">Chọn nhóm hàng</option>
                {stockCategories.map((cat: any) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
              </select>
            </div>
            <div>
              <Label>Đơn Vị</Label>
              <select value={editFormData.unitId} onChange={(e) => setEditFormData({ ...editFormData, unitId: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                <option value="">Chọn đơn vị</option>
                {stockUnits.map((unit: any) => (<option key={unit.id} value={unit.id}>{unit.name}</option>))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditProductOpen(false)} disabled={isUpdatingProduct}>Hủy</Button>
            <Button onClick={handleEditProduct} disabled={isUpdatingProduct}>
              {isUpdatingProduct ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang lưu...</> : 'Lưu'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Product Dialog */}
      <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm Sản Phẩm Mới</DialogTitle>
            <DialogDescription>Nhập thông tin sản phẩm mới</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="create-code">Mã Sản Phẩm *</Label>
              <Input id="create-code" value={editFormData.code} onChange={(e) => setEditFormData({ ...editFormData, code: e.target.value })} placeholder="Nhập mã sản phẩm" />
            </div>
            <div>
              <Label htmlFor="create-name">Tên Sản Phẩm *</Label>
              <Input id="create-name" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} placeholder="Nhập tên sản phẩm" />
            </div>
            <div>
              <Label htmlFor="create-price">Giá</Label>
              <Input id="create-price" type="number" value={editFormData.price} onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })} placeholder="Nhập giá" />
            </div>
            <div>
              <Label>Nhóm Hàng</Label>
              <select value={editFormData.categoryId} onChange={(e) => setEditFormData({ ...editFormData, categoryId: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                <option value="">Chọn nhóm hàng</option>
                {stockCategories.map((cat: any) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
              </select>
            </div>
            <div>
              <Label>Đơn Vị</Label>
              <select value={editFormData.unitId} onChange={(e) => setEditFormData({ ...editFormData, unitId: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                <option value="">Chọn đơn vị</option>
                {stockUnits.map((unit: any) => (<option key={unit.id} value={unit.id}>{unit.name}</option>))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateProductOpen(false)} disabled={isCreatingProduct}>Hủy</Button>
            <Button onClick={handleCreateProduct} disabled={isCreatingProduct}>
              {isCreatingProduct ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang thêm...</> : 'Thêm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Product Dialog */}
      <Dialog open={deleteProductOpen} onOpenChange={setDeleteProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác Nhận Xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa sản phẩm <strong>{selectedProduct?.name}</strong> ({selectedProduct?.code})?
              Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteProductOpen(false)} disabled={isDeletingProduct}>Hủy</Button>
            <Button variant="destructive" onClick={handleDeleteProduct} disabled={isDeletingProduct}>
              {isDeletingProduct ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang xóa...</> : 'Xóa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Check Dialog */}
      <Dialog open={viewCheckOpen} onOpenChange={setViewCheckOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-7xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Chi Tiết Kiểm Kê: {viewCheck?.number}</DialogTitle>
            <DialogDescription>{viewCheck?.period} - {viewCheck?.createdByName}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4 px-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">Sản Phẩm</th>
                  {/* Column Visibility Logic: Hide sensitive columns for STORE warehouses */}
                  <th className="text-center p-2 font-medium">Tồn Đầu</th>
                  <th className="text-center p-2 font-medium">Nhập</th>
                  <th className="text-center p-2 font-medium">Xuất</th>
                  <th className="text-center p-2 font-medium">Tồn Hệ Thống</th>
                  <th className="text-center p-2 font-medium">Thực Tế</th>

                  <th className="text-center p-2 font-medium">Chênh Lệch</th>
                  <th className="text-center p-2 font-medium">Ghi Chú</th>
                </tr>
              </thead>
              <tbody>
                {viewCheck?.items?.map((item: any) => (
                  <tr key={item.id} className="border-b hover:bg-muted/10">
                    <td className="p-2">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.productCode}</p>
                    </td>

                    <td className="p-2 text-center">{item.openingBalance}</td>
                    <td className="p-2 text-center text-green-600">+{item.imports}</td>
                    <td className="p-2 text-center text-red-600">-{Math.abs(item.exports || 0)}</td>
                    <td className="p-2 text-center font-medium bg-muted/20">{item.systemBalance}</td>

                    <td className="p-2 text-center font-bold text-lg">{item.actualBalance} <span className="text-xs font-normal text-muted-foreground">{item.productUnit}</span></td>

                    <td className={`p-2 text-center font-medium ${item.difference < 0 ? 'text-red-500' : item.difference > 0 ? 'text-green-500' : ''}`}>
                      {item.difference > 0 ? '+' : ''}{item.difference}
                      {item.differencePercentage !== undefined && (
                        <span className="text-xs ml-1 opacity-80">
                          ({item.differencePercentage > 0 ? "+" : ""}{item.differencePercentage}%)
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {item.difference > 0 && <span className="text-green-600">NHẬP ĐIỀU CHỈNH</span>}
                      {item.difference < 0 && <span className="text-red-600">XUẤT ĐIỀU CHỈNH</span>}
                      {item.difference === 0 && <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewCheck?.items?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">Không có dữ liệu sản phẩm</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div >
  )
}
