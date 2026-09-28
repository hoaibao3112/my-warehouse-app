-- Add image_url column to product_recipes table
ALTER TABLE "product_recipes" ADD COLUMN "image_url" VARCHAR(500);

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS "idx_product_recipes_image" ON "product_recipes"("image_url");
