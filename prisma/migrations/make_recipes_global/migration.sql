-- Make product_recipes global (remove warehouse_id requirement)
-- All warehouses can see all recipes, only admin can manage them

-- Step 1: Make warehouse_id nullable
ALTER TABLE "product_recipes" ALTER COLUMN "warehouse_id" DROP NOT NULL;

-- Step 2: Set all existing recipes to NULL warehouse_id (make them global)
UPDATE "product_recipes" SET "warehouse_id" = NULL;

-- Step 3: Drop the foreign key constraint (optional, for cleanup)
-- ALTER TABLE "product_recipes" DROP CONSTRAINT IF EXISTS "fk_product_recipes_warehouse";

-- Step 4: Drop the index on warehouse_id (optional, for cleanup)
-- DROP INDEX IF EXISTS "idx_product_recipes_warehouse";
