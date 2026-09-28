"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, RefreshCw, X, Download } from "lucide-react"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"

interface PreviewItem {
    row: number
    code: string
    name: string
    category: string
    unit: string
    price?: number
    status: 'new' | 'update' | 'error'
    message?: string
}

interface ImportSummary {
    total: number
    new: number
    update: number
    error: number
}

interface ProductImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'result'

export function ProductImportDialog({
    open,
    onOpenChange,
    onSuccess
}: ProductImportDialogProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [step, setStep] = useState<Step>('upload')
    const [loading, setLoading] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [previewData, setPreviewData] = useState<PreviewItem[]>([])
    const [summary, setSummary] = useState<ImportSummary | null>(null)
    const [importResult, setImportResult] = useState<any>(null)

    // Reset state when dialog closes
    const handleClose = () => {
        setStep('upload')
        setSelectedFile(null)
        setPreviewData([])
        setSummary(null)
        setImportResult(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        onOpenChange(false)
    }

    // Handle file selection and preview
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        const validExtensions = ['.xlsx', '.xls']
        const hasValidExtension = validExtensions.some(ext =>
            file.name.toLowerCase().endsWith(ext)
        )

        if (!hasValidExtension) {
            toast.error('Vui lòng chọn file Excel (.xlsx, .xls)')
            return
        }

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File không được vượt quá 5MB')
            return
        }

        setSelectedFile(file)
        setLoading(true)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await mobileFetch('/api/products/preview', {
                method: 'POST',
                body: formData
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to preview')
            }

            setPreviewData(data.data?.items || [])
            setSummary(data.data?.summary || null)
            setStep('preview')
        } catch (error) {
            console.error('Error reading file:', error)
            toast.error('Không thể đọc file, vui lòng kiểm tra định dạng')
            setSelectedFile(null)
        } finally {
            setLoading(false)
        }
    }

    // Handle import confirmation
    const handleImport = async () => {
        if (!selectedFile) return

        setStep('importing')
        setLoading(true)

        try {
            const formData = new FormData()
            formData.append('file', selectedFile)

            const response = await mobileFetch('/api/products/import', {
                method: 'POST',
                body: formData
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to import')
            }

            setImportResult(data.data)
            setStep('result')

            if (data.data?.created > 0 || data.data?.updated > 0) {
                toast.success(`Đã import ${data.data.created} mới, cập nhật ${data.data.updated}`)
                onSuccess()
            }
        } catch (error) {
            console.error('Error importing:', error)
            toast.error((error as Error).message || 'Lỗi import')
            setStep('preview') // Go back to preview on error
        } finally {
            setLoading(false)
        }
    }

    // Download template
    const handleDownloadTemplate = async () => {
        try {
            // Create a simple template in browser
            const headers = ['Nhóm hàng', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Giá']
            const sampleData = [
                ['Đồ uống', 'DU001', 'Cà phê đen', 'Ly', '25000'],
                ['Đồ ăn', 'DA001', 'Bánh mì', 'Cái', '15000'],
            ]

            const csvContent = [
                headers.join(','),
                ...sampleData.map(row => row.join(','))
            ].join('\n')

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'products-import-template.csv'
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error('Không thể tải template')
        }
    }

    // Get status badge
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'new':
                return <Badge className="bg-green-500/10 text-green-600 border-green-200">Thêm mới</Badge>
            case 'update':
                return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Ghi đè</Badge>
            case 'error':
                return <Badge variant="destructive">Lỗi</Badge>
            default:
                return null
        }
    }

    // Render content based on step
    const renderContent = () => {
        switch (step) {
            case 'upload':
                return (
                    <div className="space-y-4">
                        {/* Download template */}
                        <div className="space-y-2">
                            <Label>Bước 1: Tải template mẫu</Label>
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleDownloadTemplate}
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Tải Template CSV
                            </Button>
                        </div>

                        {/* Upload file */}
                        <div className="space-y-2">
                            <Label>Bước 2: Chọn file Excel</Label>
                            <div
                                className={cn(
                                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer",
                                    "hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                )}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                {loading ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        <p className="text-sm text-muted-foreground">Đang đọc file...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                                        <p className="text-sm text-muted-foreground">
                                            Click để chọn file Excel hoặc CSV
                                        </p>
                                        <p className="text-xs text-muted-foreground/60">
                                            Hỗ trợ: .xlsx, .xls, .csv (max 5MB)
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                            <p><strong>Lưu ý:</strong></p>
                            <ul className="list-disc list-inside space-y-0.5">
                                <li>File phải có các cột: Mã hàng, Tên hàng (bắt buộc)</li>
                                <li>Nếu mã sản phẩm đã tồn tại, thông tin sẽ được ghi đè</li>
                                <li>Nhóm hàng và đơn vị mới sẽ được tự động tạo</li>
                            </ul>
                        </div>
                    </div>
                )

            case 'preview':
                const validCount = previewData.filter(p => p.status !== 'error').length
                return (
                    <div className="space-y-4">
                        {/* Summary badges */}
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="gap-1">
                                Tổng: {summary?.total || 0}
                            </Badge>
                            {(summary?.new || 0) > 0 && (
                                <Badge className="bg-green-500/10 text-green-600 border-green-200 gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {summary?.new} mới
                                </Badge>
                            )}
                            {(summary?.update || 0) > 0 && (
                                <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200 gap-1">
                                    <RefreshCw className="w-3 h-3" />
                                    {summary?.update} ghi đè
                                </Badge>
                            )}
                            {(summary?.error || 0) > 0 && (
                                <Badge variant="destructive" className="gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    {summary?.error} lỗi
                                </Badge>
                            )}
                        </div>

                        {/* Preview table */}
                        <div className="border rounded-lg overflow-hidden">
                            <ScrollArea className={isMobile ? "h-[250px]" : "h-[350px]"}>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="w-12">#</TableHead>
                                            <TableHead>Mã</TableHead>
                                            <TableHead>Tên</TableHead>
                                            {!isMobile && <TableHead>Nhóm</TableHead>}
                                            <TableHead className="w-24">Trạng thái</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData.map((item, idx) => (
                                            <TableRow
                                                key={idx}
                                                className={cn(
                                                    item.status === 'error' && "bg-destructive/5",
                                                    item.status === 'update' && "bg-yellow-50 dark:bg-yellow-950/10"
                                                )}
                                            >
                                                <TableCell className="font-mono text-xs">{item.row}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="truncate max-w-[150px]" title={item.name}>
                                                    {item.name}
                                                </TableCell>
                                                {!isMobile && (
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {item.category || '-'}
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        {getStatusBadge(item.status)}
                                                        {item.message && item.status === 'update' && (
                                                            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                                                {item.message}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>

                        {/* Warning for updates */}
                        {(summary?.update || 0) > 0 && (
                            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded-lg p-3 text-sm">
                                <p className="text-yellow-800 dark:text-yellow-200">
                                    ⚠️ <strong>{summary?.update} sản phẩm</strong> sẽ được ghi đè do mã trùng.
                                </p>
                            </div>
                        )}
                    </div>
                )

            case 'importing':
                return (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">Đang import dữ liệu...</p>
                    </div>
                )

            case 'result':
                return (
                    <div className="flex flex-col items-center justify-center py-6 gap-4">
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                        <div className="text-center space-y-2">
                            <p className="font-semibold text-lg">Import hoàn tất!</p>
                            <div className="flex gap-3 justify-center">
                                {importResult?.created > 0 && (
                                    <Badge className="bg-green-500/10 text-green-600 border-green-200">
                                        {importResult.created} thêm mới
                                    </Badge>
                                )}
                                {importResult?.updated > 0 && (
                                    <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">
                                        {importResult.updated} cập nhật
                                    </Badge>
                                )}
                            </div>
                            {importResult?.errors?.length > 0 && (
                                <p className="text-sm text-destructive">
                                    {importResult.errors.length} dòng bị lỗi
                                </p>
                            )}
                        </div>
                    </div>
                )
        }
    }

    // Render footer based on step
    const renderFooter = () => {
        if (step === 'upload' || step === 'importing') return null

        if (step === 'preview') {
            const validCount = previewData.filter(p => p.status !== 'error').length
            return (
                <DialogFooter className={cn("gap-2", isMobile && "flex-col")}>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setStep('upload')
                            setSelectedFile(null)
                            if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                    >
                        <X className="h-4 w-4 mr-2" />
                        Chọn file khác
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={validCount === 0 || loading}
                        className="gap-2"
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Upload className="h-4 w-4" />
                        )}
                        Import {validCount} sản phẩm
                    </Button>
                </DialogFooter>
            )
        }

        if (step === 'result') {
            return (
                <DialogFooter>
                    <Button onClick={handleClose}>Đóng</Button>
                </DialogFooter>
            )
        }

        return null
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn("max-w-2xl", isMobile && "max-w-[95vw]")}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        Import Sản Phẩm
                    </DialogTitle>
                </DialogHeader>

                {renderContent()}
                {renderFooter()}
            </DialogContent>
        </Dialog>
    )
}
