"use client"

import { useState } from "react"
import { Sparkles, Settings, X, Send, Loader2, RefreshCw, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface AIAnalysisFABProps {
    salesData: {
        summary?: {
            total_revenue?: number
            total_invoices?: number
            total_discount?: number
            gross_revenue?: number
            net_revenue?: number
            total_gift_value?: number
        }
        product_sales?: Array<{
            recipe_name: string
            quantity_sold: number
            total_revenue: number
        }>
        category_sales?: Array<{
            category_name: string
            total_revenue: number
            percentage: number
        }>
        shift_revenue?: Array<{
            shift_name: string
            total_revenue: number
            invoice_count: number
        }>
        payment_methods?: Array<{
            method: string
            amount: number
        }>
    } | null
    warehouseName?: string
    dateRange?: {
        startDate: string
        endDate: string
    }
}

export function AIAnalysisFAB({ salesData, warehouseName, dateRange }: AIAnalysisFABProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysis, setAnalysis] = useState<string | null>(null)
    const [customPrompt, setCustomPrompt] = useState("")
    const [isSavingPrompt, setIsSavingPrompt] = useState(false)

    // Fetch custom prompt on settings open
    const fetchCustomPrompt = async () => {
        try {
            const res = await mobileFetch("/api/settings/ai-prompt")
            const json = await res.json()
            if (json.success && json.data?.value) {
                setCustomPrompt(json.data.value)
            }
        } catch (error) {
            console.error("Failed to fetch custom prompt:", error)
        }
    }

    const handleOpenSettings = async () => {
        await fetchCustomPrompt()
        setIsSettingsOpen(true)
    }

    const handleSavePrompt = async () => {
        setIsSavingPrompt(true)
        try {
            const res = await mobileFetch("/api/settings/ai-prompt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ value: customPrompt }),
            })
            const json = await res.json()
            if (json.success) {
                toast.success("Đã lưu prompt thành công")
                setIsSettingsOpen(false)
            } else {
                toast.error(json.error || "Không thể lưu prompt")
            }
        } catch (error) {
            toast.error("Không thể kết nối đến server")
        } finally {
            setIsSavingPrompt(false)
        }
    }

    const handleAnalyze = async () => {
        if (!salesData) {
            toast.error("Không có dữ liệu để phân tích")
            return
        }

        setIsAnalyzing(true)
        setAnalysis(null)

        try {
            const res = await mobileFetch("/api/ai/analyze-sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    salesData,
                    warehouseName,
                    dateRange,
                }),
            })

            const json = await res.json()

            if (json.success) {
                setAnalysis(json.data?.analysis || "Không có kết quả phân tích")
            } else {
                toast.error(json.error || "Không thể phân tích dữ liệu")
            }
        } catch (error) {
            toast.error("Không thể kết nối đến AI server")
        } finally {
            setIsAnalyzing(false)
        }
    }

    return (
        <>
            {/* Floating Action Button */}
            <div className="fixed bottom-6 right-6 z-50">
                {/* Main AI Button */}
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-14 px-5 rounded-full shadow-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all duration-300 transform hover:scale-105"
                >
                    <Sparkles className="w-5 h-5 mr-2" />
                    <span className="font-semibold">AI Phân Tích</span>
                </Button>
            </div>

            {/* Analysis Modal */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="border-b px-6 py-4 flex-shrink-0">
                        <div className="flex items-center gap-3 pr-8">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-xl">Phân Tích AI</DialogTitle>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                                        onClick={handleOpenSettings}
                                        title="Cấu hình Prompt AI"
                                    >
                                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                                    </Button>
                                </div>
                                <DialogDescription>
                                    {warehouseName && dateRange && (
                                        <span className="text-sm">
                                            {warehouseName} • {dateRange.startDate} đến {dateRange.endDate}
                                        </span>
                                    )}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {!analysis && !isAnalyzing ? (
                            <div className="py-12 text-center">
                                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 mb-4">
                                    <Sparkles className="w-10 h-10 text-violet-500" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">Phân Tích Bằng AI</h3>
                                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                    Nhấn nút bên dưới để AI phân tích toàn bộ dữ liệu doanh số, sản phẩm bán chạy,
                                    phân bố theo ca và đưa ra nhận xét chuyên sâu.
                                </p>
                                <Button
                                    onClick={handleAnalyze}
                                    size="lg"
                                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Bắt Đầu Phân Tích
                                </Button>
                            </div>
                        ) : isAnalyzing ? (
                            <div className="py-16 text-center">
                                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 mb-4 animate-pulse">
                                    <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">Đang phân tích...</h3>
                                <p className="text-muted-foreground">AI đang xử lý dữ liệu của bạn</p>
                            </div>
                        ) : (
                            <div className="ai-analysis-content">
                                {/* Custom styled markdown content */}
                                <style jsx global>{`
                                    .ai-analysis-content h1,
                                    .ai-analysis-content h2 {
                                        color: #6366f1;
                                        font-weight: 600;
                                        margin-top: 1.5rem;
                                        margin-bottom: 0.75rem;
                                        padding-bottom: 0.5rem;
                                        border-bottom: 1px solid #e5e7eb;
                                    }
                                    .ai-analysis-content h1 { font-size: 1.25rem; }
                                    .ai-analysis-content h2 { font-size: 1.1rem; border-bottom: none; color: #4f46e5; }
                                    .ai-analysis-content h3 {
                                        color: #6366f1;
                                        font-weight: 600;
                                        font-size: 1rem;
                                        margin-top: 1rem;
                                        margin-bottom: 0.5rem;
                                    }
                                    .ai-analysis-content p {
                                        color: #374151;
                                        line-height: 1.7;
                                        margin-bottom: 0.75rem;
                                    }
                                    .ai-analysis-content strong {
                                        color: #4f46e5;
                                        font-weight: 600;
                                    }
                                    .ai-analysis-content ul, .ai-analysis-content ol {
                                        margin-left: 1.25rem;
                                        margin-bottom: 1rem;
                                    }
                                    .ai-analysis-content li {
                                        color: #374151;
                                        margin-bottom: 0.5rem;
                                        line-height: 1.6;
                                    }
                                    .ai-analysis-content li::marker {
                                        color: #6366f1;
                                    }
                                    .dark .ai-analysis-content h1,
                                    .dark .ai-analysis-content h2,
                                    .dark .ai-analysis-content h3 {
                                        color: #a5b4fc;
                                    }
                                    .dark .ai-analysis-content h2 { color: #818cf8; }
                                    .dark .ai-analysis-content p,
                                    .dark .ai-analysis-content li {
                                        color: #d1d5db;
                                    }
                                    .dark .ai-analysis-content strong {
                                        color: #a5b4fc;
                                    }
                                    .dark .ai-analysis-content h1 {
                                        border-bottom-color: #374151;
                                    }
                                `}</style>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {analysis || ""}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>

                    {/* Footer with Regenerate Button - Fixed at bottom */}
                    {analysis && !isAnalyzing && (
                        <div className="border-t px-6 py-4 flex justify-center flex-shrink-0 bg-slate-50 dark:bg-slate-900">
                            <Button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                            >
                                <Sparkles className={cn("w-4 h-4 mr-2", isAnalyzing && "animate-spin")} />
                                Phân tích lại
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Settings Modal */}
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Settings className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                            </div>
                            <div>
                                <DialogTitle>Cấu Hình Prompt AI</DialogTitle>
                                <DialogDescription>
                                    Tùy chỉnh cách AI phân tích và trả lời. Dữ liệu sẽ được tự động truyền vào.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="prompt" className="text-sm font-medium">
                                    Prompt Tùy Chỉnh
                                </Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-violet-600 hover:text-violet-700"
                                    onClick={() => setCustomPrompt(`Bạn là chuyên gia phân tích F&B với 15 năm kinh nghiệm. Hãy phân tích dữ liệu doanh số được cung cấp và đưa ra:

1. **Tổng quan hoạt động kinh doanh** - đánh giá hiệu suất chung
2. **Phân tích sản phẩm bán chạy** - nhận xét về xu hướng và đề xuất
3. **Phân tích theo ca làm việc** - ca nào hiệu quả nhất, cần cải thiện gì
4. **Đề xuất chiến lược** - marketing, menu, giá cả
5. **Cảnh báo** - vấn đề cần chú ý ngay

Trả lời bằng tiếng Việt, sử dụng markdown với headers, bold, bullet points để dễ đọc. Phân tích cần chuyên sâu, cụ thể và có tính ứng dụng cao.`)}
                                >
                                    Dùng Prompt Mẫu
                                </Button>
                            </div>
                            <Textarea
                                id="prompt"
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="Để trống để sử dụng prompt mặc định, hoặc nhấn 'Dùng Prompt Mẫu' để xem và chỉnh sửa..."
                                className="min-h-[200px] resize-none"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                            Hủy
                        </Button>
                        <Button
                            onClick={handleSavePrompt}
                            disabled={isSavingPrompt}
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                        >
                            {isSavingPrompt ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Đang lưu...
                                </>
                            ) : (
                                "Lưu Cấu Hình"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
