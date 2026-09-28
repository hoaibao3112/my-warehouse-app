-- Add new fields to users table for employee information
-- Bổ sung các trường mới cho thông tin nhân viên

-- Bằng cấp (THPT, Cao Đẳng, Đại học)
ALTER TABLE users ADD COLUMN IF NOT EXISTS education_level VARCHAR(50);

-- Tên người thân
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);

-- Số điện thoại người thân
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);

-- Ngày nghỉ việc (khi đổi trạng thái work_status thành INACTIVE)
ALTER TABLE users ADD COLUMN IF NOT EXISTS termination_date DATE;

-- Add comments for documentation
COMMENT ON COLUMN users.education_level IS 'Bằng cấp: THPT, Cao Đẳng, Đại học, etc.';
COMMENT ON COLUMN users.emergency_contact_name IS 'Tên người thân liên hệ khẩn cấp';
COMMENT ON COLUMN users.emergency_contact_phone IS 'Số điện thoại người thân';
COMMENT ON COLUMN users.termination_date IS 'Ngày nhân viên nghỉ việc (khi work_status = INACTIVE)';
