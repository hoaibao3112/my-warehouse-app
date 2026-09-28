-- Add fields to separate manager approval from admin approval
ALTER TABLE warehouse_transfer_items
ADD COLUMN admin_approved_quantity INT,
ADD COLUMN manager_approved_unit_id UUID;

-- Add foreign key for manager_approved_unit_id
ALTER TABLE warehouse_transfer_items
ADD CONSTRAINT fk_warehouse_transfer_items_manager_approved_unit
  FOREIGN KEY (manager_approved_unit_id)
  REFERENCES product_units(id)
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

-- Create index for the new field
CREATE INDEX idx_warehouse_transfer_items_manager_approved_unit
  ON warehouse_transfer_items(manager_approved_unit_id);
