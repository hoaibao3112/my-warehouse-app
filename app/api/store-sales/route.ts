import { NextRequest, NextResponse } from 'next/server'

/**
 * DEPRECATED API
 * 
 * This endpoint is deprecated and will be removed in a future version.
 * Please use /api/sales-invoice instead.
 * 
 * Reason: Duplicate functionality with better unit conversion support
 * Migration Date: 2026-01-15
 * Removal Date: TBD
 */

export async function POST(request: NextRequest) {
  console.warn('⚠️ DEPRECATED: /api/store-sales is deprecated. Use /api/sales-invoice instead.')

  return NextResponse.json({
    error: 'This endpoint is deprecated',
    message: 'Please use /api/sales-invoice instead',
    deprecatedSince: '2026-01-15',
    newEndpoint: '/api/sales-invoice',
    documentation: '/docs/api/sales-invoice'
  }, {
    status: 410, // 410 Gone - indicates permanent deprecation
    headers: {
      'X-Deprecated': 'true',
      'X-Deprecated-Since': '2026-01-15',
      'X-Replacement-Endpoint': '/api/sales-invoice',
      'Deprecation': 'true' // Standard deprecation header
    }
  })
}

export async function PUT(request: NextRequest) {
  console.warn('⚠️ DEPRECATED: /api/store-sales is deprecated. Use /api/sales-invoice instead.')

  return NextResponse.json({
    error: 'This endpoint is deprecated',
    message: 'Please use /api/sales-invoice instead for updates',
    deprecatedSince: '2026-01-15',
    newEndpoint: '/api/sales-invoice',
  }, {
    status: 410,
    headers: {
      'X-Deprecated': 'true',
      'X-Deprecated-Since': '2026-01-15',
      'X-Replacement-Endpoint': '/api/sales-invoice'
    }
  })
}

export async function DELETE(request: NextRequest) {
  console.warn('⚠️ DEPRECATED: /api/store-sales is deprecated. Use /api/sales-invoice instead.')

  return NextResponse.json({
    error: 'This endpoint is deprecated',
    message: 'Please use /api/sales-invoice delete endpoint instead',
    deprecatedSince: '2026-01-15',
    newEndpoint: '/api/sales-invoice',
  }, {
    status: 410,
    headers: {
      'X-Deprecated': 'true',
      'X-Deprecated-Since': '2026-01-15',
      'X-Replacement-Endpoint': '/api/sales-invoice'
    }
  })
}
