-- CreateTable
CREATE TABLE "warehouse_printer_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "printer_id" VARCHAR(255) NOT NULL,
    "printer_name" VARCHAR(255) NOT NULL,
    "printer_type" VARCHAR(50) NOT NULL DEFAULT 'thermal_80mm',
    "connection_type" VARCHAR(20) NOT NULL DEFAULT 'bluetooth',
    "ip_address" VARCHAR(45),
    "port" INTEGER,
    "document_type" VARCHAR(50) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_printer_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_warehouse_printer_configs_warehouse" ON "warehouse_printer_configs"("warehouse_id");

-- CreateIndex  
CREATE INDEX "idx_warehouse_printer_configs_document_type" ON "warehouse_printer_configs"("document_type");

-- CreateIndex
CREATE UNIQUE INDEX "idx_warehouse_printer_configs_unique" ON "warehouse_printer_configs"("warehouse_id", "document_type");

-- AddForeignKey
ALTER TABLE "warehouse_printer_configs" ADD CONSTRAINT "fk_warehouse_printer_configs_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
