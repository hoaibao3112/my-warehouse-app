import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"
import { randomUUID } from "crypto"

/**
 * Convert time format from "10h" to "10:00:00" for database
 * @param timeStr Time string like "10h" or "14h"
 * @returns Time string in HH:MM:SS format, or null if invalid
 */
function convertTimeFormat(timeStr: string | null): string | null {
  if (!timeStr) return null

  // Match format "10h", "0h", etc
  const match = timeStr.match(/^(\d{1,2})h$/)
  if (match) {
    const hour = parseInt(match[1], 10)
    if (hour >= 0 && hour < 24) {
      return `${String(hour).padStart(2, '0')}:00:00`
    }
  }

  // If already in HH:MM:SS format, return as-is
  if (timeStr.match(/^\d{2}:\d{2}:\d{2}$/)) {
    return timeStr
  }

  return null
}

/**
 * GET /api/promotions
 * Lấy danh sách chương trình khuyến mãi (với thông tin đầy đủ)
 */
export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get("page")) || 1
    const pageSize = Number(searchParams.get("pageSize")) || 20
    const search = searchParams.get("search") || ""
    const isActive = searchParams.get("isActive")
    const withDetails = searchParams.get("withDetails") === "true"
    const includeExpired = searchParams.get("includeExpired") === "true" // Admin can request all
    const now = getVietnamTime()

    // Base query
    let sql = `SELECT DISTINCT p.* FROM promotions p`
    const params: any[] = []

    // Join warehouse restrictions if needed
    // Default: If user is logged in and has warehouseId, only show promotions for that warehouse
    // If Admin/Manager (no warehouseId or specific role), show all or filter by param?
    // Let's assume strict isolation for Franchise users.

    let whereClause = ` WHERE 1=1`

    if (user && user.warehouseId) {
      // Check if strict isolation is needed.
      // Usually Store users only see their own promotions.
      sql += ` JOIN promotion_warehouses pw ON p.id = pw.promotion_id`
      whereClause += ` AND pw.warehouse_id = ?::uuid`
      params.push(user.warehouseId)
    }

    if (search) {
      whereClause += ` AND (p.name LIKE ? OR p.description LIKE ?)`
      params.push(`%${search}%`, `%${search}%`)
    }

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      whereClause += ` AND p.is_active = ?`
      params.push(isActive === "true")
    }

    if (!includeExpired) {
      whereClause += ` AND (p.start_date IS NULL OR p.start_date <= ?::timestamp)`
      whereClause += ` AND (p.end_date IS NULL OR p.end_date >= ?::timestamp)`
      params.push(now, now)
    }

    sql += whereClause
    sql += ` ORDER BY p.priority DESC, p.created_at DESC LIMIT ? OFFSET ?`
    params.push(pageSize, (page - 1) * pageSize)

    const promotions = (await query(sql, params)) as any[]

    // Load related data if requested (logic remains similar)
    if (withDetails) {
      for (const promo of promotions) {
        // ... (rest of details loading)
        // Load warehouses
        const warehouses = (await query(
          `SELECT w.id, w.name 
             FROM promotion_warehouses pw
             JOIN warehouses w ON pw.warehouse_id = w.id
             WHERE pw.promotion_id = ?`,
          [promo.id]
        )) as any[]
        promo.warehouses = warehouses

        // Load buy products
        const buyProducts = (await query(
          `SELECT pp.*, 
                    COALESCE(p.name, pr.name) as product_name, 
                    COALESCE(p.code, CAST(pr.id AS VARCHAR)) as product_code,
                    pp.item_type as source
             FROM promotion_products pp
             LEFT JOIN products p ON pp.item_type = 'PRODUCT' AND pp.item_id::uuid = p.id
             LEFT JOIN product_recipes pr ON pp.item_type = 'RECIPE' AND pp.item_id::uuid = pr.id
             WHERE pp.promotion_id = ?::uuid`,
          [promo.id]
        )) as any[]
        promo.buyProducts = buyProducts

        // Load gift products
        const gifts = (await query(
          `SELECT pg.*, 
                    COALESCE(p.name, pr.name) as product_name, 
                    COALESCE(p.code, CAST(pr.id AS VARCHAR)) as product_code,
                    pg.item_type as source
             FROM promotion_gifts pg
             LEFT JOIN products p ON pg.item_type = 'PRODUCT' AND pg.item_id::uuid = p.id
             LEFT JOIN product_recipes pr ON pg.item_type = 'RECIPE' AND pg.item_id::uuid = pr.id
             WHERE pg.promotion_id = ?::uuid`,
          [promo.id]
        )) as any[]
        promo.gifts = gifts

        if (promo.promotion_type !== 'BUY_X_GET_Y' && promo.promotion_type !== 'GIFT') {
          promo.buyProducts = []
        }
        if (promo.promotion_type !== 'DISCOUNT' && promo.promotion_type !== 'COMBO') {
          promo.discountProducts = []
        }

        // Load conditions
        const conditions = (await query(
          `SELECT * FROM promotion_conditions WHERE promotion_id = ?`,
          [promo.id]
        )) as any[]
        promo.conditions = conditions
      }
    }

    // Count total
    let countSql = `SELECT COUNT(DISTINCT p.id) as total FROM promotions p`
    // Add join for count too
    if (user && user.warehouseId) {
      countSql += ` JOIN promotion_warehouses pw ON p.id = pw.promotion_id`
    }
    countSql += whereClause

    // We need to re-use params but filter them because we pushed limit/offset at the end of 'params' array
    // The params array structure: [warehouseId?, search?, search?, isActive?, startDate?, endDate?, limit, offset]
    // We need all except limit and offset
    const countParams = params.slice(0, params.length - 2)

    const countResult = (await query(countSql, countParams)) as any[]
    const total = countResult[0]?.total || 0

    return NextResponse.json({
      success: true,
      data: promotions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * POST /api/promotions
 * Tạo chương trình khuyến mãi mới (nâng cao)
 */
export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Allow Admin AND Warehouse Managers
    const allowedRoles = ['ADMIN', 'MANAGER', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER']
    if (!user || (!isAdmin(user) && !allowedRoles.includes(user.role))) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền tạo chương trình khuyến mãi" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    let {
      name,
      // ... inputs
      promotionType,
      walletIds, // alias for warehouseIds sometimes?
      warehouseIds,
      description,
      discountType,
      discountValue,
      minAmount,
      minQuantity,
      maxDiscountAmount,
      applyTimeType,
      applyDays,
      timeStart,
      timeEnd,
      startDate,
      endDate,
      priority,
      applyWithOtherPromotions,
      buyProducts,
      giftProducts,
      discountProducts,
      conditions,
      giftCategoryIds,
      minProductPrice,
    } = body

    // Force warehouseId for Franchise users
    if (!isAdmin(user) && user.warehouseId) {
      warehouseIds = [user.warehouseId]
    }

    if (!name || !promotionType) {
      return NextResponse.json(
        { success: false, error: "Các trường bắt buộc: Tên, Loại chương trình" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Validate based on promotion type
    if (promotionType === 'DISCOUNT' || promotionType === 'COMBO') {
      // DISCOUNT và COMBO cần discount type và value
      if (!discountType || discountValue === undefined || discountValue === null) {
        return NextResponse.json(
          { success: false, error: "Loại giảm giá và giá trị giảm là bắt buộc với chương trình giảm giá" } as ApiResponse<null>,
          { status: 400 }
        )
      }

      // Validate discount value ranges
      const discVal = Number(discountValue)
      if (isNaN(discVal) || discVal <= 0) {
        return NextResponse.json(
          { success: false, error: "Giá trị giảm phải là số dương" } as ApiResponse<null>,
          { status: 400 }
        )
      }

      if (discountType === 'PERCENTAGE' && (discVal > 100)) {
        return NextResponse.json(
          { success: false, error: "Phần trăm giảm không được vượt quá 100%" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // Validate numeric fields
    if (minAmount !== undefined && minAmount !== null) {
      const minAmt = Number(minAmount)
      if (isNaN(minAmt) || minAmt < 0) {
        return NextResponse.json(
          { success: false, error: "Số tiền tối thiểu phải là số không âm" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    if (minQuantity !== undefined && minQuantity !== null) {
      const minQty = Number(minQuantity)
      if (isNaN(minQty) || minQty < 0) {
        return NextResponse.json(
          { success: false, error: "Số lượng tối thiểu phải là số không âm" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    if (maxDiscountAmount !== undefined && maxDiscountAmount !== null) {
      const maxDisc = Number(maxDiscountAmount)
      if (isNaN(maxDisc) || maxDisc < 0) {
        return NextResponse.json(
          { success: false, error: "Giảm giá tối đa phải là số không âm" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    if (priority !== undefined && priority !== null) {
      const pr = Number(priority)
      if (isNaN(pr) || !Number.isInteger(pr) || pr < 0) {
        return NextResponse.json(
          { success: false, error: "Độ ưu tiên phải là số nguyên không âm" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    if (promotionType === 'BUY_X_GET_Y') {
      // BUY_X_GET_Y cần có sản phẩm mua và sản phẩm tặng
      if (!buyProducts || !Array.isArray(buyProducts) || buyProducts.length === 0) {
        return NextResponse.json(
          { success: false, error: "Vui lòng chọn sản phẩm mua (X)" } as ApiResponse<null>,
          { status: 400 }
        )
      }
      if (!giftProducts || !Array.isArray(giftProducts) || giftProducts.length === 0) {
        return NextResponse.json(
          { success: false, error: "Vui lòng chọn sản phẩm tặng (Y)" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    if (promotionType === 'GIFT') {
      // Logic đặc biệt cho "Mua 1 Tặng 1 Cùng Sản Phẩm":
      // Frontend gửi sản phẩm vào buyProducts, nhưng backend cần lưu vào cả giftProducts
      if ((!giftProducts || !Array.isArray(giftProducts) || giftProducts.length === 0) &&
        (buyProducts && Array.isArray(buyProducts) && buyProducts.length > 0)) {
        // Tự động sao chép buyProducts sang giftProducts
        giftProducts = [...buyProducts]
      }

      // GIFT chỉ cần sản phẩm tặng HOẶC danh mục tặng
      const hasGiftProducts = giftProducts && Array.isArray(giftProducts) && giftProducts.length > 0
      const hasGiftCategories = giftCategoryIds && Array.isArray(giftCategoryIds) && giftCategoryIds.length > 0

      if (!hasGiftProducts && !hasGiftCategories) {
        return NextResponse.json(
          { success: false, error: "Vui lòng chọn sản phẩm tặng hoặc danh mục quà tặng" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    const promotionId = randomUUID()
    const now = getVietnamTime()

    // Insert promotion
    await query(
      `INSERT INTO promotions (
        id, name, description, promotion_type, discount_type, discount_value,
        min_amount, min_quantity, max_discount_amount, apply_time_type, apply_days, time_start, time_end,
        is_active, start_date, end_date, priority, apply_with_other_promotions,
        min_product_price, gift_category_ids,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamp, ?::timestamp, ?, ?, ?, ?, ?::timestamp, ?::timestamp)`,
      [
        promotionId,
        name,
        description || null,
        promotionType,
        discountType,
        discountValue,
        minAmount || null,
        minQuantity || null,
        maxDiscountAmount || null,
        applyTimeType || 'ALWAYS',
        applyDays ? JSON.stringify(applyDays) : null,
        convertTimeFormat(timeStart) || null,
        convertTimeFormat(timeEnd) || null,
        true,
        startDate || null,
        endDate || null,
        priority || 0,
        applyWithOtherPromotions || false,
        minProductPrice || null,
        giftCategoryIds ? JSON.stringify(giftCategoryIds) : null,
        now,
        now,
      ]
    )

    // Insert warehouse restrictions
    if (warehouseIds && Array.isArray(warehouseIds) && warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        await query(
          `INSERT INTO promotion_warehouses (id, promotion_id, warehouse_id, created_at)
           VALUES (?::uuid, ?::uuid, ?::uuid, ?::timestamp)`,
          [randomUUID(), promotionId, warehouseId, now]
        )
      }
    }


    // Helper to resolve item ID (UUID) from Code or UUID
    const resolveItemId = async (codeOrId: string, type: string) => {
      // Simple regex for UUID format
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(codeOrId)
      if (isUuid) return codeOrId

      // Lookup by code
      let result: any[] = []
      if (type === 'RECIPE') {
        result = (await query(`SELECT id FROM product_recipes WHERE code = ?`, [codeOrId])) as any[]
      } else {
        result = (await query(`SELECT id FROM products WHERE code = ?`, [codeOrId])) as any[]
      }

      if (result.length > 0) return result[0].id
      return null
    }

    // Insert buy products (for BUY_X_GET_Y type)
    if (buyProducts && Array.isArray(buyProducts) && buyProducts.length > 0) {
      for (const prod of buyProducts) {
        // Determine item type based on source from API
        const itemType = prod.source || 'PRODUCT' // 'PRODUCT' or 'RECIPE'
        const originalId = prod.productId
        const itemId = await resolveItemId(originalId, itemType)

        if (!itemId) {
          console.warn(`Product code not found: ${originalId} (${itemType})`)
          continue // Skip invalid items
        }

        await query(
          `INSERT INTO promotion_products (id, promotion_id, item_type, item_id, product_id, quantity_required, created_at)
           VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?::uuid, ?, ?::timestamp)`,
          [
            randomUUID(),
            promotionId,
            itemType,
            itemId,
            itemType === 'PRODUCT' ? itemId : null, // backward compatibility
            prod.quantity || 1,
            now
          ]
        )
      }
    }

    // Insert discount products (for DISCOUNT type with specific products)
    if (discountProducts && Array.isArray(discountProducts) && discountProducts.length > 0) {
      for (const prod of discountProducts) {
        const itemType = prod.source || 'PRODUCT'
        const originalId = prod.productId
        const itemId = await resolveItemId(originalId, itemType)

        if (!itemId) {
          console.warn(`Product code not found: ${originalId} (${itemType})`)
          continue
        }

        await query(
          `INSERT INTO promotion_products (id, promotion_id, item_type, item_id, product_id, quantity_required, created_at)
           VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?::uuid, ?, ?::timestamp)`,
          [
            randomUUID(),
            promotionId,
            itemType,
            itemId,
            itemType === 'PRODUCT' ? itemId : null,
            1, // discount products don't need quantity
            now
          ]
        )
      }
    }

    // Insert gift products
    console.log('[DEBUG] Starting gift insertion. giftProducts:', giftProducts)
    if (giftProducts && Array.isArray(giftProducts) && giftProducts.length > 0) {
      for (const gift of giftProducts) {
        // Determine item type based on source from API
        const itemType = gift.source || 'PRODUCT' // 'PRODUCT' or 'RECIPE'
        const originalId = gift.productId
        console.log(`[DEBUG] Resolving gift: ${originalId} (${itemType})`)
        const itemId = await resolveItemId(originalId, itemType)
        console.log(`[DEBUG] Resolved gift ID: ${itemId}`)

        if (!itemId) {
          console.warn(`Gift product code not found: ${originalId} (${itemType})`)
          continue
        }

        await query(
          `INSERT INTO promotion_gifts (id, promotion_id, item_type, item_id, product_id, quantity, created_at)
           VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?::uuid, ?, ?::timestamp)`,
          [
            randomUUID(),
            promotionId,
            itemType,
            itemId,
            itemType === 'PRODUCT' ? itemId : null, // backward compatibility
            gift.quantity || 1,
            now
          ]
        )
      }
    }

    // Insert conditions
    if (conditions && Array.isArray(conditions) && conditions.length > 0) {
      for (const cond of conditions) {
        await query(
          `INSERT INTO promotion_conditions (id, promotion_id, condition_type, condition_value, created_at)
           VALUES (?::uuid, ?::uuid, ?, ?, ?::timestamp)`,
          [randomUUID(), promotionId, cond.type, cond.value || null, now]
        )
      }
    }

    const newPromotion = (await query(
      `SELECT * FROM promotions WHERE id = ?`,
      [promotionId]
    )) as any[]

    return NextResponse.json({
      success: true,
      message: "Chương trình khuyến mãi đã được tạo",
      data: newPromotion[0],
    })
  } catch (error: any) {
    console.error('Promotion creation error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
