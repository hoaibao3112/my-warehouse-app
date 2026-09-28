import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isStaff, isWarehouseManager, isGeneralManager, isAdmin, canAccessWarehouse } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { randomUUID } from "crypto"
import { sendNotificationWithFCM } from "@/lib/notification-helper"

/**
 * GET /api/internal-transfer-requests
 * List internal transfer requests
 * Filters based on user role and warehouse access
 */
export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const status = searchParams.get("status")
    const fromDate = searchParams.get("fromDate")
    const toDate = searchParams.get("toDate")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = (page - 1) * limit

    // Build query based on role
    let whereClause = ""
    const queryParams: any[] = []

    if (isAdmin(user)) {
      if (warehouseId) {
        whereClause = "WHERE (from_warehouse_id = ? OR to_warehouse_id = ?)"
        queryParams.push(warehouseId, warehouseId)
      }
    } else if (user.role === "MANAGER") {
      // MANAGER (kho tổng) only sees requests at statuses they need to handle
      // CHO_QUAN_LY_DUYET is for store managers, not main warehouse
      if (warehouseId) {
        whereClause = "WHERE (from_warehouse_id = ? OR to_warehouse_id = ?) AND status IN ('CHO_KHO_TONG_XUAT'::internal_transfer_status, 'DA_XUAT_KHO'::internal_transfer_status, 'CHO_XAC_NHAN_CHENH_LECH'::internal_transfer_status, 'HOAN_THANH'::internal_transfer_status)"
        queryParams.push(warehouseId, warehouseId)
      } else {
        // Show all main warehouse requests if no specific warehouse filter
        whereClause = "WHERE from_warehouse_id IN (SELECT id FROM warehouses WHERE type = 'MAIN') AND status IN ('CHO_KHO_TONG_XUAT'::internal_transfer_status, 'DA_XUAT_KHO'::internal_transfer_status, 'CHO_XAC_NHAN_CHENH_LECH'::internal_transfer_status, 'HOAN_THANH'::internal_transfer_status)"
      }
    } else if (user.role === "WAREHOUSE_STAFF") {
      if (warehouseId) {
        whereClause = "WHERE (from_warehouse_id = ? OR to_warehouse_id = ?)"
        queryParams.push(warehouseId, warehouseId)
      }
    } else if (isGeneralManager(user)) {
      if (user.warehouseIds && user.warehouseIds.length > 0) {
        const placeholders = user.warehouseIds.map(() => "?").join(",")
        // Check if GENERAL_MANAGER has permission to approve on behalf of WAREHOUSE_MANAGER
        const canApproveOnBehalf = user.permissions?.includes('can_approve_on_behalf_wm')

        if (canApproveOnBehalf) {
          // GM with can_approve_on_behalf_wm permission: See ALL statuses including CHO_QUAN_LY_DUYET
          whereClause = `WHERE to_warehouse_id IN (${placeholders})`
        } else {
          // Regular GM: Only see requests that have been approved by Store Manager (exclude CHO_QUAN_LY_DUYET)
          whereClause = `WHERE to_warehouse_id IN (${placeholders}) AND status <> 'CHO_QUAN_LY_DUYET'::internal_transfer_status`
        }
        queryParams.push(...user.warehouseIds)
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, totalRecords: 0, totalPages: 0 }
        })
      }
    } else if (isWarehouseManager(user)) {
      const warehouseIds = user.warehouseIds && user.warehouseIds.length > 0
        ? user.warehouseIds
        : (user.warehouseId ? [user.warehouseId] : [])

      if (warehouseIds.length > 0) {
        const placeholders = warehouseIds.map(() => "?").join(",")
        whereClause = `WHERE to_warehouse_id IN (${placeholders})`
        queryParams.push(...warehouseIds)
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, totalRecords: 0, totalPages: 0 }
        })
      }
    } else if (isStaff(user)) {
      if (user.warehouseId) {
        whereClause = "WHERE to_warehouse_id = ?"
        queryParams.push(user.warehouseId)
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, totalRecords: 0, totalPages: 0 }
        })
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Access denied" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Add status filter if provided
    if (status) {
      // Handle comma-separated statuses for multi-status filtering
      if (status.includes(',')) {
        const statuses = status.split(',')
        const placeholders = statuses.map(() => "?::internal_transfer_status").join(",")
        whereClause += whereClause ? ` AND status IN (${placeholders})` : `WHERE status IN (${placeholders})`
        queryParams.push(...statuses)
      } else {
        whereClause += whereClause ? " AND status = ?::internal_transfer_status" : "WHERE status = ?::internal_transfer_status"
        queryParams.push(status)
      }
    }

    // Add date range filter if provided
    if (fromDate) {
      whereClause += whereClause ? " AND itr.created_at >= ?::timestamp" : "WHERE itr.created_at >= ?::timestamp"
      queryParams.push(fromDate + " 00:00:00")
    }
    if (toDate) {
      whereClause += whereClause ? " AND itr.created_at <= ?::timestamp" : "WHERE itr.created_at <= ?::timestamp"
      queryParams.push(toDate + " 23:59:59")
    }

    // Get Total Count
    const countSql = `SELECT COUNT(*) as total FROM internal_transfer_requests itr ${whereClause}`
    const countResult = (await query(countSql, queryParams)) as any[]
    const totalRecords = Number(countResult[0]?.total || 0)
    const totalPages = Math.ceil(totalRecords / limit)

    // Get Data
    const dataSql = `SELECT itr.*, 
        wf.name as from_warehouse_name, wf.code as from_warehouse_code,
        wt.name as to_warehouse_name, wt.code as to_warehouse_code,
        uc.full_name as created_by_name
       FROM internal_transfer_requests itr
       LEFT JOIN warehouses wf ON itr.from_warehouse_id = wf.id
       LEFT JOIN warehouses wt ON itr.to_warehouse_id = wt.id
       LEFT JOIN users uc ON itr.created_by = uc.id
       ${whereClause}
       ORDER BY itr.created_at DESC
       LIMIT ? OFFSET ?`

    // Add pagination params to a copy of queryParams for the data query
    const dataParams = [...queryParams, limit, offset]

    const transfers = (await query(dataSql, dataParams)) as any[]

    return NextResponse.json({
      success: true,
      data: transfers,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages
      }
    })
  } catch (error: any) {
    console.error("[API internal-transfer-requests GET] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * POST /api/internal-transfer-requests
 * Create new internal transfer request (Staff only)
 * Body: { toWarehouseId: string, items: [{ productId, quantity, unitId }] }
 */
export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Only STAFF can create internal transfer requests
    if (!isStaff(user)) {
      return NextResponse.json(
        { success: false, error: "Only STAFF can create internal transfer requests" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Staff must belong to a warehouse
    if (!user.warehouseId) {
      return NextResponse.json(
        { success: false, error: "User must belong to a warehouse" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { items } = body || {}

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required and cannot be empty" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Get the store warehouse (user's warehouse)
    const toWarehouseId = user.warehouseId
    const toWarehouse = (await query(
      `SELECT id, type FROM warehouses WHERE id = ?`,
      [toWarehouseId]
    )) as any[]

    if (!toWarehouse || toWarehouse.length === 0 || (toWarehouse[0].type !== 'STORE' && toWarehouse[0].type !== 'PARTNER')) {
      return NextResponse.json(
        { success: false, error: "Invalid store warehouse" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Get the MAIN warehouse (from_warehouse)
    const mainWarehouse = (await query(
      `SELECT id FROM warehouses WHERE type = 'MAIN' AND is_active = true LIMIT 1`,
      []
    )) as any[]

    if (!mainWarehouse || mainWarehouse.length === 0) {
      return NextResponse.json(
        { success: false, error: "No active MAIN warehouse found" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const fromWarehouseId = mainWarehouse[0].id

    // Check if destination warehouse has IN_PROGRESS inventory check
    const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
    const lockCheck = await checkInventoryCheckLock(toWarehouseId)

    if (lockCheck.isLocked) {
      return NextResponse.json(
        { success: false, error: lockCheck.message } as ApiResponse<null>,
        { status: 423 }
      )
    }

    const requestId = randomUUID()
    const requestNumber = `ITR-${new Date().getFullYear()}-${Date.now()}`
    const now = getVietnamTime()

    // Create transfer request and items
    await query(
      `INSERT INTO internal_transfer_requests 
       (id, request_number, from_warehouse_id, to_warehouse_id, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?::internal_transfer_status, ?, ?::timestamp, ?::timestamp)`,
      [requestId, requestNumber, fromWarehouseId, toWarehouseId, 'CHO_QUAN_LY_DUYET', user.id, now, now]
    )

    // Insert items
    for (const item of items) {
      const { productId, quantity, unitId } = item

      if (!productId || !quantity || !unitId) {
        throw new Error("Mỗi sản phẩm cần có mã, số lượng và đơn vị")
      }

      if (Number(quantity) <= 0) {
        throw new Error(`Sản phẩm (ID: ${productId}) có số lượng không hợp lệ (phải lớn hơn 0)`)
      }

      const itemId = randomUUID()
      await query(
        `INSERT INTO internal_transfer_request_items
         (id, request_id, product_id, requested_quantity, requested_unit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?::numeric, ?, ?::timestamp, ?::timestamp)`,
        [itemId, requestId, productId, quantity, unitId, now, now]
      )
    }

    // Fetch created request with details
    const createdRequest = (await query(
      `SELECT itr.*, 
        wf.name as from_warehouse_name, wt.name as to_warehouse_name
       FROM internal_transfer_requests itr
       LEFT JOIN warehouses wf ON itr.from_warehouse_id = wf.id
       LEFT JOIN warehouses wt ON itr.to_warehouse_id = wt.id
       WHERE itr.id = ?`,
      [requestId]
    )) as any[]

    const createdItems = (await query(
      `SELECT itri.*, p.name as product_name, pu.name as unit_name
       FROM internal_transfer_request_items itri
       LEFT JOIN products p ON itri.product_id = p.id
       LEFT JOIN product_units pu ON itri.requested_unit_id = pu.id
       WHERE itri.request_id = ?`,
      [requestId]
    )) as any[]

    // Get warehouse manager for notification
    const managers = (await query(
      `SELECT id FROM users WHERE warehouse_id = ? AND role = 'WAREHOUSE_MANAGER' AND is_active = true`,
      [toWarehouseId]
    )) as any[]

    // Send notification to warehouse managers
    if (managers.length > 0) {
      try {
        // Get user name
        const creator = (await query(
          `SELECT full_name FROM users WHERE id = ?`,
          [user.id]
        )) as any[]

        const creatorName = creator[0]?.full_name || "Nhân viên"
        const toWarehouseName = createdRequest[0].to_warehouse_name

        await sendNotificationWithFCM({
          userId: managers.map(m => m.id),
          type: "TRANSFER_CREATED",
          title: "Yêu cầu nhập hàng nội bộ mới",
          message: `${creatorName} tạo yêu cầu nhập hàng nội bộ cho ${toWarehouseName}`,
          redirectUrl: "/warehouse/internal-transfers",
          data: { requestId }
        })
      } catch (notifError) {
        console.error("[ITR Create] Failed to send notification:", notifError)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Internal transfer request created successfully",
      data: {
        ...createdRequest[0],
        items: createdItems
      }
    } as ApiResponse<any>, { status: 201 })
  } catch (error: any) {
    console.error("[API internal-transfer-requests POST] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
