import { NextRequest, NextResponse } from "next/server"

/** DEPRECATED - Use /api/internal-transfer-requests/[id]/confirm-discrepancy instead */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    error: 'Deprecated endpoint',
    message: 'Use /api/internal-transfer-requests/[id]/confirm-discrepancy',
    deprecatedSince: '2026-01-15'
  }, { status: 410 })
}
