import { NextRequest, NextResponse } from "next/server"

/** Purchase Order Detail - Admin/Management Only */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    message: 'PO detail view - metadata only, no stock operations',
    note: 'Stock changes happen via /receive endpoint'
  }, { status: 200 })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    message: 'PO update - metadata only'
  }, { status: 200 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    message: 'PO delete - metadata only'
  }, { status: 200 })
}
