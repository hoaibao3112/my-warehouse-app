import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplierId')

    if (!supplierId) {
      return NextResponse.json(
        { success: false, error: 'Supplier ID is required' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Fetch supplier products with product details
    const supplierProducts = await prisma.supplier_products.findMany({
      where: {
        supplier_id: supplierId,
      },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            default_unit_id: true,
          },
        },
        product_units: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: {
        products: {
          name: 'asc',
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: supplierProducts,
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error fetching supplier products:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi lấy sản phẩm nhà cung cấp' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
