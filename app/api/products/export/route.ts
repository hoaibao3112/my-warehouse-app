
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import { Prisma } from "@/lib/generated/prisma"
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
    try {
        const token = getAuthToken(request)
        const user = token ? verifyToken(token) : null

        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const searchParams = request.nextUrl.searchParams
        const warehouseIdParam = searchParams.get("warehouseId")

        // Determine specific warehouse to export for
        // If Partner, forced to their warehouseId
        // If Admin/Manager, can specify via param, or defaults to their warehouseId
        const targetWarehouseId = user.warehouseId || warehouseIdParam

        const where: Prisma.productsWhereInput = {}

        if (targetWarehouseId) {
            const warehouse = await prisma.warehouses.findUnique({
                where: { id: targetWarehouseId },
                select: { type: true }
            })

            const mainWarehouse = await prisma.warehouses.findFirst({
                where: { type: 'MAIN', is_active: true },
                select: { id: true }
            })

            if (warehouse?.type === 'PARTNER') {
                where.warehouse_id = targetWarehouseId
            } else if (warehouse?.type === 'STORE') {
                const ids = [targetWarehouseId]
                if (mainWarehouse?.id && mainWarehouse.id !== targetWarehouseId) {
                    ids.push(mainWarehouse.id)
                }
                where.OR = [
                    { warehouse_id: { in: ids } },
                    { warehouse_id: null }
                ]
            } else {
                // MAIN or others
                where.OR = [
                    { warehouse_id: targetWarehouseId },
                    { warehouse_id: null }
                ]
            }
        }

        // Exclude Recipes
        where.NOT = { code: { startsWith: 'RECIPE-' } }

        const products = await prisma.products.findMany({
            where,
            select: {
                code: true,
                name: true,
                price: true,
                categories: { select: { name: true } },
                product_units: { select: { name: true } },
                warehouse_stock: targetWarehouseId ? {
                    where: { warehouse_id: targetWarehouseId },
                    select: { quantity: true }
                } : undefined
            },
            orderBy: { name: 'asc' }
        })

        // Flatten for Excel
        const rows = products.map(p => ({
            "Mã Sản Phẩm": p.code,
            "Tên Sản Phẩm": p.name,
            "Danh Mục": p.categories?.name || '',
            "Đơn Vị": p.product_units?.name || '',
            "Giá Bán": p.price ? Number(p.price) : 0,
            "Tồn Kho": (p.warehouse_stock && p.warehouse_stock.length > 0) ? Number(p.warehouse_stock[0].quantity) : 0
        }))

        // Create Excel
        const worksheet = XLSX.utils.json_to_sheet(rows)

        // Adjust column widths
        const wscols = [
            { wch: 15 }, // Code
            { wch: 30 }, // Name
            { wch: 20 }, // Category
            { wch: 10 }, // Unit
            { wch: 15 }, // Price
            { wch: 10 }, // Stock
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory")

        const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

        return new NextResponse(buf, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="inventory_export_${new Date().toISOString().split('T')[0]}.xlsx"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }
        })

    } catch (error) {
        console.error("Export Error:", error)
        return NextResponse.json({ success: false, error: "Export Failed" }, { status: 500 })
    }
}
