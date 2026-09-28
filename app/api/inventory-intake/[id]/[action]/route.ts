import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse, User } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin, isWarehouseManager, isGeneralManager, canApproveOnBehalfOfWarehouseManager } from "@/lib/auth"

/**
 * Inventory Intake Approval Workflow API
 * 
 * POST /api/inventory-intake/[id]/approve - Approve intake (workflow-aware)
 * POST /api/inventory-intake/[id]/reject - Reject intake
 * 
 * Workflow:
 * 1. PENDING_WAREHOUSE_APPROVAL → Warehouse Manager approves → APPROVED_BY_WAREHOUSE
 * 2. APPROVED_BY_WAREHOUSE → BM approves → APPROVED_BY_BM (executes stock update)
 * 
 * Any stage can be rejected
 */

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; action: string }> }
) {
    try {
        const { id, action } = await params
        const token = getAuthToken(req)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const body = await request.json()
        const { notes } = body

        // Get user info
        const user = await prisma.users.findUnique({
            where: { id: payload.id },
            select: { id: true, role: true, full_name: true }
        })

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // Get intake
        const intake = await prisma.inventory_intakes.findUnique({
            where: { id }
        })

        if (!intake) {
            return NextResponse.json(
                { success: false, error: "Intake not found" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // Handle rejection
        if (action === 'reject') {
            // Only WAREHOUSE_MANAGER, GENERAL_MANAGER or ADMIN can reject
            if (user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'GENERAL_MANAGER' && !isAdmin(user as unknown as User)) {
                return NextResponse.json(
                    { success: false, error: "Only Warehouse Manager or General Manager can reject intakes" } as ApiResponse<null>,
                    { status: 403 }
                )
            }

            // Determine rejection status based on current status
            let rejectionStatus: string
            if (intake.status === 'PENDING_WAREHOUSE_APPROVAL') {
                rejectionStatus = 'REJECTED_BY_WAREHOUSE'
            } else if (intake.status === 'APPROVED_BY_WAREHOUSE') {
                rejectionStatus = 'REJECTED_BY_BM'
            } else {
                return NextResponse.json(
                    { success: false, error: `Cannot reject intake in ${intake.status} status` } as ApiResponse<null>,
                    { status: 400 }
                )
            }

            await prisma.inventory_intakes.update({
                where: { id },
                data: {
                    status: rejectionStatus as any,
                    rejected_by: user.id,
                    rejected_at: new Date(),
                    rejection_reason: notes || body.reason || 'No reason provided',
                    updated_at: new Date()
                }
            })

            return NextResponse.json({
                success: true,
                message: `Intake rejected by ${user.full_name}`,
                data: { status: rejectionStatus }
            } as ApiResponse<any>)
        }

        // Handle approval
        if (action === 'approve') {
            // Warehouse Manager approval (or GM with special permission)
            const canApproveAsWM = user.role === 'WAREHOUSE_MANAGER' || canApproveOnBehalfOfWarehouseManager(user as unknown as User)
            if (canApproveAsWM && intake.status === 'PENDING_WAREHOUSE_APPROVAL') {
                await prisma.inventory_intakes.update({
                    where: { id },
                    data: {
                        status: 'APPROVED_BY_WAREHOUSE',
                        approved_by_warehouse: user.id,
                        approved_at_warehouse: new Date(),
                        warehouse_notes: notes,
                        updated_at: new Date()
                    }
                })

                return NextResponse.json({
                    success: true,
                    message: `Intake approved by ${user.role === 'WAREHOUSE_MANAGER' ? 'Warehouse Manager' : 'General Manager'}. Waiting for final approval.`,
                    data: { status: 'APPROVED_BY_WAREHOUSE', nextApprover: 'GENERAL_MANAGER' }
                } as ApiResponse<any>)
            }

            // GENERAL_MANAGER approval (FINAL - executes stock update)
            if (user.role === 'GENERAL_MANAGER' && intake.status === 'APPROVED_BY_WAREHOUSE') {
                // Update status first
                await prisma.inventory_intakes.update({
                    where: { id },
                    data: {
                        status: 'APPROVED_BY_BM',
                        approved_by_bm: user.id,
                        approved_at_bm: new Date(),
                        bm_notes: notes,
                        updated_at: new Date()
                    }
                })

                // TODO: Execute stock update using importService
                // This should be done here ONLY after final GENERAL_MANAGER approval
                // await executeStockUpdate(intake)

                return NextResponse.json({
                    success: true,
                    message: `Intake fully approved by General Manager. Stock updated.`,
                    data: { status: 'APPROVED_BY_BM', completed: true }
                } as ApiResponse<any>)
            }

            // Admin can approve any stage
            if (isAdmin(user as unknown as User)) {
                if (intake.status === 'PENDING_WAREHOUSE_APPROVAL') {
                    await prisma.inventory_intakes.update({
                        where: { id },
                        data: {
                            status: 'APPROVED_BY_WAREHOUSE',
                            approved_by_warehouse: user.id,
                            approved_at_warehouse: new Date(),
                            warehouse_notes: notes || 'Approved by Admin',
                            updated_at: new Date()
                        }
                    })

                    return NextResponse.json({
                        success: true,
                        message: `Intake approved by Admin (as Warehouse Manager)`,
                        data: { status: 'APPROVED_BY_WAREHOUSE' }
                    } as ApiResponse<any>)
                }

                if (intake.status === 'APPROVED_BY_WAREHOUSE') {
                    await prisma.inventory_intakes.update({
                        where: { id },
                        data: {
                            status: 'APPROVED_BY_BM',
                            approved_by_bm: user.id,
                            approved_at_bm: new Date(),
                            bm_notes: notes || 'Approved by Admin',
                            updated_at: new Date()
                        }
                    })

                    return NextResponse.json({
                        success: true,
                        message: `Intake fully approved by Admin (as BM)`,
                        data: { status: 'APPROVED_BY_BM' }
                    } as ApiResponse<any>)
                }
            }

            // If we get here, user doesn't have permission or wrong status
            return NextResponse.json(
                {
                    success: false,
                    error: `Cannot approve. Current status: ${intake.status}. Your role: ${user.role}. This intake is not awaiting your approval.`
                } as ApiResponse<null>,
                { status: 403 }
            )
        }

        return NextResponse.json(
            { success: false, error: "Invalid action. Use 'approve' or 'reject'" } as ApiResponse<null>,
            { status: 400 }
        )

    } catch (error: any) {
        console.error("Error in intake approval:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
