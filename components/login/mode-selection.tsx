"use client"

import { LayoutDashboard, BarChart3, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { type LoginMode } from "@/hooks/use-auth"
import { Card } from "@/components/ui/card"

interface ModeSelectionProps {
    onSelect: (mode: LoginMode) => void
    userName: string
}

export function ModeSelection({ onSelect, userName }: ModeSelectionProps) {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-3 mb-2">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 drop-shadow-sm">
                    Chào mừng trở lại, <span className="bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">{userName}</span>
                </h2>
                <p className="text-gray-600 text-sm sm:text-base max-w-md mx-auto">
                    Vui lòng chọn chế độ làm việc tối ưu cho bạn hôm nay.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-8 max-w-4xl mx-auto py-2">
                {/* Full Access Mode */}
                <button
                    onClick={() => onSelect("full")}
                    className="group relative flex flex-col items-start p-5 sm:p-8 text-left transition-all duration-300 bg-white hover:bg-orange-50/30 border-2 border-gray-100 hover:border-orange-200 rounded-3xl shadow-sm hover:shadow-2xl hover:-translate-y-1 overflow-hidden min-h-[200px] sm:min-h-[240px] w-full"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <LayoutDashboard className="w-24 h-24 rotate-12" />
                    </div>

                    <div className="p-3 bg-primary/10 rounded-xl mb-4 group-hover:bg-primary/20 transition-colors">
                        <LayoutDashboard className="w-8 h-8 text-primary" />
                    </div>

                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                        Trải nghiệm đầy đủ
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                        Truy cập toàn bộ tính năng quản trị hệ thống, kho hàng, nhân sự và cài đặt.
                    </p>

                    <div className="mt-auto flex items-center text-sm font-semibold text-primary">
                        <span>Bắt đầu ngay</span>
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </div>
                </button>

                {/* Reports Only Mode */}
                <button
                    onClick={() => onSelect("reports")}
                    className="group relative flex flex-col items-start p-5 sm:p-8 text-left transition-all duration-300 bg-white hover:bg-amber-50/30 border-2 border-gray-100 hover:border-amber-200 rounded-3xl shadow-sm hover:shadow-2xl hover:-translate-y-1 overflow-hidden min-h-[200px] sm:min-h-[240px] w-full"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <BarChart3 className="w-24 h-24 -rotate-12" />
                    </div>

                    <div className="p-3 bg-primary/10 rounded-xl mb-4 group-hover:bg-primary/20 transition-colors">
                        <BarChart3 className="w-8 h-8 text-primary" />
                    </div>

                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                        Báo cáo & Dashboard
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                        Tối ưu cho thiết bị di động. Theo dõi nhanh sức khỏe cửa hàng, doanh số và tồn kho.
                    </p>

                    <div className="mt-auto flex items-center text-sm font-semibold text-primary">
                        <span>Xem báo cáo</span>
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </div>
                </button>
            </div>

            <p className="text-center text-xs text-gray-500 font-medium">
                Bạn có thể thay đổi chế độ này sau trong phần cài đặt hoặc bằng cách đăng nhập lại.
            </p>
        </div>
    )
}
