import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import { translateError } from "@/lib/error-translator"

/**
 * External Sales Exports API - NEW ARCHITECTURE
 * 
 * Uses externalSalesService with unit conversion
 * 
 * FIXES:
 * - Reads from warehouse_stock_realtime
 * - Uses service layer for atomic operations
 * - Proper unit validation and conversion
 */

export async function GET(request: NextRequest) {
    try {
        const token = getAuthToken(request)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const searchParams = request.nextUrl.searchParams
        const page = Number.parseInt(searchParams.get("page") || "1")
        const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
        const warehouseId = searchParams.get("warehouseId")
        const customerId = searchParams.get("customerId")
        const status = searchParams.get("status")
        const search = searchParams.get("search") || ""

        // Use external sales service
        const { externalSalesService } = await import('@/lib/services')

        const result = await externalSalesService.listExports({
            warehouseId: warehouseId || undefined,
            customerId: customerId || undefined,
            status: status || undefined,
            search: search || undefined,
            skip: (page - 1) * pageSize,
            take: pageSize
        })

        // Get total count
        const where: any = {}
        if (warehouseId) where.warehouse_id = warehouseId
        if (customerId) where.customer_id = customerId
        if (status) where.status = status
        if (search) {
            where.OR = [
                { export_number: { contains: search, mode: "insensitive" } },
                { customer: { name: { contains: search, mode: "insensitive" } } }
            ]
        }

        const total = await prisma.external_sales_exports.count({ where })

        return NextResponse.json({
            success: true,
            data: result,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        } as PaginatedResponse<typeof result[0]>)
    } catch (error: any) {
        console.error("GET /api/external-sales-exports error:", error)
        return NextResponse.json(
            { success: false, error: translateError(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        // Only ADMIN, MANAGER, WAREHOUSE_STAFF can create exports
        if (!["ADMIN", "MANAGER", "WAREHOUSE_STAFF"].includes(user.role)) {
            return NextResponse.json(
                { success: false, error: "Forbidden" } as ApiResponse<null>,
                { status: 403 }
            )
        }

        const body = await request.json()
        const { warehouseId, customerId, notes, items, exportDate } = body || {}

        // Validation
        if (!warehouseId || !customerId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { success: false, error: "Thiếu thông tin bắt buộc: warehouseId, customerId, items" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Verify warehouse is MAIN type
        const warehouse = await prisma.warehouses.findUnique({
            where: { id: warehouseId },
            select: { type: true, name: true },
        })

        if (!warehouse) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy kho" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        if (warehouse.type !== "MAIN") {
            return NextResponse.json(
                {
                    success: false,
                    error: "Chỉ kho tổng (MAIN) mới được phép xuất bán hàng ra bên ngoài",
                } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // CRITICAL: Check for IN_PROGRESS inventory check
        const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
        const lockCheck = await checkInventoryCheckLock(warehouseId)

        if (lockCheck.isLocked) {
            return NextResponse.json(
                { success: false, error: lockCheck.message } as ApiResponse<null>,
                { status: 423 } // 423 Locked
            )
        }

        // Verify customer exists and is active
        const customer = await prisma.external_customers.findUnique({
            where: { id: customerId },
            select: { is_active: true, name: true },
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy khách hàng" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        if (!customer.is_active) {
            return NextResponse.json(
                { success: false, error: "Khách hàng đã bị vô hiệu hóa" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Validate items
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (!item.productId || !item.unitId) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `Sản phẩm ${i + 1}: Thiếu thông tin productId hoặc unitId`,
                    } as ApiResponse<null>,
                    { status: 400 }
                )
            }

            const quantity = Number(item.quantity) || 0
            if (quantity <= 0) {
                return NextResponse.json(
                    { success: false, error: `Sản phẩm ${i + 1}: Số lượng phải lớn hơn 0` } as ApiResponse<null>,
                    { status: 400 }
                )
            }

            const unitPrice = Number(item.unitPrice) || 0
            if (unitPrice < 0) {
                return NextResponse.json(
                    { success: false, error: `Sản phẩm ${i + 1}: Đơn giá không được âm` } as ApiResponse<null>,
                    { status: 400 }
                )
            }
        }

        // Use external sales service (with unit conversion)
        const { externalSalesService } = await import('@/lib/services')

        const exportId = await externalSalesService.createExternalSale({
            warehouseId: warehouseId,
            customerId: customerId,
            exportDate: exportDate ? new Date(exportDate) : new Date(),
            items: items.map((item: any) => ({
                productId: item.productId,
                quantity: Number(item.quantity),
                unitId: item.unitId,
                unitPrice: item.unitPrice ? Number(item.unitPrice) : undefined,
                notes: item.notes
            })),
            notes: notes?.trim() || undefined,
            createdBy: user.id
        })

        // Get created export with details
        const exportRecord = await externalSalesService.getExportById(exportId)

        return NextResponse.json(
            {
                success: true,
                message: "Tạo phiếu xuất bán hàng thành công với quy đổi đơn vị",
                data: {
                    id: exportRecord?.id,
                    exportNumber: exportRecord?.export_number,
                    warehouse: exportRecord?.warehouse?.name,
                    customer: exportRecord?.customer?.name,
                    totalAmount: exportRecord?.total_amount,
                    itemCount: exportRecord?.items?.length || 0,
                    items: exportRecord?.items?.map(item => ({
                        productName: item.product?.name,
                        productCode: item.product?.code,
                        quantity: item.quantity,
                        unit: item.unit?.code,
                        unitPrice: item.unit_price,
                        lineTotal: item.line_total
                    }))
                }
            } as ApiResponse<any>,
            { status: 201 }
        )
    } catch (error: any) {
        console.error("POST /api/external-sales-exports error:", error)
        return NextResponse.json(
            { success: false, error: translateError(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
