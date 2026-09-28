-- Add unit_id column to stock_transactions table
ALTER TABLE stock_transactions
ADD COLUMN unit_id UUID;

-- Add foreign key constraint
ALTER TABLE stock_transactions
ADD CONSTRAINT fk_stock_transactions_unit
FOREIGN KEY (unit_id) REFERENCES product_units(id)
ON DELETE NO ACTION
ON UPDATE NO ACTION;

-- Create index for performance
CREATE INDEX idx_stock_transactions_unit
ON stock_transactions(unit_id);
