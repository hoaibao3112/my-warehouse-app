import { NextResponse } from "next/server"
import { query } from "@/lib/prisma"
import fs from "fs"
import path from "path"

export async function POST() {
  try {
    // create a test product and a stock transaction to force DB persistence
    const productId = `test-product-${Date.now()}`
    const warehouseId = `WH-TEST`

    await query(
      `INSERT INTO products (id, code, name, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [productId, productId, 'Test Product']
    )

    await query(
      `INSERT INTO stock_transactions (id, warehouse_id, product_id, transaction_type, quantity, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [`tx-${Date.now()}`, warehouseId, productId, 'ADJUSTMENT', 10, 'system']
    )

    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite')
    const exists = fs.existsSync(dbPath)
    const size = exists ? fs.statSync(dbPath).size : 0

    return NextResponse.json({ success: true, data: { productId, warehouseId, dbFile: dbPath, exists, size } })
  } catch (err) {
    console.error('db-test failed', err)
    return NextResponse.json({ success: false, error: 'db-test failed' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const rows: any[] = await query(`SELECT COUNT(*) as c FROM stock_transactions`)
    const count = rows?.[0]?.c ?? 0
    return NextResponse.json({ success: true, data: { count } })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'db-test count failed' }, { status: 500 })
  }
}
