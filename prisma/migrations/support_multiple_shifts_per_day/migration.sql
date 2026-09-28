-- ============================================================
-- Migration: Support Multiple Shifts Per Day Per Employee
-- Date: 2024-12-11
-- Description: Remove blocking UNIQUE constraints to allow
--              employees to work multiple non-consecutive shifts
--              in a single day with independent check-in/check-out
--              and cash management.
-- ============================================================

-- Step 1: Drop UNIQUE constraints that block multiple shifts per day
DROP INDEX IF EXISTS "idx_shift_sessions_unique_user_date";
DROP INDEX IF EXISTS "idx_shift_assignments_user_date";

-- Step 2: Create non-unique indexes for query performance
-- These replace the unique constraints but allow multiple entries
CREATE INDEX IF NOT EXISTS "idx_shift_sessions_user_date"
  ON "shift_sessions"("user_id", "session_date");

CREATE INDEX IF NOT EXISTS "idx_shift_assignments_user_date"
  ON "shift_assignments"("user_id", "assigned_date");

-- Step 3: Add composite unique constraints to prevent TRUE duplicates
-- Prevents same user + same date + same shift (exact duplicate)
-- This allows multiple DIFFERENT shifts on same day
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shift_sessions_unique_user_date_shift"
  ON "shift_sessions"("user_id", "session_date", "work_shift_id")
  WHERE "work_shift_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_shift_assignments_unique_user_date_shift"
  ON "shift_assignments"("user_id", "assigned_date", "work_shift_id");

-- Step 4: Add shift_assignment_id foreign key to link sessions to specific assignments
-- This creates a 1-to-1 relationship: one assignment -> one session
ALTER TABLE "shift_sessions"
  ADD COLUMN IF NOT EXISTS "shift_assignment_id" UUID;

ALTER TABLE "shift_sessions"
  ADD CONSTRAINT "fk_shift_sessions_assignment"
  FOREIGN KEY ("shift_assignment_id")
  REFERENCES "shift_assignments"("id")
  ON UPDATE NO ACTION
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_shift_sessions_assignment"
  ON "shift_sessions"("shift_assignment_id");

-- Step 5: Backfill existing sessions with shift_assignment_id
-- Links existing sessions to their corresponding assignments
UPDATE "shift_sessions" ss
SET "shift_assignment_id" = sa.id
FROM "shift_assignments" sa
WHERE ss."user_id" = sa."user_id"
  AND ss."session_date" = sa."assigned_date"
  AND ss."work_shift_id" = sa."work_shift_id"
  AND ss."shift_assignment_id" IS NULL;

-- Step 6: Verification queries (optional - for manual validation)
-- Uncomment to run validation after migration

-- Verify no duplicate (user + date + shift) assignments
-- SELECT user_id, assigned_date, work_shift_id, COUNT(*) as cnt
-- FROM shift_assignments
-- GROUP BY user_id, assigned_date, work_shift_id
-- HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Verify no duplicate (user + date + shift) sessions
-- SELECT user_id, session_date, work_shift_id, COUNT(*) as cnt
-- FROM shift_sessions
-- WHERE work_shift_id IS NOT NULL
-- GROUP BY user_id, session_date, work_shift_id
-- HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Verify sessions are linked to assignments
-- SELECT COUNT(*)
-- FROM shift_sessions
-- WHERE shift_assignment_id IS NULL
--   AND created_at > '2024-12-11'
--   AND work_shift_id IS NOT NULL;
-- Expected: 0 rows (all new sessions should have link)

-- ============================================================
-- Migration Complete
-- ============================================================
