/**
 * Capacitor app authentication utilities
 * Provides signed cookie verification to prevent bypass attacks
 */

import crypto from 'crypto'

// Force this module to run in Node.js runtime (not Edge Runtime)
export const runtime = 'nodejs'

// Secret key for signing Capacitor app cookies
// This should be different from JWT_SECRET for defense in depth
const CAPACITOR_SECRET = process.env.CAPACITOR_SECRET || process.env.JWT_SECRET || 'capacitor-secret-change-in-production'

if (!process.env.CAPACITOR_SECRET && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  CAPACITOR_SECRET not set! Using JWT_SECRET fallback. Set CAPACITOR_SECRET in production.')
}

/**
 * Generate a signed token for Capacitor app identification
 * This token expires and cannot be forged without the secret key
 *
 * @param deviceInfo - Optional device information for additional verification
 * @returns Signed token string
 */
export function generateCapacitorToken(deviceInfo?: {
    platform?: string
    model?: string
    uuid?: string
}): string {
    const payload = {
        type: 'capacitor-app',
        timestamp: Date.now(),
        expires: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
        ...deviceInfo
    }

    const payloadStr = JSON.stringify(payload)
    const payloadB64 = Buffer.from(payloadStr).toString('base64url')

    // Create HMAC signature
    const signature = crypto
        .createHmac('sha256', CAPACITOR_SECRET)
        .update(payloadB64)
        .digest('base64url')

    return `${payloadB64}.${signature}`
}

/**
 * Verify a Capacitor app token
 *
 * @param token - Token to verify
 * @returns Object with verification result and payload if valid
 */
export function verifyCapacitorToken(token: string): {
    valid: boolean
    payload?: any
    error?: string
} {
    try {
        if (!token || typeof token !== 'string') {
            return { valid: false, error: 'Invalid token format' }
        }

        const parts = token.split('.')
        if (parts.length !== 2) {
            return { valid: false, error: 'Invalid token structure' }
        }

        const [payloadB64, providedSignature] = parts

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', CAPACITOR_SECRET)
            .update(payloadB64)
            .digest('base64url')

        if (providedSignature !== expectedSignature) {
            return { valid: false, error: 'Invalid signature' }
        }

        // Decode and parse payload
        const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf-8')
        const payload = JSON.parse(payloadStr)

        // Check expiration
        if (payload.expires && Date.now() > payload.expires) {
            return { valid: false, error: 'Token expired' }
        }

        // Verify it's a Capacitor token
        if (payload.type !== 'capacitor-app') {
            return { valid: false, error: 'Invalid token type' }
        }

        return { valid: true, payload }
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Verification failed'
        }
    }
}

/**
 * Check if a request is from a verified Capacitor app
 *
 * @param request - Next.js request object
 * @returns Object with verification status and whether it's first-time init
 */
export function isVerifiedCapacitorApp(request: Request): {
    verified: boolean
    isFirstTime: boolean
} {
    // Check for signed capacitor-app cookie
    const cookieHeader = request.headers.get('cookie') || ''
    const capacitorTokenMatch = cookieHeader.match(/capacitor-app=([^;]+)/)

    if (!capacitorTokenMatch) {
        // No token found - check if this might be first-time Capacitor app
        // Look for Capacitor-specific user agent or other indicators
        const userAgent = request.headers.get('user-agent') || ''

        // If User-Agent contains "Capacitor" AND no token, likely first-time init
        const isFirstTimeCapacitor = userAgent.includes('Capacitor')

        return {
            verified: false,
            isFirstTime: isFirstTimeCapacitor
        }
    }

    const token = decodeURIComponent(capacitorTokenMatch[1])
    const verification = verifyCapacitorToken(token)

    if (!verification.valid) {
        console.warn('[Capacitor Auth] Invalid token:', verification.error)
        return { verified: false, isFirstTime: false }
    }

    return { verified: true, isFirstTime: false }
}

/**
 * Simple check - just returns boolean for backward compatibility
 */
export function isCapacitorAppVerified(request: Request): boolean {
    return isVerifiedCapacitorApp(request).verified
}
