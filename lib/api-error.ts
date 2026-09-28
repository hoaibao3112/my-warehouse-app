/**
 * API Error Handling Utilities
 * Provides consistent error handling across all API routes
 */

import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'

/**
 * Custom API Error class with status code
 */
export class ApiError extends Error {
    public readonly statusCode: number
    public readonly code?: string

    constructor(message: string, statusCode: number = 500, code?: string) {
        super(message)
        this.name = 'ApiError'
        this.statusCode = statusCode
        this.code = code
    }
}

/**
 * Common API error codes
 */
export const ApiErrorCodes = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    DUPLICATE: 'DUPLICATE',
    RATE_LIMITED: 'RATE_LIMITED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
} as const

/**
 * Predefined error factories
 */
export const Errors = {
    unauthorized: (message = 'Unauthorized') => new ApiError(message, 401, ApiErrorCodes.UNAUTHORIZED),
    forbidden: (message = 'Forbidden') => new ApiError(message, 403, ApiErrorCodes.FORBIDDEN),
    notFound: (resource = 'Resource') => new ApiError(`${resource} not found`, 404, ApiErrorCodes.NOT_FOUND),
    validation: (message: string) => new ApiError(message, 400, ApiErrorCodes.VALIDATION_ERROR),
    duplicate: (field: string) => new ApiError(`${field} already exists`, 409, ApiErrorCodes.DUPLICATE),
    rateLimited: (retryAfter?: number) => {
        const err = new ApiError('Too many requests', 429, ApiErrorCodes.RATE_LIMITED)
            ; (err as any).retryAfter = retryAfter
        return err
    },
    internal: (message = 'Internal server error') => new ApiError(message, 500, ApiErrorCodes.INTERNAL_ERROR),
}

/**
 * Log error details (only in development or for severe errors)
 */
function logError(error: unknown, context?: string) {
    if (process.env.NODE_ENV === 'development') {
        console.error(`[API Error]${context ? ` [${context}]` : ''}:`, error)
    } else if (error instanceof Error && !(error instanceof ApiError)) {
        // In production, only log unexpected errors
        console.error(`[API Error]${context ? ` [${context}]` : ''}: ${error.message}`)
    }
}

/**
 * Extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        return error.message
    }
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === 'string') {
        return error
    }
    return 'An unexpected error occurred'
}

/**
 * Handle API errors and return consistent NextResponse
 * 
 * @param error - The caught error
 * @param context - Optional context for logging (e.g., 'createUser', 'getProducts')
 * @returns NextResponse with proper error format
 * 
 * @example
 * ```ts
 * try {
 *   // ... API logic
 * } catch (error) {
 *   return handleApiError(error, 'createProduct')
 * }
 * ```
 */
export function handleApiError(error: unknown, context?: string): NextResponse<ApiResponse<null>> {
    logError(error, context)

    // Handle known API errors
    if (error instanceof ApiError) {
        const response: ApiResponse<null> & { code?: string; retryAfter?: number } = {
            success: false,
            error: error.message,
            code: error.code,
        }

        // Add retryAfter for rate limit errors
        if ((error as any).retryAfter) {
            response.retryAfter = (error as any).retryAfter
        }

        return NextResponse.json(response, {
            status: error.statusCode,
            headers: response.retryAfter ? { 'Retry-After': String(response.retryAfter) } : undefined
        })
    }

    // Handle Prisma/Database errors
    if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase()

        // Prisma unique constraint violation - handles both formats
        // Format 1: "Unique constraint failed on..."
        // Format 2: "Invalid `prisma.$queryRawUnsafe()` invocation: Raw query failed. Code: `23505`..."
        if (errorMessage.includes('unique constraint') ||
            errorMessage.includes('code: `23505`') ||
            errorMessage.includes('already exists')) {

            // Try to extract field name for more specific message
            const codeMatch = error.message.match(/Key \((\w+)\)=/)
            if (codeMatch) {
                const field = codeMatch[1]
                let fieldMessage = ''
                switch (field) {
                    case 'code':
                        fieldMessage = 'Mã này đã tồn tại trong hệ thống'
                        break
                    case 'email':
                        fieldMessage = 'Email này đã được sử dụng'
                        break
                    case 'phone':
                    case 'phone_number':
                        fieldMessage = 'Số điện thoại này đã được sử dụng'
                        break
                    case 'username':
                        fieldMessage = 'Tên đăng nhập này đã tồn tại'
                        break
                    default:
                        fieldMessage = 'Dữ liệu này đã tồn tại trong hệ thống'
                }

                return NextResponse.json({
                    success: false,
                    error: fieldMessage,
                    code: ApiErrorCodes.DUPLICATE,
                }, { status: 409 })
            }

            return NextResponse.json({
                success: false,
                error: 'Dữ liệu này đã tồn tại trong hệ thống',
                code: ApiErrorCodes.DUPLICATE,
            }, { status: 409 })
        }

        // Prisma foreign key constraint violation - Code: `23503`
        if (errorMessage.includes('code: `23503`') || errorMessage.includes('foreign key constraint')) {
            return NextResponse.json({
                success: false,
                error: 'Không thể thực hiện vì có dữ liệu liên quan',
                code: ApiErrorCodes.DATABASE_ERROR,
            }, { status: 400 })
        }

        // Prisma not null constraint - Code: `23502`
        if (errorMessage.includes('code: `23502`') || errorMessage.includes('not null constraint')) {
            return NextResponse.json({
                success: false,
                error: 'Thiếu thông tin bắt buộc',
                code: ApiErrorCodes.VALIDATION_ERROR,
            }, { status: 400 })
        }

        // Prisma record not found
        if (errorMessage.includes('record to') && errorMessage.includes('not found')) {
            return NextResponse.json({
                success: false,
                error: 'Không tìm thấy dữ liệu',
                code: ApiErrorCodes.NOT_FOUND,
            }, { status: 404 })
        }

        // Invalid input syntax
        if (errorMessage.includes('invalid input syntax')) {
            return NextResponse.json({
                success: false,
                error: 'Dữ liệu nhập vào không đúng định dạng',
                code: ApiErrorCodes.VALIDATION_ERROR,
            }, { status: 400 })
        }

        // Generic Prisma/database error
        if (errorMessage.includes('prisma') || errorMessage.includes('raw query failed') || errorMessage.includes('connectorerror') || errorMessage.includes('cached plan')) {
            return NextResponse.json({
                success: false,
                error: 'Lỗi khi xử lý dữ liệu. Vui lòng thử lại',
                code: ApiErrorCodes.DATABASE_ERROR,
            }, { status: 500 })
        }
    }

    // Default internal error
    return NextResponse.json({
        success: false,
        error: 'Đã xảy ra lỗi. Vui lòng thử lại',
        code: ApiErrorCodes.INTERNAL_ERROR,
    }, { status: 500 })
}


/**
 * Higher-order function to wrap API handlers with error handling
 * 
 * @example
 * ```ts
 * export const GET = withErrorHandler(async (request) => {
 *   const data = await fetchData()
 *   return NextResponse.json({ success: true, data })
 * }, 'getProducts')
 * ```
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
    handler: T,
    context?: string
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await handler(...args)
        } catch (error) {
            return handleApiError(error, context)
        }
    }) as T
}
