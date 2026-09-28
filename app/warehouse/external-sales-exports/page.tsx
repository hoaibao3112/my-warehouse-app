"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Package, Plus, Eye, Trash2, Printer } from "lucide-react"
import { toast } from "sonner"
import { ResponsiveTable } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
import { translateError } from "@/lib/error-translator"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function ExternalSalesExportsPage() {
    const router = useRouter()
    const [exports, setExports] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [inventoryLocks, setInventoryLocks] = useState<Map<string, boolean>>(new Map())

    useEffect(() => {
        loadExports()
    }, [])

    const loadExports = async () => {
        setLoading(true)
        try {
            const res = await mobileFetch(`/api/external-sales-exports?pageSize=999`)
            const json = await res.json()
            if (json?.success) {
                const exportsData = json.data || []
                setExports(exportsData)

                // Check if each export can be deleted (check both IN_PROGRESS and COMPLETED inventory checks)
                const locks = new Map<string, boolean>()

                await Promise.all(exportsData.map(async (exportItem: any) => {
                    try {
                        // Check if this specific export can be deleted
                        const lockRes = await mobileFetch(`/api/external-sales-exports/${exportItem.id}/can-delete`)
                        const lockJson = await lockRes.json()
                        locks.set(exportItem.id, !(lockJson?.canDelete ?? true)) // If canDelete = false, then isLocked = true
                    } catch (err) {
                        console.error('Failed to check delete permission for export:', exportItem.id, err)
                        locks.set(exportItem.id, false) // Default allow delete if check fails
                    }
                }))

                setInventoryLocks(locks)
            }
        } catch (err: any) {
            toast.error("Lỗi tải danh sách phiếu xuất", { description: translateError(err) })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string, exportNumber: string) => {
        if (
            !confirm(
                `Bạn có chắc muốn xóa phiếu ${exportNumber}? Tồn kho sẽ được hoàn lại.`
            )
        )
            return

        try {
            const res = await mobileFetch(`/api/external-sales-exports/${id}`, {
                method: "DELETE",
            })
            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi xóa phiếu xuất")
            }

            toast.success("Đã xóa phiếu xuất và hoàn lại tồn kho")
            loadExports()
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        }
    }

    const getStatusBadge = (status: string) => {
        const config = {
            ACTIVE: { label: "Đang hoạt động", className: "bg-green-100 text-green-800" },
            DELETED: { label: "Đã xóa", className: "bg-red-100 text-red-800" },
        }
        const c = config[status as keyof typeof config] || config.ACTIVE
        return <Badge className={c.className}>{c.label}</Badge>
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Package}
                title="Xuất Bán Hàng"
                subtitle="Quản lý phiếu xuất bán hàng"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold">Phiếu Xuất Bán Hàng</h1>
                    <p className="text-muted-foreground mt-1">
                        Quản lý phiếu xuất bán hàng ra bên ngoài (không phải kho con)
                    </p>
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                    <Button onClick={() => router.push("/warehouse/external-sales-exports/create")} className="gap-2">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Tạo Phiếu Xuất</span>
                        <span className="sm:hidden">Tạo</span>
                    </Button>
                </div>

                {/* Table */}
                <Card className="p-6">
                    <ResponsiveTable
                        data={exports}
                        columns={[
                            {
                                key: "export_number",
                                label: "Số Phiếu",
                                render: (e) => <span className="font-mono font-medium">{e.export_number}</span>,
                                mobilePrimary: true,
                            },
                            {
                                key: "customer",
                                label: "Khách Hàng",
                                render: (e) => <span>{e.customer?.name || "-"}</span>,
                                mobilePrimary: true,
                            },
                            {
                                key: "warehouse",
                                label: "Kho",
                                render: (e) => <span>{e.warehouse?.name || "-"}</span>,
                            },
                            {
                                key: "total_amount",
                                label: "Tổng Tiền",
                                render: (e) => (
                                    <span className="font-semibold">
                                        {Number(e.total_amount || 0).toLocaleString("vi-VN")} đ
                                    </span>
                                ),
                            },
                            {
                                key: "created_at",
                                label: "Ngày Tạo",
                                render: (e) => (
                                    <span className="text-sm">
                                        {new Date(e.created_at).toLocaleString("vi-VN", {
                                            year: "numeric",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        })}
                                    </span>
                                ),
                            },
                        ]}
                        actions={[
                            {
                                label: "Xem",
                                icon: <Eye className="w-4 h-4" />,
                                onClick: (e) => router.push(`/warehouse/external-sales-exports/${e.id}`),
                                variant: "ghost",
                            },
                            {
                                label: "Xóa",
                                icon: <Trash2 className="w-4 h-4" />,
                                onClick: (e) => handleDelete(e.id, e.export_number),
                                variant: "ghost",
                                className: "hover:bg-red-50 hover:text-red-600",
                                show: (e: any) => {
                                    // Don't show delete button if:
                                    // 1. Export is already deleted
                                    // 2. Export is locked (covered by inventory check)
                                    if (e.status === "DELETED") return false
                                    const isLocked = inventoryLocks.get(e.id) || false
                                    return !isLocked
                                },
                            },
                        ]}
                        keyExtractor={(e) => e.id}
                        loading={loading}
                        emptyMessage="Chư có phiếu xuất nào"
                        mobileCardTitle={(e) => e.export_number}
                        mobileCardMeta={(e) => [
                            <span className="text-xs">Khách: {e.customer?.name}</span>,
                            <span className="text-xs">
                                {Number(e.total_amount || 0).toLocaleString("vi-VN")} đ
                            </span>,
                        ]}
                    />
                </Card>
            </div>
        </div>
    )
}
