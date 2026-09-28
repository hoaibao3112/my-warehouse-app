import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Transfer Export API
 * 
 * Export items from source warehouse
 * DEDUCTS stock from source using base unit quantities
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
            transferId,
            exportDate,
            items // Array of { itemId, exportedQuantity, exportedUnitId }
        } = body

        if (!transferId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid required fields" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Validate items
        for (const item of items) {
            if (!item.itemId || !item.exportedQuantity || !item.exportedUnitId) {
                return NextResponse.json(
                    { success: false, error: "Each item must have itemId, exportedQuantity, and exportedUnitId" } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        const { transferService } = await import('@/lib/services')

        await transferService.exportTransfer({
            transferId: transferId,
            exportDate: exportDate ? new Date(exportDate) : new Date(),
            items: items,
            exportedBy: payload.id
        })

        const transfer = await transferService.getTransferById(transferId)

        return NextResponse.json({
            success: true,
            data: {
                id: transfer?.id,
                transferNumber: transfer?.transfer_number,
                status: transfer?.status,
                exportedDate: transfer?.exported_date,
                message: `Items exported successfully from ${transfer?.from_warehouse?.name}. Stock deducted in BASE UNITS.`
            }
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error exporting transfer:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
