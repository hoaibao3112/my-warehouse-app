"use client"

import { mobileFetch } from "@/lib/mobile/api-client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Trash2, Eye, ClipboardList } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { getStatusLabel, getStatusColor, TRANSFER_STATUS } from "@/lib/transfer-status"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

export default function StockTransferRequestsPage() {
    const router = useRouter()
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
    const { user } = useAuth()

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean
        title: string
        description: string
        onConfirm: () => void
    }>({ open: false, title: '', description: '', onConfirm: () => { } })

    const fetchRequests = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await mobileFetch(`/api/stock-transfer-requests?page=1&pageSize=100`)
            const json = await res.json()
            if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi tải dữ liệu")
            setRequests(json.data || [])
        } catch (err: any) {
            setError(err?.message || String(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchRequests()
    }, [])

    const handleDelete = async (requestId: string, status: string) => {
        if (status !== "CHO_DUYET") {
            toast.error("Chỉ có thể xóa yêu cầu ở trạng thái 'Chờ duyệt'")
            return
        }

        setConfirmDialog({
            open: true,
            title: "Xác nhận xóa yêu cầu",
            description: "Bạn có chắc muốn xóa yêu cầu này?",
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                setDeleteLoading(requestId)
                try {
                    const res = await mobileFetch(`/api/stock-transfer-requests/${requestId}`, {
                        method: "DELETE"
                    })

                    const json = await res.json()
                    if (!res.ok || !json?.success) throw new Error(json?.error || "Lỗi xóa yêu cầu")

                    toast.success("Đã xóa yêu cầu chuyển kho")
                    fetchRequests()
                } catch (err: any) {
                    toast.error(err?.message || "Không thể xóa yêu cầu")
                } finally {
                    setDeleteLoading(null)
                }
            }
        })
    }

    const statusMap: { [key: string]: { label: string; color: string } } = {
        CHO_DUYET: { label: "Chờ duyệt", color: "bg-yellow-100 text-yellow-800" },
        DA_DUYET: { label: "Đã duyệt", color: "bg-blue-100 text-blue-800" },
        DA_XUAT_KHO: { label: "Đã xuất kho", color: "bg-cyan-100 text-cyan-800" },
        KHO_TONG_DA_KY: { label: "Kho Tổng đã ký", color: "bg-purple-100 text-purple-800" },
        HOAN_THANH: { label: "Hoàn thành", color: "bg-green-100 text-green-800" },
        TU_CHOI: { label: "Từ chối", color: "bg-red-100 text-red-800" },
        HUY_BO: { label: "Hủy bỏ", color: "bg-gray-100 text-gray-800" },
    }

    const filteredRequests = requests.filter((r) =>
        r.request_number?.toLowerCase().includes(search.toLowerCase())
    )

    const formatDate = (value: any) => {
        try {
            const d = new Date(value)
            if (isNaN(d.getTime())) return "-"
            return d.toLocaleString("vi-VN")
        } catch {
            return "-"
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={ClipboardList}
                title="Nhập Hàng Nội Bộ"
                subtitle="Yêu cầu nhập hàng từ Kho Tổng"
            />

            <div className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="hidden md:block">
                        <h1 className="text-3xl font-bold text-foreground">Nhập Hàng Nội Bộ</h1>
                        <p className="text-muted-foreground mt-2">Yêu cầu nhập hàng từ Kho Tổng</p>
                    </div>
                    <Button onClick={() => router.push("/store/stock-transfer-requests/new")} className="gap-2 w-full md:w-auto">
                        <Plus className="w-4 h-4" />
                        Tạo Yêu Cầu Mới
                    </Button>
                </div>

                <Card className="p-6">
                    <div className="mb-6 flex gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm kiếm số yêu cầu..."
                                className="pl-10"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        {loading && <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>}
                        {error && <p className="p-4 text-sm text-destructive">Lỗi: {error}</p>}
                        {!loading && filteredRequests.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">Không có yêu cầu nào</p>
                        )}

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {filteredRequests.map((request) => (
                                <Card key={request.id} className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate">{request.transfer_number || request.request_number}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(request.created_at)}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={getStatusColor(request.status as any) || "bg-gray-100 text-gray-800"}>
                                                {getStatusLabel(request.status as any)}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => {
                                                window.location.href = `/store/stock-transfer-requests/${request.id}`
                                            }}
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            Chi tiết
                                        </Button>
                                        {request.status === TRANSFER_STATUS.CHO_DUYET && user && (user.id === (request.requested_by || request.requestedBy)) && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-red-600"
                                                onClick={() => handleDelete(request.id, request.status)}
                                                disabled={deleteLoading === request.id}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <table className="w-full hidden md:table">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Số Yêu Cầu</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Ngày Tạo</th>
                                    <th className="text-left py-3 px-4 font-semibold text-foreground">Hành Động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRequests.map((request) => (
                                    <tr key={request.id} className="border-b border-border hover:bg-muted/50">
                                        <td className="py-3 px-4 font-medium text-foreground">{request.transfer_number || request.request_number}</td>
                                        <td className="py-3 px-4">
                                            <Badge className={getStatusColor(request.status as any) || "bg-gray-100 text-gray-800"}>
                                                {getStatusLabel(request.status as any)}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-foreground">
                                            {formatDate(request.created_at)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        window.location.href = `/store/stock-transfer-requests/${request.id}`
                                                    }}
                                                    title="Xem chi tiết"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                {request.status === TRANSFER_STATUS.CHO_DUYET && user && (user.id === (request.requested_by || request.requestedBy)) && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => handleDelete(request.id, request.status)}
                                                        disabled={deleteLoading === request.id}
                                                        title="Xóa yêu cầu"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
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
