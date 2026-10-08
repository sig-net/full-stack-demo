ALTER TABLE "midnight_erc20_vault_deposits_v1" ALTER COLUMN "amount" SET DATA TYPE numeric(39, 0);--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "in_index" numeric(39, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "evm_nonce" numeric(39, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "gas_limit" numeric(39, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "max_fee_per_gas" numeric(39, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD COLUMN "max_priority_fee_per_gas" numeric(39, 0) NOT NULL;