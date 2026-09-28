/**
 * Server-side Error Handler Utility
 * Provides user-friendly error messages for API responses
 */

export interface ErrorResponse {
    success: false
    error: string
}

/**
 * Handles Prisma errors and converts them to user-friendly messages
 * @param error - The error object from Prisma or other sources
 * @returns User-friendly error message in Vietnamese
 */
export function handlePrismaError(error: any): string {
    // Extract error details
    const errorMessage = error?.message || String(error)
    const errorCode = error?.code

    // Unique constraint violation (duplicate entry)
    if (errorCode === 'P2002' || errorMessage.includes('Code: `23505`') || errorMessage.includes('already exists')) {
        // Try to extract field name from error
        const match = errorMessage.match(/Key \((\w+)\)=/)
        if (match) {
            const field = match[1]
            switch (field) {
                case 'code':
                    return "Mã này đã tồn tại trong hệ thống"
                case 'email':
                    return "Email này đã được sử dụng"
                case 'phone':
                case 'phone_number':
                    return "Số điện thoại này đã được sử dụng"
                case 'username':
                    return "Tên đăng nhập này đã tồn tại"
                default:
                    return `${field} này đã tồn tại trong hệ thống`
            }
        }
        return "Dữ liệu này đã tồn tại trong hệ thống"
    }

    // Foreign key constraint violation
    if (errorCode === 'P2003' || errorMessage.includes('Code: `23503`') || errorMessage.includes('foreign key constraint')) {
        return "Không thể thực hiện vì có dữ liệu liên quan"
    }

    // Not null constraint violation
    if (errorCode === 'P2011' || errorMessage.includes('Code: `23502`') || errorMessage.includes('not null constraint')) {
        return "Thiếu thông tin bắt buộc"
    }

    // Record not found
    if (errorCode === 'P2025' || errorMessage.includes('Record to update not found')) {
        return "Không tìm thấy dữ liệu"
    }

    // Invalid input
    if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
        return "Dữ liệu không hợp lệ"
    }

    // Timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        return "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại"
    }

    // Connection error
    if (errorMessage.includes('Can\'t reach database') || errorMessage.includes('connection')) {
        return "Không thể kết nối cơ sở dữ liệu"
    }

    // Generic database error
    if (errorMessage.includes('prisma') || errorMessage.includes('Prisma')) {
        return "Lỗi khi xử lý dữ liệu"
    }

    // Default
    return "Đã xảy ra lỗi. Vui lòng thử lại"
}

/**
 * Creates a standardized error response for API routes
 * @param error - The error object
 * @param customMessage - Optional custom message to override
 * @returns Standardized error response object
 */
export function createErrorResponse(error: any, customMessage?: string): ErrorResponse {
    const message = customMessage || handlePrismaError(error)

    // Log the actual error for debugging (keep technical details in logs)
    console.error('[API Error]:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
    })

    return {
        success: false,
        error: message,
    }
}

/**
 * Wraps an async API route handler to automatically handle errors
 * @param handler - The async route handler function
 */
export function withErrorHandling<T>(
    handler: () => Promise<T>
): Promise<T | ErrorResponse> {
    return handler().catch((error) => {
        return createErrorResponse(error)
    })
}
