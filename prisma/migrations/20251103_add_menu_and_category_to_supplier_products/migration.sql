-- Add menu_type_id and category_id columns to supplier_products
ALTER TABLE "supplier_products" ADD COLUMN "menu_type_id" uuid;
ALTER TABLE "supplier_products" ADD COLUMN "category_id" uuid;

-- Add foreign key constraints
ALTER TABLE "supplier_products"
  ADD CONSTRAINT "fk_supplier_products_menu_type"
  FOREIGN KEY ("menu_type_id") REFERENCES "menu_types"("id") ON DELETE SET NULL;

ALTER TABLE "supplier_products"
  ADD CONSTRAINT "fk_supplier_products_category"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;

-- Add indexes
CREATE INDEX "idx_supplier_products_menu_type" ON "supplier_products"("menu_type_id");
CREATE INDEX "idx_supplier_products_category" ON "supplier_products"("category_id");

-- Add relations to menu_types and categories (for Prisma tracking)
-- menu_types already has supplier_products relation in schema
-- categories already has supplier_products relation in schema
