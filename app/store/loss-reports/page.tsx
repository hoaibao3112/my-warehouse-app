"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Plus, Eye, Trash2, Edit2, AlertTriangle } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import CreateLossReportDialog from "./components/create-loss-report-dialog"
import EditLossReportDialog from "./components/edit-loss-report-dialog"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function LossReportsPage() {
  const [lossReports, setLossReports] = useState<any[]>([])
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editReportId, setEditReportId] = useState<string>('')
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const me = await (await mobileFetch('/api/auth/me')).json()
        const whId = me?.data?.warehouseId
        if (whId) setWarehouseId(whId)
        const q = whId ? `?warehouseId=${encodeURIComponent(whId)}&page=1&pageSize=200` : `?page=1&pageSize=200`
        const res = await mobileFetch(`/api/inventory-loss-reports${q}`)
        const json = await res.json()
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
        if (!mounted) return
        setLossReports(json.data || [])
      } catch (err) {
        console.error('Failed to load loss reports', err)
        toast.error("Không thể tải danh sách báo cáo mất hàng")
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])


  const openDetail = async (report: any) => {
    setSelectedReport(report)
    setDetailLoading(true)
    try {
      const res = await mobileFetch(`/api/inventory-loss-reports/${report.id}`)
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
      setDetailData(json.data)
      setDetailOpen(true)
    } catch (err: any) {
      toast.error("Lỗi tải chi tiết", { description: err?.message })
    } finally {
      setDetailLoading(false)
    }
  }


  const handleDelete = async () => {
    if (!detailData) return
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa",
      description: "Bạn có chắc muốn xóa báo cáo này? Tồn kho sẽ được khôi phục.",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeleting(true)
        try {
          const res = await mobileFetch(`/api/inventory-loss-reports/${detailData.id}`, {
            method: "DELETE",
          })
          const json = await res.json()
          if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
          toast.success("Báo cáo đã xóa và tồn kho khôi phục")
          setDetailOpen(false)
          reloadList()
        } catch (err: any) {
          toast.error("Lỗi", { description: err?.message })
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  const reloadList = async () => {
    try {
      const q = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}&page=1&pageSize=200` : `?page=1&pageSize=200`
      const res = await mobileFetch(`/api/inventory-loss-reports${q}`)
      const json = await res.json()
      if (json?.success) setLossReports(json.data || [])
    } catch (err) {
      console.error('Failed to reload list', err)
      toast.error("Không thể cập nhật danh sách")
    }
  }

  const handleEdit = (report: any) => {
    setEditReportId(report.id)
    setEditDialogOpen(true)
  }

  const handleDeleteFromList = async (report: any) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa",
      description: "Bạn có chắc muốn xóa báo cáo này? Tồn kho sẽ được khôi phục.",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await mobileFetch(`/api/inventory-loss-reports/${report.id}`, {
            method: "DELETE",
          })
          const json = await res.json()
          if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed')
          toast.success("Báo cáo đã xóa và tồn kho khôi phục")
          reloadList()
        } catch (err: any) {
          toast.error("Lỗi xóa báo cáo", { description: err?.message })
        }
      }
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={AlertTriangle}
        title="Báo Cáo Mất Hàng"
        subtitle="Theo dõi hàng mất, hư hỏng"
      />

      <div className="p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="hidden md:block">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Báo Cáo Mất Hàng</h1>
            <p className="text-muted-foreground mt-2">Báo cáo và theo dõi hàng mất, hư hỏng hoặc hết hạn</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Báo Cáo Mất Hàng Mới
          </Button>
        </div>

        <Card className="p-4 md:p-6">
          <div className="mb-6 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm báo cáo mất hàng..." className="pl-10" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm md:text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 md:px-4 font-semibold text-foreground">Mã Phiếu</th>
                  <th className="text-left py-3 px-2 md:px-4 font-semibold text-foreground">Ngày Tạo</th>
                  <th className="text-center py-3 px-2 md:px-4 font-semibold text-foreground">Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {lossReports.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      Chưa có báo cáo mất hàng nào
                    </td>
                  </tr>
                ) : (
                  lossReports.map((report) => (
                    <tr key={report.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-2 md:px-4 font-medium text-foreground font-mono">
                        {report.report_number || report.number || report.id}
                      </td>
                      <td className="py-3 px-2 md:px-4 text-foreground">
                        {new Date(report.created_at ?? report.date).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-2 md:px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDetail(report)}
                            disabled={detailLoading}
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {/* <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(report)}
                            title="Chỉnh sửa"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button> */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteFromList(report)}
                            title="Xóa"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Detail Modal */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
              <DialogTitle>Chi Tiết Báo Cáo Mất Hàng</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4">
                {detailLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
                ) : detailData ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Số Báo Cáo</p>
                        <p className="text-base font-semibold">{detailData.report_number}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Ngày Báo Cáo</p>
                        <p className="text-base font-semibold">{new Date(detailData.created_at).toLocaleString('vi-VN')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Lý Do</p>
                        <p className="text-base font-semibold">{detailData.reason || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Cập Nhật Lần Cuối</p>
                        <p className="text-base font-semibold">{new Date(detailData.updated_at).toLocaleString('vi-VN')}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-4">Danh Sách Sản Phẩm Mất Hàng</h3>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted border-b">
                            <tr>
                              <th className="text-left py-2 px-3 font-semibold">Mã/Tên Sản Phẩm</th>
                              <th className="text-left py-2 px-3 font-semibold">Đơn Vị</th>
                              <th className="text-right py-2 px-3 font-semibold">Số Lượng</th>
                              <th className="text-right py-2 px-3 font-semibold">Giá Đơn Vị</th>
                              <th className="text-right py-2 px-3 font-semibold">Thành Tiền</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailData.items && detailData.items.length > 0 ? (
                              detailData.items.map((item: any) => (
                                <tr key={item.id} className="border-b hover:bg-muted/50">
                                  <td className="py-2 px-3">
                                    <div>
                                      <p className="font-mono text-xs">{item.product_code}</p>
                                      <p className="font-medium">{item.product_name}</p>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">{item.unit_name || item.unit_code || "-"}</td>
                                  <td className="py-2 px-3 text-right font-semibold">{item.quantity_lost}</td>
                                  <td className="py-2 px-3 text-right">{item.unit_price ? Number(item.unit_price).toLocaleString('vi-VN') : "0"} đ</td>
                                  <td className="py-2 px-3 text-right font-semibold">
                                    {item.unit_price ? (item.quantity_lost * Number(item.unit_price)).toLocaleString('vi-VN') : "0"} đ
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="py-4 px-3 text-center text-muted-foreground">
                                  Không có sản phẩm
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {detailData.items && detailData.items.length > 0 && (
                        <div className="mt-4 flex justify-end">
                          <div className="space-y-2">
                            <div className="flex gap-8">
                              <span className="font-semibold">Tổng Số Lượng:</span>
                              <span className="font-semibold text-lg">{detailData.totalQuantity}</span>
                            </div>
                            <div className="flex gap-8">
                              <span className="font-semibold">Tổng Tiền:</span>
                              <span className="font-semibold text-lg text-red-600">{Number(detailData.totalAmount).toLocaleString('vi-VN')} đ</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
              {detailData?.isLocked ? (
                <div className="flex-1 flex items-center text-amber-600 gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">{detailData.lockReason || "Đã chốt sổ kiểm kê"}</span>
                </div>
              ) : (
                <>
                  {/* <Button onClick={() => {
                    setDetailOpen(false)
                    handleEdit(detailData)
                  }} variant="outline" className="gap-2">
                    <Edit2 className="w-4 h-4" />
                    Chỉnh sửa
                  </Button> */}
                  <Button onClick={handleDelete} disabled={deleting || !detailData} variant="destructive" className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    Xóa
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Loss Report Dialog */}
        <CreateLossReportDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          warehouseId={warehouseId}
          onSuccess={reloadList}
        />

        {/* Edit Loss Report Dialog */}
        <EditLossReportDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          reportId={editReportId}
          warehouseId={warehouseId}
          onSuccess={reloadList}
        />

        {/* Confirm Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">{confirmDialog.description}</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Hủy</Button>
              <Button variant="destructive" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
