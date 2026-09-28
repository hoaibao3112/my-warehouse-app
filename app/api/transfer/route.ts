import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Internal Transfer API
 * 
 * Handles warehouse-to-warehouse transfers with CRITICAL unit conversion
 * 
 * FIXES THE PROBLEM:
 * - Kho tổng xuất: 1 gói (100ML)
 * - Kho con nhận: 100ML
 * - Both stored as 100ML base unit → NO DISCREPANCY!
 * 
 * Flow:
 * 1. POST /api/transfer - Create transfer request
 * 2. POST /api/transfer/export - Export from source
 * 3. POST /api/transfer/receive - Receive at destination
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
            transferNumber,
            fromWarehouseId,
            toWarehouseId,
            requestDate,
            items, // Array of { productId, requestedQuantity, requestedUnitId }
            notes
        } = body

        if (!fromWarehouseId || !toWarehouseId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid required fields" } as ApiResponse<null>,
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

        // Generate transfer number if not provided
        const finalTransferNumber = transferNumber ||
            `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`

        // Validate items have required fields
        for (const item of items) {
            if (!item.productId || !item.requestedQuantity || !item.requestedUnitId) {
                return NextResponse.json(
                    { success: false, error: "Each item must have productId, requestedQuantity, and requestedUnitId" } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        // Use transfer service
        const { transferService } = await import('@/lib/services')

        const transferId = await transferService.createTransferRequest({
            transferNumber: finalTransferNumber,
            fromWarehouseId: fromWarehouseId,
            toWarehouseId: toWarehouseId,
            requestDate: requestDate ? new Date(requestDate) : new Date(),
            items: items.map(item => ({
                productId: item.productId,
                requestedQuantity: item.requestedQuantity,
                requestedUnitId: item.requestedUnitId
            })),
            notes: notes,
            requestedBy: payload.id
        })

        // Get created transfer with details
        const transfer = await transferService.getTransferById(transferId)

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: transfer?.id,
                    transferNumber: transfer?.transfer_number,
                    fromWarehouse: transfer?.from_warehouse?.name,
                    toWarehouse: transfer?.to_warehouse?.name,
                    status: transfer?.status,
                    itemCount: transfer?.items?.length || 0,
                    requestDate: transfer?.request_date,
                    message: `Transfer request created successfully. Status: PENDING`,
                    items: transfer?.items?.map(item => ({
                        productName: item.product?.name,
                        productCode: item.product?.code,
                        requestedQuantity: item.requested_quantity,
                        requestedUnit: item.requested_unit?.code
                    }))
                },
            } as ApiResponse<any>,
            { status: 201 }
        )
    } catch (error: any) {
        console.error("Error creating transfer:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * GET: List transfers
 */
export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const fromWarehouseId = searchParams.get("fromWarehouseId")
        const toWarehouseId = searchParams.get("toWarehouseId")
        const status = searchParams.get("status")
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

        const { transferService } = await import('@/lib/services')

        const transfers = await transferService.listTransfers({
            fromWarehouseId: fromWarehouseId || undefined,
            toWarehouseId: toWarehouseId || undefined,
            status: status || undefined,
            skip: (page - 1) * pageSize,
            take: pageSize
        })

        const { prisma } = await import('@/lib/prisma')

        const where: any = {}
        if (fromWarehouseId) where.from_warehouse_id = fromWarehouseId
        if (toWarehouseId) where.to_warehouse_id = toWarehouseId
        if (status) where.status = status

        const total = await prisma.internal_transfer_requests.count({ where })

        return NextResponse.json({
            success: true,
            data: transfers,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error fetching transfers:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
