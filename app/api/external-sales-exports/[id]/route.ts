import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * External Sales Export Detail API
 * 
 * GET, PUT, DELETE for individual export records
 */

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const token = getAuthToken(req)
        if (!token || !verifyToken(token)) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { externalSalesService } = await import('@/lib/services')
        const exportRecord = await externalSalesService.getExportById(id)

        if (!exportRecord) {
            return NextResponse.json(
                { success: false, error: "Export not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: exportRecord
        } as ApiResponse<any>)
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const token = getAuthToken(req)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        // Get export to check warehouse ownership
        const exportRecord = await prisma.external_sales_exports.findUnique({
            where: { id },
            select: { warehouse_id: true }
        })

        if (!exportRecord) {
            return NextResponse.json(
                { success: false, error: "Export not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // Permission check: ADMIN or MANAGER of the warehouse
        const isAdmin = user.role === 'ADMIN'
        const isWarehouseManager = user.role === 'MANAGER' && user.warehouseId === exportRecord.warehouse_id

        if (!isAdmin && !isWarehouseManager) {
            return NextResponse.json(
                { success: false, error: "Forbidden - Only warehouse manager or admin can delete" } as ApiResponse<null>,
                { status: 403 }
            )
        }

        // Use service method to delete and restore stock
        const { externalSalesService } = await import('@/lib/services')
        await externalSalesService.deleteExternalSale(id)

        return NextResponse.json({
            success: true,
            message: "Export deleted and stock restored successfully"
        } as ApiResponse<any>)
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
