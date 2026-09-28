import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/** External Customers Management API */

export async function GET(request: NextRequest) {
    try {
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const searchParams = request.nextUrl.searchParams
        const search = searchParams.get("search")
        const isActive = searchParams.get("isActive")

        const where: any = {}

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } }
            ]
        }

        if (isActive !== null && isActive !== undefined) {
            where.is_active = isActive === 'true'
        }

        // Context Isolation
        if (user.warehouseId) {
            where.warehouse_id = user.warehouseId
        }

        const customers = await prisma.external_customers.findMany({
            where,
            orderBy: { name: 'asc' }
        })

        return NextResponse.json({
            success: true,
            data: customers
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error fetching external customers:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
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

        const body = await request.json()
        const { name, address, phone, notes } = body

        if (!name) {
            return NextResponse.json(
                { success: false, error: "Name is required" } as ApiResponse<null>,
                { status: 400 }
            )
        }

        const customer = await prisma.external_customers.create({
            data: {
                name,
                address,
                phone,
                notes,
                is_active: true,
                warehouse_id: user.warehouseId
            }
        })

        return NextResponse.json({
            success: true,
            data: customer
        } as ApiResponse<any>)

    } catch (error: any) {
        console.error("Error creating external customer:", error)
        return NextResponse.json(
            { success: false, error: error?.message || String(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}
