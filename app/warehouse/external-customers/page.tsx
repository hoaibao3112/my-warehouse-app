"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Plus, Edit, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { ResponsiveTable } from "@/components/mobile/responsive-table"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
import { translateError } from "@/lib/error-translator"

export default function ExternalCustomersPage() {
    const [customers, setCustomers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [formData, setFormData] = useState({
        name: "",
        address: "",
        phone: "",
        notes: "",
    })

    useEffect(() => {
        loadCustomers()
    }, [])

    const loadCustomers = async () => {
        setLoading(true)
        try {
            const res = await mobileFetch(`/api/external-customers?pageSize=999&search=${searchQuery}`)
            const json = await res.json()
            if (json?.success) {
                setCustomers(json.data || [])
            }
        } catch (err: any) {
            toast.error("Lỗi tải danh sách khách hàng", { description: translateError(err) })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toast.error("Tên khách hàng là bắt buộc")
            return
        }

        setSaving(true)
        try {
            const url = editingId ? `/api/external-customers/${editingId}` : `/api/external-customers`
            const method = editingId ? "PUT" : "POST"

            const res = await mobileFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            })

            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi lưu khách hàng")
            }

            toast.success(editingId ? "Cập nhật thành công" : "Tạo khách hàng thành công")
            setDialogOpen(false)
            resetForm()
            loadCustomers()
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Bạn có chắc muốn xóa khách hàng này?")) return

        try {
            const res = await mobileFetch(`/api/external-customers/${id}`, { method: "DELETE" })
            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi xóa khách hàng")
            }

            toast.success("Đã xóa khách hàng")
            loadCustomers()
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        }
    }

    const openEdit = (customer: any) => {
        setEditingId(customer.id)
        setFormData({
            name: customer.name,
            address: customer.address || "",
            phone: customer.phone || "",
            notes: customer.notes || "",
        })
        setDialogOpen(true)
    }

    const openCreate = () => {
        resetForm()
        setDialogOpen(true)
    }

    const resetForm = () => {
        setEditingId(null)
        setFormData({ name: "", address: "", phone: "", notes: "" })
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Users}
                title="Khách Hàng Ngoài"
                subtitle="Quản lý khách hàng xuất bán hàng"
                gradient="blue"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold">Khách Hàng Ngoài</h1>
                    <p className="text-muted-foreground mt-1">
                        Quản lý danh sách khách hàng xuất bán hàng ra bên ngoài
                    </p>
                </div>

                {/* Search and Actions */}
                <div className="flex gap-2 flex-wrap">
                    <Input
                        placeholder="Tìm kiếm khách hàng..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadCustomers()}
                        className="flex-1 min-w-[200px]"
                    />
                    <Button onClick={loadCustomers} variant="outline">
                        Tìm
                    </Button>
                    <Button onClick={openCreate} className="gap-2">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Thêm Khách Hàng</span>
                        <span className="sm:hidden">Thêm</span>
                    </Button>
                </div>

                {/* Table */}
                <Card className="p-6">
                    <ResponsiveTable
                        data={customers}
                        columns={[
                            {
                                key: "name",
                                label: "Tên Khách Hàng",
                                render: (c) => <span className="font-medium">{c.name}</span>,
                                mobilePrimary: true,
                            },
                            {
                                key: "phone",
                                label: "Số Điện Thoại",
                                render: (c) => <span>{c.phone || "-"}</span>,
                                mobilePrimary: true,
                            },
                            {
                                key: "address",
                                label: "Địa Chỉ",
                                render: (c) => <span className="text-sm">{c.address || "-"}</span>,
                            },
                        ]}
                        actions={[
                            {
                                label: "Sửa",
                                icon: <Edit className="w-4 h-4" />,
                                onClick: (c) => openEdit(c),
                                variant: "ghost",
                            },
                            {
                                label: "Xóa",
                                icon: <Trash2 className="w-4 h-4" />,
                                onClick: (c) => handleDelete(c.id),
                                variant: "ghost",
                                className: "hover:bg-red-50 hover:text-red-600",
                            },
                        ]}
                        keyExtractor={(c) => c.id}
                        loading={loading}
                        emptyMessage="Chưa có khách hàng nào"
                        mobileCardTitle={(c) => c.name}
                        mobileCardMeta={(c) => [
                            c.phone && <span className="text-xs">SĐT: {c.phone}</span>,
                            c.address && <span className="text-xs">Địa chỉ: {c.address}</span>,
                        ]}
                    />
                </Card>

                {/* Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {editingId ? "Chỉnh Sửa Khách Hàng" : "Thêm Khách Hàng Mới"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 mt-4">
                            <div>
                                <Label htmlFor="name">Tên Khách Hàng *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Nhập tên khách hàng"
                                    disabled={saving}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="phone">Số Điện Thoại</Label>
                                <Input
                                    id="phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="Số điện thoại"
                                    disabled={saving}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="address">Địa Chỉ</Label>
                                <Input
                                    id="address"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Địa chỉ khách hàng"
                                    disabled={saving}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="notes">Ghi Chú</Label>
                                <Input
                                    id="notes"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Ghi chú"
                                    disabled={saving}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                                Hủy
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? "Đang lưu..." : editingId ? "Cập Nhật" : "Tạo Mới"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
