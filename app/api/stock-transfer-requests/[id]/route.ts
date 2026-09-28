import { NextRequest, NextResponse } from "next/server"

/**
 * DEPRECATED API
 * 
 * This legacy stock-transfer-requests endpoint is deprecated.
 * Please use the new /api/internal-transfer-requests endpoints instead.
 * 
 * Reason: Consolidated into single internal transfer system
 * Migration Date: 2026-01-15
 */

export async function GET(request: NextRequest) {
  return NextResponse.json({
    error: 'This endpoint is deprecated',
    message: 'Please use /api/internal-transfer-requests instead',
    deprecatedSince: '2026-01-15',
    newEndpoint: '/api/internal-transfer-requests'
  }, { status: 410, headers: { 'X-Deprecated': 'true' } })
}

export async function POST(request: NextRequest) {
  return GET(request)
}

export async function PUT(request: NextRequest) {
  return GET(request)
}

export async function PATCH(request: NextRequest) {
  return GET(request)
}

export async function DELETE(request: NextRequest) {
  return GET(request)
}
