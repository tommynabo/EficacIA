-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add global_schedule column to users
-- Purpose  : Store per-action-type send-schedule configuration
--            (invitations vs messages can have independent days/time windows).
-- Applied  : Run once in Supabase SQL editor or via any migration tool.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS global_schedule JSONB DEFAULT NULL;

COMMENT ON COLUMN users.global_schedule IS
  'Global send-schedule config: {
     invitations: { enabled, days: number[], start_time, end_time },
     messages:    { enabled, days: number[], start_time, end_time },
     timezone:    string
   }
   Days use JS day index: 0 = Sunday … 6 = Saturday.
   times are HH:MM strings in the specified timezone.';
