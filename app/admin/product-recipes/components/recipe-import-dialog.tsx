"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
  Info,
  ChefHat
} from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"

interface RecipeImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface PreviewIngredient {
  code: string
  name: string
  quantity: string
  unit: string
  unitName: string
}

interface PreviewRecipe {
  rowNum: number
  code: string
  name: string
  price: string
  category: string
  categoryValid: boolean
  warehouses: string[]
  warehouseCount: number
  ingredients: PreviewIngredient[]
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface PreviewSummary {
  total: number
  valid: number
  invalid: number
  items: PreviewRecipe[]
}

interface ImportResult {
  imported: number
  importedNames: string[]
  errors: string[]
}

export function RecipeImportDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: RecipeImportDialogProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<PreviewRecipe[]>([])
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload')

  const resetState = () => {
    setSelectedFile(null)
    setPreviewData([])
    setPreviewSummary(null)
    setImportResult(null)
    setStep('upload')
  }

  const handleClose = () => {
    resetState()
    onOpenChange(false)
  }

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true)
      
      const response = await mobileFetch('/api/product-recipes/template', {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to download template')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'product-recipes-template.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success('Đã tải template thành công')
    } catch (error) {
      console.error('Error downloading template:', error)
      toast.error('Không thể tải template')
    } finally {
      setDownloadingTemplate(false)
    }
  }

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
    setPreviewLoading(true)

    try {
      // Call preview API to validate data against database
      const formData = new FormData()
      formData.append('file', file)

      const response = await mobileFetch('/api/product-recipes/preview', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to preview')
      }

      setPreviewSummary(data.data)
      setPreviewData(data.data.items)
      setStep('preview')

    } catch (error) {
      console.error('Error reading file:', error)
      toast.error('Không thể đọc file, vui lòng kiểm tra định dạng')
      setSelectedFile(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    try {
      setLoading(true)

      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await mobileFetch('/api/product-recipes/import', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import')
      }

      setImportResult(data.data)
      setStep('result')

      if (data.data?.imported > 0) {
        toast.success(`Đã import ${data.data.imported} công thức`)
        onSuccess()
      }

    } catch (error) {
      console.error('Error importing:', error)
      toast.error((error as Error).message || 'Lỗi import')
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
            {/* Download template */}
            <div className="space-y-2">
              <Label>Bước 1: Tải template</Label>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
              >
                {downloadingTemplate ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Tải template Excel
              </Button>
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
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {previewLoading ? (
                  <div className="space-y-2">
                    <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
                    <p className="font-medium">Đang kiểm tra dữ liệu...</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedFile?.name}
                    </p>
                  </div>
                ) : selectedFile ? (
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
                      Hỗ trợ: Excel (.xlsx, .xls)
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
                <p>• <strong>Tên công thức</strong>: Bắt buộc</p>
                <p>• <strong>Giá tiền, Nhóm hàng</strong>: Tùy chọn</p>
                <p>• <strong>Mã kho</strong>: Để trống = toàn hệ thống, nhiều kho phân cách bằng dấu phẩy</p>
                <p>• <strong>Nguyên liệu</strong>: Định dạng <code className="bg-muted px-1 rounded">MÃ_SP:SỐ_LƯỢNG:ĐƠN_VỊ;...</code></p>
              </AlertDescription>
            </Alert>
          </div>
        )

      case 'preview':
        const validCount = previewSummary?.valid || previewData.filter(p => p.valid).length
        const invalidCount = previewSummary?.invalid || previewData.filter(p => !p.valid).length
        const totalRecipes = previewData.reduce((sum, p) => sum + (p.valid ? p.warehouseCount : 0), 0)

        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                {previewData.length} dòng
              </Badge>
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="w-3 h-3" />
                {validCount} hợp lệ
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  {invalidCount} lỗi
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <ChefHat className="w-3 h-3" />
                Tạo {totalRecipes} công thức
              </Badge>
            </div>

            {/* Preview table */}
            <div className="border rounded-lg overflow-hidden">
              <ScrollArea className="h-[300px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted z-10">
                    <tr>
                      <th className="p-2 text-left font-medium border-b w-8">#</th>
                      <th className="p-2 text-left font-medium border-b">Mã món</th>
                      <th className="p-2 text-left font-medium border-b">Tên công thức</th>
                      <th className="p-2 text-left font-medium border-b">Giá</th>
                      <th className="p-2 text-left font-medium border-b">Kho</th>
                      <th className="p-2 text-left font-medium border-b">Nguyên liệu</th>
                      <th className="p-2 text-center font-medium border-b w-20">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((recipe, idx) => (
                      <tr 
                        key={idx} 
                        className={cn(
                          "hover:bg-muted/50",
                          !recipe.valid && "bg-red-50 dark:bg-red-950/20",
                          recipe.warnings?.length > 0 && recipe.valid && "bg-yellow-50 dark:bg-yellow-950/20"
                        )}
                      >
                        <td className="p-2 border-b text-muted-foreground">{recipe.rowNum}</td>
                        <td className="p-2 border-b">
                          {recipe.code ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {recipe.code}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2 border-b">
                          <div>
                            <span className="font-medium">{recipe.name}</span>
                            {recipe.category && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({recipe.category})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 border-b">{recipe.price || '-'}</td>
                        <td className="p-2 border-b">
                          <div className="flex flex-wrap gap-1">
                            {recipe.warehouses.map((wh, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {wh}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 border-b">
                          <div className="flex flex-wrap gap-1">
                            {recipe.ingredients.slice(0, 3).map((ing, i) => (
                              <Badge 
                                key={i} 
                                variant="secondary" 
                                className="text-xs"
                                title={`${ing.name} - ${ing.quantity} ${ing.unitName}`}
                              >
                                {ing.name.length > 10 ? ing.code : ing.name}: {ing.quantity}{ing.unit}
                              </Badge>
                            ))}
                            {recipe.ingredients.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{recipe.ingredients.length - 3}
                              </Badge>
                            )}
                            {recipe.ingredients.length === 0 && (
                              <span className="text-muted-foreground text-xs">Không có</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 border-b text-center">
                          {recipe.valid ? (
                            recipe.warnings?.length > 0 ? (
                              <div className="flex items-center justify-center gap-1" title={recipe.warnings.join('\n')}>
                                <AlertCircle className="w-5 h-5 text-yellow-500" />
                              </div>
                            ) : (
                              <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                            )
                          ) : (
                            <div className="flex items-center justify-center gap-1" title={recipe.errors.join('\n')}>
                              <XCircle className="w-5 h-5 text-red-500" />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>

            {/* Error details */}
            {invalidCount > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Có {invalidCount} dòng lỗi</AlertTitle>
                <AlertDescription className="mt-2">
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {previewData.filter(p => !p.valid).slice(0, 5).map((p, i) => (
                      <li key={i}>
                        <strong>Dòng {p.rowNum}:</strong> {p.errors.join(', ')}
                      </li>
                    ))}
                    {previewData.filter(p => !p.valid).length > 5 && (
                      <li>...và {previewData.filter(p => !p.valid).length - 5} lỗi khác</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Warnings */}
            {previewData.some(p => p.warnings?.length > 0) && (
              <Alert>
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertTitle>Cảnh báo</AlertTitle>
                <AlertDescription className="mt-2">
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {previewData.filter(p => p.warnings?.length > 0).slice(0, 5).map((p, i) => (
                      <li key={i}>
                        <strong>Dòng {p.rowNum}:</strong> {p.warnings.join(', ')}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )

      case 'result':
        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className={cn(
              "grid gap-3",
              isMobile ? "grid-cols-1" : "grid-cols-2"
            )}>
              <div className="border rounded-lg p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-3xl font-bold text-green-600">{importResult?.imported || 0}</p>
                <p className="text-sm text-muted-foreground">Công thức đã import</p>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <XCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                <p className="text-3xl font-bold text-red-600">{importResult?.errors.length || 0}</p>
                <p className="text-sm text-muted-foreground">Lỗi</p>
              </div>
            </div>

            {/* Imported names */}
            {importResult && importResult.importedNames.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Công thức đã tạo
                </Label>
                <ScrollArea className="h-[120px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {importResult.importedNames.map((name, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-green-50 dark:bg-green-950/30">
                        <ChefHat className="w-4 h-4 text-green-600 shrink-0" />
                        <span>{name}</span>
                      </div>
                    ))}
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
                <ScrollArea className="h-[120px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-red-50 dark:bg-red-950/30">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <span className="text-red-700 dark:text-red-300">{err}</span>
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
      return null
    }
    
    if (step === 'preview') {
      const validCount = previewData.filter(p => p.valid).length
      return (
        <div className={cn(
          "flex gap-2 pt-4 border-t",
          isMobile ? "flex-col" : "flex-row justify-end"
        )}>
          <Button 
            variant="outline" 
            onClick={() => {
              setStep('upload')
              setSelectedFile(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            className={cn(isMobile && "order-2")}
          >
            Chọn file khác
          </Button>
          <Button 
            onClick={handleImport}
            disabled={loading || validCount === 0}
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
                Import {validCount} công thức
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
              <ChefHat className="h-5 w-5" />
              Import công thức
            </SheetTitle>
            <SheetDescription>
              {step === 'upload' && 'Tải template và import file Excel'}
              {step === 'preview' && 'Xem trước dữ liệu trước khi import'}
              {step === 'result' && 'Kết quả import'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto mt-4 pr-2">
            {renderContent()}
          </div>
          {renderFooter()}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Import công thức chế biến
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Tải template và import file Excel công thức'}
            {step === 'preview' && 'Xem trước dữ liệu trước khi import vào hệ thống'}
            {step === 'result' && 'Kết quả import công thức'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto pr-2">
          {renderContent()}
        </div>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  )
}
