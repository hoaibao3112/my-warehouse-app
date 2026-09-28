import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin, hasPermission } from "@/lib/auth"
import { Prisma } from "@/lib/generated/prisma"
import { handleApiError } from "@/lib/api-error"

export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    const where: Prisma.suppliersWhereInput = {}

    const { searchParams } = new URL(request.url)
    const queryWarehouseId = searchParams.get('warehouseId')

    // Find MAIN warehouse ID for inheritance logic
    const mainWarehouse = await prisma.warehouses.findFirst({
      where: { type: 'MAIN', is_active: true },
      select: { id: true }
    })
    const mainWarehouseId = mainWarehouse?.id

    // STRICT ISOLATION Logic for Suppliers
    if (user && user.warehouseId) {
      // Fetch current warehouse type
      const currentWarehouse = await prisma.warehouses.findUnique({
        where: { id: user.warehouseId },
        select: { type: true }
      })

      if (currentWarehouse?.type === 'PARTNER') {
        // STRICT ISOLATION: Partners only see own suppliers
        // (Optional: Add Global/Main if Partners are allowed to buy from them directly)
        where.warehouse_id = user.warehouseId
      } else {
        // STORE and MAIN: See own + Global + MAIN suppliers
        const visibleIds = [user.warehouseId]
        if (mainWarehouseId && mainWarehouseId !== user.warehouseId) {
          visibleIds.push(mainWarehouseId)
        }

        where.OR = [
          { warehouse_id: { in: visibleIds } },
          { warehouse_id: null }
        ]
      }
    } else {
      // Admin / No-Warehouse User
      if (queryWarehouseId) {
        // View as specific warehouse
        // Check target warehouse type
        const targetWh = await prisma.warehouses.findUnique({
          where: { id: queryWarehouseId },
          select: { type: true }
        })

        if (targetWh?.type === 'PARTNER') {
          where.warehouse_id = queryWarehouseId
        } else {
          // Simulate Store/Main view
          const visibleIds = [queryWarehouseId]
          if (mainWarehouseId && mainWarehouseId !== queryWarehouseId) {
            visibleIds.push(mainWarehouseId)
          }
          where.OR = [
            { warehouse_id: { in: visibleIds } },
            { warehouse_id: null }
          ]
        }
      } else {
        // Default Admin View: GLOBAL + MAIN suppliers
        // This excludes private Partner/Store suppliers (reducing clutter)
        // but ensures all "System Standard" suppliers are visible
        const visibleIds: string[] = []
        if (mainWarehouseId) visibleIds.push(mainWarehouseId)

        where.OR = [
          { warehouse_id: { in: visibleIds } },
          { warehouse_id: null }
        ]
      }
    }

    const suppliers = await prisma.suppliers.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        contact_person: true,
        email: true,
        phone: true,
        address: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        warehouse_id: true
      }
    })

    return NextResponse.json(
      { success: true, data: suppliers } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error) {
    return handleApiError(error, 'GET /api/suppliers')
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Permission check
    // Allow Admin, Manager, or users with 'supplier_management' permission
    const canCreate = user && (isAdmin(user) || hasPermission(user, 'supplier_management') || user.role === 'WAREHOUSE_MANAGER' || user.role === 'MANAGER')

    if (!canCreate) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, contact_person, email, phone, address } = body

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Tên nhà cung cấp là bắt buộc" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check duplicate name in scope
    const existing = await prisma.suppliers.findFirst({
      where: {
        name: name.trim(),
        warehouse_id: user?.warehouseId || null
      }
    })

    if (existing) {
      return NextResponse.json({ success: false, error: `Supplier '${name}' already exists in this warehouse.` } as ApiResponse<null>, { status: 409 })
    }

    const supplier = await prisma.suppliers.create({
      data: {
        name: name.trim(),
        contact_person: contact_person || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        is_active: true,
        warehouse_id: user?.warehouseId || null
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: "Nhà cung cấp đã được tạo",
        data: supplier,
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error, 'POST /api/suppliers')
  }
}
