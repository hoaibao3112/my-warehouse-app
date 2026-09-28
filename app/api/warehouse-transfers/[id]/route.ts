import { NextRequest, NextResponse } from "next/server"

/**
 * DEPRECATED API
 * 
 * This legacy warehouse-transfers endpoint is deprecated.
 * Please use the new /api/transfer endpoints instead.
 * 
 * Reason: Duplicate functionality, new API has unit conversion
 * Migration Date: 2026-01-15
 * Removal Date: TBD
 * 
 * New Endpoints:
 * - POST /api/transfer - Create transfer request
 * - POST /api/transfer/export - Export from source warehouse
 * - POST /api/transfer/receive - Receive at destination warehouse
 */

export async function GET(request: NextRequest) {
  console.warn('⚠️ DEPRECATED: /api/warehouse-transfers is deprecated. Use /api/internal-transfer-requests instead.')

  return NextResponse.json({
    error: 'This endpoint is deprecated',
    message: 'Please use /api/internal-transfer-requests instead',
    deprecatedSince: '2026-01-15',
    newEndpoint: '/api/internal-transfer-requests',
    documentation: '/docs/api/internal-transfers'
  }, {
    status: 410,
    headers: {
      'X-Deprecated': 'true',
      'X-Deprecated-Since': '2026-01-15',
      'X-Replacement-Endpoint': '/api/internal-transfer-requests'
    }
  })
}

export async function POST(request: NextRequest) {
  console.warn('⚠️ DEPRECATED: /api/warehouse-transfers is deprecated.')

  return NextResponse.json({
    error: 'This endpoint is deprecated',
    message: 'Please use /api/internal-transfer-requests for creating transfers',
    deprecatedSince: '2026-01-15',
    newEndpoint: '/api/internal-transfer-requests'
  }, {
    status: 410,
    headers: {
      'X-Deprecated': 'true'
    }
  })
}

export async function PUT(request: NextRequest) {
  return POST(request)
}

export async function DELETE(request: NextRequest) {
  return POST(request)
}
