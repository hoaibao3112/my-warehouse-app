"use client"
import { redirect } from "next/navigation"
import { hasPermission, isWarehouseManager, isGeneralManager, canAccessWarehouse, canApproveOnBehalfOfWarehouseManager } from "@/lib/auth-helpers"
import { useAuth } from "@/hooks/use-auth"
import { useEffect, useState, useRef } from "react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Plus, Eye, Clock, CheckCircle, XCircle, AlertCircle, ArrowDownToLine, Trash2, Search, X, PackageCheck, ArrowRight, User } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { ManagerApprovalForm } from "@/components/internal-transfer/manager-approval-form"
import { GmApprovalView } from "@/components/internal-transfer/gm-approval-view"
import { ReceiveForm } from "@/components/internal-transfer/receive-form"
import { RequestDetailView } from "@/components/internal-transfer/request-detail-view"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createPortal } from "react-dom"

const STATUS_CONFIG: Record<string, { label: string; variant: any; icon: any }> = {
  CHO_QUAN_LY_DUYET: {
    label: "Chờ Quản Lý duyệt",
    variant: "secondary",
    icon: Clock
  },
  CHO_TONG_QUAN_LY_DUYET: {
    label: "Chờ Tổng Quản Lý duyệt",
    variant: "secondary",
    icon: Clock
  },
  CHO_KHO_TONG_XUAT: {
    label: "Chờ xuất kho",
    variant: "default",
    icon: Clock
  },
  DA_XUAT_KHO: {
    label: "Đã xuất - Chờ nhận",
    variant: "default",
    icon: AlertCircle
  },
  CHO_XAC_NHAN_CHENH_LECH: {
    label: "Chờ xác nhận Chênh Lệch",
    variant: "outline",
    icon: AlertCircle
  },
  HOAN_THANH: {
    label: "Hoàn thành",
    variant: "default",
    icon: CheckCircle
  },
  TU_CHOI: {
    label: "Từ chối",
    variant: "destructive",
    icon: XCircle
  },
  HUY_BO: {
    label: "Hủy bỏ",
    variant: "outline",
    icon: XCircle
  }
}

