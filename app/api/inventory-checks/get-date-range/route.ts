import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const token = getAuthToken(request)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get('warehouseId')

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: 'warehouseId is required' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Get the latest completed inventory check for this warehouse
    const lastCheck = await prisma.inventory_checks.findFirst({
      where: {
        warehouse_id: warehouseId,
        status: 'COMPLETED',
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        created_at: true,
      },
    })

    // If there's a last check, calculate from that date
    // Otherwise, calculate from the beginning (no date limit)
    let startDate: string
    let endDate: string

    if (lastCheck) {
      // From the last check date to today
      startDate = lastCheck.created_at.toISOString().split('T')[0]
    } else {
      // From a very old date (effectively no limit) - use year 2000
      startDate = '2000-01-01'
    }

    // End date is always today
    endDate = new Date().toISOString().split('T')[0]

    return NextResponse.json({
      success: true,
      data: {
        startDate,
        endDate,
        lastCheckDate: lastCheck?.created_at || null,
      },
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error('Get inventory check date range error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get date range' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
