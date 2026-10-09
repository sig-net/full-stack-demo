DROP INDEX "midnight_transactions_v1_live";--> statement-breakpoint
ALTER TABLE "midnight_transactions_v1" ADD COLUMN "failure" text;--> statement-breakpoint
CREATE UNIQUE INDEX "midnight_transactions_v1_live" ON "midnight_transactions_v1" USING btree ("parent","circuit") WHERE "midnight_transactions_v1"."state" not in ('Succeeded', 'Failed');