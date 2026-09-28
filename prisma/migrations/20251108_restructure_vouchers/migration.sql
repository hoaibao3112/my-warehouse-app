-- Create voucher_programs table
CREATE TABLE "voucher_programs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "discount_type" VARCHAR(20) NOT NULL,
  "discount_value" DECIMAL(12,2) NOT NULL,
  "min_amount" DECIMAL(12,2),
  "total_codes" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "start_date" TIMESTAMP(6),
  "end_date" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) DEFAULT now(),
  "updated_at" TIMESTAMP(6) DEFAULT now(),

  CONSTRAINT "voucher_programs_pkey" PRIMARY KEY ("id")
);

-- Create indexes for voucher_programs
CREATE INDEX "idx_voucher_programs_active" ON "voucher_programs"("is_active");
CREATE INDEX "idx_voucher_programs_dates" ON "voucher_programs"("start_date", "end_date");

-- Add program_id column to vouchers (nullable first for migration)
ALTER TABLE "vouchers" ADD COLUMN "program_id" UUID;

-- Add new columns for vouchers
ALTER TABLE "vouchers" ADD COLUMN "is_used" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vouchers" ADD COLUMN "used_at" TIMESTAMP(6);

-- Migrate existing vouchers to programs
-- Group by code prefix to create programs
INSERT INTO "voucher_programs" ("name", "discount_type", "discount_value", "min_amount", "total_codes", "is_active", "start_date", "end_date", "created_at")
SELECT
  COALESCE(SUBSTRING("code", 1, 20), 'Default Program') as "name",
  "discount_type",
  MAX("discount_value") as "discount_value",
  MAX("min_amount") as "min_amount",
  COUNT(*) as "total_codes",
  BOOL_OR("is_active") as "is_active",
  MIN("start_date") as "start_date",
  MAX("end_date") as "end_date",
  MIN("created_at") as "created_at"
FROM "vouchers"
GROUP BY SUBSTRING("code", 1, 20), "discount_type";

-- Update vouchers with program_id (match by discount settings)
UPDATE "vouchers" v
SET "program_id" = p."id"
FROM "voucher_programs" p
WHERE SUBSTRING(v."code", 1, 20) = p."name"
  AND v."discount_type" = p."discount_type"
  AND v."discount_value" = p."discount_value";

-- Make program_id NOT NULL
ALTER TABLE "vouchers" ALTER COLUMN "program_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "voucher_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Create index for program_id
CREATE INDEX "idx_vouchers_program" ON "vouchers"("program_id");
CREATE INDEX "idx_vouchers_is_used" ON "vouchers"("is_used");

-- Drop old columns from vouchers
ALTER TABLE "vouchers" DROP COLUMN "discount_type";
ALTER TABLE "vouchers" DROP COLUMN "discount_value";
ALTER TABLE "vouchers" DROP COLUMN "min_amount";
ALTER TABLE "vouchers" DROP COLUMN "max_uses";
ALTER TABLE "vouchers" DROP COLUMN "current_uses";
ALTER TABLE "vouchers" DROP COLUMN "is_active";
ALTER TABLE "vouchers" DROP COLUMN "start_date";
ALTER TABLE "vouchers" DROP COLUMN "end_date";
ALTER TABLE "vouchers" DROP COLUMN "updated_at";

-- Drop old indexes
DROP INDEX IF EXISTS "idx_vouchers_active";
DROP INDEX IF EXISTS "idx_vouchers_dates";
