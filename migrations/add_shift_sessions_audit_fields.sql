-- Add audit trail fields to shift_sessions table
-- Run this migration to support IP, GPS, and modification tracking

-- Add check-in audit fields
ALTER TABLE shift_sessions 
ADD COLUMN IF NOT EXISTS check_in_ip VARCHAR(45),
ADD COLUMN IF NOT EXISTS check_in_location JSONB,
ADD COLUMN IF NOT EXISTS check_in_device_info TEXT;

-- Add check-out audit fields
ALTER TABLE shift_sessions 
ADD COLUMN IF NOT EXISTS check_out_ip VARCHAR(45),
ADD COLUMN IF NOT EXISTS check_out_location JSONB,
ADD COLUMN IF NOT EXISTS check_out_device_info TEXT;

-- Add modification tracking fields
ALTER TABLE shift_sessions 
ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS modification_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN shift_sessions.check_in_ip IS 'IP address from which check-in was performed';
COMMENT ON COLUMN shift_sessions.check_in_location IS 'GPS location data: {latitude, longitude, accuracy, address}';
COMMENT ON COLUMN shift_sessions.check_in_device_info IS 'User agent string from check-in device';
COMMENT ON COLUMN shift_sessions.check_out_ip IS 'IP address from which check-out was performed';
COMMENT ON COLUMN shift_sessions.check_out_location IS 'GPS location data: {latitude, longitude, accuracy, address}';
COMMENT ON COLUMN shift_sessions.check_out_device_info IS 'User agent string from check-out device';
COMMENT ON COLUMN shift_sessions.modified_by IS 'Manager who manually edited attendance (NULL if not edited)';
COMMENT ON COLUMN shift_sessions.modified_at IS 'Timestamp when attendance was manually edited';
COMMENT ON COLUMN shift_sessions.modification_reason IS 'Reason provided by manager for manual edit';

-- Create index for faster queries on modified sessions
CREATE INDEX IF NOT EXISTS idx_shift_sessions_modified_by ON shift_sessions(modified_by) WHERE modified_by IS NOT NULL;
