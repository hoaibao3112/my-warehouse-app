/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 * 
 * Tối ưu: dùng lazy cleanup thay vì setInterval
 * để tránh giữ process active trên serverless
 */

interface RateLimitEntry {
    count: number
    resetTime: number
}

class RateLimiter {
    private requests: Map<string, RateLimitEntry> = new Map()
    private lastCleanupTime: number = Date.now()
    private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 phút

    /**
     * Lazy cleanup: chỉ dọn khi có request mới, không dùng setInterval
     */
    private lazyCleanup(): void {
        const now = Date.now()
        if (now - this.lastCleanupTime < RateLimiter.CLEANUP_INTERVAL_MS) return

        this.lastCleanupTime = now
        for (const [key, entry] of this.requests.entries()) {
            if (now > entry.resetTime) {
                this.requests.delete(key)
            }
        }
    }

    /**
     * Check if request should be allowed
     * @param identifier - Unique identifier (IP, email, etc.)
     * @param maxRequests - Maximum requests allowed in window
     * @param windowMs - Time window in milliseconds
     * @returns Object with allowed status and retry info
     */
    checkLimit(
        identifier: string,
        maxRequests: number,
        windowMs: number
    ): { allowed: boolean; retryAfter?: number; remaining?: number } {
        // Lazy cleanup thay vì setInterval
        this.lazyCleanup()

        const now = Date.now()
        const entry = this.requests.get(identifier)

        if (!entry || now > entry.resetTime) {
            // First request or window expired, start new window
            this.requests.set(identifier, {
                count: 1,
                resetTime: now + windowMs
            })
            return { allowed: true, remaining: maxRequests - 1 }
        }

        if (entry.count >= maxRequests) {
            // Rate limit exceeded
            const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
            return { allowed: false, retryAfter }
        }

        // Increment counter
        entry.count++
        return { allowed: true, remaining: maxRequests - entry.count }
    }

    /**
     * Reset rate limit for an identifier
     */
    reset(identifier: string): void {
        this.requests.delete(identifier)
    }

    /**
     * Clean up on shutdown
     */
    destroy(): void {
        this.requests.clear()
    }
}

// Singleton instance
const rateLimiter = new RateLimiter()

export default rateLimiter

/**
 * Helper function to get client IP from request
 */
export function getClientIP(request: Request): string {
    // Try to get real IP from headers (for proxies/load balancers)
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
        return forwarded.split(',')[0].trim()
    }

    const realIp = request.headers.get('x-real-ip')
    if (realIp) {
        return realIp
    }

    // Fallback to request IP (may not work in all environments)
    return 'unknown'
}

/**
 * Common rate limit presets
 */
export const RateLimits = {
    // Strict limit for authentication endpoints
    AUTH: {
        maxRequests: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.'
    },
    // Medium limit for sensitive operations
    SENSITIVE: {
        maxRequests: 10,
        windowMs: 10 * 60 * 1000, // 10 minutes
        message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
    },
    // Relaxed limit for general API calls
    GENERAL: {
        maxRequests: 100,
        windowMs: 1 * 60 * 1000, // 1 minute
        message: 'Quá nhiều yêu cầu. Vui lòng chậm lại.'
    }
}
