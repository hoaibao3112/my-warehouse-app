import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Inventory Adjustments API - NEW ARCHITECTURE
 * 
 * Uses adjustmentService with unit conversion
 * 
 * FIXES:
 * - Unit validation required
 * - Conversion to base units
 * - Atomic stock updates
 * - Proper audit trail
 */

export async function POST(req: NextRequest) {
  try {
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await req.json()
    const {
      adjustmentNumber,
      warehouseId,
      adjustmentType, // 'LOSS', 'DAMAGE', 'FOUND', 'MANUAL'
      reason,
      adjustmentDate,
      items,
      notes,
      approvedBy
    } = body

    // Validate required fields
    if (!warehouseId || !adjustmentType || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: warehouseId, adjustmentType, items" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate adjustment type
    const validTypes = ['LOSS', 'DAMAGE', 'FOUND', 'MANUAL']
    if (!validTypes.includes(adjustmentType)) {
      return NextResponse.json(
        { success: false, error: `Invalid adjustment type. Must be one of: ${validTypes.join(', ')}` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || item.quantityBefore === undefined || item.quantityAfter === undefined || !item.unitId) {
        return NextResponse.json(
          { success: false, error: "Mỗi sản phẩm cần có mã, số lượng trước/sau và đơn vị" } as ApiResponse<null>,
          { status: 400 }
        )
      }
      if (Number(item.quantityAfter) < 0) {
        return NextResponse.json(
          { success: false, error: `Sản phẩm ${item.productId} có số lượng sau điều chỉnh không hợp lệ (nhỏ hơn 0)` } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // Generate adjustment number if not provided
    const finalAdjustmentNumber = adjustmentNumber ||
      `ADJ-${adjustmentType}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`

    // Use adjustment service
    const { adjustmentService } = await import('@/lib/services')

    const adjustmentId = await adjustmentService.createAdjustment({
      adjustmentNumber: finalAdjustmentNumber,
      warehouseId: warehouseId,
      adjustmentType: adjustmentType,
      reason: reason || `${adjustmentType} adjustment`,
      adjustmentDate: adjustmentDate ? new Date(adjustmentDate) : new Date(),
      items: items.map((item: any) => ({
        productId: item.productId,
        quantityBefore: item.quantityBefore,
        quantityAfter: item.quantityAfter,
        unitId: item.unitId,
        notes: item.notes
      })),
      approvedBy: approvedBy || payload.id,
      createdBy: payload.id
    })

    // Get created adjustment with details
    const adjustment = await adjustmentService.getAdjustmentById(adjustmentId)

    return NextResponse.json({
      success: true,
      message: `Adjustment created successfully with unit conversion`,
      data: {
        id: adjustment?.id,
        adjustmentNumber: adjustment?.adjustment_number,
        adjustmentType: adjustment?.adjustment_type,
        warehouse: adjustment?.warehouse?.name,
        itemsAdjusted: adjustment?.items?.length || 0,
        items: adjustment?.items?.map(item => ({
          productName: item.product?.name,
          productCode: item.product?.code,
          quantityBefore: item.quantity_before,
          quantityAfter: item.quantity_after,
          difference: item.quantity_change,
          unit: item.product?.product_units?.code
        }))
      }
    } as ApiResponse<any>, { status: 201 })
  } catch (error: any) {
    console.error("Error creating adjustment:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const adjustmentType = searchParams.get("adjustmentType")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")

    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const { adjustmentService } = await import('@/lib/services')

    const adjustments = await adjustmentService.listAdjustments({
      warehouseId: warehouseId || undefined,
      adjustmentType: adjustmentType || undefined,
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    // Get total count
    const where: any = {}
    if (warehouseId) where.warehouse_id = warehouseId
    if (adjustmentType) where.adjustment_type = adjustmentType

    const total = await prisma.inventory_adjustments.count({ where })

    return NextResponse.json({
      success: true,
      data: adjustments,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching adjustments:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
