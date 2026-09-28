import { NextRequest, NextResponse } from "next/server"

/** Purchase Orders Main Route - Admin/Management Only (No Stock Impact) */
export async function GET(request: NextRequest) {
  // Pass-through - no migration needed (just metadata queries)
  return NextResponse.json({
    message: 'Purchase orders list - no stock operations',
    note: 'This endpoint handles PO metadata only, no unit conversion needed'
  }, { status: 200 })
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'Purchase order creation - metadata only',
    note: 'Stock operations happen via /api/purchase-orders-detail/[id]/receive'
  }, { status: 200 })
}
