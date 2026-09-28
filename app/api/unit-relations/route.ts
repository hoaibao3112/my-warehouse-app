import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const unitId = searchParams.get('unitId')

    if (!unitId) {
      return NextResponse.json({ success: false, error: 'unitId is required' } as ApiResponse<null>, { status: 400 })
    }

    // Fetch conversions involving this unit (as source or target)
    const conversions = await prisma.unit_relations.findMany({
      where: {
        OR: [
          { from_unit_id: unitId },
          { to_unit_id: unitId }
        ]
      },
      include: {
        product_units_unit_relations_from_unit_idToproduct_units: {
          select: { name: true }
        },
        product_units_unit_relations_to_unit_idToproduct_units: {
          select: { name: true }
        }
      },
      orderBy: {
        created_at: 'asc'
      }
    })

    // Transform to match expected format
    const data = conversions.map(c => ({
      id: c.id,
      fromUnitId: c.from_unit_id,
      toUnitId: c.to_unit_id,
      fromUnitName: c.product_units_unit_relations_from_unit_idToproduct_units?.name || 'Unknown',
      toUnitName: c.product_units_unit_relations_to_unit_idToproduct_units?.name || 'Unknown',
      multiplier: c.multiplier,
      fromQuantity: c.from_quantity,
      toQuantity: c.to_quantity
    }))

    return NextResponse.json({ success: true, data } as ApiResponse<any>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}
