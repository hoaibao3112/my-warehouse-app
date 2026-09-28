import { prisma } from "@/lib/prisma"

/**
 * Check if there's an IN_PROGRESS inventory check for a warehouse
 * If exists, block all stock operations until completed/deleted
 */
export async function checkInventoryCheckLock(warehouseId: string): Promise<{
    isLocked: boolean
    message?: string
    checkNumber?: string
}> {
    const activeCheck = await prisma.inventory_checks.findFirst({
        where: {
            warehouse_id: warehouseId,
            status: 'IN_PROGRESS'
        },
        select: {
            id: true,
            number: true,
            created_at: true
        },
        orderBy: {
            created_at: 'desc'
        }
    })

    if (activeCheck) {
        const lock = {
            isLocked: true,
            message: `Không thể thực hiện. Phiếu kiểm kê ${activeCheck.number} đang tiến hành. Vui lòng hoàn thành hoặc xóa phiếu kiểm kê trước.`,
            checkNumber: activeCheck.number
        }
        return lock
    }

    return { isLocked: false }
}

/**
 * Check if there's ANY IN_PROGRESS inventory check (for creating new check)
 */
export async function checkAnyInventoryCheckInProgress(): Promise<{
    hasInProgress: boolean
    message?: string
    warehouseName?: string
    checkNumber?: string
}> {
    const activeCheck = await prisma.inventory_checks.findFirst({
        where: {
            status: 'IN_PROGRESS'
        },
        select: {
            id: true,
            number: true,
            warehouse_id: true
        },
        orderBy: {
            created_at: 'desc'
        }
    })

    if (activeCheck) {
        // Fetch warehouse name separately
        const warehouse = await prisma.warehouses.findUnique({
            where: { id: activeCheck.warehouse_id },
            select: { name: true }
        })

        return {
            hasInProgress: true,
            message: `Không thể tạo phiếu kiểm kê mới. Phiếu ${activeCheck.number} tại ${warehouse?.name || 'kho'} đang tiến hành. Vui lòng hoàn thành hoặc xóa trước.`,
            warehouseName: warehouse?.name,
            checkNumber: activeCheck.number
        }
    }

    return { hasInProgress: false }
}
