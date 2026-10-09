ALTER TABLE "ethereum_transactions_v1" ALTER COLUMN "signed_tx" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ethereum_transactions_v1" ADD COLUMN "block_number" bigint;--> statement-breakpoint
ALTER TABLE "ethereum_transactions_v1" ADD COLUMN "expire_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ethereum_transactions_v1" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "ethereum_transactions_v1" DROP COLUMN "unsigned_tx";