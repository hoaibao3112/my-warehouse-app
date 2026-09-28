import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Inventory Adjustment API
 * 
 * Handles inventory adjustments for:
 * - LOSS: Items lost or stolen
 * - DAMAGE: Items damaged and unusable
 * - FOUND: Items found during inventory check
 * - MANUAL: Manual adjustments for corrections
 * 
 * Uses adjustment-service with unit validation
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
            adjustmentType, // LOSS, DAMAGE, FOUND, MANUAL
            reason,
            adjustmentDate,
            items, // Array of { productId, quantityBefore, quantityAfter, unitId, notes }
            approvedBy
        } = body

        if (!warehouseId || !adjustmentType || !reason || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid required fields" } as ApiResponse<null>,
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

        // Get user info
        const { prisma } = await import('@/lib/prisma')

        const user = await prisma.users.findUnique({
            where: { id: payload.id },
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // Generate adjustment number if not provided
        const finalAdjustmentNumber = adjustmentNumber ||
            `ADJ-${adjustmentType}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`

        // Validate items have required fields
        for (const item of items) {
            if (!item.productId || item.quantityBefore == null || item.quantityAfter == null || !item.unitId) {
                return NextResponse.json(
                    { success: false, error: "Each item must have productId, quantityBefore, quantityAfter, and unitId" } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        // Use adjustment service
        const { adjustmentService } = await import('@/lib/services')

        const adjustmentId = await adjustmentService.createAdjustment({
            adjustmentNumber: finalAdjustmentNumber,
            warehouseId: warehouseId,
            adjustmentType: adjustmentType,
            reason: reason,
            adjustmentDate: adjustmentDate ? new Date(adjustmentDate) : new Date(),
            items: items.map(item => ({
                productId: item.productId,
                quantityBefore: item.quantityBefore,
                quantityAfter: item.quantityAfter,
                unitId: item.unitId,
                notes: item.notes
            })),
            approvedBy: approvedBy || payload.id, // Default to creator if no approver
            createdBy: payload.id
        })

        // Get created adjustment with details
        const adjustment = await adjustmentService.getAdjustmentById(adjustmentId)

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: adjustment?.id,
                    adjustmentNumber: adjustment?.adjustment_number,
                    warehouseId: adjustment?.warehouse_id,
                    warehouseName: adjustment?.warehouse?.name,
                    adjustmentType: adjustment?.adjustment_type,
                    reason: adjustment?.reason,
                    itemCount: adjustment?.items?.length || 0,
                    adjustmentDate: adjustment?.adjustment_date,
                    approvedBy: adjustment?.approver?.full_name,
                    createdBy: adjustment?.creator?.full_name,
                    message: `Điều chỉnh ${adjustmentType} đã được tạo thành công. ${adjustment?.items?.length || 0} sản phẩm đã được cập nhật.`,
                    items: adjustment?.items?.map(item => ({
                        productName: item.product?.name,
                        productCode: item.product?.code,
                        quantityBefore: item.quantity_before,
                        quantityAfter: item.quantity_after,
                        quantityChange: item.quantity_change,
                        unit: item.product?.product_units?.code,
                        notes: item.notes
                    }))
                },
            } as ApiResponse<any>,
            { status: 201 }
        )
    } catch (error: any) {
        console.error("Error creating adjustment:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * GET: List adjustments
 */
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

        const { prisma } = await import('@/lib/prisma')

        const where: any = {}
        if (warehouseId) where.warehouse_id = warehouseId
        if (adjustmentType) where.adjustment_type = adjustmentType

        const total = await prisma.inventory_adjustments.count({ where })

        return NextResponse.json({
            success: true,
            data: adjustments,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error fetching adjustments:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
