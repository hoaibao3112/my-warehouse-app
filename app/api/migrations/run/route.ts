import { type NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"

/**
 * POST /api/migrations/run
 * Chạy migration script
 */
export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Chỉ admin mới được chạy migration" },
        { status: 403 }
      )
    }

    // Run migrations
    const migrations = [
      // 1. Add columns to promotions
      `ALTER TABLE promotions 
       ADD COLUMN IF NOT EXISTS promotion_type VARCHAR(50) DEFAULT 'DISCOUNT',
       ADD COLUMN IF NOT EXISTS apply_time_type VARCHAR(20) DEFAULT 'ALWAYS',
       ADD COLUMN IF NOT EXISTS apply_days TEXT,
       ADD COLUMN IF NOT EXISTS time_start TIME,
       ADD COLUMN IF NOT EXISTS time_end TIME,
       ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
       ADD COLUMN IF NOT EXISTS max_discount_amount DECIMAL(12, 2),
       ADD COLUMN IF NOT EXISTS apply_with_other_promotions BOOLEAN DEFAULT FALSE`,

      // 2. Create promotion_warehouses
      `CREATE TABLE IF NOT EXISTS promotion_warehouses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      `CREATE INDEX IF NOT EXISTS idx_promotion_warehouses_promotion ON promotion_warehouses(promotion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_promotion_warehouses_warehouse ON promotion_warehouses(warehouse_id)`,

      // 3. Create promotion_products
      `CREATE TABLE IF NOT EXISTS promotion_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        is_buy_product BOOLEAN DEFAULT TRUE,
        quantity_required INTEGER DEFAULT 1,
        quantity_gift INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      `CREATE INDEX IF NOT EXISTS idx_promotion_products_promotion ON promotion_products(promotion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_promotion_products_product ON promotion_products(product_id)`,

      // 4. Create promotion_conditions
      `CREATE TABLE IF NOT EXISTS promotion_conditions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        condition_type VARCHAR(50) NOT NULL,
        condition_value TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      `CREATE INDEX IF NOT EXISTS idx_promotion_conditions_promotion ON promotion_conditions(promotion_id)`,

      // 5. Create promotion_gifts
      `CREATE TABLE IF NOT EXISTS promotion_gifts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      `CREATE INDEX IF NOT EXISTS idx_promotion_gifts_promotion ON promotion_gifts(promotion_id)`,
    ]

    for (const sql of migrations) {
      await query(sql, [])
    }

    return NextResponse.json({
      success: true,
      message: "Migration completed successfully",
    })
  } catch (error: any) {
    console.error("Migration error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    )
  }
}
