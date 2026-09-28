-- Migration Script: Transfer Sales Data from shift_sessions to sales_sessions
-- Run this script in your PostgreSQL database
-- Date: 2025-12-17

-- =====================================================
-- STEP 1: Migrate sales data to sales_sessions table
-- Only migrate records that have opening_cash (sales shifts)
-- =====================================================

INSERT INTO sales_sessions (
    id,
    user_id,
    warehouse_id,
    session_date,
    work_shift_id,
    shift_opened_at,
    opening_cash,
    opening_cash_user_id,
    shift_closed_at,
    closing_cash,
    closing_cash_user_id,
    expected_cash,
    cash_difference,
    total_orders,
    total_revenue,
    total_discount,
    cash_orders,
    transfer_orders,
    ewallet_orders,
    transfer_total,
    ewallet_total,
    vouchers_used,
    status,
    notes,
    approved_by,
    approved_at,
    rejection_reason,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(), -- New ID for sales_sessions
    user_id,
    warehouse_id,
    session_date,
    work_shift_id,
    COALESCE(shift_opened_at, check_in_time, created_at), -- Use shift_opened_at or fallback
    COALESCE(opening_cash, 0),
    opening_cash_user_id,
    shift_closed_at,
    closing_cash,
    closing_cash_user_id,
    expected_cash,
    cash_difference,
    total_orders,
    total_revenue,
    total_discount,
    cash_orders,
    transfer_orders,
    ewallet_orders,
    transfer_total,
    ewallet_total,
    vouchers_used,
    -- Map old status to new sales_session_status
    CASE 
        WHEN status = 'IN_PROGRESS' THEN 'IN_PROGRESS'::sales_session_status
        WHEN status = 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL'::sales_session_status
        WHEN status = 'COMPLETED' THEN 'COMPLETED'::sales_session_status
        WHEN status = 'REJECTED' THEN 'REJECTED'::sales_session_status
        ELSE 'COMPLETED'::sales_session_status
    END,
    notes,
    approved_by,
    approved_at,
    rejection_reason,
    created_at,
    updated_at
FROM shift_sessions
WHERE opening_cash IS NOT NULL; -- Only sales shifts have opening_cash

-- =====================================================
-- STEP 2: Create a mapping table for old -> new IDs
-- This is needed to update sales_invoices FK
-- =====================================================

CREATE TEMP TABLE session_id_mapping AS
SELECT 
    ss.id AS old_id,
    new_ss.id AS new_id
FROM shift_sessions ss
JOIN sales_sessions new_ss ON 
    new_ss.user_id = ss.user_id 
    AND new_ss.session_date = ss.session_date
    AND new_ss.warehouse_id = ss.warehouse_id
    AND COALESCE(new_ss.work_shift_id, 'null') = COALESCE(ss.work_shift_id, 'null')
WHERE ss.opening_cash IS NOT NULL;

-- =====================================================
-- STEP 3: Update sales_invoices to point to new table
-- =====================================================

UPDATE sales_invoices si
SET sales_session_id = mapping.new_id
FROM session_id_mapping mapping
WHERE si.shift_session_id = mapping.old_id;

-- =====================================================
-- STEP 4: Verify migration
-- =====================================================

-- Check count matches
SELECT 
    'shift_sessions with sales data' AS source,
    COUNT(*) AS count
FROM shift_sessions WHERE opening_cash IS NOT NULL
UNION ALL
SELECT 
    'sales_sessions' AS source,
    COUNT(*) AS count
FROM sales_sessions;

-- Check sales_invoices updated
SELECT 
    'sales_invoices with old FK' AS type,
    COUNT(*) AS count
FROM sales_invoices WHERE shift_session_id IS NOT NULL AND sales_session_id IS NULL
UNION ALL
SELECT 
    'sales_invoices with new FK' AS type,
    COUNT(*) AS count
FROM sales_invoices WHERE sales_session_id IS NOT NULL;

-- Cleanup temp table
DROP TABLE IF EXISTS session_id_mapping;

-- =====================================================
-- STEP 5: After verification, you can remove sales columns
-- from shift_sessions table (done via Prisma schema update)
-- =====================================================

-- Note: Run this ONLY after confirming data migrated correctly!
-- The Prisma schema will be updated to remove these columns,
-- then run: npx prisma db push
