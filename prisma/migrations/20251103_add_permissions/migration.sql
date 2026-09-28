-- Add permissions column to users table
ALTER TABLE "public"."users" ADD COLUMN "permissions" TEXT DEFAULT '[]';
