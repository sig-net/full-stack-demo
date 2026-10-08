ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "state" text NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "start_deposit_midnight_txn" text;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "deposit_evm_txn" text;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "complete_deposit_midnight_txn" text;