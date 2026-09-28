import { NextRequest, NextResponse } from "next/server"

/** DEPRECATED - Use /api/internal-transfer-requests/[id]/receive instead */
export async function PUT(request: NextRequest) {
  return NextResponse.json({
    error: 'Deprecated endpoint',
    message: 'Use /api/internal-transfer-requests/[id]/receive',
    deprecatedSince: '2026-01-15'
  }, { status: 410 })
}
