import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Transfer Receive API
 * 
 * Receive items at destination warehouse
 * ADDS stock to destination using base unit quantities
 * Handles discrepancy if received != exported
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
            receiveDate,
            items // Array of { itemId, receivedQuantity, receivedUnitId }
        } = body

        if (!transferId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid required fields" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Validate items
        for (const item of items) {
            if (!item.itemId || !item.receivedQuantity || !item.receivedUnitId) {
                return NextResponse.json(
                    { success: false, error: "Each item must have itemId, receivedQuantity, and receivedUnitId" } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        const { transferService } = await import('@/lib/services')

        await transferService.receiveTransfer({
            transferId: transferId,
            receiveDate: receiveDate ? new Date(receiveDate) : new Date(),
            items: items,
            receivedBy: payload.id
        })

        const transfer = await transferService.getTransferById(transferId)

        // Check for discrepancies
        const discrepancies = transfer?.items?.filter(item => item.discrepancy !== 0) || []

        return NextResponse.json({
            success: true,
            data: {
                id: transfer?.id,
                transferNumber: transfer?.transfer_number,
                status: transfer?.status,
                receivedDate: transfer?.received_date,
                message: discrepancies.length > 0
                    ? `Transfer completed with ${discrepancies.length} discrepancy(ies). Stock added in BASE UNITS.`
                    : `Transfer completed successfully. Stock added in BASE UNITS.`,
                discrepancies: discrepancies.map(item => ({
                    productName: item.product?.name,
                    productCode: item.product?.code,
                    exported: item.exported_base_quantity,
                    received: item.received_base_quantity,
                    discrepancy: item.discrepancy,
                    unit: item.product?.product_units?.code
                }))
            }
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error receiving transfer:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
