import { NextRequest, NextResponse } from "next/server"

/**
 * DEPRECATED - Stock Transactions Query Endpoint
 * 
 * This endpoint provided historical transaction logs.
 * For new architecture, use:
 * - /api/warehouse-stock-new for current stock
 * - Specific service history endpoints for transaction logs
 * 
 * READ-ONLY mode: No new writes allowed
 */

export async function GET(request: NextRequest) {
  return NextResponse.json({
    error: 'Deprecated endpoint',
    message: 'This endpoint is deprecated. Use /api/warehouse-stock-new for current stock levels.',
    deprecatedSince: '2026-01-15',
    note: 'Historical transaction logs will be available via service-specific endpoints'
  }, {
    status: 410,
    headers: { 'X-Deprecated': 'true' }
  })
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    error: 'Writing to stock_transactions is disabled',
    message: 'Use service layer APIs for stock operations',
    deprecatedSince: '2026-01-15'
  }, { status: 403 })
}
