import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * Convert time format from "10h" to "10:00:00" for database
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
 * GET /api/promotions/[id]
 * Lấy chi tiết chương trình khuyến mãi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const promotions = (await query(
      `SELECT * FROM promotions WHERE id = ?`,
      [id]
    )) as any[]

    if (promotions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy chương trình khuyến mãi" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const promotion = promotions[0]

    // Load warehouses
    const warehouses = (await query(
      `SELECT w.id, w.name, w.type
       FROM promotion_warehouses pw
       JOIN warehouses w ON pw.warehouse_id = w.id
       WHERE pw.promotion_id = ?`,
      [id]
    )) as any[]
    promotion.warehouses = warehouses

    // Load products from promotion_products table
    const allPromotionProducts = (await query(
      `SELECT pp.*, 
              COALESCE(p.name, pr.name) as product_name, 
              COALESCE(p.code, CAST(pr.id AS VARCHAR)) as product_code,
              pp.item_type as source
       FROM promotion_products pp
       LEFT JOIN products p ON pp.item_type = 'PRODUCT' AND pp.item_id::uuid = p.id
       LEFT JOIN product_recipes pr ON pp.item_type = 'RECIPE' AND pp.item_id::uuid = pr.id
       WHERE pp.promotion_id = ?::uuid`,
      [id]
    )) as any[]

    // Separate buy products and discount products based on promotion type
    if (promotion.promotion_type === 'BUY_X_GET_Y' || promotion.promotion_type === 'GIFT') {
      promotion.buyProducts = allPromotionProducts
      promotion.discountProducts = []
    } else if (promotion.promotion_type === 'DISCOUNT' || promotion.promotion_type === 'COMBO') {
      promotion.buyProducts = []
      promotion.discountProducts = allPromotionProducts
    } else {
      promotion.buyProducts = []
      promotion.discountProducts = []
    }

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
      [id]
    )) as any[]
    promotion.gifts = gifts

    // Load conditions
    const conditions = (await query(
      `SELECT * FROM promotion_conditions WHERE promotion_id = ?`,
      [id]
    )) as any[]
    promotion.conditions = conditions

    return NextResponse.json({
      success: true,
      data: promotion,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * PUT /api/promotions/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được cập nhật" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    let {
      name,
      description,
      discountType,
      discountValue,
      minAmount,
      minQuantity,
      isActive,
      startDate,
      endDate,
      promotionType,
      applyTimeType,
      applyDays,
      timeStart,
      timeEnd,
      priority,
      maxDiscountAmount,
      applyWithOtherPromotions,
      warehouseIds,
      buyProducts,
      giftProducts,
      discountProducts,
      conditions,
    } = body

    const now = getVietnamTime()


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

    if (promotionType === 'GIFT') {
      // Logic đặc biệt cho "Mua 1 Tặng 1 Cùng Sản Phẩm":
      // Frontend gửi sản phẩm vào buyProducts, nhưng backend cần lưu vào cả giftProducts
      if ((!giftProducts || !Array.isArray(giftProducts) || giftProducts.length === 0) &&
        (buyProducts && Array.isArray(buyProducts) && buyProducts.length > 0)) {
        // Tự động sao chép buyProducts sang giftProducts
        giftProducts = [...buyProducts]
      }
    }

    // Update main promotion record
    await query(
      `UPDATE promotions SET
        name = ?, description = ?, discount_type = ?, discount_value = ?,
        min_amount = ?, min_quantity = ?, is_active = ?,
        start_date = ?::timestamp, end_date = ?::timestamp,
        promotion_type = ?, apply_time_type = ?, apply_days = ?,
        time_start = ?, time_end = ?, priority = ?,
        max_discount_amount = ?, apply_with_other_promotions = ?,
        updated_at = ?::timestamp
       WHERE id = ?::uuid`,
      [
        name,
        description || null,
        discountType,
        discountValue,
        minAmount || null,
        minQuantity || null,
        isActive,
        startDate || null,
        endDate || null,
        promotionType || 'DISCOUNT',
        applyTimeType || 'ALWAYS',
        applyDays ? JSON.stringify(applyDays) : null,
        convertTimeFormat(timeStart) || null,
        convertTimeFormat(timeEnd) || null,
        priority || 0,
        maxDiscountAmount || null,
        applyWithOtherPromotions ?? true,
        now,
        id,
      ]
    )

    // Delete and recreate related records
    await query(`DELETE FROM promotion_warehouses WHERE promotion_id = ?::uuid`, [id])
    await query(`DELETE FROM promotion_products WHERE promotion_id = ?::uuid`, [id])
    await query(`DELETE FROM promotion_gifts WHERE promotion_id = ?::uuid`, [id])
    await query(`DELETE FROM promotion_conditions WHERE promotion_id = ?::uuid`, [id])

    // Insert warehouses
    if (warehouseIds && warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        await query(
          `INSERT INTO promotion_warehouses (id, promotion_id, warehouse_id, created_at) VALUES (gen_random_uuid(), ?::uuid, ?::uuid, ?::timestamp)`,
          [id, warehouseId, now]
        )
      }
    }

    // Insert buy products (for BUY_X_GET_Y type)
    if (buyProducts && buyProducts.length > 0) {
      for (const product of buyProducts) {
        const itemType = product.source || 'PRODUCT' // 'PRODUCT' or 'RECIPE'
        const originalId = product.productId
        const itemId = await resolveItemId(originalId, itemType)

        if (!itemId) {
          console.warn(`Product code not found during update: ${originalId}`)
          continue
        }

        await query(
          `INSERT INTO promotion_products (id, promotion_id, item_type, item_id, product_id, quantity_required, created_at) VALUES (gen_random_uuid(), ?::uuid, ?, ?::uuid, ?::uuid, ?, ?::timestamp)`,
          [id, itemType, itemId, itemType === 'PRODUCT' ? itemId : null, product.quantity || 1, now]
        )
      }
    }

    // Insert discount products (for DISCOUNT type with specific products)
    if (discountProducts && discountProducts.length > 0) {
      for (const product of discountProducts) {
        const itemType = product.source || 'PRODUCT'
        const originalId = product.productId
        const itemId = await resolveItemId(originalId, itemType)

        if (!itemId) {
          console.warn(`Product code not found during update: ${originalId}`)
          continue
        }

        await query(
          `INSERT INTO promotion_products (id, promotion_id, item_type, item_id, product_id, quantity_required, created_at) VALUES (gen_random_uuid(), ?::uuid, ?, ?::uuid, ?::uuid, ?, ?::timestamp)`,
          [id, itemType, itemId, itemType === 'PRODUCT' ? itemId : null, 1, now]
        )
      }
    }

    // Insert gift products
    if (giftProducts && giftProducts.length > 0) {
      for (const gift of giftProducts) {
        const itemType = gift.source || 'PRODUCT' // 'PRODUCT' or 'RECIPE'
        const originalId = gift.productId
        const itemId = await resolveItemId(originalId, itemType)

        if (!itemId) {
          console.warn(`Gift code not found during update: ${originalId}`)
          continue
        }

        await query(
          `INSERT INTO promotion_gifts (id, promotion_id, item_type, item_id, product_id, quantity, created_at) VALUES (gen_random_uuid(), ?::uuid, ?, ?::uuid, ?::uuid, ?, ?::timestamp)`,
          [id, itemType, itemId, itemType === 'PRODUCT' ? itemId : null, gift.quantity || 1, now]
        )
      }
    }

    // Insert conditions
    if (conditions && conditions.length > 0) {
      for (const condition of conditions) {
        await query(
          `INSERT INTO promotion_conditions (id, promotion_id, condition_type, condition_value, created_at) VALUES (gen_random_uuid(), ?::uuid, ?, ?, ?::timestamp)`,
          [id, condition.type, condition.value, now]
        )
      }
    }

    // Get updated promotion with related data
    const updated = (await query(
      `SELECT * FROM promotions WHERE id = ?`,
      [id]
    )) as any[]

    const warehouses = (await query(
      `SELECT pw.*, w.name as warehouse_name 
       FROM promotion_warehouses pw
       LEFT JOIN warehouses w ON pw.warehouse_id = w.id
       WHERE pw.promotion_id = ?`,
      [id]
    )) as any[]

    const products = (await query(
      `SELECT pp.*, p.name as product_name 
       FROM promotion_products pp
       LEFT JOIN products p ON pp.product_id = p.id
       WHERE pp.promotion_id = ?`,
      [id]
    )) as any[]

    const gifts = (await query(
      `SELECT pg.*, p.name as product_name 
       FROM promotion_gifts pg
       LEFT JOIN products p ON pg.product_id = p.id
       WHERE pg.promotion_id = ?`,
      [id]
    )) as any[]

    const loadedConditions = (await query(
      `SELECT * FROM promotion_conditions WHERE promotion_id = ?`,
      [id]
    )) as any[]

    return NextResponse.json({
      success: true,
      message: "Chương trình khuyến mãi đã được cập nhật",
      data: {
        ...updated[0],
        warehouses,
        buyProducts: products,
        gifts,
        conditions: loadedConditions,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/promotions/[id]
 * Xóa chương trình khuyến mãi và các dữ liệu liên quan
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ quản trị viên mới được xóa" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params

    // Delete related data (CASCADE should handle this, but being explicit)
    await query(`DELETE FROM promotion_warehouses WHERE promotion_id = ?`, [id])
    await query(`DELETE FROM promotion_products WHERE promotion_id = ?`, [id])
    await query(`DELETE FROM promotion_gifts WHERE promotion_id = ?`, [id])
    await query(`DELETE FROM promotion_conditions WHERE promotion_id = ?`, [id])

    // Delete promotion
    await query(`DELETE FROM promotions WHERE id = ?`, [id])

    return NextResponse.json({
      success: true,
      message: "Chương trình khuyến mãi đã được xóa",
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
