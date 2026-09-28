import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

import OpenAI from "openai"

// Lazy OpenAI client initialization
let openaiClient: OpenAI | null = null
function getOpenAI() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        })
    }
    return openaiClient
}

const DEFAULT_PROMPT = `Bạn là chuyên gia phân tích F&B với 15 năm kinh nghiệm. Hãy phân tích dữ liệu doanh số được cung cấp và đưa ra:

1. **Tổng quan hoạt động kinh doanh**
2. **Phân tích sản phẩm bán chạy** - nhận xét về xu hướng và đề xuất
3. **Phân tích theo ca làm việc** - ca nào hiệu quả nhất, cần cải thiện gì
4. **Đề xuất chiến lược** - marketing, menu, giá cả
5. **Cảnh báo** - vấn đề cần chú ý

Trả lời bằng tiếng Việt, sử dụng markdown với headers, bold, bullet points để dễ đọc. Phân tích cần chuyên sâu, cụ thể và có tính ứng dụng cao.`

// POST /api/ai/analyze-sales - Analyze sales data with AI
export async function POST(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        // Check admin role
        const userRecord = await prisma.users.findUnique({
            where: { id: user.id },
            select: { role: true }
        })

        if (userRecord?.role !== "ADMIN" && userRecord?.role !== "GENERAL_MANAGER") {
            return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 })
        }

        const body = await request.json()
        const { salesData, warehouseName, dateRange } = body

        if (!salesData) {
            return NextResponse.json({ success: false, error: "No sales data provided" }, { status: 400 })
        }

        // Get custom prompt if exists
        let customPrompt = DEFAULT_PROMPT
        try {
            const setting = await prisma.system_settings.findUnique({
                where: { key: "ai_analysis_prompt" }
            })
            if (setting?.value) {
                customPrompt = setting.value
            }
        } catch (e) {
            // Use default if error
        }

        // Format data for AI
        const formatCurrency = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ'

        const summary = salesData.summary || {}
        const dataContext = `
## Thông tin cửa hàng
- Cửa hàng: ${warehouseName || "N/A"}
- Khoảng thời gian: ${dateRange?.startDate || "N/A"} đến ${dateRange?.endDate || "N/A"}

## Tổng quan doanh số
- Doanh thu gốc: ${formatCurrency(summary.gross_revenue || summary.total_revenue + (summary.total_discount || 0) || 0)}
- Tổng giảm giá: ${formatCurrency(summary.total_discount || 0)}
- Giá trị quà tặng: ${formatCurrency(summary.total_gift_value || 0)}
- Doanh thu thực: ${formatCurrency(summary.net_revenue || summary.total_revenue || 0)}
- Số hóa đơn: ${summary.total_invoices || 0}

## Sản phẩm bán chạy (Top 20)
${(salesData.product_sales || []).slice(0, 20).map((p: any, i: number) =>
            `${i + 1}. ${p.recipe_name}: ${p.quantity_sold} sản phẩm - ${formatCurrency(p.total_revenue)}`
        ).join('\n') || "Không có dữ liệu"}

## Doanh thu theo ca
${(salesData.shift_revenue || []).map((s: any) =>
            `- ${s.shift_name}: ${formatCurrency(s.total_revenue)} (${s.invoice_count} hóa đơn)`
        ).join('\n') || "Không có dữ liệu"}

## Phân bố theo nhóm hàng
${(salesData.category_sales || []).map((c: any) =>
            `- ${c.category_name}: ${formatCurrency(c.total_revenue)} (${c.percentage?.toFixed(1) || 0}%)`
        ).join('\n') || "Không có dữ liệu"}

## Phương thức thanh toán
${(salesData.payment_methods || []).map((p: any) =>
            `- ${p.method}: ${formatCurrency(p.amount)}`
        ).join('\n') || "Không có dữ liệu"}
`

        // Call OpenAI
        const openai = getOpenAI()
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: customPrompt
                },
                {
                    role: "user",
                    content: `Đây là dữ liệu doanh số cần phân tích:\n\n${dataContext}`
                }
            ],
            max_tokens: 2000,
            temperature: 0.7,
        })

        const analysis = completion.choices[0]?.message?.content || "Không thể tạo phân tích"

        return NextResponse.json({
            success: true,
            data: { analysis }
        })

    } catch (error: any) {
        console.error("Error analyzing sales:", error)

        if (error?.code === "insufficient_quota") {
            return NextResponse.json({
                success: false,
                error: "API key hết hạn mức. Vui lòng kiểm tra OPENAI_API_KEY."
            }, { status: 500 })
        }

        // Check if key exists
        const keyCheck = process.env.OPENAI_API_KEY ? "Key exists" : "Key missing";

        return NextResponse.json({
            success: false,
            error: `Không thể kết nối AI: ${error.message} (${keyCheck})`
        }, { status: 500 })
    }

}
