/**
 * Lark Webhook Service
 * 
 * Gửi thông báo đến Lark webhook khi có sự kiện quan trọng
 * Retry logic với exponential backoff, không throw error để không ảnh hưởng flow chính
 */

const LARK_WEBHOOK_URL = 'https://open-sg.larksuite.com/anycross/trigger/callback/MDM3MzAxZDlhNmMwNWM1YjQzMTk2OTlkNjZjYmE1YjRm'
const MAX_RETRIES = 3
const TIMEOUT_MS = 10000

interface InventoryDiscrepancyPayload {
    message: string
}

/**
 * Format số với dấu phẩy ngăn cách hàng nghìn
 */
function formatNumber(num: number): string {
    return num.toLocaleString('vi-VN', { maximumFractionDigits: 3 })
}

/**
 * Format ngày giờ theo định dạng Việt Nam
 */
function formatDateTime(date: Date): string {
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    })
}

class LarkWebhookService {
    /**
     * Gửi thông báo kiểm kê chênh lệch đến Lark
     * Không throw error - chỉ log warning nếu fail
     */
    async sendInventoryDiscrepancyAlert(payload: InventoryDiscrepancyPayload): Promise<boolean> {
        if (!payload.message) {
            console.log('[Lark Webhook] No message to send, skipping webhook')
            return true
        }

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

                const response = await fetch(LARK_WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                })

                clearTimeout(timeoutId)

                if (response.ok) {
                    console.log(`[Lark Webhook] Sent inventory discrepancy alert successfully`)
                    return true
                }

                const errorText = await response.text().catch(() => 'Unknown error')
                console.warn(`[Lark Webhook] Attempt ${attempt}/${MAX_RETRIES} failed - Status ${response.status}: ${errorText}`)

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                console.warn(`[Lark Webhook] Attempt ${attempt}/${MAX_RETRIES} failed - ${errorMessage}`)
            }

            // Exponential backoff: 1s, 2s, 4s
            if (attempt < MAX_RETRIES) {
                const delay = Math.pow(2, attempt - 1) * 1000
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }

        console.error(`[Lark Webhook] Failed to send inventory discrepancy alert after ${MAX_RETRIES} attempts`)
        return false
    }

    /**
     * Helper: Tạo payload từ dữ liệu kiểm kê - gộp thành 1 đoạn text liền mạch
     */
    createDiscrepancyPayload(params: {
        checkNumber: string
        warehouseName: string
        warehouseCode: string
        period: string
        completedByName: string
        completedAt: Date
        items: Array<{
            productCode?: string | null
            productName?: string | null
            productUnit?: string | null
            systemBalance: number
            actualBalance: number
            difference: number
            differencePercentage: number
        }>
    }): InventoryDiscrepancyPayload {
        const discrepancyItems = params.items.map(item => ({
            productCode: item.productCode || 'N/A',
            productName: item.productName || 'N/A',
            unit: item.productUnit || 'N/A',
            systemStock: Number(item.systemBalance) || 0,
            actualStock: Number(item.actualBalance) || 0,
            difference: Number(item.difference) || 0,
            differencePercent: Number(item.differencePercentage) || 0
        })).filter(i => Math.abs(i.difference) > 0.000001)

        // Phân loại thừa/thiếu
        const excessItems = discrepancyItems.filter(i => i.difference > 0)
        const shortageItems = discrepancyItems.filter(i => i.difference < 0)

        // Sắp xếp theo độ lớn chênh lệch
        const sortedByExcess = [...excessItems].sort((a, b) => b.difference - a.difference)
        const sortedByShortage = [...shortageItems].sort((a, b) => a.difference - b.difference)

        // Tính tổng
        const totalExcessValue = excessItems.reduce((sum, i) => sum + i.difference, 0)
        const totalShortageValue = shortageItems.reduce((sum, i) => sum + i.difference, 0)

        // === Gộp thành 1 đoạn text liền mạch ===
        const messageParts: string[] = []

        // Header
        messageParts.push(`📦 KIỂM KÊ CHÊNH LỆCH`)
        messageParts.push(``)
        messageParts.push(`🔢 Mã phiếu: ${params.checkNumber}`)
        messageParts.push(`🏪 Kho: ${params.warehouseName} (${params.warehouseCode})`)
        messageParts.push(`📅 Kỳ: ${params.period}`)
        messageParts.push(`👤 Nhân viên: ${params.completedByName}`)
        messageParts.push(`🕐 Thời gian: ${formatDateTime(params.completedAt)}`)
        messageParts.push(``)
        messageParts.push(`📊 Tổng chênh lệch: ${discrepancyItems.length} sản phẩm`)
        messageParts.push(``)

        // Danh sách thừa
        if (excessItems.length > 0) {
            messageParts.push(`📈 HÀNG THỪA (${excessItems.length} sản phẩm):`)
            excessItems.forEach(item => {
                messageParts.push(` + ${item.productCode} - ${item.productName} (${item.unit}): Hệ thống ${formatNumber(item.systemStock)}, Thực tế ${formatNumber(item.actualStock)}, Thừa +${formatNumber(item.difference)}`)
            })
            messageParts.push(``)
        }

        // Danh sách thiếu
        if (shortageItems.length > 0) {
            messageParts.push(`📉 HÀNG THIẾU (${shortageItems.length} sản phẩm):`)
            shortageItems.forEach(item => {
                messageParts.push(` - ${item.productCode} - ${item.productName} (${item.unit}): Hệ thống ${formatNumber(item.systemStock)}, Thực tế ${formatNumber(item.actualStock)}, Thiếu ${formatNumber(item.difference)}`)
            })
        }

        return {
            message: messageParts.join('\n')
        }
    }
}

// Singleton instance
export const larkWebhookService = new LarkWebhookService()
