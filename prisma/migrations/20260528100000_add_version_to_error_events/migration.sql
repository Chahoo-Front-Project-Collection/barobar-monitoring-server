-- Add per-occurrence version/environment on error_events.
ALTER TABLE "error_events" ADD COLUMN IF NOT EXISTS "version" TEXT;
ALTER TABLE "error_events" ADD COLUMN IF NOT EXISTS "environment" TEXT;

UPDATE "error_events" AS ee
SET
  "version" = e."version",
  "environment" = e."environment"
FROM "errors" AS e
WHERE ee."error_id" = e."id";

ALTER TABLE "error_events" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "error_events" ALTER COLUMN "environment" SET NOT NULL;
