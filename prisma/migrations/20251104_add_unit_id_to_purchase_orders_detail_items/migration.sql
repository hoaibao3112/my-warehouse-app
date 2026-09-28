-- Add unit_id column to purchase_orders_detail_items table
ALTER TABLE purchase_orders_detail_items
ADD COLUMN unit_id UUID;

-- Add foreign key constraint
ALTER TABLE purchase_orders_detail_items
ADD CONSTRAINT fk_purchase_orders_detail_items_unit
FOREIGN KEY (unit_id) REFERENCES product_units(id)
ON DELETE NO ACTION
ON UPDATE NO ACTION;

-- Create index for performance
CREATE INDEX idx_purchase_orders_detail_items_unit
ON purchase_orders_detail_items(unit_id);
