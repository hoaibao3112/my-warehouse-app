/**
 * Error Translation Utility
 * Converts technical error messages into user-friendly Vietnamese messages
 */

/**
 * Translates technical error messages to user-friendly Vietnamese messages
 * @param error - The error object or string
 * @returns User-friendly error message in Vietnamese
 */
export function translateError(error: any): string {
    // Handle null/undefined
    if (!error) {
        return "Đã xảy ra lỗi không xác định"
    }

    // Convert error to string for analysis
    const errorMessage = typeof error === 'string'
        ? error
        : error.message || error.error || String(error)

    const lowerError = errorMessage.toLowerCase()

    // Prisma Database Errors
    if (lowerError.includes('prisma')) {
        // Unique constraint violation (duplicate entry)
        if (lowerError.includes('code: `23505`') || lowerError.includes('already exists')) {
            // Try to extract the field name
            if (lowerError.includes('(code)')) {
                return "Mã này đã tồn tại trong hệ thống"
            }
            if (lowerError.includes('(email)')) {
                return "Email này đã được sử dụng"
            }
            if (lowerError.includes('(phone)')) {
                return "Số điện thoại này đã được sử dụng"
            }
            if (lowerError.includes('(username)')) {
                return "Tên đăng nhập này đã tồn tại"
            }
            return "Dữ liệu này đã tồn tại trong hệ thống"
        }

        // Foreign key constraint violation
        if (lowerError.includes('code: `23503`') || lowerError.includes('foreign key constraint') || lowerError.includes('p2003')) {
            const match = /foreign key constraint failed on the field: `(.*?)`/i.exec(errorMessage) || /failed on the constraint: `(.*?)`/i.exec(errorMessage);
            const field = match ? match[1] : '';
            return `Không thể thực hiện vì có dữ liệu liên quan${field ? ` (${field})` : ''}. Vui lòng xóa dữ liệu liên quan trước`
        }

        // Not null constraint violation
        if (lowerError.includes('code: `23502`') || lowerError.includes('not null constraint')) {
            return "Thiếu thông tin bắt buộc. Vui lòng điền đầy đủ các trường"
        }

        // Invalid input syntax
        if (lowerError.includes('invalid input syntax')) {
            return "Dữ liệu nhập vào không đúng định dạng"
        }

        // Generic Prisma error
        return "Lỗi khi xử lý dữ liệu. Vui lòng thử lại"
    }

    // Network Errors
    if (lowerError.includes('fetch') || lowerError.includes('network') || lowerError.includes('connection')) {
        return "Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng"
    }

    // Timeout errors
    if (lowerError.includes('timeout')) {
        return "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại"
    }

    // Authentication/Authorization errors
    if (lowerError.includes('unauthorized') || lowerError.includes('authentication')) {
        return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại"
    }

    if (lowerError.includes('forbidden') || lowerError.includes('permission')) {
        return "Bạn không có quyền thực hiện thao tác này"
    }

    // Validation errors
    if (lowerError.includes('validation') || lowerError.includes('invalid')) {
        return "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại"
    }

    // Not found errors
    if (lowerError.includes('not found') || lowerError.includes('404')) {
        return "Không tìm thấy dữ liệu"
    }

    // Server errors
    if (lowerError.includes('internal server error') || lowerError.includes('500')) {
        return "Lỗi hệ thống. Vui lòng thử lại sau"
    }

    // If error message is already in Vietnamese (doesn't contain common English error keywords)
    const hasEnglishErrorKeywords = /error|failed|invalid|constraint|violation|exception/i.test(errorMessage)
    if (!hasEnglishErrorKeywords && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(errorMessage)) {
        return errorMessage
    }

    // Default fallback - if message is short and doesn't look too technical, show it
    if (errorMessage.length < 100 && !errorMessage.includes('`') && !errorMessage.includes('Raw query')) {
        return errorMessage
    }

    // Generic fallback for complex technical errors
    return "Đã xảy ra lỗi. Vui lòng thử lại hoặc liên hệ quản trị viên"
}

/**
 * Wraps an async function to automatically translate errors in toast notifications
 * @param fn - The async function to wrap
 * @param toast - The toast object from sonner
 */
export function withErrorTranslation<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    toast: { error: (message: string) => void }
): T {
    return (async (...args: any[]) => {
        try {
            return await fn(...args)
        } catch (error) {
            toast.error(translateError(error))
            throw error
        }
    }) as T
}
