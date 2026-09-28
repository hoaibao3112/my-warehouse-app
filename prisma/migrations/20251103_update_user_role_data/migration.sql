-- Update user roles from old names to new names
UPDATE "public"."users" SET role = 'ADMIN'::user_role WHERE role = 'AdminKhoTong'::user_role;
UPDATE "public"."users" SET role = 'WAREHOUSE_MANAGER'::user_role WHERE role = 'QuanLyKhoCon'::user_role;
