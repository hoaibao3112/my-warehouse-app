-- Add code column to product_recipes table for recipe code/SKU
ALTER TABLE product_recipes ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Create unique index on code (allowing NULL for backwards compatibility)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_recipes_code ON product_recipes(code) WHERE code IS NOT NULL;

-- Comment
COMMENT ON COLUMN product_recipes.code IS 'Mã món - SKU code for the recipe';
