ALTER TABLE "midnight_erc20_vault_deposits_v1" RENAME TO "midnight_ethereum_erc20_vault_deposits_v1";--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_deposits_v1" RENAME CONSTRAINT "midnight_erc20_vault_deposits_v1_pkey" TO "midnight_ethereum_erc20_vault_deposits_v1_pkey";
