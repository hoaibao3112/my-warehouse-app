-- Create reports table for storing generated reports
CREATE TABLE "reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_number" VARCHAR(100) NOT NULL UNIQUE,
  "warehouse_id" UUID NOT NULL,
  "report_type" VARCHAR(50) NOT NULL,
  "start_date" TIMESTAMP(6),
  "end_date" TIMESTAMP(6),
  "report_data" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_reports_id" PRIMARY KEY ("id"),
  CONSTRAINT "fk_reports_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id"),
  CONSTRAINT "fk_reports_user" FOREIGN KEY ("created_by") REFERENCES "users" ("id")
);

CREATE INDEX "idx_reports_warehouse" ON "reports" ("warehouse_id");
CREATE INDEX "idx_reports_type" ON "reports" ("report_type");
CREATE INDEX "idx_reports_created_at" ON "reports" ("created_at");
