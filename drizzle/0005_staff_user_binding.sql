-- Additive schema only. This does not grant access or populate mappings.
ALTER TABLE "team_members"
  ADD COLUMN IF NOT EXISTS "staff_user_id" text;

CREATE INDEX IF NOT EXISTS "team_members_staff_user_idx"
  ON "team_members" USING btree ("staff_user_id");
