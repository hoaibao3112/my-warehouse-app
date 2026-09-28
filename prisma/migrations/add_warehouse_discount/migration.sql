-- Add discount_percentage column to warehouses table
ALTER TABLE warehouses ADD COLUMN discount_percentage DECIMAL(5, 2) DEFAULT 0;

COMMENT ON COLUMN warehouses.discount_percentage IS 'Discount percentage applied to internal warehouse transfers (0-100)';
