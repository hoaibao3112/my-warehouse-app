import { NextRequest } from "next/server"

// Redirect to /api/shifts/current
// Sales sessions API uses the same endpoint as shifts
// Direct import handler to avoid internal fetch issues
import { GET as getShift } from "../../shifts/current/route"

export const dynamic = 'force-dynamic'

// Redirect to /api/shifts/current
// Sales sessions API uses the same endpoint as shifts
export async function GET(request: NextRequest) {
    return getShift(request)
}
