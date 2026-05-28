-- Rename legacy "release" column to "version" (intended schema name).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'errors'
      AND column_name = 'release'
  ) THEN
    ALTER TABLE "errors" RENAME COLUMN "release" TO "version";
  END IF;
END $$;
