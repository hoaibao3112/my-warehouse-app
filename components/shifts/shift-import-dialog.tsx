"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileWarning,
  XCircle,
  Info
} from "lucide-react"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { format, addMonths, subMonths } from "date-fns"
import { vi } from "date-fns/locale"
import * as XLSX from "xlsx"
import { mobileFetch } from "@/lib/mobile/api-client"

interface ShiftImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId: string
  onSuccess: () => void
}

interface ImportResult {
  success: number
  skipped: number
  skippedDetails?: { row: number; reason: string }[]
  errors: { row: number; reason: string }[]
}

export function ShiftImportDialog({
  open,
  onOpenChange,
  warehouseId,
  onSuccess
}: ShiftImportDialogProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload')
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

  // Generate month options (6 months before and after)
  const monthOptions = Array.from({ length: 13 }, (_, i) => {
    const date = addMonths(subMonths(new Date(), 6), i)
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: vi })
    }
  })

  const resetState = () => {
    setSelectedFile(null)
    setPreviewData([])
    setImportResult(null)
    setStep('upload')
  }

  const handleClose = () => {
    resetState()
    onOpenChange(false)
  }

  const handleDownloadTemplate = async (includeData: boolean = false) => {
    try {
      setDownloadingTemplate(true)

      const url = `/api/shifts/template?warehouseId=${warehouseId}&month=${selectedMonth}&includeData=${includeData}`
      const res = await mobileFetch(url)
      const json = await res.json()

      if (!json.success) {
        throw new Error(json.error || 'Lỗi tải template')
      }

      const { template, shifts, employees, columns, instructions, monthLabel } = json.data

      // Create workbook
      const wb = XLSX.utils.book_new()

      // Main sheet - Matrix template with proper headers
      // Build header row manually for proper day column names
      const headerRow: Record<string, string> = {}
      columns.forEach((col: { key: string; label: string }) => {
        headerRow[col.key] = col.label
      })

      // Create worksheet with template data
      const ws = XLSX.utils.json_to_sheet(template, {
        header: columns.map((c: { key: string }) => c.key)
      })

      // Set column widths
      const colWidths = columns.map((col: { width?: number }) => ({ wch: col.width || 8 }))
      ws['!cols'] = colWidths

      XLSX.utils.book_append_sheet(wb, ws, `Lịch ${monthLabel || selectedMonth}`)

      // Shifts reference sheet - always create
      const shiftData = shifts.length > 0
        ? shifts
        : [{ 'Mã ca': '(Chưa có ca)', 'Tên ca': 'Vui lòng tạo ca làm việc trước', 'Giờ bắt đầu': '', 'Giờ kết thúc': '', 'Trạng thái': '' }]
      const shiftWs = XLSX.utils.json_to_sheet(shiftData)
      shiftWs['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, shiftWs, 'Danh sách ca')

      // Employees reference sheet - always create
      const empData = employees.length > 0
        ? employees
        : [{ 'STT': 1, 'Họ tên': '(Chưa có nhân viên)', 'Email': 'Vui lòng thêm nhân viên vào kho', 'Chức vụ': '' }]
      const empWs = XLSX.utils.json_to_sheet(empData)
      empWs['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 30 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, empWs, 'Danh sách NV')

      // Instructions sheet
      const instructionsData = instructions.map((text: string, i: number) => ({
        'STT': i + 1,
        'Hướng dẫn': text
      }))
      const instructWs = XLSX.utils.json_to_sheet(instructionsData)
      instructWs['!cols'] = [{ wch: 5 }, { wch: 80 }]
      XLSX.utils.book_append_sheet(wb, instructWs, 'Hướng dẫn')

      // Download
      const fileName = includeData
        ? `xep-ca-${selectedMonth}.xlsx`
        : `template-xep-ca-${selectedMonth}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast.success(includeData
        ? "Đã tải file lịch làm việc hiện tại"
        : "Đã tải file template xếp ca")

    } catch (error) {
      console.error('Error downloading template:', error)
      toast.error((error as Error).message || "Không thể tải template")
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ]
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const hasValidExtension = validExtensions.some(ext =>
      file.name.toLowerCase().endsWith(ext)
    )

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      toast.error("Vui lòng chọn file Excel (.xlsx, .xls) hoặc CSV")
      return
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File không được vượt quá 5MB")
      return
    }

    setSelectedFile(file)

    try {
      // Read and parse file
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)

      // Get first sheet
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        toast.error("File không có dữ liệu để import")
        return
      }

      // Preview first 10 rows
      setPreviewData(jsonData.slice(0, 10))
      setStep('preview')

    } catch (error) {
      console.error('Error reading file:', error)
      toast.error("Không thể đọc file, vui lòng kiểm tra định dạng")
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    try {
      setLoading(true)

      // Read full file
      const data = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      // Parse month/year from selectedMonth (yyyy-MM format)
      const [year, month] = selectedMonth.split('-').map(Number)

      // Call import API with month/year for matrix format
      const res = await mobileFetch('/api/shifts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          data: jsonData,
          month,
          year
        })
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        if (json.details) {
          setImportResult(json.details)
          setStep('result')
        }
        throw new Error(json.error || 'Lỗi import')
      }

      setImportResult(json.details)
      setStep('result')

      if (json.details.success > 0) {
        toast.success(json.message || "Import thành công")
        onSuccess()
      }

    } catch (error) {
      console.error('Error importing:', error)
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Content based on step
  const renderContent = () => {
    switch (step) {
      case 'upload':
        return (
          <div className="space-y-4">
            {/* Month selector */}
            <div className="space-y-2">
              <Label>Tháng áp dụng</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Download template buttons */}
            <div className="space-y-2">
              <Label>Bước 1: Tải template</Label>
              <div className={cn(
                "flex gap-2",
                isMobile ? "flex-col" : "flex-row"
              )}>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleDownloadTemplate(false)}
                  disabled={downloadingTemplate}
                >
                  {downloadingTemplate ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Tải template trống
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleDownloadTemplate(true)}
                  disabled={downloadingTemplate}
                >
                  {downloadingTemplate ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                  )}
                  Tải có sẵn dữ liệu
                </Button>
              </div>
            </div>

            {/* Upload file */}
            <div className="space-y-2">
              <Label>Bước 2: Chọn file import</Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  "hover:border-primary hover:bg-primary/5",
                  selectedFile && "border-primary bg-primary/5"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Nhấn để chọn file hoặc kéo thả vào đây
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Hỗ trợ: Excel (.xlsx, .xls), CSV
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Instructions */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Hướng dẫn</AlertTitle>
              <AlertDescription className="text-xs mt-2 space-y-1">
                <p>• Mỗi hàng là 1 nhân viên, mỗi cột (D1, D2...) là ngày trong tháng</p>
                <p>• Điền mã ca (VD: S, C, D) vào ô tương ứng ngày làm việc</p>
                <p>• Để trống ô nếu nhân viên nghỉ ngày đó</p>
                <p>• Xem sheet "Danh sách ca" trong file template để biết mã ca</p>
              </AlertDescription>
            </Alert>
          </div>
        )

      case 'preview':
        return (
          <div className="space-y-4">
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>Xem trước dữ liệu</AlertTitle>
              <AlertDescription>
                Hiển thị 10 dòng đầu tiên. Tổng cộng: {previewData.length}+ dòng
              </AlertDescription>
            </Alert>

            {/* Horizontal scroll wrapper for wide table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: isMobile ? '250px' : '350px' }}>
                <table className="w-max text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted">
                      {previewData.length > 0 && Object.keys(previewData[0]).map(key => (
                        <th key={key} className="border p-2 text-left text-xs font-medium whitespace-nowrap bg-muted">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} className="hover:bg-muted/50">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="border p-2 text-xs whitespace-nowrap">
                            {String(val || '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      case 'result':
        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className={cn(
              "grid gap-3",
              isMobile ? "grid-cols-1" : "grid-cols-3"
            )}>
              <div className="border rounded-lg p-3 text-center">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold text-green-600">{importResult?.success || 0}</p>
                <p className="text-xs text-muted-foreground">Thành công</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <AlertCircle className="h-6 w-6 mx-auto mb-1 text-yellow-500" />
                <p className="text-2xl font-bold text-yellow-600">{importResult?.skipped || 0}</p>
                <p className="text-xs text-muted-foreground">Bỏ qua (đã tồn tại)</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <XCircle className="h-6 w-6 mx-auto mb-1 text-red-500" />
                <p className="text-2xl font-bold text-red-600">{importResult?.errors.length || 0}</p>
                <p className="text-xs text-muted-foreground">Lỗi</p>
              </div>
            </div>

            {/* Skipped details */}
            {importResult && importResult.skippedDetails && importResult.skippedDetails.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  Chi tiết bỏ qua ({importResult.skipped} ô)
                </Label>
                <ScrollArea className="h-[150px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {importResult.skippedDetails.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-yellow-50 dark:bg-yellow-950/30">
                        <Badge variant="outline" className="shrink-0 text-xs bg-yellow-100 dark:bg-yellow-900">
                          Dòng {item.row}
                        </Badge>
                        <span className="text-yellow-700 dark:text-yellow-300">{item.reason}</span>
                      </div>
                    ))}
                    {importResult.skipped > (importResult.skippedDetails?.length || 0) && (
                      <div className="text-xs text-muted-foreground text-center py-2">
                        ...và {importResult.skipped - importResult.skippedDetails.length} ô khác
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Error details */}
            {importResult && importResult.errors.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <FileWarning className="h-4 w-4 text-red-500" />
                  Chi tiết lỗi
                </Label>
                <ScrollArea className="h-[150px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-red-50 dark:bg-red-950">
                        <Badge variant="outline" className="shrink-0 text-xs">
                          Dòng {err.row}
                        </Badge>
                        <span className="text-red-700 dark:text-red-300">{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )
    }
  }

  // Render footer buttons based on step
  const renderFooter = () => {
    if (step === 'upload') {
      return null // No footer buttons needed for upload step
    }

    if (step === 'preview') {
      return (
        <div className={cn(
          "flex gap-2 pt-4 border-t",
          isMobile ? "flex-col" : "flex-row justify-end"
        )}>
          <Button
            variant="outline"
            onClick={() => setStep('upload')}
            className={cn(isMobile && "order-2")}
          >
            Quay lại
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading}
            className={cn(isMobile && "order-1")}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang import...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Xác nhận Import
              </>
            )}
          </Button>
        </div>
      )
    }

    if (step === 'result') {
      return (
        <div className="flex justify-center pt-4 border-t">
          <Button onClick={handleClose}>
            Đóng
          </Button>
        </div>
      )
    }

    return null
  }

  // Use Sheet for mobile, Dialog for desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import lịch làm việc
            </SheetTitle>
            <SheetDescription>
              {step === 'upload' && 'Tải template và import file Excel'}
              {step === 'preview' && 'Xem trước dữ liệu trước khi import'}
              {step === 'result' && 'Kết quả import'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto mt-4 pr-4">
            {renderContent()}
          </div>
          {renderFooter()}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import lịch làm việc
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Tải template và import file Excel xếp ca nhân viên'}
            {step === 'preview' && 'Xem trước dữ liệu trước khi import vào hệ thống'}
            {step === 'result' && 'Kết quả import lịch làm việc'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto pr-4">
          {renderContent()}
        </div>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  )
}
