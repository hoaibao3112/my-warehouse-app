import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { ApiResponse } from "@/lib/types"

/**
 * GET /api/external-sales-exports/[id]/can-delete
 * Check if an export can be deleted (not covered by completed inventory check)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        // Get export creation time
        const exportRecord = await prisma.external_sales_exports.findUnique({
            where: { id },
            select: {
                warehouse_id: true,
                created_at: true
            }
        })

        if (!exportRecord) {
            return NextResponse.json({
                success: false,
                error: "Export not found"
            } as ApiResponse<null>, { status: 404 })
        }

        // Check if warehouse has IN_PROGRESS inventory check
        const { checkInventoryCheckLock } = await import("@/lib/inventory-check-lock")
        const lockStatus = await checkInventoryCheckLock(exportRecord.warehouse_id)

        if (lockStatus.isLocked) {
            // Warehouse is locked - cannot delete
            return NextResponse.json({
                success: true,
                canDelete: false,
                reason: "WAREHOUSE_LOCKED",
                message: lockStatus.message
            })
        }

        // Check if export is covered by COMPLETED inventory check
        if (exportRecord.created_at) {
            const completedCheck = await prisma.inventory_checks.findFirst({
                where: {
                    warehouse_id: exportRecord.warehouse_id,
                    status: 'COMPLETED',
                    updated_at: {
                        gte: exportRecord.created_at
                    }
                },
                select: {
                    number: true
                }
            })

            if (completedCheck) {
                // Export is covered by completed inventory check - cannot delete
                return NextResponse.json({
                    success: true,
                    canDelete: false,
                    reason: "COVERED_BY_INVENTORY_CHECK",
                    message: `Phiếu xuất đã nằm trong kiểm kê hoàn thành: ${completedCheck.number}`
                })
            }
        }

        // Can delete
        return NextResponse.json({
            success: true,
            canDelete: true
        })
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
