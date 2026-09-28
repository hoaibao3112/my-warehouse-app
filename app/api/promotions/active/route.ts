import { NextResponse, type NextRequest } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { query } from '@/lib/prisma'
import { getVietnamNow } from '@/lib/server-time'
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Map day string to day of week number (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
const dayStringToNumber: Record<string, number> = {
  // ... existing map ...
  'SUNDAY': 0,
  'MONDAY': 1,
  'TUESDAY': 2,
  'WEDNESDAY': 3,
  'THURSDAY': 4,
  'FRIDAY': 5,
  'SATURDAY': 6,
  // Vietnamese names
  'CN': 0,
  'T2': 1,
  'T3': 2,
  'T4': 3,
  'T5': 4,
  'T6': 5,
  'T7': 6,
}

// ... existing isPromotionApplicableNow function ...
function isPromotionApplicableNow(promo: any, now: Date): boolean {
  // If applyTimeType is ALWAYS, no restrictions
  if (!promo.apply_time_type || promo.apply_time_type === 'ALWAYS') {
    return true
  }

  const currentDayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMinute

  // Check apply_days for DAY or DAY_TIME type
  if (promo.apply_time_type === 'DAY' || promo.apply_time_type === 'DAY_TIME') {
    let applyDays: string[] = []

    if (promo.apply_days) {
      if (typeof promo.apply_days === 'string') {
        try {
          applyDays = JSON.parse(promo.apply_days)
        } catch {
          applyDays = []
        }
      } else if (Array.isArray(promo.apply_days)) {
        applyDays = promo.apply_days
      }
    }

    // If apply_days is specified, check if today is included
    if (applyDays.length > 0) {
      const allowedDays = applyDays.map(d => dayStringToNumber[d.toUpperCase()] ?? -1).filter(d => d >= 0)
      if (!allowedDays.includes(currentDayOfWeek)) {
        console.log(`⏰ Promotion "${promo.name}" not applicable today (day: ${currentDayOfWeek}, allowed: ${allowedDays.join(',')})`)
        return false
      }
    }
  }

  // Check time range for TIME or DAY_TIME type
  if (promo.apply_time_type === 'TIME' || promo.apply_time_type === 'DAY_TIME') {
    const timeStart = promo.time_start // Format: "HH:MM:SS" or null
    const timeEnd = promo.time_end // Format: "HH:MM:SS" or null

    if (timeStart || timeEnd) {
      // Parse time_start
      let startInMinutes = 0
      if (timeStart) {
        const [h, m] = timeStart.split(':').map(Number)
        startInMinutes = (h || 0) * 60 + (m || 0)
      }

      // Parse time_end
      let endInMinutes = 24 * 60 - 1 // End of day
      if (timeEnd) {
        const [h, m] = timeEnd.split(':').map(Number)
        endInMinutes = (h || 0) * 60 + (m || 0)
      }

      // Check if current time is within range
      if (currentTimeInMinutes < startInMinutes || currentTimeInMinutes > endInMinutes) {
        console.log(`⏰ Promotion "${promo.name}" not applicable at this time (current: ${currentHour}:${currentMinute}, allowed: ${timeStart || '00:00'}-${timeEnd || '23:59'})`)
        return false
      }
    }
  }

  return true
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const withDetails = searchParams.get("withDetails") === "true"
    const now = getVietnamNow() // Use Date object for proper timestamp comparison

    // Auth Check
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    console.log('🔍 Fetching active promotions at:', now.toISOString(), 'withDetails:', withDetails)

    let sql = `SELECT DISTINCT p.* FROM promotions p`
    const params: any[] = []
    let whereClause = ` WHERE p.is_active = true 
       AND p.promotion_type IN ('DISCOUNT', 'COMBO', 'GIFT', 'BUY_X_GET_Y')
       AND p.start_date <= $1::timestamp
       AND (p.end_date IS NULL OR p.end_date >= $2::timestamp)`

    params.push(now, now)

    // Filter by Warehouse if franchise user
    if (user && user.warehouseId) {
      sql += ` JOIN promotion_warehouses pw ON p.id = pw.promotion_id`
      whereClause += ` AND pw.warehouse_id = $3::uuid`
      params.push(user.warehouseId)
    }

    sql += whereClause
    sql += ` ORDER BY p.priority DESC`

    // Get active auto-applicable promotions (now including GIFT and BUY_X_GET_Y)
    const allPromotions = (await query(sql, params)) as any[]

    // Filter promotions based on apply_days and time rules
    const promotions = allPromotions.filter(promo => isPromotionApplicableNow(promo, now))

    console.log(`✅ Found active promotions: ${promotions.length} (filtered from ${allPromotions.length})`)

    // Load related data if requested
    if (withDetails) {
      for (const promo of promotions) {
        // Load discount products
        const discountProducts = (await query(
          `SELECT pp.*, 
                  COALESCE(p.name, pr.name) as product_name,
                  pp.item_id as productId,
                  pp.item_type as source
           FROM promotion_products pp
           LEFT JOIN products p ON pp.item_type = 'PRODUCT' AND pp.item_id::uuid = p.id
           LEFT JOIN product_recipes pr ON pp.item_type = 'RECIPE' AND pp.item_id::uuid = pr.id
           WHERE pp.promotion_id = ?::uuid`,
          [promo.id]
        )) as any[]
        promo.discountProducts = discountProducts

        // Load buy products (for GIFT and BUY_X_GET_Y)
        if (promo.promotion_type === 'GIFT' || promo.promotion_type === 'BUY_X_GET_Y') {
          const buyProducts = (await query(
            `SELECT pp.*, 
                      COALESCE(p.name, pr.name) as product_name,
                      COALESCE(p.code, CAST(pr.id AS VARCHAR)) as product_code,
                      pp.item_id as productId,
                      pp.item_type as source
               FROM promotion_products pp
               LEFT JOIN products p ON pp.item_type = 'PRODUCT' AND pp.item_id::uuid = p.id
               LEFT JOIN product_recipes pr ON pp.item_type = 'RECIPE' AND pp.item_id::uuid = pr.id
               WHERE pp.promotion_id = ?::uuid`,
            [promo.id]
          )) as any[]
          promo.buyProducts = buyProducts

          const gifts = (await query(
            `SELECT pg.*, 
                      COALESCE(p.name, pr.name) as product_name, 
                      COALESCE(p.code, CAST(pr.id AS VARCHAR)) as product_code,
                      pg.item_id as productId,
                      pg.item_type as source
               FROM promotion_gifts pg
               LEFT JOIN products p ON pg.item_type = 'PRODUCT' AND pg.item_id::uuid = p.id
               LEFT JOIN product_recipes pr ON pg.item_type = 'RECIPE' AND pg.item_id::uuid = pr.id
               WHERE pg.promotion_id = ?::uuid`,
            [promo.id]
          )) as any[]
          promo.gifts = gifts
        }

        console.log(`Promotion ${promo.name} details loaded`)
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: promotions,
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error fetching active promotions:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi lấy chương trình khuyến mãi' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
