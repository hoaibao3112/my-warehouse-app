-- Create shift_session_status enum type (if it doesn't exist)
DO $$ BEGIN
  CREATE TYPE "shift_session_status" AS ENUM ('IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create work_shifts table if it doesn't exist
CREATE TABLE IF NOT EXISTS "work_shifts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "warehouse_id" UUID NOT NULL,
  "shift_name" VARCHAR(255) NOT NULL,
  "shift_code" VARCHAR(100) NOT NULL,
  "start_time" TIME NOT NULL,
  "end_time" TIME NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) DEFAULT now(),
  "updated_at" TIMESTAMP(6) DEFAULT now(),

  CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_work_shifts_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- Create shift_sessions table
CREATE TABLE IF NOT EXISTS "shift_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "warehouse_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "work_shift_id" UUID,
  "session_date" DATE NOT NULL,
  "check_in_time" TIMESTAMP(6),
  "check_out_time" TIMESTAMP(6),
  "actual_duration" INTEGER,
  "total_orders" INTEGER NOT NULL DEFAULT 0,
  "total_revenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "total_discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "opening_cash" DECIMAL(15,2),
  "closing_cash" DECIMAL(15,2),
  "expected_cash" DECIMAL(15,2),
  "cash_difference" DECIMAL(15,2),
  "cash_orders" INTEGER NOT NULL DEFAULT 0,
  "transfer_orders" INTEGER NOT NULL DEFAULT 0,
  "ewallet_orders" INTEGER NOT NULL DEFAULT 0,
  "transfer_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "ewallet_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vouchers_used" INTEGER NOT NULL DEFAULT 0,
  "status" "shift_session_status" NOT NULL DEFAULT 'IN_PROGRESS',
  "notes" TEXT,
  "approved_by" UUID,
  "approved_at" TIMESTAMP(6),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(6) DEFAULT now(),
  "updated_at" TIMESTAMP(6) DEFAULT now(),

  CONSTRAINT "shift_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_shift_sessions_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_shift_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_shift_sessions_work_shift" FOREIGN KEY ("work_shift_id") REFERENCES "work_shifts"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_shift_sessions_approver" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "idx_shift_sessions_unique_user_date" UNIQUE ("user_id", "session_date")
);

-- Create indexes for work_shifts
CREATE INDEX IF NOT EXISTS "idx_work_shifts_warehouse" ON "work_shifts"("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_work_shifts_active" ON "work_shifts"("is_active");

-- Create indexes for shift_sessions
CREATE INDEX IF NOT EXISTS "idx_shift_sessions_warehouse" ON "shift_sessions"("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_shift_sessions_user" ON "shift_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_shift_sessions_status" ON "shift_sessions"("status");
CREATE INDEX IF NOT EXISTS "idx_shift_sessions_session_date" ON "shift_sessions"("session_date");
CREATE INDEX IF NOT EXISTS "idx_shift_sessions_work_shift" ON "shift_sessions"("work_shift_id");

-- Add shift_session_id column to sales_invoices if it doesn't exist
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "shift_session_id" UUID;

-- Add foreign key constraint for shift_session_id if it doesn't exist
ALTER TABLE "sales_invoices" ADD CONSTRAINT "fk_sales_invoices_shift_session"
  FOREIGN KEY ("shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Create index for shift_session_id in sales_invoices
CREATE INDEX IF NOT EXISTS "idx_sales_invoices_shift_session" ON "sales_invoices"("shift_session_id");
