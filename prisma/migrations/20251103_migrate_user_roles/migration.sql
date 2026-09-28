-- Add new enum values to user_role type
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'WAREHOUSE_MANAGER';
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'STAFF';