export default function InternalTransfersPage() {
  const { user, loading: authLoading } = useAuth()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  // Detail View State
  const [viewDetailOpen, setViewDetailOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<{ request: any, items: any[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [productUnitsMap, setProductUnitsMap] = useState<Record<string, any[]>>({})

  // Filter states for GENERAL_MANAGER
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [filterWarehouse, setFilterWarehouse] = useState("")
  const [warehouses, setWarehouses] = useState<any[]>([])

  const handleViewDetail = async (requestId: string) => {
    setDetailLoading(true)
    setViewDetailOpen(true)
    try {
      // Fetch Request
      const res = await mobileFetch(`/api/internal-transfer-requests/${requestId}`)
      const json = await res.json()
      if (json.success) {
        setSelectedRequest({ request: json.data, items: json.data.items || [] })

        // Use productUnitsMap from API response directly
        // The API already provides correct conversion data with base_quantity
        if (json.data.productUnitsMap) {
          console.log('[STORE PAGE] Using productUnitsMap from API:', json.data.productUnitsMap)
          setProductUnitsMap(json.data.productUnitsMap)
        } else {
          console.warn('[STORE PAGE] No productUnitsMap in API response')
          setProductUnitsMap({})
        }
      }
    } catch (err) {
      toast.error("Lỗi", { description: "Không thể tải chi tiết" })
      setViewDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleActionSuccess = () => {
    setViewDetailOpen(false)
    fetchRequests()
    toast.success("Đã cập nhật phiếu yêu cầu")
  }

  const fetchRequests = async () => {
    try {
      // Build query params
      const params = new URLSearchParams()
      if (fromDate) params.append('fromDate', fromDate)
      if (toDate) params.append('toDate', toDate)
      if (filterWarehouse) params.append('warehouseId', filterWarehouse)

      const url = `/api/internal-transfer-requests${params.toString() ? '?' + params.toString() : ''}`
      const response = await mobileFetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setRequests(data.data)
        }
      }
    } catch (error) {
      console.error("Error fetching requests:", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch warehouses for filter - Always fetch for debugging
  useEffect(() => {
    if (authLoading || !user) return
    // DEBUG: Fetch for all users
    // if (!isGeneralManager(user) && user.role !== 'MANAGER') return

    const fetchWarehouses = async () => {
      try {
        const res = await mobileFetch('/api/warehouses?page=1&pageSize=100')
        const json = await res.json()
        if (json.success) {
          setWarehouses(json.data || [])
        }
      } catch (err) {
        console.error('Failed to load warehouses:', err)
      }
    }
    fetchWarehouses()
  }, [user, authLoading])

  useEffect(() => {
    if (!authLoading && !user) {
      redirect("/login")
    }

    if (!authLoading && user) {
      const allowedRoles = ["STAFF", "WAREHOUSE_MANAGER", "GENERAL_MANAGER", "WAREHOUSE_STAFF", "MANAGER"]
      const hasAccessRole = allowedRoles.includes(user.role)
      const hasAccessPermission = hasPermission(user, "purchase_requests")

      if (!hasAccessRole && !hasAccessPermission) {
        redirect("/store")
      }

      fetchRequests()
    }
  }, [user, authLoading])

  // Re-fetch when filters change
  useEffect(() => {
    if (!authLoading && user) {
      setLoading(true)
      fetchRequests()
    }
  }, [fromDate, toDate, filterWarehouse])

  /* State copied from transfers/page.tsx */
  const [mainWarehouse, setMainWarehouse] = useState<any | null>(null)
  const [details, setDetails] = useState<any[]>([{ id: "1", productId: "", product: "", quantity: "" }])
  const [creating, setCreating] = useState(false)
  const [warehouseDiscount, setWarehouseDiscount] = useState<number>(0)

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
        toast.error("Lỗi", { description: "Không thể tải thông tin kho" })
      }
    }

    fetchData()
    setDetails([{ id: "1", productId: "", product: "", quantity: "" }])
    return () => {
      mounted = false
    }
  }, [createOpen])


  const handleAddDetail = () => {
    const newId = String(Math.max(...details.map((d) => Number(d.id)), 0) + 1)
    setDetails([...details, { id: newId, productId: "", product: "", quantity: "" }])
  }

  const handleRemoveDetail = (id: string) => {
    if (details.length > 1) {
      setDetails(details.filter((item) => item.id !== id))
    }
  }

  const handleItemChange = (id: string, field: string, value: string) => {
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
          const res = await mobileFetch(`/api/products/${product.id}/units`)
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
            const convertibleUnits = unitsList.filter((u: any) => u.multiplier !== null && u.multiplier !== undefined)

            // Find smallest unit (highest multiplier)
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
          toast.error("Lỗi", { description: 'Không thể tải đơn vị sản phẩm' })
        }
      })()
  }

  const handleCreateRequest = async () => {
    // Validation
    if (details.length === 0) {
      toast.error("Lỗi", { description: "Vui lòng thêm ít nhất một sản phẩm" })
      return
    }

    if (details.some(d => !d.productId || !d.quantity || Number(d.quantity) <= 0)) {
      toast.error("Lỗi", { description: "Vui lòng kiểm tra lại sản phẩm và số lượng" })
      return
    }

    setCreating(true)

    try {
      const res = await mobileFetch(`/api/internal-transfer-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: details.map(d => ({
            productId: d.productId,
            quantity: Number(d.quantity),
            unitId: d.unitId
          }))
        }),
      })

      const json = await res.json()

      // Check for 423 Locked status (inventory check in progress)
      if (res.status === 423) {
        toast.error("Không thể tạo yêu cầu", { description: json?.error || "Có phiếu kiểm kê đang tiến hành. Vui lòng hoàn thành kiểm kê trước khi tạo yêu cầu nhập hàng" })
        return
      }

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Lỗi tạo yêu cầu")
      }

      // Success
      setCreateOpen(false)
      setDetails([])
      toast.success("Đã tạo yêu cầu nhập hàng nội bộ (chờ quản lý duyệt)")
      fetchRequests()
    } catch (err: any) {
      toast.error("Lỗi tạo nhập hàng", { description: err?.message || String(err) })
    } finally {
      setCreating(false)
    }
  }

  if (authLoading || loading) {
    return <div className="p-8 text-center">Đang tải...</div>
  }

  if (!user) return null

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
            <h1 className="text-3xl font-bold">Nhập Hàng Nội Bộ</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý phiếu yêu cầu nhập hàng từ Kho Tổng
            </p>
          </div>
          {(user.role === "STAFF" || isWarehouseManager(user) || isGeneralManager(user) || hasPermission(user, "purchase_requests")) && (
            <Button onClick={() => setCreateOpen(true)} className="w-full md:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Tạo phiếu yêu cầu
            </Button>
          )}
        </div>

        {/* Filters - Visible for all roles (DEBUG) */}
        {true && (
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Từ ngày</Label>
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Đến ngày</Label>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Kho</Label>
                    <select
                      value={filterWarehouse}
                      onChange={(e) => setFilterWarehouse(e.target.value)}
                      className="w-full h-10 px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Tất cả kho</option>
                      {warehouses.length === 0 ? (
                        <option disabled>Đang tải kho...</option>
                      ) : (
                        warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name} ({wh.code})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFromDate("")
                        setToDate("")
                        setFilterWarehouse("")
                      }}
                      className="w-full h-10"
                    >
                      Xóa bộ lọc
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Danh Sách Phiếu Yêu Cầu</CardTitle>
            <CardDescription>
              Tất cả phiếu yêu cầu nhập hàng nội bộ
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Chưa có phiếu yêu cầu nào</p>
                {(user.role === "STAFF" || isWarehouseManager(user) || isGeneralManager(user) || hasPermission(user, "purchase_requests")) && (
                  <Button onClick={() => setCreateOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Tạo phiếu yêu cầu đầu tiên
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request: any) => {
                  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.CHO_QUAN_LY_DUYET
                  const StatusIcon = statusConfig.icon

                  return (
                    <div key={request.id}>
                      {/* Mobile View */}
                      <Card className="md:hidden overflow-hidden shadow-sm border-border/60 hover:shadow-md transition-shadow">
                        <div
                          className="p-0 cursor-pointer group"
                          onClick={() => handleViewDetail(request.id)}
                        >
                          {/* Header: ID & Status */}
                          <div className="flex items-start justify-between p-3 pb-2 bg-muted/10 border-b border-border/40">
                            <span className="font-bold text-sm tracking-tight text-foreground group-hover:text-primary transition-colors">
                              {request.request_number}
                            </span>
                            <Badge variant={statusConfig.variant} className="shrink-0 text-[10px] px-2 py-0.5 h-auto rounded-full font-medium">
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>

                          {/* Body: Route & Info */}
                          <div className="p-3 bg-card space-y-3">
                            {/* Warehouse Flow */}
                            <div className="flex items-center gap-2 text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5">Từ Kho</p>
                                <p className="font-medium text-foreground truncate" title={request.from_warehouse_name}>
                                  {request.from_warehouse_name}
                                </p>
                              </div>

                              <div className="shrink-0 px-2 flex flex-col items-center justify-center text-muted-foreground/50">
                                <ArrowRight className="w-4 h-4" />
                              </div>

                              <div className="flex-1 min-w-0 text-right">
                                <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5">Đến Kho</p>
                                <p className="font-medium text-foreground truncate" title={request.to_warehouse_name}>
                                  {request.to_warehouse_name}
                                </p>
                              </div>
                            </div>

                            <div className="h-px bg-border/40 w-full" />

                            {/* Footer: User & Time */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <User className="w-3 h-3 text-primary" />
                                </div>
                                <span className="truncate max-w-[120px]">{request.created_by_name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 bg-secondary/30 px-2 py-1 rounded-md">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span>{new Date(request.created_at).toLocaleString("vi-VN", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </div>

                          {/* Action Button - More Prominent */}
                          <div className="bg-muted/5 p-3 border-t border-border/40">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewDetail(request.id)
                              }}
                              size="sm"
                              className="w-full gap-2"
                              variant="default"
                            >
                              <Eye className="w-4 h-4" />
                              Chi tiết
                            </Button>
                          </div>
                        </div>
                      </Card>

                      {/* Desktop View (Original) */}
                      <Card className="hidden md:block">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold">{request.request_number}</h3>
                                <Badge variant={statusConfig.variant}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {statusConfig.label}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                <p>{request.from_warehouse_name} → {request.to_warehouse_name}</p>
                                <p>Tạo bởi: {request.created_by_name} • {new Date(request.created_at).toLocaleString("vi-VN")}</p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleViewDetail(request.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Chi tiết
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setDetails([]); setShowProductSearch(null); } setCreateOpen(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
            <DialogTitle>Nhập Hàng Nội Bộ Mới</DialogTitle>
            <DialogDescription>
              Tạo yêu cầu nhập hàng từ kho Tổng xuống kho con
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
                                      const updatedDetail = { ...detail, unitId: newUnitId }

                                      if (newUnitId === detail.defaultUnitId) {
                                        updatedDetail.convertedQuantity = undefined
                                      } else if (detail.quantity && detail.defaultUnitId) {
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
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Hủy</Button>
            <Button
              onClick={handleCreateRequest}
              disabled={creating || details.length === 0 || details.some(d => !d.productId || !d.quantity)}
            >
              {creating ? "Đang tạo..." : "Tạo Yêu Cầu"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={viewDetailOpen} onOpenChange={setViewDetailOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle>Chi Tiết Phiếu Yêu Cầu</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {detailLoading ? (
              <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : selectedRequest ? (
              <div className="space-y-6">
                {/* Action Forms */}
                {(() => {
                  const { request, items } = selectedRequest;

                  // Helper to determine active form
                  // For CHO_QUAN_LY_DUYET: Only show if user has access to the destination warehouse
                  if (request.status === "CHO_QUAN_LY_DUYET") {
                    const canApproveAsManager = (
                      isWarehouseManager(user) ||
                      user.role === "ADMIN" ||
                      user.role === "MANAGER" ||
                      (isGeneralManager(user) && canApproveOnBehalfOfWarehouseManager(user))
                    )
                    // Must have access to destination warehouse
                    const hasWarehouseAccess = canAccessWarehouse(user, request.to_warehouse_id)

                    if (canApproveAsManager && hasWarehouseAccess) {
                      return <ManagerApprovalForm
                        requestId={request.id}
                        items={items}
                        productUnitsMap={productUnitsMap}
                        isGeneralManager={user.role === "GENERAL_MANAGER" || user.role === "ADMIN"}
                        onSuccess={handleActionSuccess}
                      />
                    }
                  }
                  // CHO_TONG_QUAN_LY_DUYET: GM can only approve requests for warehouses they have access to
                  if (request.status === "CHO_TONG_QUAN_LY_DUYET") {
                    const canApproveAsGM = (user.role === "ADMIN" ||
                      (isGeneralManager(user) && canAccessWarehouse(user, request.to_warehouse_id)))

                    if (canApproveAsGM) {
                      return <GmApprovalView
                        requestId={request.id}
                        items={items}
                        productUnitsMap={productUnitsMap}
                        warehouseName={request.to_warehouse_name}
                        onSuccess={handleActionSuccess}
                      />
                    }
                  }
                  if (request.status === "DA_XUAT_KHO") { // For Receive
                    // Assuming current user is in TO warehouse?
                    // The API usually checks if user belongs to to_warehouse_id.
                    // Here we just show form, receiving endpoint validates permission.
                    return <ReceiveForm
                      requestId={request.id}
                      items={items}
                      productUnitsMap={productUnitsMap}
                      onSuccess={handleActionSuccess}
                    />
                  }
                  return null;
                })()}

                {/* Detail View - Only show when NOT in approval/action mode */}
                {(() => {
                  const { request } = selectedRequest;

                  // Check if user can approve CHO_QUAN_LY_DUYET for this warehouse
                  const canApproveAsManagerForThisRequest = (
                    isWarehouseManager(user) ||
                    user.role === "ADMIN" ||
                    user.role === "MANAGER" ||
                    (isGeneralManager(user) && canApproveOnBehalfOfWarehouseManager(user))
                  ) && canAccessWarehouse(user, request.to_warehouse_id)

                  // Check if user can approve CHO_TONG_QUAN_LY_DUYET for this warehouse
                  const canApproveAsGMForThisRequest = (
                    user.role === "ADMIN" ||
                    (isGeneralManager(user) && canAccessWarehouse(user, request.to_warehouse_id))
                  )

                  const isApprovalMode = (
                    (request.status === "CHO_QUAN_LY_DUYET" && canApproveAsManagerForThisRequest) ||
                    (request.status === "CHO_TONG_QUAN_LY_DUYET" && canApproveAsGMForThisRequest) ||
                    (request.status === "DA_XUAT_KHO")
                  );

                  if (!isApprovalMode) {
                    return (
                      <RequestDetailView
                        request={selectedRequest.request}
                        items={selectedRequest.items}
                        userRole={user.role}
                      />
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div className="text-center p-8 text-muted-foreground">Không có dữ liệu</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
