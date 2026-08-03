-- Glicko-2 rating storage.
--
-- Glicko-2 tracks three numbers per rating rather than one: the rating itself,
-- how uncertain we are about it (deviation) and how erratic the player's
-- results have been (volatility). Rating becomes a float because rounding on
-- every game compounds drift over a career.
--
-- Written by hand rather than generated: `drizzle-kit generate` cannot run
-- non-interactively here because the 0000 snapshot names its enums
-- `timeControlEnum`/`gameStatusEnum` while schema/enums.ts declares
-- `time_control_enum`/`game_status_enum`. That drift predates this migration
-- and is deliberately left alone.

--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "rating_deviation" double precision DEFAULT 350 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "volatility" double precision DEFAULT 0.06 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "peak_rating" double precision DEFAULT 1500 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "last_played_at" timestamp;
--> statement-breakpoint

-- The column was nullable, so backfill before tightening the constraint.
UPDATE "ratings" SET "rating" = 1500 WHERE "rating" IS NULL;
--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "rating" SET DATA TYPE double precision;
--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "rating" SET DEFAULT 1500;
--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "rating" SET NOT NULL;
--> statement-breakpoint

-- Existing players start their peak at whatever they have already reached,
-- not at the default.
UPDATE "ratings" SET "peak_rating" = "rating" WHERE "peak_rating" < "rating";
