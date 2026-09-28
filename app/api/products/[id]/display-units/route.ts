import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import { unitConversionService } from '@/lib/services/unit-conversion-service'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Params is a Promise in Next.js 15
) {
    try {
        const { id } = await params
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)
        const baseQuantity = Number(searchParams.get('baseQuantity') || '0')

        const options = await unitConversionService.getDisplayUnitOptions(id, baseQuantity)

        return NextResponse.json({
            success: true,
            data: options
        } as ApiResponse<any>)

    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
