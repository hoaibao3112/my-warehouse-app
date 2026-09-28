-- Migration to add SALES_STAFF role to user_role enum
-- This migration adds the new SALES_STAFF role for sales-only accounts

-- For PostgreSQL: Add new value to existing enum type
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SALES_STAFF' AFTER 'STAFF';
