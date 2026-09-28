"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Printer, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"
import { translateError } from "@/lib/error-translator"
import { useRouter } from "next/navigation"
import { exportInvoiceToPDF, generatePDFFilename } from "@/lib/pdf-utils"
import { Capacitor } from "@capacitor/core"

export default function ExportDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter()
    const [exportData, setExportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)
    const [id, setId] = useState("")

    useEffect(() => {
        params.then((p) => {
            setId(p.id)
            loadExport(p.id)
        })
    }, [params])

    const loadExport = async (exportId: string) => {
        try {
            const res = await mobileFetch(`/api/external-sales-exports/${exportId}`)
            const json = await res.json()
            if (json?.success) {
                setExportData(json.data)
            } else {
                toast.error("Không tìm thấy phiếu xuất")
                router.back()
            }
        } catch (err: any) {
            toast.error("Lỗi tải dữ liệu", { description: translateError(err) })
        } finally {
            setLoading(false)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    const handleExportPDF = async () => {
        if (!exportData) return

        setExporting(true)
        try {
            const filename = generatePDFFilename(exportData.export_number)
            const result = await exportInvoiceToPDF(exportData, filename)

            if (result.method === "download") {
                toast.success("Đã tải xuống PDF thành công")
            } else if (result.method === "share") {
                toast.success("Đã mở chia sẻ PDF")
            }
        } catch (err: any) {
            console.error("PDF export error:", err)
            toast.error("Lỗi xuất PDF", { description: translateError(err) })
        } finally {
            setExporting(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm("Bạn có chắc muốn xóa phiếu này? Tồn kho sẽ được hoàn lại.")) return

        try {
            const res = await mobileFetch(`/api/external-sales-exports/${id}`, { method: "DELETE" })
            const json = await res.json()
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Lỗi xóa phiếu")
            }

            toast.success("Đã xóa phiếu và hoàn tồn kho")
            router.push("/warehouse/external-sales-exports")
        } catch (err: any) {
            toast.error("Lỗi", { description: translateError(err) })
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Đang tải...</div>
            </div>
        )
    }

    if (!exportData) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Không tìm thấy phiếu xuất</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header - Hidden when printing */}
            <div className="print:hidden p-4 md:p-8 border-b">
                <div className="flex items-center justify-between max-w-5xl mx-auto">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="sm" onClick={() => router.back()}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Quay Lại
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">Chi Tiết Phiếu Xuất</h1>
                            <p className="text-sm text-muted-foreground">{exportData.export_number}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {exportData.status !== "DELETED" && (
                            <Button variant="outline" onClick={handleDelete} className="text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Xóa Phiếu
                            </Button>
                        )}
                        {Capacitor.isNativePlatform() ? (
                            <Button onClick={handleExportPDF} disabled={exporting}>
                                <Printer className="w-4 h-4 mr-2" />
                                {exporting ? "Đang xử lý..." : "In Phiếu"}
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" onClick={handlePrint}>
                                    <Printer className="w-4 h-4 mr-2" />
                                    In (Browser)
                                </Button>
                                <Button onClick={handleExportPDF} disabled={exporting}>
                                    <Printer className="w-4 h-4 mr-2" />
                                    {exporting ? "Đang tạo PDF..." : "Tải PDF"}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Print Content */}
            <div className="p-4 md:p-8 max-w-5xl mx-auto">
                <Card className="p-8 print:shadow-none print:border-none">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold uppercase">Phiếu Xuất Bán Hàng</h2>
                        <p className="text-lg font-mono mt-2">{exportData.export_number}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Ngày: {new Date(exportData.created_at).toLocaleDateString("vi-VN")}
                        </p>
                    </div>

                    {/* Sender & Recipient */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <h3 className="font-semibold text-lg mb-3">Bên Gửi (Kho)</h3>
                            <div className="space-y-1 text-sm">
                                <p>
                                    <span className="font-medium">Tên kho:</span> {exportData.warehouse?.name}
                                </p>
                                <p>
                                    <span className="font-medium">Mã kho:</span> {exportData.warehouse?.code}
                                </p>
                                {exportData.warehouse?.location && (
                                    <p>
                                        <span className="font-medium">Địa chỉ:</span> {exportData.warehouse.location}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-3">Bên Nhận (Khách Hàng)</h3>
                            <div className="space-y-1 text-sm">
                                <p>
                                    <span className="font-medium">Tên khách hàng:</span> {exportData.customer?.name}
                                </p>
                                {exportData.customer?.phone && (
                                    <p>
                                        <span className="font-medium">Số điện thoại:</span> {exportData.customer.phone}
                                    </p>
                                )}
                                {exportData.customer?.address && (
                                    <p>
                                        <span className="font-medium">Địa chỉ:</span> {exportData.customer.address}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="mb-8">
                        <table className="w-full border-collapse border border-gray-300">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-300 px-4 py-2 text-left">STT</th>
                                    <th className="border border-gray-300 px-4 py-2 text-left">Mã SP</th>
                                    <th className="border border-gray-300 px-4 py-2 text-left">Tên Sản Phẩm</th>
                                    <th className="border border-gray-300 px-4 py-2 text-center">Đơn Vị</th>
                                    <th className="border border-gray-300 px-4 py-2 text-right">Số Lượng</th>
                                    <th className="border border-gray-300 px-4 py-2 text-right">Đơn Giá</th>
                                    <th className="border border-gray-300 px-4 py-2 text-right">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exportData.items?.map((item: any, index: number) => (
                                    <tr key={item.id}>
                                        <td className="border border-gray-300 px-4 py-2 text-center">{index + 1}</td>
                                        <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                                            {item.product?.code}
                                        </td>
                                        <td className="border border-gray-300 px-4 py-2">{item.product?.name}</td>
                                        <td className="border border-gray-300 px-4 py-2 text-center">
                                            {item.unit?.name}
                                        </td>
                                        <td className="border border-gray-300 px-4 py-2 text-right">{item.quantity}</td>
                                        <td className="border border-gray-300 px-4 py-2 text-right">
                                            {Number(item.unit_price || 0).toLocaleString("vi-VN")} đ
                                        </td>
                                        <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                                            {Number(item.line_total || 0).toLocaleString("vi-VN")} đ
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 font-semibold">
                                    <td colSpan={6} className="border border-gray-300 px-4 py-3 text-right">
                                        Tổng Tiền:
                                    </td>
                                    <td className="border border-gray-300 px-4 py-3 text-right text-lg">
                                        {Number(exportData.total_amount || 0).toLocaleString("vi-VN")} đ
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Notes */}
                    {exportData.notes && (
                        <div className="mb-8">
                            <h3 className="font-semibold mb-2">Ghi Chú:</h3>
                            <p className="text-sm">{exportData.notes}</p>
                        </div>
                    )}

                    {/* Signatures */}
                    <div className="grid grid-cols-3 gap-8 mt-12 pt-8 border-t">
                        <div className="text-center">
                            <p className="font-semibold mb-12">Người Tạo Phiếu</p>
                            <p className="text-sm">{exportData.created_by_user?.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                                {new Date(exportData.created_at).toLocaleString("vi-VN")}
                            </p>
                        </div>

                        <div className="text-center">
                            <p className="font-semibold mb-12">Người Duyệt</p>
                            {exportData.approved_by_user ? (
                                <>
                                    <p className="text-sm">{exportData.approved_by_user.full_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(exportData.approved_at).toLocaleString("vi-VN")}
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">(Ký và ghi rõ họ tên)</p>
                            )}
                        </div>

                        <div className="text-center">
                            <p className="font-semibold mb-12">Người Nhận</p>
                            <p className="text-sm text-muted-foreground">(Ký và ghi rõ họ tên)</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
