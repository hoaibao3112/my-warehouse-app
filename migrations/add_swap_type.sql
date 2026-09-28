-- Add swap_type field to shift_swap_requests table
-- Type: SWAP (đổi ca cho nhau) or REPLACE (người khác làm thay)

-- Add enum type for swap_type
DO $$ BEGIN
    CREATE TYPE shift_swap_type AS ENUM ('SWAP', 'REPLACE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add swap_type column (default SWAP for backward compatibility)
ALTER TABLE shift_swap_requests 
ADD COLUMN IF NOT EXISTS swap_type shift_swap_type DEFAULT 'SWAP';

-- Make requester_reason NOT NULL (bắt buộc phải nhập lý do)
ALTER TABLE shift_swap_requests 
ALTER COLUMN requester_reason SET NOT NULL;

-- Add comment
COMMENT ON COLUMN shift_swap_requests.swap_type IS 'Type of swap: SWAP (đổi ca cho nhau) or REPLACE (người khác làm thay ca)';
COMMENT ON COLUMN shift_swap_requests.requester_reason IS 'Reason for swap request (required)';
