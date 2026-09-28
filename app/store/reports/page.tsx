"use client"

import { mobileFetch } from "@/lib/mobile/api-client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Search, Eye, Plus, Trash2, FileText, TrendingUp, ClipboardCheck,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarIcon, X
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { isAdmin, isWarehouseManager, isGeneralManager } from "@/lib/auth-helpers"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"

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
  createdByName?: string | null
  createdAt: string
  canDelete?: boolean
  deleteBlockedReason?: string
  items: InventoryCheckProduct[]
}

export default function ReportsPage() {
  const { user } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse()
  const router = useRouter()
  // For GENERAL_MANAGER, use selected warehouse; for others use their assigned warehouse
  const currentWarehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : user?.warehouseId
  const [activeTab, setActiveTab] = useState("inventory-check")
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState("")
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [unitsMap, setUnitsMap] = useState<Record<string, any[]>>({})
  // Product cache for smart search (fetched once per dialog open)
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  // Pagination & Filters
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0, page: 1, pageSize: 20 })
  const [listSearch, setListSearch] = useState("")
  const [listSearchDebounced, setListSearchDebounced] = useState("")
  const [listStatus, setListStatus] = useState<string>("all")
  const [listFromDate, setListFromDate] = useState<Date | undefined>(undefined)
  const [listToDate, setListToDate] = useState<Date | undefined>(undefined)

  // Check permissions for viewing different columns
  // - Opening Balance (Tồn Đầu) + System Balance (Tồn Hệ Thống): Only Admin can see
  // - Imports/Exports (Nhập/Xuất): Admin and Warehouse Manager can see, Staff cannot
  // - Actual Balance (Tồn Thực Tế): Everyone can see (no restriction)
  const isManager = isWarehouseManager(user)
  const isAdminUser = isAdmin(user)
  const isGeneralManagerUser = isGeneralManager(user)

  const canViewOpeningAndSystemBalance = isAdminUser || isGeneralManagerUser || isManager // Admin, GM, and Manager can see Tồn Đầu and Tồn Hệ Thống
  const canViewImportsExports = isAdminUser || isManager || isGeneralManagerUser  // All managers can see Nhập/Xuất

  // Helper to format quantity based on selected unit
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

  // Debounce search cho bảng danh sách
  useEffect(() => {
    const timer = setTimeout(() => {
      setListSearchDebounced(listSearch)
    }, 400)
    return () => clearTimeout(timer)
  }, [listSearch])

  // Fetch trọng tâm: dùng pagination server-side
  const fetchInventoryChecks = async (page: number = 1) => {
    if (!currentWarehouseId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('warehouseId', currentWarehouseId)
      params.set('page', String(page))
      params.set('pageSize', '20')
      if (listSearchDebounced) params.set('search', listSearchDebounced)
      if (listStatus !== 'all') params.set('status', listStatus)
      if (listFromDate) params.set('fromDate', listFromDate.toISOString())
      if (listToDate) {
        const endDate = new Date(listToDate)
        endDate.setHours(23, 59, 59, 999)
        params.set('toDate', endDate.toISOString())
      }

      const response = await mobileFetch(`/api/inventory-checks?${params.toString()}`)
      const result = await response.json()
      if (result.success) {
        setInventoryChecks(result.data || [])
        if (result.pagination) {
          setPagination(result.pagination)
        }
      } else {
        setInventoryChecks([])
      }
    } catch (error) {
      console.error("Error fetching inventory checks:", error)
      setInventoryChecks([])
    } finally {
      setLoading(false)
    }
  }

  // Load khi tab, warehouse, hoặc filter thay đổi
  useEffect(() => {
    if (activeTab === "inventory-check" && currentWarehouseId) {
      fetchInventoryChecks(1)
    }
  }, [activeTab, currentWarehouseId, listSearchDebounced, listStatus, listFromDate, listToDate])

  // Listen for warehouse changes
  useEffect(() => {
    const handleWarehouseChange = () => {
      if (activeTab === "inventory-check") {
        fetchInventoryChecks(1)
      }
    }
    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    return () => window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
  }, [activeTab, currentWarehouseId])

  // Fetch units for products when a check is selected
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
      setInventoryChecks(prevChecks => {
        return prevChecks.map((c) => {
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
      })
    }

    // If no missing products, just update with existing cache and return
    if (missingProductIds.length === 0) {
      updateCheckWithUnits(unitsMap)
      return
    }

    const fetchUnits = async () => {
      try {
        const batchSize = 200
        const batches: string[][] = []
        for (let i = 0; i < missingProductIds.length; i += batchSize) {
          batches.push(missingProductIds.slice(i, i + batchSize))
        }

        const additionalUnitsMap: Record<string, any[]> = {}

        for (const batch of batches) {
          const response = await mobileFetch('/api/products/batch-units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds: batch })
          })
          const result = await response.json()
          if (result.success && result.data) {
            for (const productId of batch) {
              if (result.data[productId]) {
                additionalUnitsMap[productId] = result.data[productId].units || []
              }
            }
          }
        }

        const combinedMap = { ...unitsMap, ...additionalUnitsMap }
        setUnitsMap(combinedMap)
        updateCheckWithUnits(combinedMap)
      } catch (error) {
        console.error('Error fetching units:', error)
      }
    }
    fetchUnits()
  }, [selectedCheckId]) // REMOVED inventoryChecks from dependency

  // Fetch all products once when dialog opens (for smart search)
  useEffect(() => {
    if (!selectedCheckId || !currentWarehouseId) {
      setAllProducts([])
      return
    }

    const fetchAllProducts = async () => {
      setProductsLoading(true)
      try {
        const response = await mobileFetch(`/api/products?warehouseId=${currentWarehouseId}&limit=1000`)
        const result = await response.json()
        if (result.success && result.data) {
          setAllProducts(result.data)
        }
      } catch (error) {
        console.error('Error fetching products for search:', error)
      } finally {
        setProductsLoading(false)
      }
    }

    fetchAllProducts()
  }, [selectedCheckId, currentWarehouseId])

  // Helper to get conversion multiplier for a product's selected unit
  const getConversionMultiplier = (productId: string | undefined, selectedUnitId: string | undefined): number => {
    if (!productId || !selectedUnitId) return 1
    const units = unitsMap[productId] || []
    const unit = units.find(u => u.id === selectedUnitId)
    return unit?.multiplier || 1
  }

  // Compute search suggestion (memoized for performance)
  const searchSuggestion = useMemo(() => {
    const currentCheck = inventoryChecks.find((c) => c.id === selectedCheckId)
    if (!currentCheck || !searchFilter.trim()) return null

    // Filter inventory items based on search
    const filteredItems = currentCheck.items.filter(
      (item) =>
        item.productCode.toLowerCase().includes(searchFilter.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchFilter.toLowerCase())
    )

    // If found in inventory, no suggestion needed
    if (filteredItems.length > 0) return null

    // Check if product exists but not in inventory
    const productNotInInventory = allProducts.find(p =>
      p.product_code?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.product_name?.toLowerCase().includes(searchFilter.toLowerCase())
    )

    return productNotInInventory
  }, [inventoryChecks, selectedCheckId, searchFilter, allProducts])

  const handleCreateCheck = async () => {
    if (!currentWarehouseId) {
      toast.error("Không tìm thấy kho của bạn")
      return
    }

    try {
      setCreating(true)

      // Create inventory check for store warehouse
      const createResponse = await mobileFetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: currentWarehouseId }),
      })
      const result = await createResponse.json()

      // Check for HTTP error status (including 409 Conflict)
      if (!createResponse.ok) {
        toast.error(result.error || "Không thể tạo báo cáo kiểm kê")
        return
      }

      if (result.success && result.data) {
        // Wait a bit for server to finish creating items
        await new Promise(resolve => setTimeout(resolve, 500))

        // Reload inventory checks from database
        await fetchInventoryChecks(1)

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
        await fetchInventoryChecks(pagination.page)
        toast.success("Xóa báo cáo thành công")
      } else {
        console.error("Error deleting inventory check:", result.error)
        toast.error(result.error || "Lỗi xóa báo cáo")
      }

      setDeleteConfirmId(null)
    } catch (error) {
      console.error("Error deleting inventory check:", error)
      toast.error("Lỗi xóa báo cáo")
    } finally {
      setDeleting(false)
    }
  }

  // Define tabs - filter based on role
  // Only managers (isManager or isAdminUser) can see sales tab
  const allTabs = [
    { id: "inventory-check", label: "Kiểm Kê", icon: ClipboardCheck },
    { id: "sales", label: "Doanh Số", icon: TrendingUp, managerOnly: true },
  ]

  const tabs = allTabs.filter(tab => !tab.managerOnly || isManager || isAdminUser)

  const handleTabChange = (tabId: string) => {
    if (tabId === "sales") {
      router.push("/store/reports/sales")
    } else {
      setActiveTab(tabId)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={FileText}
        title="Báo Cáo"
        subtitle="Xem và quản lý báo cáo"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Báo Cáo</h1>
          <p className="text-muted-foreground mt-2">Xem và quản lý báo cáo</p>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-2 border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === tab.id
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

        <Card className="p-6">
          <div className="overflow-x-auto">
            {/* Kiểm Kê Tab */}
            {activeTab === "inventory-check" && (
              <div>
                {/* Bộ lọc */}
                <div className="space-y-4 mb-6">
                  <div className="flex flex-wrap gap-3 items-end">
                    {/* Tìm kiếm */}
                    <div className="space-y-1.5 flex-1 min-w-[200px] max-w-sm">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Search className="w-4 h-4" />
                        Tìm kiếm
                      </Label>
                      <Input
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                        placeholder="Nhập số phiếu kiểm kê..."
                        className="h-9"
                      />
                    </div>

                    {/* Lọc trạng thái */}
                    <div className="space-y-1.5 min-w-[150px]">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        Trạng thái
                      </Label>
                      <Select value={listStatus} onValueChange={(v) => setListStatus(v)}>
                        <SelectTrigger className="w-full md:w-44 h-9">
                          <SelectValue placeholder="Tất cả" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                          <SelectItem value="IN_PROGRESS">Đang thực hiện</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Từ ngày */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <CalendarIcon className="w-4 h-4" />
                        Từ ngày
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-9 w-40 justify-start text-left font-normal"
                          >
                            {listFromDate ? listFromDate.toLocaleDateString('vi-VN') : <span className="text-muted-foreground">Chọn ngày</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={listFromDate} onSelect={setListFromDate} />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Đến ngày */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        Đến ngày
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-9 w-40 justify-start text-left font-normal"
                          >
                            {listToDate ? listToDate.toLocaleDateString('vi-VN') : <span className="text-muted-foreground">Chọn ngày</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={listToDate} onSelect={setListToDate} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(listFromDate || listToDate || listSearch || listStatus !== 'all') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setListSearch('')
                            setListStatus('all')
                            setListFromDate(undefined)
                            setListToDate(undefined)
                          }}
                          className="gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                          Xóa bộ lọc
                        </Button>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {pagination.total > 0
                          ? `Tìm thấy ${pagination.total} phiếu kiểm kê`
                          : loading ? "" : "Không tìm thấy kết quả"}
                      </span>
                    </div>

                    {activeTab === "inventory-check" && (
                      <Button className="gap-2" onClick={handleCreateCheck} disabled={creating}>
                        <Plus className="w-4 h-4" />
                        {creating ? "Đang tạo..." : "Tạo Kiểm Kê"}
                      </Button>
                    )}
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Đang tải dữ liệu...
                  </div>
                ) : inventoryChecks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chưa có phiếu kiểm kê nào
                  </div>
                ) : (
                  <>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Số Kiểm Kê</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Người Tạo</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày Tạo</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryChecks.map((check) => (
                          <tr key={check.id} className="border-b border-border hover:bg-muted/50">
                            <td className="py-3 px-4 font-medium text-foreground">{check.number}</td>
                            <td className="py-3 px-4 text-foreground text-sm">{check.createdBy || '-'}</td>
                            <td className="py-3 px-4 text-foreground text-sm">{check.createdAt ? new Date(check.createdAt).toLocaleString('vi-VN') : '-'}</td>
                            <td className="py-3 px-4">
                              <Badge className={
                                check.status === "COMPLETED" ? "bg-green-100 text-green-800" :
                                  "bg-blue-100 text-blue-800"
                              }>
                                {check.status === "COMPLETED" ? "Hoàn Thành" :
                                  "Đang Tiến Hành"}
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
                              {check.canDelete !== false && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteConfirmId(check.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Xóa phiếu kiểm kê"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Phân trang */}
                    {pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t mt-4">
                        <div className="text-sm text-muted-foreground">
                          Trang {pagination.page} / {pagination.totalPages}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => fetchInventoryChecks(1)}
                            disabled={pagination.page <= 1}
                          >
                            <ChevronsLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => fetchInventoryChecks(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="px-3 text-sm font-medium">{pagination.page}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => fetchInventoryChecks(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => fetchInventoryChecks(pagination.totalPages)}
                            disabled={pagination.page >= pagination.totalPages}
                          >
                            <ChevronsRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
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
              </DialogHeader>

              {inventoryChecks.find((c) => c.id === selectedCheckId) && (
                <>
                  {/* Search/Filter - Sticky */}
                  <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
                    <div className="flex gap-2">
                      <Search className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-2.5" />
                      <Input
                        placeholder="Tìm kiếm sản phẩm..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="space-y-4 px-6 py-4">

                      {/* Smart Search Suggestion */}
                      {searchSuggestion && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                          <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="flex-1">
                              <h4 className="font-medium text-yellow-800 dark:text-yellow-200 text-sm">
                                Sản phẩm "{searchSuggestion.product_name}" chưa có trong tồn kho
                              </h4>
                              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                                Mã: {searchSuggestion.product_code} - Sản phẩm này tồn tại nhưng chưa được nhập hàng.
                              </p>
                              <Button
                                size="sm"
                                onClick={() => router.push('/store/internal-transfers')}
                                className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white"
                              >
                                ➕ Nhập Hàng Cho Sản Phẩm Này
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Empty State - No Items in Inventory Check */}
                      {inventoryChecks.find((c) => c.id === selectedCheckId)?.items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                          <div className="w-full max-w-md text-center space-y-4">
                            <div className="flex justify-center">
                              <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4">
                                <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h3 className="text-lg font-semibold text-foreground">
                                📦 Chưa Có Hàng Để Kiểm Kê
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Kho hiện tại chưa có sản phẩm nào trong tồn kho.<br />
                                Vui lòng nhập hàng nội bộ trước khi kiểm kê.
                              </p>
                            </div>
                            <div className="pt-2">
                              <Button
                                onClick={() => router.push('/store/internal-transfers')}
                                className="gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Đi Nhập Hàng Nội Bộ
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground pt-2">
                              💡 <strong>Mẹo:</strong> Sau khi nhập hàng, quay lại để tiến hành kiểm kê.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>

                          {/* Products Table - Desktop */}
                          <div className="hidden md:block overflow-x-auto border border-border rounded-lg">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-muted border-b border-border">
                                  <th className="text-left py-3 px-4 font-semibold text-foreground">Mã SP</th>
                                  <th className="text-left py-3 px-4 font-semibold text-foreground">Sản Phẩm</th>
                                  <th className="text-left py-3 px-4 font-semibold text-foreground">Đơn Vị</th>
                                  {canViewOpeningAndSystemBalance && (
                                    <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Đầu</th>
                                  )}
                                  {canViewImportsExports && (
                                    <th className="text-center py-3 px-4 font-semibold text-foreground">Nhập</th>
                                  )}
                                  {canViewImportsExports && (
                                    <th className="text-center py-3 px-4 font-semibold text-foreground">Xuất</th>
                                  )}
                                  {canViewOpeningAndSystemBalance && (
                                    <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Hệ Thống</th>
                                  )}
                                  <th className="text-center py-3 px-4 font-semibold text-foreground">Tồn Thực Tế</th>
                                  {canViewOpeningAndSystemBalance && inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "COMPLETED" && (
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

                                    // Determine the effective Unit ID (Selected > Saved Input > Default Product Unit)
                                    const currentUnitId = item.selectedUnitId || item.inputUnitId || item.productUnitId

                                    // Find the unit in cache to get multiplier
                                    const unit = item.productId && unitsMap[item.productId]
                                      ? unitsMap[item.productId]?.find((u: any) => u.id === currentUnitId)
                                      : null

                                    // Calculate multiplier (default to 1 if not found)
                                    // Note: If unit exists but multiplier is missing/0, fallback to 1? Usually multiplier > 0.
                                    const multiplier = unit?.multiplier && unit.multiplier > 0 ? unit.multiplier : 1

                                    return (
                                      <tr key={item.id} className="border-b border-border hover:bg-muted/50">
                                        <td className="py-3 px-4 text-sm font-medium text-muted-foreground">{item.productCode}</td>
                                        <td className="py-3 px-4 font-medium text-foreground">{item.productName}</td>
                                        <td className="py-3 px-4 text-sm text-foreground">
                                          {isEditing && item.productId && (unitsMap[item.productId]?.length ?? 0) > 1 ? (
                                            <select
                                              value={currentUnitId || ''}
                                              onChange={(e) => {
                                                const newUnitId = e.target.value
                                                const newMultiplier = getConversionMultiplier(item.productId, newUnitId)
                                                const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                                const itemIdx = newItems.findIndex(i => i.id === item.id)
                                                if (itemIdx >= 0) {
                                                  const currentActualBalance = newItems[itemIdx].actualBalance || 0
                                                  // Recalculate inputValue based on existing actualBalance (Base Unit)
                                                  const calculatedInputValue = currentActualBalance / newMultiplier

                                                  // Format for display (no grouping, max 6 decimals)
                                                  const formattedInputValue = new Intl.NumberFormat('vi-VN', {
                                                    maximumFractionDigits: 6,
                                                    minimumFractionDigits: 0,
                                                    useGrouping: false
                                                  }).format(calculatedInputValue).replace('.', ',')

                                                  newItems[itemIdx] = {
                                                    ...newItems[itemIdx],
                                                    selectedUnitId: newUnitId,
                                                    conversionMultiplier: newMultiplier,
                                                    inputValue: formattedInputValue
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
                                            // View mode: Show saved inputUnitCode or lookup by inputUnitId
                                            item.inputUnitCode
                                              ? item.inputUnitCode
                                              : (item.inputUnitId && item.productId && unitsMap[item.productId]?.find((u: any) => u.id === item.inputUnitId)?.code)
                                                ? unitsMap[item.productId]?.find((u: any) => u.id === item.inputUnitId)?.code
                                                : (item.productUnit ?? '-')
                                          )}
                                        </td>
                                        {canViewOpeningAndSystemBalance && (
                                          <td className="py-3 px-4 text-center text-foreground">
                                            {formatDisplayQuantity(item.openingBalance, multiplier)}
                                          </td>
                                        )}
                                        {canViewImportsExports && (
                                          <td className="py-3 px-4 text-center text-green-600 font-medium">
                                            +{formatDisplayQuantity(item.imports, multiplier)}
                                          </td>
                                        )}
                                        {canViewImportsExports && (
                                          <td className="py-3 px-4 text-center text-red-600 font-medium">
                                            -{formatDisplayQuantity(item.exports, multiplier)}
                                          </td>
                                        )}
                                        {canViewOpeningAndSystemBalance && (
                                          <td className="py-3 px-4 text-center text-foreground font-medium">
                                            {formatDisplayQuantity(item.systemBalance, multiplier)}
                                          </td>
                                        )}
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
                                                  // Set to 0 only when leaving with empty value
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
                                                    const currMultiplier = newItems[itemIdx].conversionMultiplier || multiplier // Use calc multiplier if missing

                                                    // Calculate actualBalance (Base Unit)
                                                    // No rounding here to preserve precision as requested
                                                    const convertedValue = numValue * currMultiplier

                                                    newItems[itemIdx] = { ...newItems[itemIdx], inputValue: rawValue, actualBalance: convertedValue }
                                                    const updatedChecks = inventoryChecks.map((c) =>
                                                      c.id === selectedCheckId ? { ...c, items: newItems } : c
                                                    )
                                                    setInventoryChecks(updatedChecks)
                                                  }
                                                }}
                                              />
                                              {/* Conversion preview when editing */}
                                              {/* Show preview if multiplier > 1. Use Intl for consistent formatting (no forced round) */}
                                              {multiplier > 1 && Number(String(item.inputValue ?? 0).replace(',', '.')) > 0 && (
                                                <span className="text-xs text-blue-600 font-medium">
                                                  {(item.inputValue ?? 0)} {unit?.code || ''} → {new Intl.NumberFormat('vi-VN', {
                                                    maximumFractionDigits: 6,
                                                    minimumFractionDigits: 0,
                                                    useGrouping: false
                                                  }).format(Number(String(item.inputValue ?? 0).replace(',', '.')) * multiplier)} {item.productUnit}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            /* View mode: show input value + input unit with conversion note */
                                            <div className="flex flex-col items-center gap-0.5">
                                              <span className="font-medium text-foreground">
                                                {(item.inputValue !== null && item.inputValue !== undefined && String(item.inputValue).trim() !== '')
                                                  ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(String(item.inputValue).replace(',', '.')))
                                                  : formatDisplayQuantity(item.actualBalance, multiplier)} {item.inputUnitCode || item.productUnit || ''}
                                              </span>
                                              {/* Show conversion note if different unit was used */}
                                              {item.inputUnitId && item.inputUnitId !== item.productUnitId && (
                                                <span className="text-xs text-muted-foreground">
                                                  (= {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(item.actualBalance))} {item.productUnit})
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        {canViewOpeningAndSystemBalance && isCompleted && (
                                          <>
                                            <td className="py-3 px-4 text-center">
                                              <span
                                                className={`font-semibold ${item.difference >= 0 ? "text-green-600" : "text-red-600"
                                                  }`}
                                              >
                                                {item.difference > 0 ? "+" : ""}
                                                {formatDisplayQuantity(item.difference, multiplier)}
                                              </span>
                                              <div className="text-xs text-muted-foreground">
                                                ({item.differencePercentage > 0 ? "+" : ""}{item.differencePercentage}%)
                                              </div>
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

                                // Determine the effective Unit ID (Selected > Saved Input > Default Product Unit)
                                const currentUnitId = item.selectedUnitId || item.inputUnitId || item.productUnitId

                                // Find the unit in cache to get multiplier
                                const unit = item.productId && unitsMap[item.productId]
                                  ? unitsMap[item.productId]?.find((u: any) => u.id === currentUnitId)
                                  : null

                                const multiplier = unit?.multiplier && unit.multiplier > 0 ? unit.multiplier : 1

                                return (
                                  <div key={item.id} className="border border-border rounded-lg p-4 bg-card space-y-3">
                                    {/* Product Info */}
                                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-border">
                                      <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-base text-foreground truncate">{item.productName}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-xs text-muted-foreground">Mã: {item.productCode}</span>
                                          <span className="text-xs text-muted-foreground">• ĐV: {
                                            item.inputUnitCode
                                              ? item.inputUnitCode
                                              : (item.inputUnitId && item.productId && unitsMap[item.productId]?.find((u: any) => u.id === item.inputUnitId)?.code)
                                                ? unitsMap[item.productId]?.find((u: any) => u.id === item.inputUnitId)?.code
                                                : (item.productUnit ?? '-')
                                          }</span>
                                        </div>
                                      </div>
                                      {canViewOpeningAndSystemBalance && isCompleted && item.difference !== 0 && (
                                        <Badge className={item.difference > 0 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                                          {item.difference > 0 ? "Nhập ĐC" : "Xuất ĐC"}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Stock Info Grid */}
                                    {canViewOpeningAndSystemBalance && (
                                      <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-muted/50 rounded-lg p-2">
                                          <div className="text-xs text-muted-foreground mb-1">Tồn Đầu</div>
                                          <div className="text-sm font-medium">{formatDisplayQuantity(item.openingBalance, multiplier)}</div>
                                        </div>
                                        {canViewImportsExports && (
                                          <>
                                            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2">
                                              <div className="text-xs text-green-600 dark:text-green-400 mb-1">Nhập</div>
                                              <div className="text-sm font-semibold text-green-600 dark:text-green-400">+{formatDisplayQuantity(item.imports, multiplier)}</div>
                                            </div>
                                            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-2">
                                              <div className="text-xs text-red-600 dark:text-red-400 mb-1">Xuất</div>
                                              <div className="text-sm font-semibold text-red-600 dark:text-red-400">-{formatDisplayQuantity(item.exports, multiplier)}</div>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}

                                    {canViewOpeningAndSystemBalance && (
                                      <div className="flex items-center justify-center gap-2 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Tồn Hệ Thống:</span>
                                        <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatDisplayQuantity(item.systemBalance, multiplier)}</span>
                                      </div>
                                    )}

                                    {/* Input Field - Large and Prominent */}
                                    <div className="space-y-2">
                                      <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <span className={isEditing ? "text-green-600" : ""}>Tồn Thực Tế</span>
                                        {isEditing && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">Đang nhập</Badge>}
                                      </label>

                                      {/* Unit selector for mobile */}
                                      {isEditing && item.productId && (unitsMap[item.productId]?.length ?? 0) > 1 && (
                                        <select
                                          value={currentUnitId || ''}
                                          onChange={(e) => {
                                            const newUnitId = e.target.value
                                            const newMultiplier = getConversionMultiplier(item.productId, newUnitId)
                                            const newItems = [...inventoryChecks.find((c) => c.id === selectedCheckId)!.items]
                                            const itemIdx = newItems.findIndex(i => i.id === item.id)
                                            if (itemIdx >= 0) {
                                              const currentActualBalance = newItems[itemIdx].actualBalance || 0
                                              // Recalculate inputValue based on existing actualBalance (Base Unit)
                                              const calculatedInputValue = currentActualBalance / newMultiplier

                                              // Format for display
                                              const formattedInputValue = new Intl.NumberFormat('vi-VN', {
                                                maximumFractionDigits: 6,
                                                minimumFractionDigits: 0,
                                                useGrouping: false
                                              }).format(calculatedInputValue).replace('.', ',')

                                              newItems[itemIdx] = {
                                                ...newItems[itemIdx],
                                                selectedUnitId: newUnitId,
                                                conversionMultiplier: newMultiplier,
                                                inputValue: formattedInputValue
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
                                        <>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            // pattern="[0-9]*" // Removed pattern to allow decimal separator
                                            placeholder="Nhập số lượng kiểm kê"
                                            value={item.inputValue === null || item.inputValue === undefined ? '' : String(item.inputValue).replace('.', ',')} // Display with comma
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
                                                const currMultiplier = newItems[itemIdx].conversionMultiplier || multiplier

                                                // Calculate actualBalance (Base Unit)
                                                // No rounding here to preserve precision as requested
                                                const convertedValue = numValue * currMultiplier

                                                newItems[itemIdx] = { ...newItems[itemIdx], inputValue: rawValue, actualBalance: convertedValue }
                                                const updatedChecks = inventoryChecks.map((c) =>
                                                  c.id === selectedCheckId ? { ...c, items: newItems } : c
                                                )
                                                setInventoryChecks(updatedChecks)
                                              }
                                            }}
                                          />

                                          {/* Conversion preview when editing */}
                                          {multiplier > 1 && Number(String(item.inputValue ?? 0).replace(',', '.')) > 0 && (
                                            <div className="text-center text-sm text-blue-600 font-medium mt-2">
                                              {(item.inputValue ?? 0)} {unit?.code || ''} → {new Intl.NumberFormat('vi-VN', {
                                                maximumFractionDigits: 6,
                                                minimumFractionDigits: 0,
                                                useGrouping: false
                                              }).format(Number(String(item.inputValue ?? 0).replace(',', '.')) * multiplier)} {item.productUnit}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        /* View mode for mobile: show input value + input unit with conversion note */
                                        <div className="text-center py-2">
                                          <span className="text-xl font-bold text-foreground">
                                            {(item.inputValue !== null && item.inputValue !== undefined && String(item.inputValue).trim() !== '')
                                              ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(String(item.inputValue).replace(',', '.')))
                                              : formatDisplayQuantity(item.actualBalance, multiplier)} {item.inputUnitCode || item.productUnit || ''}
                                          </span>
                                          {/* Show conversion note if different unit was used */}
                                          {item.inputUnitId && item.inputUnitId !== item.productUnitId && item.inputValue && (
                                            <div className="text-sm text-muted-foreground mt-1">
                                              (= {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(item.actualBalance))} {item.productUnit})
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Difference Display - Only when Completed */}
                                    {canViewOpeningAndSystemBalance && isCompleted && (
                                      <div className={`p-3 rounded-lg ${item.difference > 0 ? 'bg-green-50 dark:bg-green-950' :
                                        item.difference < 0 ? 'bg-red-50 dark:bg-red-950' :
                                          'bg-muted/50'
                                        }`}>
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-medium text-muted-foreground">Chênh lệch:</span>
                                          <span className={`text-base font-bold ${item.difference >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                            }`}>
                                            {item.difference > 0 ? "+" : ""}{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(Number(item.difference))}
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

                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Fixed Footer with Buttons */}
              {(inventoryChecks.find((c) => c.id === selectedCheckId) && (
                inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "IN_PROGRESS" ||
                inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "COMPLETED"
              )) ? (
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
                      disabled={inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "COMPLETED"}
                      onClick={() => setIsEditing(true)}
                    >
                      Chỉnh Sửa
                    </Button>
                  )}
                  {isEditing && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Sync selectedUnitId → inputUnitId for view mode display
                        const check = inventoryChecks.find((c) => c.id === selectedCheckId)
                        if (check) {
                          const updatedItems = check.items.map(item => {
                            if (item.selectedUnitId && item.selectedUnitId !== item.inputUnitId) {
                              // User changed unit - sync to inputUnitId and get code
                              const unitCode = item.productId && unitsMap[item.productId]
                                ? unitsMap[item.productId].find((u: any) => u.id === item.selectedUnitId)?.code
                                : undefined
                              return {
                                ...item,
                                inputUnitId: item.selectedUnitId,
                                inputUnitCode: unitCode || item.inputUnitCode
                              }
                            }
                            return item
                          })
                          const updatedChecks = inventoryChecks.map((c) =>
                            c.id === selectedCheckId ? { ...c, items: updatedItems } : c
                          )
                          setInventoryChecks(updatedChecks)
                        }
                        setIsEditing(false)
                      }}
                    >
                      Xong Chỉnh Sửa
                    </Button>
                  )}
                  {/* Removed manager approval button - auto-complete now */}
                  {/* Submit button for IN_PROGRESS status */}
                  {inventoryChecks.find((c) => c.id === selectedCheckId)?.status === "IN_PROGRESS" && (
                    <Button
                      disabled={isEditing || isSaving}
                      onClick={async () => {
                        const check = inventoryChecks.find((c) => c.id === selectedCheckId)
                        if (!check) return

                        // Validate all items have user input (allow 0 and negative values)
                        const allFilled = check.items.every((it) => typeof it.actualBalance === 'number')
                        if (!allFilled) {
                          toast.error("Vui lòng nhập đầy đủ 'Tồn Thực Tế' cho tất cả sản phẩm")
                          return
                        }

                        try {
                          setIsSaving(true)

                          // All users submit with COMPLETED status immediately
                          // No more PENDING_APPROVAL - auto-complete for everyone
                          const finalStatus = "COMPLETED"

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
                              status: finalStatus,
                            }),
                          })
                          const json = await res.json()
                          if (res.ok && json.success) {
                            // Reload inventory checks
                            const reloadRes = await mobileFetch(`/api/inventory-checks?warehouseId=${user?.warehouseId}`)
                            const reloadJson = await reloadRes.json()
                            if (reloadJson.success) {
                              setInventoryChecks(reloadJson.data || [])
                              setSelectedCheckId(null)
                              setIsEditing(false)
                              toast.success("Kiểm kê hoàn thành thành công!")
                            }
                          } else {
                            toast.error(json.error || "Lỗi khi submit kiểm kê")
                          }
                        } catch (err) {
                          toast.error("Lỗi khi submit kiểm kê")
                        } finally {
                          setIsSaving(false)
                        }
                      }}
                    >
                      {isSaving ? "Đang xử lý..." : "Hoàn Thành Kiểm Kê"}
                    </Button>
                  )}
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        )}

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

      </div>
    </div>
  )
}
