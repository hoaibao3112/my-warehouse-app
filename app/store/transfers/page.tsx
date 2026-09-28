"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Plus, Search, Eye, X, ArrowDownToLine } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { fetchWithRateLimit } from "@/lib/api-rate-limit"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useSelectedWarehouse, WAREHOUSE_CHANGE_EVENT } from "@/components/store/warehouse-selector"

interface DetailItem {
  id: string
  productId: string
  product: string
  quantity: string
  unitId?: string
  defaultUnitId?: string      // Default unit for this product
  convertedQuantity?: number  // Quantity in smallest unit when unit differs from default
  smallestUnitId?: string     // ID of smallest unit
  price?: number              // Product price for calculating total
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [mainWarehouse, setMainWarehouse] = useState<any | null>(null)
  const [details, setDetails] = useState<DetailItem[]>([])
  const [creating, setCreating] = useState(false)
  const [receivedQuantities, setReceivedQuantities] = useState<{ [key: string]: string }>({})
  const [approvedQuantities, setApprovedQuantities] = useState<{ [key: string]: string }>({})
  const [confirming, setConfirming] = useState(false)
  const { user } = useAuth()
  const selectedWarehouseId = useSelectedWarehouse()
  const [warehouseDiscount, setWarehouseDiscount] = useState<number>(0)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })

  // Search state
  const [showProductSearch, setShowProductSearch] = useState<string | null>(null)
  const [productResultsMap, setProductResultsMap] = useState<Record<string, any[]>>({})
  const [highlightedIndexMap, setHighlightedIndexMap] = useState<Record<string, number>>({})
  const searchTimers = useRef<Record<string, number | null>>({})
  const productContainerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const productInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [dropdownPos, setDropdownPos] = useState<Record<string, { top: number; left: number; width: number }>>({})
  const [unitsMap, setUnitsMap] = useState<Record<string, any[]>>({})

  // Fetch products for a specific item (debounced)
  const fetchProductsFor = async (itemId: string, q: string) => {
    if (!q || q.trim().length === 0) {
      setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
      return
    }
    try {
      const res = await mobileFetch(`/api/products?search=${encodeURIComponent(q)}&page=1&pageSize=25`)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
      setProductResultsMap((s) => ({ ...s, [itemId]: json.data || [] }))
      setHighlightedIndexMap((s) => ({ ...s, [itemId]: 0 }))
    } catch (err) {
      console.warn('Product search failed', err)
      setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
    }
  }

  // Close product search when clicking outside
  useEffect(() => {
    const onDocPointer = (e: PointerEvent) => {
      if (!showProductSearch) return
      const currentEl = productContainerRefs.current[showProductSearch]
      const dropdownEl = dropdownRefs.current[showProductSearch]
      const target = e.target as Node
      if (currentEl && currentEl.contains(target)) return
      if (dropdownEl && dropdownEl.contains(target)) return
      setShowProductSearch(null)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [showProductSearch])

  // Compute dropdown position for portal
  useEffect(() => {
    if (!showProductSearch) return
    const updatePos = () => {
      const input = productInputRefs.current[showProductSearch]
      if (!input) return
      const rect = input.getBoundingClientRect()
      setDropdownPos((s) => ({ ...s, [showProductSearch]: { top: rect.bottom, left: rect.left, width: rect.width } }))
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showProductSearch, productResultsMap])

  // Memoized fetch function để tránh infinite loop trong useAutoRefresh
  const fetchTransfers = useCallback(async () => {
    setError(null)
    try {
      const res = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
      setTransfers(json.data || [])
    } catch (err: any) {
      setError(err?.message || String(err))
    }
  }, [])

  // Load transfers list on mount
  useEffect(() => {
    setLoading(true)
    fetchTransfers().finally(() => setLoading(false))

    // Listen for warehouse changes - reload immediately
    const handleWarehouseChange = () => {
      setLoading(true)
      fetchTransfers().finally(() => setLoading(false))
    }
    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
  }, [fetchTransfers])

  // Auto-refresh transfers mỗi 30 giây (adaptive: tăng dần lên 2 phút nếu không có thay đổi)
  useAutoRefresh(fetchTransfers, 30000)

  // Reset state when dialog closes
  useEffect(() => {
    if (!viewOpen) {
      setReceivedQuantities({})
      setApprovedQuantities({})
      setSelectedTransfer(null)
    }
  }, [viewOpen])

  // Load main warehouse and reset details when dialog opens
  useEffect(() => {
    if (!createOpen) return

    let mounted = true

    const fetchData = async () => {
      try {
        const whRes = await mobileFetch(`/api/warehouses?type=MAIN&page=1&pageSize=10`)
        const whJson = await whRes.json()
        if (mounted && whJson.data && whJson.data.length > 0) {
          setMainWarehouse(whJson.data[0])
        }
      } catch (err) {
        console.error("Error loading warehouse:", err)
        toast.error("Không thể tải thông tin kho")
      }
    }

    fetchData()
    setDetails([{ id: "1", productId: "", product: "", quantity: "" }])
    return () => {
      mounted = false
    }
  }, [createOpen])

  const formatDate = (value: any) => {
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return "-"
      return d.toLocaleString("vi-VN")
    } catch {
      return "-"
    }
  }

  const handleAddDetail = () => {
    const newId = String(Math.max(...details.map((d) => Number(d.id)), 0) + 1)
    setDetails([...details, { id: newId, productId: "", product: "", quantity: "" }])
  }

  const handleRemoveDetail = (id: string) => {
    if (details.length > 1) {
      setDetails(details.filter((item) => item.id !== id))
    }
  }

  const handleItemChange = (id: string, field: keyof DetailItem, value: string) => {
    setDetails(details.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const handleSelectProduct = (itemId: string, product: { id: string; name: string; code?: string; price?: number }) => {
    setDetails(prevDetails =>
      prevDetails.map(item =>
        item.id === itemId
          ? { ...item, product: product.name, productId: product.id, price: product.price ? Number(product.price) : 0 }
          : item
      )
    )
    const input = productInputRefs.current[itemId]
    if (input) {
      input.value = product.name
    }
    setShowProductSearch(null)
    setProductResultsMap((s) => ({ ...s, [itemId]: [] }))
    setHighlightedIndexMap((s) => ({ ...s, [itemId]: 0 }))

      // Fetch units for this product and set default unit
      ; (async () => {
        try {
          const res = await mobileFetch(`/api/products/${product.id}/units`, {
            credentials: 'include'
          })
          const json = await res.json()
          if (res.ok && json?.success) {
            // API returns { units, defaultUnitId }
            let unitsList: any[] = []
            let defaultUnitId: string | undefined = undefined
            if (json.data && Array.isArray(json.data.units)) {
              unitsList = json.data.units
              defaultUnitId = json.data.defaultUnitId
            } else if (Array.isArray(json.data)) {
              unitsList = json.data
            }

            // Filter to only units that have conversion paths (multiplier !== null)
            // This excludes units that are isolated (no conversion relations to the base unit)
            const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)

            console.log('[Transfers] Product:', product.name, 'Total units:', unitsList.length, 'Convertible units:', convertibleUnits.length)
            console.log('[Transfers] Units detail:', unitsList.map((u: any) => ({ code: u.code, multiplier: u.multiplier, isDefault: u.isDefault })))

            // Find smallest unit (highest multiplier, since multiplier = how much base unit = 1 smaller unit)
            let smallestUnit = convertibleUnits[0] || unitsList[0]
            for (const unit of convertibleUnits) {
              if (unit.multiplier > smallestUnit.multiplier) {
                smallestUnit = unit
              }
            }

            // Set preferred unit as the default unit or smallest unit
            const preferred = defaultUnitId || smallestUnit?.id || convertibleUnits[0]?.id || unitsList[0]?.id

            // Store only convertible units in the map
            setUnitsMap((m) => ({ ...m, [itemId]: convertibleUnits.length > 0 ? convertibleUnits : unitsList }))

            if (preferred) {
              setDetails(prevDetails =>
                prevDetails.map(item =>
                  item.id === itemId
                    ? {
                      ...item,
                      unitId: preferred,
                      defaultUnitId: preferred,  // Store the default unit ID
                      smallestUnitId: smallestUnit?.id,
                      convertedQuantity: undefined  // Reset on product change
                    }
                    : item
                )
              )
            }
          }
        } catch (err) {
          console.error('Failed to fetch units for item', itemId, err)
          toast.error('Không thể tải đơn vị sản phẩm')
        }
      })()
  }

  const handleConfirmReceived = async () => {
    if (!selectedTransfer?.id) return
    setConfirming(true)
    try {
      const items = (selectedTransfer.items || selectedTransfer.itemsList || []).map((item: any) => ({
        itemId: item.id,
        actualReceivedQuantity: receivedQuantities[item.id] || 0,
      }))

      const res = await fetchWithRateLimit(`/api/stock-transfer-requests/${selectedTransfer.id}/sign-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi xác nhận")

      toast.success(json.message || "Xác nhận thành công")
      setViewOpen(false)
      setReceivedQuantities({})
      // Refresh list
      const r = await fetchWithRateLimit(`/api/warehouse-transfers?page=1&pageSize=100`)
      const j = await r.json()
      if (j?.success) setTransfers(j.data || [])
    } catch (err: any) {
      toast.error("Lỗi xác nhận", { description: err?.message || String(err) })
    } finally {
      setConfirming(false)
    }
  }

  const handleManagerApprove = async () => {
    if (!selectedTransfer?.id) return
    setConfirming(true)
    try {
      // Prepare items with manager-approved quantities
      const items = (selectedTransfer.items || selectedTransfer.itemsList || []).map((item: any) => ({
        itemId: item.id,
        approvedQuantity: approvedQuantities[item.id] || item.quantity || item.requested_quantity || 0,
      }))

      const res = await fetchWithRateLimit(`/api/stock-transfer-requests/${selectedTransfer.id}/manager-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi duyệt yêu cầu")

      toast.success("Đã duyệt yêu cầu")
      setViewOpen(false)
      // Refresh list
      const r = await fetchWithRateLimit(`/api/warehouse-transfers?page=1&pageSize=100`)
      const j = await r.json()
      if (j?.success) setTransfers(j.data || [])
    } catch (err: any) {
      toast.error("Lỗi duyệt yêu cầu", { description: err?.message || String(err) })
    } finally {
      setConfirming(false)
    }
  }

  const handleMainWarehouseApprove = async () => {
    if (!selectedTransfer?.id) return
    setConfirming(true)
    try {
      const items = (selectedTransfer.items || selectedTransfer.itemsList || []).map((item: any) => ({
        itemId: item.id,
        approvedQuantity: approvedQuantities[item.id] || (item.quantity ?? item.requested_quantity ?? 0),
      }))

      const res = await fetchWithRateLimit(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi duyệt yêu cầu")

      toast.success("Đã duyệt và xuất kho")
      setViewOpen(false)
      // Refresh list
      const r = await fetchWithRateLimit(`/api/warehouse-transfers?page=1&pageSize=100`)
      const j = await r.json()
      if (j?.success) setTransfers(j.data || [])
    } catch (err: any) {
      toast.error("Lỗi duyệt yêu cầu", { description: err?.message || String(err) })
    } finally {
      setConfirming(false)
    }
  }

  // Calculate total amount reactively
  const totalAmount = useMemo(() => {
    if (!selectedTransfer) return 0
    let subtotal = (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
      const price = Number(item.price ?? item.product_price ?? 0)
      const requestedQty = item.quantity ?? item.requested_quantity ?? 0
      // Use admin's approved quantity if available, otherwise manager's approved quantity
      const approvedQty = item.admin_approved_quantity ?? item.received_quantity ?? item.approved_quantity ?? 0

      // Determine display quantity based on status and editable inputs
      let displayQty = 0
      if ((selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && !selectedTransfer.approved_by && user && (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon")) ||
        (selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && ((user.role as any) === "ADMIN" || (user.role as any) === "ADMIN"))) {
        // In editable states, use the edited quantity from approvedQuantities
        displayQty = Number(approvedQuantities[item.id] ?? approvedQty)
      } else if (selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO) {
        // In DA_XUAT_KHO state, use admin's approved quantity (or editable received quantity)
        displayQty = Number(receivedQuantities[item.id] ?? approvedQty)
      } else if (selectedTransfer.status === 'HOAN_THANH') {
        // In completed state, use actual received quantity
        displayQty = Number(item.actual_received_quantity ?? approvedQty ?? 0)
      } else {
        // Default to requested quantity
        displayQty = Number(requestedQty)
      }

      // Use converted quantity (in default unit) if available, otherwise use display quantity
      // This ensures correct calculation when unit differs from default unit
      const effectiveQty = item.convertedQuantity !== undefined && item.convertedQuantity !== null
        ? Number(item.convertedQuantity)
        : displayQty

      return sum + (effectiveQty * price)
    }, 0)

    // Apply warehouse discount if status is HOAN_THANH (completed)
    if (selectedTransfer.status === 'HOAN_THANH' && warehouseDiscount > 0) {
      return subtotal * (1 - warehouseDiscount / 100)
    }

    return subtotal
  }, [selectedTransfer, approvedQuantities, receivedQuantities, user, warehouseDiscount])

  const handleCreateRequest = async () => {
    // Validation
    if (!mainWarehouse) {
      toast.error("Không thể tải kho Tổng")
      return
    }

    if (details.length === 0) {
      toast.error("Vui lòng thêm ít nhất một sản phẩm")
      return
    }

    if (details.some(d => !d.productId || !d.quantity || Number(d.quantity) <= 0)) {
      toast.error("Vui lòng kiểm tra lại sản phẩm và số lượng")
      return
    }

    setCreating(true)

    try {
      // Determine if this should require approval based on user role
      // Managers can bypass approval by setting requiresApproval: false
      // Staff always requires approval (requiresApproval: true or undefined)
      const isManager = user && (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon")

      const res = await fetchWithRateLimit(`/api/stock-transfer-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          fromWarehouseId: mainWarehouse.id,
          requiresApproval: !isManager, // Staff: true, Manager: false (unless they want approval)
          details: details.map(d => ({
            productId: d.productId,
            // Send original quantity, not converted
            requestedQuantity: Number(d.quantity),
            unitId: d.unitId || null
          })),
        }),
      })

      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Lỗi tạo yêu cầu")
      }

      // Success
      setCreateOpen(false)
      setDetails([])

      // Show appropriate message based on user role
      if (isManager) {
        toast.success("Đã tạo nhập hàng nội bộ (không cần duyệt)")
      } else {
        toast.success("Đã tạo yêu cầu nhập hàng nội bộ (chờ quản lý duyệt)")
      }

      // Refresh transfer list
      const refreshRes = await fetchWithRateLimit(`/api/warehouse-transfers?page=1&pageSize=100`)
      const refreshJson = await refreshRes.json()
      if (refreshJson?.success) {
        setTransfers(refreshJson.data || [])
      }
    } catch (err: any) {
      toast.error("Lỗi tạo nhập hàng", {
        description: err?.message || String(err)
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={ArrowDownToLine}
        title="Nhập Hàng Nội Bộ"
        subtitle="Theo dõi nhập hàng nội bộ"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="hidden md:block">
            <h1 className="text-3xl font-bold text-foreground">Nhập Hàng Nội Bộ</h1>
            <p className="text-muted-foreground mt-2">Yêu cầu và theo dõi nhập hàng nội bộ</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Nhập Hàng Nội Bộ Mới
          </Button>
        </div>

        <Card className="p-6">
          <div className="mb-6 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm nhập hàng..." className="pl-10" />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải nhập hàng...</p>}
            {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {transfers.map((transfer) => (
                <Card key={transfer.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground">{formatDate(transfer.createdAt ?? transfer.created_at ?? transfer.date)}</p>
                    </div>
                    <Badge className={getStatusColor(transfer.status as any)}>
                      {getStatusLabel(transfer.status as any)}
                    </Badge>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={async () => {
                        try {
                          setViewOpen(true)
                          const res = await mobileFetch(`/api/stock-transfer-requests/${transfer.id}`)
                          const json = await res.json()
                          const data = json?.data || transfer
                          setSelectedTransfer(data)
                          const initial: { [key: string]: string } = {}
                          const approvedInitial: { [key: string]: string } = {}
                          const itemsToProcess = data.itemsList || data.items || []
                          itemsToProcess.forEach((item: any) => {
                            let defaultReceived = 0
                            if (data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                              defaultReceived = item.admin_approved_quantity ?? item.quantity ?? item.requested_quantity ?? 0
                            } else {
                              defaultReceived = item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0
                            }
                            initial[item.id] = String(Number(defaultReceived))
                            approvedInitial[item.id] = String(Number(item.quantity || item.requested_quantity || 0))
                          })
                          setReceivedQuantities(initial)
                          setApprovedQuantities(approvedInitial)
                          if (data.status === 'HOAN_THANH' || data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                            try {
                              // For GENERAL_MANAGER, use selected warehouse; for others use their assigned warehouse
                              const currentWarehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : user?.warehouseId
                              const whRes = await mobileFetch(`/api/warehouses/${currentWarehouseId}`)
                              const whJson = await whRes.json()
                              if (whJson?.success && whJson?.data?.discount_percentage) {
                                setWarehouseDiscount(Number(whJson.data.discount_percentage))
                              } else {
                                setWarehouseDiscount(0)
                              }
                            } catch (err) {
                              setWarehouseDiscount(0)
                            }
                          }
                        } catch (err) {
                          console.error('Error fetching transfer details:', err)
                          toast.error("Không thể tải chi tiết phiếu nhập")
                          setSelectedTransfer(transfer)
                        }
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Chi tiết
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Desktop Table View */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày</th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-4 text-foreground">{formatDate(transfer.createdAt ?? transfer.created_at ?? transfer.date)}</td>
                    <td className="py-3 px-4">
                      <Badge className={getStatusColor(transfer.status as any)}>
                        {getStatusLabel(transfer.status as any)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              setViewOpen(true)
                              // fetch the stock-transfer-request detail (includes product names)
                              const res = await mobileFetch(`/api/stock-transfer-requests/${transfer.id}`)
                              const json = await res.json()
                              const data = json?.data || transfer
                              setSelectedTransfer(data)
                              // Initialize received quantities with approved quantities (received_quantity = số duyệt)
                              const initial: { [key: string]: string } = {}
                              const approvedInitial: { [key: string]: string } = {}
                              const itemsToProcess = data.itemsList || data.items || []
                              itemsToProcess.forEach((item: any) => {
                                // At DA_XUAT_KHO status, default to admin's approval if available, otherwise original request
                                // At other statuses where editing, use manager's approval or original request
                                let defaultReceived = 0
                                if (data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                  // For DA_XUAT_KHO: use admin's approved quantity (from approve endpoint), or original request
                                  defaultReceived = item.admin_approved_quantity ?? item.quantity ?? item.requested_quantity ?? 0
                                } else {
                                  // For other statuses: use admin's approved quantity if exists, then manager's, then original
                                  defaultReceived = item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0
                                }
                                initial[item.id] = String(Number(defaultReceived))
                                approvedInitial[item.id] = String(Number(item.quantity || item.requested_quantity || 0))
                              })
                              setReceivedQuantities(initial)
                              setApprovedQuantities(approvedInitial)

                              // Fetch current warehouse discount if status is completed
                              if (data.status === 'HOAN_THANH' || data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                try {
                                  // For GENERAL_MANAGER, use selected warehouse; for others use their assigned warehouse
                                  const currentWarehouseId = user?.role === 'GENERAL_MANAGER' ? selectedWarehouseId : user?.warehouseId
                                  const whRes = await mobileFetch(`/api/warehouses/${currentWarehouseId}`)
                                  const whJson = await whRes.json()
                                  if (whJson?.success && whJson?.data?.discount_percentage) {
                                    setWarehouseDiscount(Number(whJson.data.discount_percentage))
                                  } else {
                                    setWarehouseDiscount(0)
                                  }
                                } catch (err) {
                                  setWarehouseDiscount(0)
                                }
                              }
                            } catch (err) {
                              setSelectedTransfer(transfer)
                            }
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>

                        {(transfer.status === TRANSFER_STATUS.CHO_DUYET) && user && (user.id === (transfer.requested_by || transfer.requestedBy) || user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setConfirmDialog({
                                open: true,
                                title: "Xác nhận hủy yêu cầu",
                                description: "Bạn có chắc muốn hủy yêu cầu này?",
                                onConfirm: async () => {
                                  setConfirmDialog(prev => ({ ...prev, open: false }))
                                  try {
                                    const res = await fetchWithRateLimit(`/api/stock-transfer-requests/${transfer.id}`, { method: 'DELETE' })
                                    const json = await res.json()
                                    if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi hủy')
                                    toast.success('Đã hủy yêu cầu')
                                    // refresh list
                                    const refreshRes = await fetchWithRateLimit(`/api/warehouse-transfers?page=1&pageSize=100`)
                                    const refreshJson = await refreshRes.json()
                                    if (refreshJson?.success) setTransfers(refreshJson.data || [])
                                  } catch (err: any) {
                                    toast.error('Lỗi hủy: ' + (err?.message || String(err)))
                                  }
                                }
                              })
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Dialog open={viewOpen} onOpenChange={(open) => { setViewOpen(open) }}>
          <DialogContent className="max-w-2xl max-h-screen flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Chi tiết nhập hàng nội bộ</DialogTitle>
              <DialogDescription>Thông tin chi tiết</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4">
                {selectedTransfer ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Đến</p>
                        <div className="font-medium">{selectedTransfer.toWarehouse ?? selectedTransfer.to ?? selectedTransfer.to_warehouse_id}</div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Trạng thái</p>
                        <Badge className={getStatusColor(selectedTransfer.status as any)}>
                          {getStatusLabel(selectedTransfer.status as any)}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold">Chi tiết sản phẩm</h3>
                      <div className="border rounded-lg overflow-hidden mt-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted border-b">
                              <th className="text-left py-2 px-3">Sản phẩm</th>
                              <th className="text-center py-2 px-3">Yêu cầu</th>
                              <th className="text-center py-2 px-3">Đơn giá</th>
                              <th className="text-center py-2 px-3">
                                {(selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && !selectedTransfer.approved_by && user && (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon")) ||
                                  (selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && ((user.role as any) === "ADMIN" || (user.role as any) === "ADMIN"))
                                  ? 'Duyệt (có thể chỉnh sửa)'
                                  : 'Kho Tổng duyệt'}
                              </th>
                              {(selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO || selectedTransfer.status === 'HOAN_THANH') && (
                                <th className="text-center py-2 px-3">
                                  {selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO
                                    ? 'Nhận Thực Tế (mặc định = Đã duyệt)'
                                    : 'Nhận Thực Tế'}
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedTransfer.itemsList || selectedTransfer.items || []).map((it: any, idx: number) => {
                              // Status-aware logic:
                              // At CHO_DUYET (before manager approval): show original request
                              // At DA_DUYET and later (after manager approval): show manager's approved quantity
                              const requestedQty = selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET
                                ? (it.quantity ?? it.requested_quantity ?? it.qty)
                                : (it.received_quantity ?? it.quantity ?? it.requested_quantity ?? it.qty)
                              // Use admin's approved quantity if available (admin has already approved), otherwise use manager's approved quantity
                              const approvedQty = it.admin_approved_quantity ?? it.received_quantity ?? it.approved_quantity ?? '-'
                              const unitCode = it.unit_code ?? it.unitCode ?? ''
                              const hasConversion = it.convertedQuantity !== undefined && it.convertedQuantity !== null
                              const defaultUnitCode = it.default_unit_code ?? it.defaultUnitCode ?? ''
                              const price = Number(it.price ?? it.product_price ?? 0)

                              return (
                                <tr key={idx} className="border-b">
                                  <td className="py-2 px-3">{it.product_name ?? it.productName ?? it.productId}</td>
                                  <td className="py-2 px-3 text-center">
                                    <div>{requestedQty} {unitCode}</div>
                                    {hasConversion && (
                                      <div className="text-gray-500 text-xs mt-1">
                                        ≈ {Math.round(it.convertedQuantity * 100) / 100} {defaultUnitCode}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center font-semibold">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {((selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && !selectedTransfer.approved_by && user && (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon")) ||
                                      (selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && ((user.role as any) === "ADMIN" || (user.role as any) === "ADMIN"))) ? (
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={approvedQuantities[it.id] ?? (approvedQty !== '-' ? String(approvedQty) : "0")}
                                        onChange={(e) => {
                                          const newValue = e.target.value
                                          setApprovedQuantities({
                                            ...approvedQuantities,
                                            [it.id]: newValue,
                                          })
                                        }}
                                        className="w-20 mx-auto text-center text-sm"
                                        disabled={confirming}
                                      />
                                    ) : (
                                      approvedQty !== '-' ? `${approvedQty} ${it.approved_unit_code || unitCode}` : '-'
                                    )}
                                  </td>
                                  {(selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO || selectedTransfer.status === 'HOAN_THANH') && (
                                    <td className="py-2 px-3 text-center">
                                      {selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <Input
                                            type="number"
                                            min="0"
                                            step="0.0001"
                                            value={receivedQuantities[it.id] ?? 0}
                                            onChange={(e) => {
                                              const newValue = e.target.value
                                              setReceivedQuantities({
                                                ...receivedQuantities,
                                                [it.id]: newValue,
                                              })
                                            }}
                                            className="w-16 text-center text-sm"
                                            disabled={confirming}
                                          />
                                          <span className="text-xs text-muted-foreground">{it.approved_unit_code || unitCode}</span>
                                        </div>
                                      ) : (
                                        <span className="font-semibold text-green-600">{it.actual_received_quantity ?? 0} {it.approved_unit_code || unitCode}</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Total Amount Section for Detail View */}
                      {selectedTransfer && (selectedTransfer.itemsList || selectedTransfer.items || []).length > 0 && (
                        <div className="border-t mt-4 pt-4">
                          {selectedTransfer.status === 'HOAN_THANH' && warehouseDiscount > 0 ? (
                            <div className="flex justify-end items-center gap-4">
                              <div className="text-right space-y-2">
                                <div>
                                  <div className="text-sm text-muted-foreground mb-1">Tổng tiền gốc:</div>
                                  <div className="text-lg font-semibold text-foreground">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                      (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                        const price = Number(item.price ?? item.product_price ?? 0)
                                        const displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                        // Use converted quantity (in default unit) if available, otherwise use display quantity
                                        const effectiveQty = item.convertedQuantity !== undefined && item.convertedQuantity !== null
                                          ? Number(item.convertedQuantity)
                                          : displayQty
                                        return sum + (effectiveQty * price)
                                      }, 0)
                                    )}
                                  </div>
                                </div>
                                <div className="pt-2 border-t">
                                  <div className="text-sm text-red-600 mb-1">Chiết khấu ({warehouseDiscount}%):</div>
                                  <div className="text-lg font-semibold text-red-600">
                                    -
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                      ((selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                        const price = Number(item.price ?? item.product_price ?? 0)
                                        const displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                        // Use converted quantity (in default unit) if available, otherwise use display quantity
                                        const effectiveQty = item.convertedQuantity !== undefined && item.convertedQuantity !== null
                                          ? Number(item.convertedQuantity)
                                          : displayQty
                                        return sum + (effectiveQty * price)
                                      }, 0)) * (warehouseDiscount / 100)
                                    )}
                                  </div>
                                </div>
                                <div className="pt-2 border-t">
                                  <div className="text-sm text-green-600 mb-1">Thành tiền:</div>
                                  <div className="text-xl font-bold text-green-600">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end items-center gap-4">
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground mb-1">Tổng tiền (ước tính):</div>
                                <div className="text-xl font-bold text-primary">
                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  * Dựa trên số lượng yêu cầu và giá sản phẩm hiện tại
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p>Đang tải...</p>
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex items-center gap-2 flex-wrap justify-end">
              {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET && user && !selectedTransfer.approved_by && (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon") && (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleManagerApprove}
                  disabled={confirming}
                >
                  {confirming ? "Đang duyệt..." : "Duyệt Yêu Cầu"}
                </Button>
              )}
              {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.DA_DUYET && user && ((user.role as any) === "ADMIN" || (user.role as any) === "ADMIN") && (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleMainWarehouseApprove}
                  disabled={confirming}
                >
                  {confirming ? "Đang duyệt..." : "Duyệt & Xuất Kho"}
                </Button>
              )}
              {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleConfirmReceived}
                  disabled={confirming}
                >
                  {confirming ? "Đang xác nhận..." : "Xác Nhận Hoàn Thành"}
                </Button>
              )}
              {selectedTransfer && selectedTransfer.status === TRANSFER_STATUS.CHO_ADMIN_XAC_NHAN && user && ((user.role as any) === "ADMIN" || (user.role as any) === "ADMIN") && (
                <>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      setConfirming(true)
                      try {
                        const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/admin-confirm-shortage`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: 'CANCEL' })
                        })

                        const json = await res.json()
                        if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi")

                        toast.success("Đã hủy yêu cầu")
                        setViewOpen(false)
                        // Refresh list
                        const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                        const j = await r.json()
                        if (j?.success) setTransfers(j.data || [])
                      } catch (err: any) {
                        toast.error("Lỗi hủy: " + (err?.message || String(err)))
                      } finally {
                        setConfirming(false)
                      }
                    }}
                    disabled={confirming}
                  >
                    Hủy Yêu Cầu
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={async () => {
                      setConfirming(true)
                      try {
                        const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/admin-confirm-shortage`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: 'CONFIRM' })
                        })

                        const json = await res.json()
                        if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi")

                        toast.success("Đã xác nhận và hoàn thành yêu cầu")
                        setViewOpen(false)
                        // Refresh list
                        const r = await mobileFetch(`/api/warehouse-transfers?page=1&pageSize=100`)
                        const j = await r.json()
                        if (j?.success) setTransfers(j.data || [])
                      } catch (err: any) {
                        toast.error("Lỗi xác nhận: " + (err?.message || String(err)))
                      } finally {
                        setConfirming(false)
                      }
                    }}
                    disabled={confirming}
                  >
                    {confirming ? "Đang xác nhận..." : "Xác Nhận Hoàn Thành"}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setDetails([]); setShowProductSearch(null); } setCreateOpen(open) }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Nhập Hàng Nội Bộ Mới</DialogTitle>
              <DialogDescription>
                {user && (user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon")
                  ? "Tạo yêu cầu nhập hàng từ kho Tổng xuống kho con (không cần duyệt)"
                  : "Tạo yêu cầu nhập hàng từ kho Tổng xuống kho con (chờ quản lý duyệt)"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 space-y-4">
                {/* Fixed Warehouse Info */}
                {mainWarehouse && (
                  <div>
                    <Label className="text-sm font-medium">Kho Tổng</Label>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 mt-1">
                      <strong>{mainWarehouse.name}</strong> ({mainWarehouse.code})
                    </div>
                  </div>
                )}

                {/* Product Details */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label>Chi tiết sản phẩm</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddDetail}
                      disabled={creating}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm Sản Phẩm
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                    {details.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">Chưa có sản phẩm nào. Nhấn "Thêm Sản Phẩm" để bắt đầu.</p>
                    ) : (
                      details.map((item, index) => (
                        <div key={item.id} className="p-4 border border-border rounded-lg bg-muted/30">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-foreground">Sản phẩm {index + 1}</span>
                            {details.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDetail(item.id)}
                                className="p-1 hover:bg-red-100 rounded transition-colors"
                              >
                                <X className="w-4 h-4 text-red-600" />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col md:flex-row md:items-end gap-3">
                            {/* Product Search Input */}
                            <div className="flex-1">
                              <Label htmlFor={`product-${item.id}`} className="text-sm font-medium mb-1">Sản Phẩm</Label>
                              <div className="relative" ref={(el) => { productContainerRefs.current[item.id] = el }}>
                                <div className="flex gap-2">
                                  <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                    <Input
                                      id={`product-${item.id}`}
                                      type="text"
                                      ref={(el) => { productInputRefs.current[item.id] = el }}
                                      value={item.product}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        handleItemChange(item.id, 'product', v)
                                        const prev = searchTimers.current[item.id]
                                        if (prev) clearTimeout(prev)
                                        searchTimers.current[item.id] = window.setTimeout(() => {
                                          fetchProductsFor(item.id, v)
                                        }, 250) as unknown as number
                                        setShowProductSearch(item.id)
                                      }}
                                      onFocus={() => setShowProductSearch(item.id)}
                                      onKeyDown={(e) => {
                                        if (showProductSearch !== item.id) return
                                        const results = productResultsMap[item.id] || []
                                        const max = results.length - 1
                                        const current = highlightedIndexMap[item.id] ?? 0
                                        if (e.key === 'ArrowDown') {
                                          e.preventDefault()
                                          const next = current >= max ? 0 : current + 1
                                          setHighlightedIndexMap((s) => ({ ...s, [item.id]: next }))
                                        } else if (e.key === 'ArrowUp') {
                                          e.preventDefault()
                                          const prev = current <= 0 ? max : current - 1
                                          setHighlightedIndexMap((s) => ({ ...s, [item.id]: prev }))
                                        } else if (e.key === 'Enter') {
                                          e.preventDefault()
                                          const idx = highlightedIndexMap[item.id] ?? 0
                                          const sel = (productResultsMap[item.id] || [])[idx]
                                          if (sel) handleSelectProduct(item.id, sel)
                                        } else if (e.key === 'Escape') {
                                          setShowProductSearch(null)
                                        }
                                      }}
                                      placeholder="Tìm kiếm sản phẩm..."
                                      className="pl-10"
                                      aria-autocomplete="list"
                                      aria-expanded={showProductSearch === item.id}
                                      aria-controls={`product-list-${item.id}`}
                                      disabled={creating}
                                    />
                                  </div>
                                </div>

                                {/* Portal dropdown */}
                                {showProductSearch === item.id && dropdownPos[item.id] && createPortal(
                                  <div
                                    id={`product-list-${item.id}`}
                                    role="listbox"
                                    ref={(el) => { dropdownRefs.current[item.id] = el }}
                                    onPointerDown={(e) => { e.stopPropagation() }}
                                    onMouseDown={(e) => { e.stopPropagation() }}
                                    onWheel={(e) => { e.stopPropagation() }}
                                    className="bg-background border border-border rounded-lg shadow-lg overflow-y-auto"
                                    style={{
                                      position: 'fixed',
                                      top: dropdownPos[item.id].top + 'px',
                                      left: dropdownPos[item.id].left + 'px',
                                      width: dropdownPos[item.id].width + 'px',
                                      maxHeight: '200px',
                                      zIndex: 2147483647,
                                      pointerEvents: 'auto'
                                    }}
                                  >
                                    {(productResultsMap[item.id] || []).length > 0 ? (
                                      (productResultsMap[item.id] || []).map((product: any, idx: number) => (
                                        <button
                                          key={product.id}
                                          type="button"
                                          onPointerDown={(e) => { e.stopPropagation() }}
                                          onMouseEnter={() => setHighlightedIndexMap((s) => ({ ...s, [item.id]: idx }))}
                                          onClick={() => { handleSelectProduct(item.id, product) }}
                                          className={`w-full text-left px-4 py-2 transition-colors text-foreground ${((highlightedIndexMap[item.id] ?? 0) === idx) ? 'bg-muted' : 'hover:bg-muted'}`}
                                        >
                                          <div className="text-sm font-medium">{product.code ? `${product.code} — ${product.name}` : product.name}</div>
                                          {product.unit_name && <div className="text-xs text-muted-foreground">{product.unit_name}</div>}
                                        </button>
                                      ))
                                    ) : item.product ? (
                                      <div className="px-4 py-2 text-muted-foreground text-sm">Không tìm thấy sản phẩm</div>
                                    ) : (
                                      <div className="px-4 py-2 text-muted-foreground text-sm">Bắt đầu gõ để tìm kiếm...</div>
                                    )}
                                  </div>
                                  , document.body)}
                              </div>
                            </div>

                            {/* Quantity Input */}
                            <div className="w-32">
                              <Label htmlFor={`quantity-${item.id}`} className="text-sm font-medium mb-1">Số Lượng</Label>
                              <Input
                                id={`quantity-${item.id}`}
                                type="number"
                                min="0"
                                step="0.0001"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newQty = e.target.value
                                  handleItemChange(item.id, "quantity", newQty)

                                  // Auto-convert ONLY if selected unit differs from default unit
                                  if (newQty && item.unitId && item.defaultUnitId && item.unitId !== item.defaultUnitId) {
                                    const unitsList = unitsMap[item.id] || []
                                    const defaultUnit = unitsList.find((u: any) => u.id === item.defaultUnitId)
                                    const selectedUnit = unitsList.find((u: any) => u.id === item.unitId)

                                    if (defaultUnit && selectedUnit && defaultUnit.multiplier !== null && selectedUnit.multiplier !== null) {
                                      // Convert from selected unit to default unit
                                      // quantity * (selectedUnit.multiplier / defaultUnit.multiplier)
                                      const converted = Number(newQty) * (selectedUnit.multiplier / defaultUnit.multiplier)
                                      setDetails(prevDetails =>
                                        prevDetails.map(detail =>
                                          detail.id === item.id
                                            ? { ...detail, convertedQuantity: Math.round(converted * 100) / 100 }
                                            : detail
                                        )
                                      )
                                    }
                                  } else {
                                    // Reset converted quantity if unit is same as default
                                    setDetails(prevDetails =>
                                      prevDetails.map(detail =>
                                        detail.id === item.id
                                          ? { ...detail, convertedQuantity: undefined }
                                          : detail
                                      )
                                    )
                                  }
                                }}
                                placeholder="Nhập số lượng"
                                disabled={creating}
                              />
                            </div>

                            {/* Unit Selector */}
                            <div className="w-40">
                              <Label htmlFor={`unit-${item.id}`} className="text-sm font-medium mb-1">Đơn Vị</Label>
                              {item.unitId ? (
                                <select
                                  id={`unit-${item.id}`}
                                  value={item.unitId}
                                  onChange={(e) => {
                                    const newUnitId = e.target.value
                                    setDetails(prevDetails =>
                                      prevDetails.map(detail => {
                                        if (detail.id !== item.id) return detail

                                        // Update unit and recalculate conversion if needed
                                        const updatedDetail = { ...detail, unitId: newUnitId }

                                        // If new unit is the same as default, clear converted quantity
                                        if (newUnitId === detail.defaultUnitId) {
                                          updatedDetail.convertedQuantity = undefined
                                        } else if (detail.quantity && detail.defaultUnitId) {
                                          // Recalculate conversion for new unit to default unit
                                          const unitsList = unitsMap[item.id] || []
                                          const selectedUnit = unitsList.find((u: any) => u.id === newUnitId)
                                          const defaultUnit = unitsList.find((u: any) => u.id === detail.defaultUnitId)

                                          if (selectedUnit && defaultUnit && selectedUnit.multiplier !== null && defaultUnit.multiplier !== null) {
                                            const converted = Number(detail.quantity) * (selectedUnit.multiplier / defaultUnit.multiplier)
                                            updatedDetail.convertedQuantity = Math.round(converted * 100) / 100
                                          }
                                        }

                                        return updatedDetail
                                      })
                                    )
                                  }}
                                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm h-10 font-medium disabled:opacity-50"
                                  disabled={creating || (unitsMap[item.id] || []).length === 0}
                                >
                                  {(unitsMap[item.id] || []).map((unit: any) => (
                                    <option key={unit.id} value={unit.id}>
                                      {unit.code || unit.name} {unit.isDefault ? '(mặc định)' : ''}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground text-sm h-10 flex items-center italic">
                                  Chọn sản phẩm
                                </div>
                              )}
                            </div>

                            {/* Converted Quantity Display */}
                            {item.convertedQuantity !== undefined && (
                              <div className="w-32">
                                <Label className="text-sm font-medium mb-1">Quy đổi</Label>
                                <div className="px-3 py-2 border border-blue-200 rounded-lg bg-blue-50 text-blue-900 text-sm h-10 flex items-center font-semibold">
                                  {item.convertedQuantity} {(unitsMap[item.id] || []).find((u: any) => u.id === item.defaultUnitId)?.code || ''}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Total Amount Section */}
                {details.length > 0 && details.some(d => d.productId && d.quantity) && (
                  <div className="border-t pt-4 mt-2">
                    <div className="flex justify-end items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                        <div className="text-2xl font-bold text-primary">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                            details.reduce((sum, item) => {
                              if (item.productId && item.quantity && item.price) {
                                // Use convertedQuantity if available (when unit differs from default)
                                // Otherwise use the original quantity
                                const effectiveQty = item.convertedQuantity !== undefined
                                  ? item.convertedQuantity
                                  : Number(item.quantity)
                                return sum + (effectiveQty * item.price)
                              }
                              return sum
                            }, 0)
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <DialogClose disabled={creating}>Hủy</DialogClose>
              <Button
                onClick={handleCreateRequest}
                disabled={creating || details.length === 0 || details.some(d => !d.productId || !d.quantity) || !mainWarehouse}
              >
                {creating ? "Đang tạo..." : "Tạo Nhập Hàng"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-[340px] rounded-lg">
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
              <DialogDescription>{confirmDialog.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
                Hủy
              </Button>
              <Button variant="destructive" onClick={confirmDialog.onConfirm}>
                Xác nhận
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
