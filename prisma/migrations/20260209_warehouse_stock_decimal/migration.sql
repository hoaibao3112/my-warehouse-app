-- ============================================================================
-- MIGRATION: warehouse_stock_realtime Int -> Decimal
-- Ngày tạo: 2026-02-09
-- Mô tả: Chuyển đổi các cột quantity trong warehouse_stock_realtime từ INT sang DECIMAL
--        để hỗ trợ số thập phân (ví dụ: 0.5 kg, 2.5 lít)
-- ============================================================================

-- ============================================================================
-- BƯỚC 1: BACKUP (BẮT BUỘC TRƯỚC KHI CHẠY TRÊN PRODUCTION)
-- ============================================================================
-- Chạy lệnh này để backup bảng trước khi migrate:
-- CREATE TABLE warehouse_stock_realtime_backup AS SELECT * FROM warehouse_stock_realtime;

-- ============================================================================
-- BƯỚC 2: ALTER TABLE - Thay đổi kiểu dữ liệu
-- ============================================================================
-- QUAN TRỌNG: 
-- - Migration này KHÔNG thay đổi dữ liệu hiện có
-- - PostgreSQL tự động convert INT -> DECIMAL(18,4) mà không mất dữ liệu
-- - Ví dụ: 100 -> 100.0000

ALTER TABLE warehouse_stock_realtime 
  ALTER COLUMN quantity TYPE DECIMAL(18,4) USING quantity::DECIMAL(18,4),
  ALTER COLUMN qty_imported TYPE DECIMAL(18,4) USING qty_imported::DECIMAL(18,4),
  ALTER COLUMN qty_produced TYPE DECIMAL(18,4) USING qty_produced::DECIMAL(18,4),
  ALTER COLUMN qty_sold TYPE DECIMAL(18,4) USING qty_sold::DECIMAL(18,4),
  ALTER COLUMN qty_transferred_in TYPE DECIMAL(18,4) USING qty_transferred_in::DECIMAL(18,4),
  ALTER COLUMN qty_transferred_out TYPE DECIMAL(18,4) USING qty_transferred_out::DECIMAL(18,4),
  ALTER COLUMN qty_adjusted TYPE DECIMAL(18,4) USING qty_adjusted::DECIMAL(18,4);

-- ============================================================================
-- BƯỚC 3: VERIFY - Kiểm tra sau khi migrate
-- ============================================================================
-- Chạy các câu lệnh sau để verify:

-- 3.1. Kiểm tra kiểu dữ liệu đã thay đổi
-- SELECT column_name, data_type, numeric_precision, numeric_scale 
-- FROM information_schema.columns 
-- WHERE table_name = 'warehouse_stock_realtime' 
--   AND column_name IN ('quantity', 'qty_imported', 'qty_produced', 'qty_sold', 
--                       'qty_transferred_in', 'qty_transferred_out', 'qty_adjusted');

-- 3.2. Kiểm tra dữ liệu không bị ảnh hưởng
-- SELECT COUNT(*) as total_records FROM warehouse_stock_realtime;
-- SELECT SUM(quantity) as total_quantity FROM warehouse_stock_realtime;

-- ============================================================================
-- BƯỚC 4: ROLLBACK (NẾU CẦN)
-- ============================================================================
-- Nếu cần rollback về INT (LƯU Ý: Sẽ mất phần thập phân nếu có)
-- ALTER TABLE warehouse_stock_realtime 
--   ALTER COLUMN quantity TYPE INTEGER USING ROUND(quantity)::INTEGER,
--   ALTER COLUMN qty_imported TYPE INTEGER USING ROUND(qty_imported)::INTEGER,
--   ALTER COLUMN qty_produced TYPE INTEGER USING ROUND(qty_produced)::INTEGER,
--   ALTER COLUMN qty_sold TYPE INTEGER USING ROUND(qty_sold)::INTEGER,
--   ALTER COLUMN qty_transferred_in TYPE INTEGER USING ROUND(qty_transferred_in)::INTEGER,
--   ALTER COLUMN qty_transferred_out TYPE INTEGER USING ROUND(qty_transferred_out)::INTEGER,
--   ALTER COLUMN qty_adjusted TYPE INTEGER USING ROUND(qty_adjusted)::INTEGER;

-- ============================================================================
-- HƯỚNG DẪN DEPLOY PRODUCTION AN TOÀN
-- ============================================================================
-- 
-- 1. TRƯỚC KHI DEPLOY:
--    a) Backup database: pg_dump -Fc database_name > backup_$(date +%Y%m%d).dump
--    b) Thông báo maintenance window (khuyến nghị: 5-10 phút)
--    c) Deploy code mới (đã hỗ trợ Decimal) TRƯỚC khi chạy migration
--       Lý do: Code mới có ::numeric cast sẽ hoạt động với cả INT và DECIMAL
--
-- 2. CHẠY MIGRATION:
--    a) Kiểm tra số record: SELECT COUNT(*) FROM warehouse_stock_realtime;
--    b) Backup bảng: CREATE TABLE warehouse_stock_realtime_backup AS SELECT * FROM warehouse_stock_realtime;
--    c) Chạy ALTER TABLE ở trên
--    d) Verify: Chạy các câu lệnh ở Bước 3
--
-- 3. SAU KHI DEPLOY:
--    a) Monitor logs trong 30 phút đầu
--    b) Test các flow: Nhập hàng, Xuất hàng, Chuyển kho, Bán hàng, Kiểm kê
--    c) Nếu ổn định 24h, xóa backup: DROP TABLE warehouse_stock_realtime_backup;
--
-- 4. ROLLBACK NẾU CẦN:
--    a) Chạy lệnh rollback ở Bước 4
--    b) Hoặc restore từ backup: 
--       DELETE FROM warehouse_stock_realtime;
--       INSERT INTO warehouse_stock_realtime SELECT * FROM warehouse_stock_realtime_backup;
-- ============================================================================
