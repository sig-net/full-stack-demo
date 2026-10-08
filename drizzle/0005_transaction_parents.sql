ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP CONSTRAINT "deposits_v1_start_txn_unique";--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP CONSTRAINT "deposits_v1_evm_txn_unique";--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP CONSTRAINT "deposits_v1_complete_txn_unique";--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP CONSTRAINT "deposits_v1_start_txn_fk";
--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP CONSTRAINT "deposits_v1_evm_txn_fk";
--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP CONSTRAINT "deposits_v1_complete_txn_fk";
--> statement-breakpoint
ALTER TABLE "ethereum_transactions_v1" ADD COLUMN "parent" text NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_transactions_v1" ADD COLUMN "parent" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ethereum_transactions_v1_live" ON "ethereum_transactions_v1" USING btree ("parent") WHERE "ethereum_transactions_v1"."state" not in ('Succeeded', 'Failed');--> statement-breakpoint
CREATE UNIQUE INDEX "midnight_transactions_v1_live" ON "midnight_transactions_v1" USING btree ("parent","circuit") WHERE "midnight_transactions_v1"."state" not in ('Succeeded', 'Failed', 'Expired');--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP COLUMN "start_deposit_midnight_txn";--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP COLUMN "deposit_evm_txn";--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" DROP COLUMN "complete_deposit_midnight_txn";