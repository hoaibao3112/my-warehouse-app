import { NextRequest, NextResponse } from 'next/server'
import { generateCapacitorToken } from '@/lib/capacitor-auth'

/**
 * Initialize Capacitor app with signed authentication token
 * This endpoint is called by Capacitor app on startup to get a signed cookie
 */
export async function POST(request: NextRequest) {
    try {
        // Get device info from request body (optional)
        const body = await request.json().catch(() => ({}))
        const { platform, model, uuid } = body

        // Generate signed token
        const token = generateCapacitorToken({
            platform,
            model,
            uuid
        })

        const response = NextResponse.json({
            success: true,
            message: 'Capacitor app initialized'
        })

        // Set signed cookie with 30-day expiration
        response.cookies.set('capacitor-app', token, {
            httpOnly: false, // Client needs to read this for debugging
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60 // 30 days
        })

        return response
    } catch (error) {
        console.error('[Capacitor Init] Error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to initialize Capacitor app' },
            { status: 500 }
        )
    }
}

/**
 * GET endpoint for health check
 */
export async function GET() {
    return NextResponse.json({
        success: true,
        message: 'Capacitor init endpoint is ready'
    })
}
