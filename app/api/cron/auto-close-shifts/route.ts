import { NextRequest, NextResponse } from "next/server"
import { runAutoCloseShifts } from "@/lib/cron/auto-close-logic"
import { formatVietnamDateTime, getVietnamNow } from "@/lib/server-time"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')
        // Validate secret if configured
        if (process.env.CRON_SECRET) {
            if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
        }

        const result = await runAutoCloseShifts() // Call shared logic

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: formatVietnamDateTime(getVietnamNow())
        })
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
}
