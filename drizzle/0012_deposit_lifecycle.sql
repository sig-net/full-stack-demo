ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" ADD COLUMN "deposit_account" text NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" ADD COLUMN "create_time" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" ADD COLUMN "update_time" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "midnight_ethereum_erc20_vault_deposits_v1_deposit_account" ON "midnight_ethereum_erc20_vault_deposits_v1" USING btree ("deposit_account");