import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import { translateError } from "@/lib/error-translator"

/**
 * @swagger
 * /api/external-customers/{id}:
 *   get:
 *     summary: Get External Customer by ID
 *     tags: [External Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = getAuthToken(request)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { id } = await params

        const customer = await prisma.external_customers.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { external_sales_exports: true },
                },
            },
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy khách hàng" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: customer,
        } as ApiResponse<typeof customer>)
    } catch (error: any) {
        console.error("GET /api/external-customers/[id] error:", error)
        return NextResponse.json(
            { success: false, error: translateError(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * @swagger
 * /api/external-customers/{id}:
 *   put:
 *     summary: Update External Customer
 *     tags: [External Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               notes:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Customer updated successfully
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        // Only ADMIN, MANAGER, WAREHOUSE_STAFF can update customers
        if (!["ADMIN", "MANAGER", "WAREHOUSE_STAFF"].includes(user.role)) {
            return NextResponse.json(
                { success: false, error: "Forbidden" } as ApiResponse<null>,
                { status: 403 }
            )
        }

        const { id } = await params
        const body = await request.json()
        const { name, address, phone, notes, isActive } = body || {}

        // Check if customer exists
        const exists = await prisma.external_customers.findUnique({
            where: { id },
        })

        if (!exists) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy khách hàng" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        const updateData: any = {}

        if (name !== undefined) {
            if (!name.trim()) {
                return NextResponse.json(
                    { success: false, error: "Tên khách hàng không được để trống" } as ApiResponse<null>,
                    { status: 400 }
                )
            }
            updateData.name = name.trim()
        }

        if (address !== undefined) updateData.address = address?.trim() || null
        if (phone !== undefined) updateData.phone = phone?.trim() || null
        if (notes !== undefined) updateData.notes = notes?.trim() || null
        if (isActive !== undefined) updateData.is_active = Boolean(isActive)

        const customer = await prisma.external_customers.update({
            where: { id },
            data: updateData,
        })

        return NextResponse.json({
            success: true,
            data: customer,
        } as ApiResponse<typeof customer>)
    } catch (error: any) {
        console.error("PUT /api/external-customers/[id] error:", error)
        return NextResponse.json(
            { success: false, error: translateError(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * @swagger
 * /api/external-customers/{id}:
 *   delete:
 *     summary: Soft Delete External Customer
 *     tags: [External Customers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        // Allow ADMIN, MANAGER, WAREHOUSE_STAFF to delete
        if (!["ADMIN", "MANAGER", "WAREHOUSE_STAFF"].includes(user.role)) {
            return NextResponse.json(
                { success: false, error: "Không có quyền xóa khách hàng" } as ApiResponse<null>,
                { status: 403 }
            )
        }

        const { id } = await params

        // Check if customer has any exports
        const exportsCount = await prisma.external_sales_exports.count({
            where: {
                customer_id: id,
                status: "ACTIVE",
            },
        })

        if (exportsCount > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Không thể xóa khách hàng vì còn ${exportsCount} phiếu xuất đang hoạt động`,
                } as ApiResponse<null>,
                { status: 400 }
            )
        }

        // Soft delete by setting is_active to false
        const customer = await prisma.external_customers.update({
            where: { id },
            data: { is_active: false },
        })

        return NextResponse.json({
            success: true,
            data: customer,
        } as ApiResponse<typeof customer>)
    } catch (error: any) {
        console.error("DELETE /api/external-customers/[id] error:", error)
        return NextResponse.json(
            { success: false, error: translateError(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
