"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Eye, Hammer } from "lucide-react"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { useAuth } from "@/hooks/use-auth"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function ToolsTransfersPage() {
  const { user } = useAuth()
  const [transfers, setTransfers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null)
  const [warehousesMap, setWarehousesMap] = useState<Record<string, string>>({})
  const [usersMap, setUsersMap] = useState<Record<string, string>>({})
  const [storeWarehouses, setStoreWarehouses] = useState<any[]>([])
  const [selectedStoreWarehouse, setSelectedStoreWarehouse] = useState<string>("")
  const [toolsCategoryId, setToolsCategoryId] = useState<string>("")
  const [warehouseType, setWarehouseType] = useState<string>("")
  const [approvedMap, setApprovedMap] = useState<Record<string, number>>({})
  const [approvedUnitMap, setApprovedUnitMap] = useState<Record<string, string>>({})
  const [approving, setApproving] = useState(false)
  const [showSignature, setShowSignature] = useState(false)
  const [warehouseDiscount, setWarehouseDiscount] = useState<number>(0)
  const [searchTerm, setSearchTerm] = useState<string>("")

  // Get warehouse type for current user (affects page title)
  useEffect(() => {
    if ((user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "WAREHOUSE_MANAGER" || user?.role === "QuanLyKhoCon") && user?.warehouseId) {
      mobileFetch(`/api/warehouses/${user.warehouseId}`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          if (data.data?.type) {
            setWarehouseType(data.data.type)
          }
        })
        .catch(err => console.error('Failed to fetch warehouse type:', err))
    } else if ((user?.role === "ADMIN" || user?.role === "AdminKhoTong") && !user?.warehouseId) {
      // For ADMIN without warehouseId, default to MAIN
      setWarehouseType("MAIN")
    }
  }, [user?.role, user?.warehouseId])

  // Get tools category on mount
  useEffect(() => {
    const fetchToolsCategory = async () => {
      try {
        const res = await mobileFetch('/api/categories')
        const json = await res.json()
        if (json?.success && Array.isArray(json.data)) {
          const toolsCat = json.data.find((cat: any) =>
            cat.name?.toLowerCase().includes('công cụ') ||
            cat.name?.toLowerCase().includes('dụng cụ')
          )
          if (toolsCat) {
            setToolsCategoryId(toolsCat.id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch tools category:', err)
      }
    }
    fetchToolsCategory()
  }, [])

  // Memoized fetch function để auto-refresh
  const fetchTransfers = useCallback(async () => {
    if (!toolsCategoryId) return

    setError(null)
    try {
      // Use stock-transfer-requests API with tools category filter
      let url = `/api/stock-transfer-requests?page=1&pageSize=100&categoryId=${toolsCategoryId}`
      if (selectedStoreWarehouse) {
        url += `&toWarehouseId=${selectedStoreWarehouse}`
      }
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch')
      setTransfers(json.data || [])
    } catch (err: any) {
      setError(err?.message || String(err))
    }
  }, [selectedStoreWarehouse, toolsCategoryId])

  // Load transfers on mount and when filter changes
  useEffect(() => {
    if (!toolsCategoryId) return
    setLoading(true)
    fetchTransfers().finally(() => setLoading(false))
  }, [fetchTransfers, toolsCategoryId])

  // Auto-refresh transfers mỗi 30 giây (adaptive: tăng dần lên 2 phút nếu không có thay đổi)
  useAutoRefresh(fetchTransfers, 30000)

  // Load lookup data (warehouses, users)
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const whRes = await mobileFetch(`/api/warehouses?page=1&pageSize=200`)
        const whJson = await whRes.json()
        if (whJson?.success && Array.isArray(whJson.data)) {
          const map: Record<string, string> = {}
          const stores: any[] = []
          for (const w of whJson.data) {
            map[w.id] = w.name || w.code || w.id
            // Collect store warehouses (not MAIN)
            if (w.type !== 'MAIN') {
              stores.push(w)
            }
          }
          setWarehousesMap(map)
          setStoreWarehouses(stores)
        }

        const uRes = await mobileFetch(`/api/users?page=1&pageSize=200`)
        const uJson = await uRes.json()
        if (uJson?.success && Array.isArray(uJson.data)) {
          const um: Record<string, string> = {}
          for (const u of uJson.data) um[u.id] = u.name || u.email || u.id
          setUsersMap(um)
        }
      } catch (e) {
        console.error('Failed to fetch lookups:', e)
      }
    }

    fetchLookups()
  }, [])

  const formatDate = (value: any) => {
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return "-"
      return d.toLocaleString("vi-VN")
    } catch {
      return "-"
    }
  }

  // Filter transfers by search term
  const filteredTransfers = transfers.filter((t) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      t.transfer_number?.toLowerCase().includes(searchLower) ||
      (t.itemsList && t.itemsList.some((item: any) =>
        item.product_name?.toLowerCase().includes(searchLower) ||
        item.product_code?.toLowerCase().includes(searchLower)
      ))
    )
  })

  const handleApprove = async () => {
    if (!selectedTransfer) return

    try {
      setApproving(true)

      // Prepare approved items
      const approvedItems = (selectedTransfer.itemsList || []).map((item: any) => ({
        id: item.id,
        approvedQuantity: approvedMap[item.id] ?? item.received_quantity ?? Number(item.quantity ?? 0),
        approvedUnitId: approvedUnitMap[item.id] ?? item.approved_unit_id ?? item.unit_id,
      }))

      const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedItems }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to approve')

      toast.success('Đã phê duyệt yêu cầu chuyển công cụ')
      setViewOpen(false)
      setSelectedTransfer(null)
      fetchTransfers()
    } catch (err: any) {
      toast.error(err?.message || 'Không thể phê duyệt')
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!selectedTransfer) return

    try {
      setApproving(true)
      const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejected: true, rejectionReason: 'Từ chối phê duyệt' }),
      })

      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to reject')

      toast.success('Đã từ chối yêu cầu chuyển công cụ')
      setViewOpen(false)
      setSelectedTransfer(null)
      fetchTransfers()
    } catch (err: any) {
      toast.error(err?.message || 'Không thể từ chối')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Hammer}
        title={warehouseType === "MAIN" ? "Xuất Công Cụ" : "Nhập Công Cụ"}
        subtitle="Quản lý công cụ dụng cụ"
      />

      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">
            {warehouseType === "MAIN" ? "Xuất Công Cụ" : "Nhập Công Cụ"}
          </h1>
          <p className="text-muted-foreground mt-2">Quản lý yêu cầu {warehouseType === "MAIN" ? "xuất" : "nhập"} công cụ dụng cụ từ các cửa hàng</p>
        </div>

        {!toolsCategoryId && (
          <Card className="p-6 bg-yellow-50 border-yellow-200">
            <p className="text-sm text-yellow-800">Chưa tìm thấy danh mục Công Cụ Dụng Cụ. Vui lòng tạo danh mục trước.</p>
          </Card>
        )}

        {toolsCategoryId && (
          <Card className="p-6">
            <div className="mb-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Chọn Cửa Hàng</label>
                <Select value={selectedStoreWarehouse || ""} onValueChange={setSelectedStoreWarehouse}>
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Tất cả cửa hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeWarehouses.length > 0 ? (
                      storeWarehouses.map((wh) => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-warehouse" disabled>
                        Không có cửa hàng nào
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-4 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm kiếm mã yêu cầu hoặc tên công cụ..."
                    className="pl-10"
                  />
                </div>
                <Button variant="ghost" onClick={() => setSearchTerm('')}>Xóa</Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải yêu cầu chuyển công cụ...</p>}
              {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}
              {!loading && !error && filteredTransfers.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Không có yêu cầu chuyển công cụ</p>
              )}
              {filteredTransfers.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Mã Yêu Cầu</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Từ Kho</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Đến Kho</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Người Yêu Cầu</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày Yêu Cầu</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransfers.map((transfer) => (
                      <tr key={transfer.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium text-foreground">{transfer.transfer_number}</td>
                        <td className="py-3 px-4 text-foreground">{warehousesMap[transfer.from_warehouse_id] || transfer.from_warehouse_id}</td>
                        <td className="py-3 px-4 text-foreground">{warehousesMap[transfer.to_warehouse_id] || transfer.to_warehouse_id}</td>
                        <td className="py-3 px-4 text-foreground">{usersMap[transfer.requested_by] || transfer.requested_by}</td>
                        <td className="py-3 px-4">
                          <Badge className={getStatusColor(transfer.status)}>
                            {getStatusLabel(transfer.status)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm">{formatDate(transfer.created_at)}</td>
                        <td className="py-3 px-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={async () => {
                              try {
                                setViewOpen(true)
                                const res = await mobileFetch(`/api/stock-transfer-requests/${transfer.id}`)
                                const json = await res.json()
                                const data = json?.data || transfer
                                // Ensure itemsList is set properly
                                if (data && !data.itemsList && data.items) {
                                  data.itemsList = data.items
                                }
                                setSelectedTransfer(data)
                                // Initialize approved map: if already approved, use received_quantity; otherwise use requested quantity
                                const map: Record<string, number> = {}
                                const items = data.itemsList || data.items || []
                                for (const it of items) {
                                  // If status is CHO_DUYET (pending), default to requested quantity
                                  // Otherwise, use received_quantity (already approved)
                                  if (data.status === TRANSFER_STATUS.CHO_DUYET) {
                                    map[it.id] = Number(it.quantity ?? it.requested_quantity ?? 0)
                                  } else {
                                    map[it.id] = Number(it.received_quantity ?? 0)
                                  }
                                }
                                setApprovedMap(map)

                                // Fetch receiving warehouse discount if status is completed
                                if (data.status === 'HOAN_THANH' || data.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                  try {
                                    const whRes = await mobileFetch(`/api/warehouses/${data.to_warehouse_id}`)
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
                                setSelectedTransfer(transfer)
                              }
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        )}

        {/* Detail Dialog */}
        <Dialog open={viewOpen} onOpenChange={(open) => {
          if (!open) {
            setSelectedTransfer(null)
            setApprovedMap({})
            setApprovedUnitMap({})
          }
          setViewOpen(open)
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Chi tiết Yêu Cầu Chuyển Công Cụ</DialogTitle>
              <DialogDescription>Xem và quản lý yêu cầu chuyển công cụ dụng cụ</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
              {selectedTransfer && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 border-b pb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Mã Yêu Cầu</p>
                      <p className="font-semibold">{selectedTransfer.transfer_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Trạng Thái</p>
                      <Badge className={getStatusColor(selectedTransfer.status)}>
                        {getStatusLabel(selectedTransfer.status)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Từ Kho</p>
                      <p className="font-semibold">{warehousesMap[selectedTransfer.from_warehouse_id]}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Đến Kho</p>
                      <p className="font-semibold">{warehousesMap[selectedTransfer.to_warehouse_id]}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Người Yêu Cầu</p>
                      <p className="font-semibold">{usersMap[selectedTransfer.requested_by]}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ngày Yêu Cầu</p>
                      <p className="font-semibold">{formatDate(selectedTransfer.created_at)}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">Chi tiết Công Cụ</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Sản phẩm</th>
                            <th className="text-center py-2 px-3 font-medium">Yêu cầu</th>
                            <th className="text-center py-2 px-3 font-medium">Tồn kho cửa hàng</th>
                            <th className="text-center py-2 px-3 font-medium">Tồn kho Kho Tổng</th>
                            <th className="text-right py-2 px-3 font-medium">Đơn giá</th>
                            {(selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) && (
                              <>
                                <th className="text-center py-2 px-3 font-medium">{selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET ? 'Duyệt (Kho Tổng)' : 'Duyệt (Kho Tổng)'}</th>
                                <th className="text-center py-2 px-3 font-medium">Đơn vị duyệt</th>
                              </>
                            )}
                            {selectedTransfer.status !== TRANSFER_STATUS.CHO_DUYET && selectedTransfer.status !== TRANSFER_STATUS.DA_DUYET && (
                              <>
                                <th className="text-center py-2 px-3 font-medium">Số duyệt</th>
                                <th className="text-center py-2 px-3 font-medium">Đơn vị</th>
                                <th className="text-center py-2 px-3 font-medium">Kho con nhập nhận</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedTransfer.itemsList || selectedTransfer.items || []).map((item: any) => {
                            const price = Number(item.price ?? item.product_price ?? 0)
                            // Status-aware logic similar to transfers page
                            const requestedQty = selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET
                              ? (item.quantity ?? item.requested_quantity ?? item.qty)
                              : (item.received_quantity ?? item.quantity ?? item.requested_quantity ?? item.qty)

                            return (
                              <tr key={item.id} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-3">{item.product_name ?? item.productName ?? item.productId}</td>
                                <td className="py-2 px-3 text-center">
                                  <div className="font-semibold">{requestedQty}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.unit_code ?? item.unit_name ?? '-'}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span className={item.store_stock <= 0 ? "text-red-600 font-semibold" : "text-foreground"}>
                                    {item.store_stock ?? 0}
                                  </span>
                                  <div className="text-xs text-muted-foreground">{item.default_unit_code ?? '-'}</div>
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span className={item.main_stock <= 0 ? "text-red-600 font-semibold" : "text-foreground"}>
                                    {item.main_stock ?? 0}
                                  </span>
                                  <div className="text-xs text-muted-foreground">{item.default_unit_code ?? '-'}</div>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="font-semibold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)}</div>
                                </td>
                                {(selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) && (
                                  <>
                                    <td className="py-2 px-3 text-center">
                                      <div>
                                        <input
                                          type="number"
                                          min={0}
                                          max={Number(item.convertedQuantity ?? item.quantity ?? item.requested_quantity ?? item.qty) || undefined}
                                          value={approvedMap[item.id] ?? (item.admin_approved_quantity ?? item.received_quantity ?? 0)}
                                          onChange={(e) => setApprovedMap((m) => ({ ...m, [item.id]: Number(e.target.value) }))}
                                          className="border px-2 py-1 rounded w-28"
                                        />
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <select
                                        value={approvedUnitMap[item.id] ?? (item.unit_code ?? item.unit_name ?? '')}
                                        onChange={(e) => setApprovedUnitMap((m) => ({ ...m, [item.id]: e.target.value }))}
                                        className="border px-2 py-1 rounded text-sm"
                                      >
                                        <option value={item.unit_code ?? item.unit_name ?? ''}>{item.unit_code ?? item.unit_name ?? 'N/A'}</option>
                                        {item.convertedQuantity !== undefined && item.default_unit_code && (
                                          <option value={item.default_unit_code}>{item.default_unit_code}</option>
                                        )}
                                      </select>
                                    </td>
                                  </>
                                )}
                                {selectedTransfer.status !== TRANSFER_STATUS.CHO_DUYET && selectedTransfer.status !== TRANSFER_STATUS.DA_DUYET && (
                                  <>
                                    <td className="py-2 px-3 text-center font-semibold">{item.admin_approved_quantity ?? item.received_quantity ?? 0}</td>
                                    <td className="py-2 px-3 text-center text-sm">{item.approved_unit_code ?? item.unit_code ?? item.unit_name ?? '-'}</td>
                                    <td className="py-2 px-3 text-center">
                                      {selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO
                                        ? 'Đang nhập...'
                                        : (item.actual_received_quantity ?? '-')}
                                    </td>
                                  </>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Total section */}
                    {(selectedTransfer.itemsList || selectedTransfer.items || []).length > 0 && (
                      <div className="flex justify-end mt-4 pt-4 border-t">
                        {selectedTransfer.status === 'HOAN_THANH' && warehouseDiscount > 0 ? (
                          <div className="text-right space-y-2">
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">Tổng tiền gốc:</div>
                              <div className="text-lg font-semibold text-foreground">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                  (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                    const price = Number(item.price ?? item.product_price ?? 0)
                                    const displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                    return sum + (displayQty * price)
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
                                    return sum + (displayQty * price)
                                  }, 0)) * (warehouseDiscount / 100)
                                )}
                              </div>
                            </div>
                            <div className="pt-2 border-t">
                              <div className="text-sm text-green-600 mb-1">Thành tiền:</div>
                              <div className="text-2xl font-bold text-green-600">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                  (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                    const price = Number(item.price ?? item.product_price ?? 0)
                                    let displayQty = 0

                                    if (selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) {
                                      displayQty = approvedMap[item.id] ?? (item.admin_approved_quantity ?? item.received_quantity ?? Number(item.quantity ?? item.requested_quantity ?? 0))
                                    } else if (selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                      displayQty = Number(item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                    } else {
                                      displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                    }

                                    return sum + (displayQty * price)
                                  }, 0) * (1 - warehouseDiscount / 100)
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground mb-1">Tổng tiền:</div>
                            <div className="text-2xl font-bold text-primary">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                (selectedTransfer.itemsList || selectedTransfer.items || []).reduce((sum: number, item: any) => {
                                  const price = Number(item.price ?? item.product_price ?? 0)
                                  let displayQty = 0

                                  if (selectedTransfer.status === TRANSFER_STATUS.CHO_DUYET || selectedTransfer.status === TRANSFER_STATUS.DA_DUYET) {
                                    displayQty = approvedMap[item.id] ?? (item.admin_approved_quantity ?? item.received_quantity ?? Number(item.quantity ?? item.requested_quantity ?? 0))
                                  } else if (selectedTransfer.status === TRANSFER_STATUS.DA_XUAT_KHO) {
                                    displayQty = Number(item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                  } else {
                                    displayQty = Number(item.actual_received_quantity ?? item.admin_approved_quantity ?? item.received_quantity ?? item.quantity ?? item.requested_quantity ?? 0)
                                  }

                                  return sum + (displayQty * price)
                                }, 0)
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div></div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setViewOpen(false)}>Đóng</Button>
              {selectedTransfer?.status === TRANSFER_STATUS.CHO_DUYET && (
                <>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const reason = prompt('Lý do từ chối (bắt buộc để từ chối)')
                      if (!reason || reason.trim().length === 0) {
                        toast.error('Lý do từ chối là bắt buộc')
                        return
                      }
                      try {
                        setApproving(true)
                        const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ rejectionReason: reason }),
                        })
                        const json = await res.json()
                        if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi từ chối')
                        toast.success('Đã từ chối')
                        setViewOpen(false)
                        fetchTransfers()
                      } catch (err: any) {
                        toast.error(err?.message || String(err))
                      } finally {
                        setApproving(false)
                      }
                    }}
                    disabled={approving}
                  >
                    {approving ? 'Đang xử lý...' : 'Từ Chối'}
                  </Button>
                  <Button
                    onClick={async () => {
                      // Validate approved quantities
                      const items = (selectedTransfer.itemsList || selectedTransfer.items || [])
                      const payloadItems: any[] = []
                      for (const it of items) {
                        const approved = Number(approvedMap[it.id] ?? 0)
                        const maxAllowed = Number(it.convertedQuantity ?? it.quantity ?? it.requested_quantity ?? it.qty) || 0
                        if (approved < 0 || approved > maxAllowed) {
                          toast.error(`Số lượng phê duyệt cho ${it.product_name || it.productId} không hợp lệ`)
                          return
                        }
                        payloadItems.push({
                          itemId: it.id,
                          approvedQuantity: approved,
                          approvedUnitCode: approvedUnitMap[it.id] ?? (it.unit_code ?? it.unit_name ?? '')
                        })
                      }

                      try {
                        setApproving(true)
                        const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ items: payloadItems }),
                        })
                        const json = await res.json()
                        if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi duyệt')
                        toast.success('Đã duyệt yêu cầu')
                        setViewOpen(false)
                        fetchTransfers()
                      } catch (err: any) {
                        toast.error(err?.message || String(err))
                      } finally {
                        setApproving(false)
                      }
                    }}
                    disabled={approving}
                  >
                    {approving ? 'Đang xử lý...' : 'Duyệt'}
                  </Button>
                </>
              )}
              {selectedTransfer?.status === TRANSFER_STATUS.DA_DUYET && (
                <Button
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={async () => {
                    // Validate approved quantities
                    const items = (selectedTransfer.itemsList || selectedTransfer.items || [])
                    const payloadItems: any[] = []
                    for (const it of items) {
                      const approved = Number(approvedMap[it.id] ?? (it.received_quantity ?? 0))
                      const maxAllowed = Number(it.convertedQuantity ?? it.quantity ?? it.requested_quantity ?? it.qty) || 0
                      if (approved < 0 || approved > maxAllowed) {
                        toast.error(`Số lượng phê duyệt cho ${it.product_name || it.productId} không hợp lệ`)
                        return
                      }
                      payloadItems.push({
                        itemId: it.id,
                        approvedQuantity: approved,
                        approvedUnitCode: approvedUnitMap[it.id] ?? (it.unit_code ?? it.unit_name ?? '')
                      })
                    }

                    try {
                      setApproving(true)
                      const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/approve`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: payloadItems }),
                      })
                      const json = await res.json()
                      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi duyệt')
                      toast.success('Đã duyệt và xuất kho')
                      setViewOpen(false)
                      fetchTransfers()
                    } catch (err: any) {
                      toast.error(err?.message || String(err))
                    } finally {
                      setApproving(false)
                    }
                  }}
                  disabled={approving}
                >
                  {approving ? 'Đang duyệt...' : 'Duyệt & Xuất Kho'}
                </Button>
              )}
              {selectedTransfer?.status === 'HOAN_THANH' && (
                <Button
                  variant="default"
                  onClick={() => {
                    window.open(`/api/stock-transfer-requests/${selectedTransfer.id}/pdf`, '_blank')
                  }}
                >
                  Tải Báo Cáo
                </Button>
              )}
              {selectedTransfer?.status === TRANSFER_STATUS.CHO_ADMIN_XAC_NHAN && (
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    setApproving(true)
                    try {
                      const res = await mobileFetch(`/api/stock-transfer-requests/${selectedTransfer.id}/admin-confirm-shortage`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'CONFIRM' }),
                      })
                      const json = await res.json()
                      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lỗi xác nhận')
                      toast.success('Đã xác nhận và hoàn thành yêu cầu')
                      setViewOpen(false)
                      fetchTransfers()
                    } catch (err: any) {
                      toast.error(err?.message || String(err))
                    } finally {
                      setApproving(false)
                    }
                  }}
                  disabled={approving}
                >
                  {approving ? 'Đang xác nhận...' : 'Xác Nhận'}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
