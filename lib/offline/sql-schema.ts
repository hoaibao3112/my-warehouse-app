/**
 * SQL Schema Definitions for Offline SQLite Database
 */

export const SQL_SCHEMA = {
  // ========================================
  // Cache Tables
  // ========================================

  CREATE_OFFLINE_RECIPES: `
    CREATE TABLE IF NOT EXISTS offline_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category_id TEXT,
      category_name TEXT,
      warehouse_id TEXT NOT NULL,
      recipe_ingredients TEXT, -- JSON array
      barcode TEXT,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      cached_at INTEGER NOT NULL,
      INDEX idx_warehouse_id (warehouse_id),
      INDEX idx_category_id (category_id),
      INDEX idx_is_active (is_active)
    );
  `,

  CREATE_OFFLINE_STOCK: `
    CREATE TABLE IF NOT EXISTS offline_stock (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      product_name TEXT,
      unit TEXT,
      cached_at INTEGER NOT NULL,
      UNIQUE(warehouse_id, product_id),
      INDEX idx_warehouse_product (warehouse_id, product_id)
    );
  `,

  CREATE_OFFLINE_PROMOTIONS: `
    CREATE TABLE IF NOT EXISTS offline_promotions (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT, -- 'PROMOTION' or 'VOUCHER'
      discount_type TEXT,
      discount_value REAL,
      min_order_value REAL,
      start_date INTEGER,
      end_date INTEGER,
      data TEXT, -- JSON
      cached_at INTEGER NOT NULL,
      INDEX idx_type (type),
      INDEX idx_dates (start_date, end_date)
    );
  `,

  CREATE_OFFLINE_SHIFTS: `
    CREATE TABLE IF NOT EXISTS offline_shifts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      session_date TEXT,
      status TEXT, -- IN_PROGRESS, COMPLETED
      initial_cash REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      total_discount REAL DEFAULT 0,
      cash_orders INTEGER DEFAULT 0,
      transfer_orders INTEGER DEFAULT 0,
      ewallet_orders INTEGER DEFAULT 0,
      cash_total REAL DEFAULT 0,
      transfer_total REAL DEFAULT 0,
      ewallet_total REAL DEFAULT 0,
      vouchers_used INTEGER DEFAULT 0,
      cached_at INTEGER NOT NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_warehouse_id (warehouse_id),
      INDEX idx_status (status)
    );
  `,

  // ========================================
  // Pending Orders Queue
  // ========================================

  CREATE_PENDING_ORDERS: `
    CREATE TABLE IF NOT EXISTS pending_orders (
      id TEXT PRIMARY KEY,
      temp_invoice_number TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      shift_session_id TEXT,
      items TEXT NOT NULL, -- JSON array
      total_amount REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      customer_payment REAL,
      change_amount REAL,
      payment_method TEXT, -- CASH, TRANSFER, EWALLET
      ewallet_type TEXT,
      voucher_id TEXT,
      voucher_code TEXT,
      promotion_id TEXT,
      gift_promotion_id TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending', -- pending, syncing, synced, failed
      sync_attempts INTEGER DEFAULT 0,
      sync_error TEXT,
      last_sync_attempt INTEGER,
      server_invoice_id TEXT,
      server_invoice_number TEXT,
      INDEX idx_sync_status (sync_status),
      INDEX idx_created_at (created_at),
      INDEX idx_warehouse_id (warehouse_id)
    );
  `,

  // ========================================
  // Sync Metadata
  // ========================================

  CREATE_SYNC_METADATA: `
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    );
  `,

  // ========================================
  // Cached Receipts
  // ========================================

  CREATE_CACHED_RECEIPTS: `
    CREATE TABLE IF NOT EXISTS cached_receipts (
      invoice_id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      receipt_data TEXT NOT NULL, -- JSON
      created_at INTEGER NOT NULL,
      INDEX idx_created_at (created_at)
    );
  `,
}

// Helper function to get all CREATE TABLE statements
export function getAllTableSchemas(): string[] {
  return Object.values(SQL_SCHEMA)
}

// Table names for cleanup operations
export const TABLE_NAMES = {
  RECIPES: 'offline_recipes',
  STOCK: 'offline_stock',
  PROMOTIONS: 'offline_promotions',
  SHIFTS: 'offline_shifts',
  PENDING_ORDERS: 'pending_orders',
  SYNC_METADATA: 'sync_metadata',
  CACHED_RECEIPTS: 'cached_receipts',
} as const

export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES]
