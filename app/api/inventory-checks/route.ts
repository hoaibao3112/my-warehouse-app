import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, canAccessWarehouse } from "@/lib/auth"
import { handleApiError } from "@/lib/api-error"

/**
 * Inventory Checks API - NEW ARCHITECTURE
 * 
 * Uses inventoryCheckService with unit conversion
 * 
 * CRITICAL FIXES:
 * - Reads from warehouse_stock_realtime (not warehouse_stock!)
 * - Unit validation for actual_balance inputs
 * - Proper discrepancy calculation in base units
 * - No manual warehouse_stock rebuilding
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

    const { warehouseId } = await req.json()

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "warehouseId is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Verify user access
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, warehouse_id: true, full_name: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Check warehouse access
    let warehouseIds: string[] = []
    if (user.role === 'GENERAL_MANAGER') {
      const storeWarehouses = await prisma.warehouses.findMany({
        where: { type: { not: 'MAIN' }, is_active: true },
        select: { id: true }
      })
      warehouseIds = storeWarehouses.map(w => w.id)
    }

    const userWithAssignments = {
      ...user,
      warehouseId: user.warehouse_id,
      warehouseIds
    }

    if (!canAccessWarehouse(userWithAssignments as any, warehouseId)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cannot create check for this warehouse" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Get warehouse info
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: warehouseId },
    })

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: "Warehouse not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // CRITICAL: Only check if THIS warehouse already has an IN_PROGRESS check
    // Each warehouse operates independently - multiple warehouses can do inventory checks simultaneously
    const existingCheck = await prisma.inventory_checks.findFirst({
      where: {
        warehouse_id: warehouseId,
        status: "IN_PROGRESS",
      },
    })

    if (existingCheck) {
      return NextResponse.json(
        {
          success: false,
          error: `Kho "${warehouse.name}" đã có báo cáo đang tiến hành (${existingCheck.number}). Vui lòng hoàn thành hoặc hủy báo cáo hiện tại.`,
        } as ApiResponse<null>,
        { status: 409 }
      )
    }

    // Use inventory check service
    const { inventoryCheckService } = await import('@/lib/services')

    const checkId = await inventoryCheckService.createInventoryCheck({
      warehouseId: warehouseId,
      createdBy: user.id
    })

    // ✅ OPTIMIZED: Use service to generate items (handles Unit Conversion & Missing Goods)
    const itemCount = await inventoryCheckService.generateCheckItems(
      checkId,
      warehouseId,
      warehouse.type
    )

    console.log(`[Inventory Check] Created ${itemCount} items for check ${checkId}`)

    // Get created check with details
    const check = await inventoryCheckService.getCheckById(checkId)

    return NextResponse.json(
      {
        success: true,
        message: "Inventory check created successfully",
        data: {
          id: check?.id,
          number: check?.number,
          warehouse: check?.warehouse,
          status: check?.status,
          itemCount: itemCount, // Use the count we already have
          createdBy: user.full_name,
          createdAt: check?.createdAt
        }
      } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    return handleApiError(error, 'POST /api/inventory-checks')
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Get user info to enforce warehouse access
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, warehouse_id: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const fromDate = searchParams.get("fromDate")
    const toDate = searchParams.get("toDate")
    const page = parseInt(searchParams.get("page") || "1", 10)
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100) // Giới hạn tối đa 100

    // Use inventory check service
    const { inventoryCheckService } = await import('@/lib/services')

    // Base filter params
    const filterParams = {
      status: status || undefined,
      search: search || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page,
      pageSize
    }

    // Enforce warehouse access based on role
    let result
    if (user.role === 'ADMIN' || user.role === 'GENERAL_MANAGER') {
      result = await inventoryCheckService.listChecks({
        ...filterParams,
        warehouseId: warehouseId || undefined,
      })
    } else {
      if (!user.warehouse_id) {
        return NextResponse.json(
          { success: false, error: "User không được gán kho" } as ApiResponse<null>,
          { status: 403 }
        )
      }
      result = await inventoryCheckService.listChecks({
        ...filterParams,
        warehouseId: user.warehouse_id,
      })
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        pageSize: result.pageSize
      }
    } as ApiResponse<any>)
  } catch (error: any) {
    return handleApiError(error, 'GET /api/inventory-checks')
  }
}