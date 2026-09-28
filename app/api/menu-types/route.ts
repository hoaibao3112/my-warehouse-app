import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null
    const url = new URL(req.url)
    const warehouseParam = url.searchParams.get('warehouseId')

    // Safe by default
    let where: any = { id: '___NO_ACCESS___' }

    if (user) {
      if (isAdmin(user)) {
        if (warehouseParam) {
          // Admin filtering by specific warehouse
          where = {
            OR: [
              { warehouse_id: warehouseParam },
              { warehouse_id: null }
            ]
          }
        } else {
          // Admin default view: Global (System) types ONLY
          // Hides Partner-specific types to avoid clutter/leak
          where = { warehouse_id: null }
        }
      }
      else if (user.warehouseId) {
        // Fetch current warehouse info
        const warehouse = await prisma.warehouses.findUnique({
          where: { id: user.warehouseId },
          select: { type: true }
        })

        if (warehouse) {
          if (warehouse.type === 'PARTNER') {
            // Partner sees: Own ONLY (Strict isolation)
            where = { warehouse_id: user.warehouseId }
          }
          else if (warehouse.type === 'STORE') {
            // Store sees: Own + Main + Global
            const mainWarehouse = await prisma.warehouses.findFirst({
              where: { type: 'MAIN', is_active: true },
              select: { id: true }
            })
            const visibleIds = [user.warehouseId]
            if (mainWarehouse?.id && mainWarehouse.id !== user.warehouseId) {
              visibleIds.push(mainWarehouse.id)
            }
            where = {
              OR: [
                { warehouse_id: { in: visibleIds } },
                { warehouse_id: null }
              ]
            }
          }
          else {
            // MAIN/MANAGER: Own + Global
            where = {
              OR: [
                { warehouse_id: null },
                { warehouse_id: user.warehouseId }
              ]
            }
          }
        }
      }
      // If user has no warehouseId and not Admin -> No Access (default)
    } else if (warehouseParam) {
      // Unauthenticated but with warehouseParam? (Should be blocked ideally, but keeping existing public logic if intended)
      // Actually, unauthenticated access should likely be blocked in a real app.
      // But keeping legacy behavior for now BUT restricting it.
      // If public needs access, we assume standard visibility (Global + Param).
      where = {
        OR: [
          { warehouse_id: null },
          { warehouse_id: warehouseParam }
        ]
      }
    } else {
      // No Auth, No Param -> No Access
    }

    const menuTypes = await prisma.menu_types.findMany({
      where,
      include: {
        categories: {
          select: {
            id: true,
            name: true,
          },
        },
        warehouses: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: { created_at: "desc" },
    })

    return NextResponse.json({
      success: true,
      data: menuTypes,
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching menu types:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user - only admin can create menu types
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user || (!isAdmin(user) && user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'MANAGER' && user.role !== 'GENERAL_MANAGER')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Access required' } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await req.json()
    const { name } = body

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { success: false, error: "name is required and must be a string" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const warehouseId = user.warehouseId || null

    // Check if menu type already exists in the same context (Global or Warehouse)
    const existing = await prisma.menu_types.findFirst({
      where: {
        name,
        warehouse_id: warehouseId
      },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Loại thực đơn này đã tồn tại" } as ApiResponse<null>,
        { status: 409 }
      )
    }

    const menuType = await prisma.menu_types.create({
      data: {
        name,
        warehouse_id: warehouseId
      },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(
      { success: true, data: menuType } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error creating menu type:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
