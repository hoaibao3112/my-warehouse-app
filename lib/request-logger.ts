/**
 * API Request Logger Middleware
 * Logs all API requests with timing, status, and user info
 * 
 * Usage in API routes:
 * import { withRequestLogging } from '@/lib/request-logger'
 * export const GET = withRequestLogging(async (request) => { ... })
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from './logger'
import { getAuthToken } from './auth-server'
import { verifyToken } from './auth'

type Handler = (request: NextRequest, context?: any) => Promise<NextResponse>

/**
 * Wrapper to add request logging to API handlers
 */
export function withRequestLogging(handler: Handler): Handler {
    return async (request: NextRequest, context?: any) => {
        const startTime = Date.now()
        const method = request.method
        const url = new URL(request.url)
        const path = url.pathname

        // Try to get user ID from token
        let userId: string | undefined
        try {
            const token = getAuthToken(request)
            if (token) {
                const payload = verifyToken(token)
                userId = payload?.id
            }
        } catch {
            // Ignore auth errors for logging
        }

        let response: NextResponse
        let statusCode: number

        try {
            response = await handler(request, context)
            statusCode = response.status
        } catch (error) {
            const duration = Date.now() - startTime
            logger.error(`${method} ${path} ERROR ${duration}ms${userId ? ` user:${userId}` : ''}`, error)
            throw error // Re-throw to let Next.js handle error response
        }

        const duration = Date.now() - startTime

        // Log successful requests
        if (statusCode >= 400) {
            logger.warn(`${method} ${path} ${statusCode} ${duration}ms${userId ? ` user:${userId}` : ''}`)
        } else {
            logger.info(`${method} ${path} ${statusCode} ${duration}ms${userId ? ` user:${userId}` : ''}`)
        }

        return response
    }
}

/**
 * Simple function to log a request manually
 * Use this when you can't wrap the entire handler
 */
export function logRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    userId?: string
) {
    logger.request(method, path, statusCode, durationMs, userId)
}

/**
 * Log an API error
 */
export function logApiError(
    method: string,
    path: string,
    error: Error | unknown,
    userId?: string
) {
    const message = `${method} ${path} ERROR${userId ? ` user:${userId}` : ''}`
    logger.error(message, error)
}
