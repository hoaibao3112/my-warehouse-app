import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query } from "@/lib/prisma"
import { verifyToken, isAdmin, isGeneralManager, isWarehouseManager, isStaff, canAccessWarehouse } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * GET /api/internal-transfer-requests/[id]
 * Get internal transfer request details
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Fetch request with warehouse and user details
    const requests = (await query(
      `SELECT itr.*, 
        wf.name as from_warehouse_name, wf.code as from_warehouse_code, wf.type as from_warehouse_type,
        wt.name as to_warehouse_name, wt.code as to_warehouse_code, wt.type as to_warehouse_type,
        uc.full_name as created_by_name,
        um.full_name as manager_approved_by_name,
        ug.full_name as gm_approved_by_name,
        ue.full_name as exported_by_name,
        ur.full_name as received_by_name,
        ud.full_name as discrepancy_confirmed_by_name
       FROM internal_transfer_requests itr
       LEFT JOIN warehouses wf ON itr.from_warehouse_id = wf.id
       LEFT JOIN warehouses wt ON itr.to_warehouse_id = wt.id
       LEFT JOIN users uc ON itr.created_by = uc.id
       LEFT JOIN users um ON itr.manager_approved_by = um.id
       LEFT JOIN users ug ON itr.gm_approved_by = ug.id
       LEFT JOIN users ue ON itr.exported_by = ue.id
       LEFT JOIN users ur ON itr.received_by = ur.id
       LEFT JOIN users ud ON itr.discrepancy_confirmed_by = ud.id
       WHERE itr.id = ?`,
      [id]
    )) as any[]

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { success: false, error: "Request not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const request_data = requests[0]

    // Check access permissions
    const toWarehouseId = request_data.to_warehouse_id
    const fromWarehouseId = request_data.from_warehouse_id
    const requestStatus = request_data.status

    let hasAccess = false

    if (isAdmin(user)) {
      hasAccess = true
    } else if (user.role === "MANAGER") {
      // MANAGER (kho tổng) can only access requests from MAIN warehouse at specific statuses
      const allowedStatuses = ['CHO_KHO_TONG_XUAT', 'DA_XUAT_KHO', 'CHO_XAC_NHAN_CHENH_LECH', 'HOAN_THANH']
      hasAccess = request_data.from_warehouse_type === 'MAIN' && allowedStatuses.includes(requestStatus)
    } else {
      hasAccess = canAccessWarehouse(user, toWarehouseId) || canAccessWarehouse(user, fromWarehouseId)
    }

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Access denied" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Fetch items with product details
    const items = (await query(
      `SELECT itri.*, 
        p.name as product_name, p.code as product_code, p.unit_id as base_unit_id,
        ru.name as requested_unit_name, ru.code as requested_unit_code,
        mu.name as manager_unit_name, mu.code as manager_unit_code,
        eu.name as exported_unit_name, eu.code as exported_unit_code,
        recu.name as received_unit_name, recu.code as received_unit_code
       FROM internal_transfer_request_items itri
       LEFT JOIN products p ON itri.product_id = p.id
       LEFT JOIN product_units ru ON itri.requested_unit_id = ru.id
       LEFT JOIN product_units mu ON itri.manager_unit_id = mu.id
       LEFT JOIN product_units eu ON itri.exported_unit_id = eu.id
       LEFT JOIN product_units recu ON itri.received_unit_id = recu.id
       WHERE itri.request_id = ?
       ORDER BY itri.created_at`,
      [id]
    )) as any[]

    // For GENERAL_MANAGER and ADMIN, include current stock information (converted to requested unit)
    if (isGeneralManager(user) || isAdmin(user)) {
      for (const item of items) {
        // Get stock in base unit
        const stock = (await query(
          `SELECT quantity FROM warehouse_stock_realtime WHERE warehouse_id = ? AND product_id = ?`,
          [toWarehouseId, item.product_id]
        )) as any[]

        const baseStock = stock.length > 0 ? Number(stock[0].quantity) : 0

        // Get the unit to convert to (manager_unit if approved, else requested_unit)
        const targetUnitId = item.manager_unit_id || item.requested_unit_id

        // Get conversion rate for target unit
        let conversionRate = 1
        if (targetUnitId) {
          const conversionData = await query(
            `SELECT base_quantity FROM product_package_units WHERE product_id = ? AND package_unit_id = ?`,
            [item.product_id, targetUnitId]
          ) as any[]

          if (conversionData.length > 0 && conversionData[0].base_quantity) {
            conversionRate = Number(conversionData[0].base_quantity)
          }
        }

        // Convert stock from base unit to target unit
        // Stock in base unit / conversionRate = stock in target unit
        item.current_stock_display = conversionRate > 0 ? Math.round((baseStock / conversionRate) * 100) / 100 : baseStock
        item.stock_unit_name = item.manager_unit_name || item.requested_unit_name
      }
    }

    // For Admin/Main warehouse (MANAGER, WAREHOUSE_STAFF), include main warehouse stock
    if (isAdmin(user) || user.role === "MANAGER" || user.role === "WAREHOUSE_STAFF") {
      for (const item of items) {
        const mainStock = (await query(
          `SELECT quantity FROM warehouse_stock_realtime WHERE warehouse_id = ? AND product_id = ?`,
          [fromWarehouseId, item.product_id]
        )) as any[]

        item.main_stock_display = mainStock.length > 0 ? mainStock[0].quantity : 0
      }
    }

    // Fetch product conversion units
    // Fetch product conversion units (Product-specific + Base Units)
    let productUnitsMap: Record<string, any[]> = {}
    if (items.length > 0) {
      const productIds = [...new Set(items.map((i: any) => i.product_id))]

      // 1. Fetch Base Units for all products
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',')

        const baseUnits = await query(
          `SELECT p.id as product_id, p.unit_id, pu.name as unit_name, pu.code as unit_code
           FROM products p
           LEFT JOIN product_units pu ON p.unit_id = pu.id
           WHERE p.id IN (${placeholders})`,
          productIds
        ) as any[]

        baseUnits.forEach(bu => {
          if (!productUnitsMap[bu.product_id]) {
            productUnitsMap[bu.product_id] = []
          }
          productUnitsMap[bu.product_id].push({
            id: bu.unit_id,
            name: bu.unit_name,
            code: bu.unit_code,
            base_quantity: 1, // Base unit always = 1
            is_default: false,
            source: 'base'
          })
        })
      }

      // 2. Fetch Product Specific Package Units
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',')

        const conversions = await query(
          `SELECT ppu.package_unit_id, ppu.product_id, ppu.base_quantity, ppu.package_name, ppu.is_default,
                  pu.name as unit_name, pu.code as unit_code
             FROM product_package_units ppu
             LEFT JOIN product_units pu ON ppu.package_unit_id = pu.id
             WHERE ppu.product_id IN (${placeholders})`,
          productIds
        ) as any[]

        conversions.forEach(c => {
          if (!productUnitsMap[c.product_id]) {
            productUnitsMap[c.product_id] = []
          }
          // Robust access to handle different column name cases
          const qty = c.base_quantity ?? c.basequantity ?? c.BaseQuantity ?? 1;

          // Check if unit already exists (e.g. from base unit) to avoid duplicate keys
          const exists = productUnitsMap[c.product_id].some(u => u.id === c.package_unit_id)

          if (!exists) {
            productUnitsMap[c.product_id].push({
              id: c.package_unit_id,
              name: c.package_name || c.unit_name,
              code: c.unit_code,
              base_quantity: qty,
              is_default: c.is_default,
              source: 'package'
            })
          }
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...request_data,
        items,
        productUnitsMap
      }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("[API internal-transfer-requests [id] GET] Error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
