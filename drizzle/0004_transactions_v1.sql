CREATE TABLE "ethereum_transactions_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"unsigned_tx" text,
	"signed_tx" text,
	"tx_hash" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_transactions_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"circuit" text NOT NULL,
	"unproven_tx" text,
	"unbound_tx" text,
	"finalized_tx" text,
	"expire_time" timestamp with time zone,
	"tx_id" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD CONSTRAINT "deposits_v1_start_txn_fk" FOREIGN KEY ("start_deposit_midnight_txn") REFERENCES "public"."midnight_transactions_v1"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD CONSTRAINT "deposits_v1_evm_txn_fk" FOREIGN KEY ("deposit_evm_txn") REFERENCES "public"."ethereum_transactions_v1"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD CONSTRAINT "deposits_v1_complete_txn_fk" FOREIGN KEY ("complete_deposit_midnight_txn") REFERENCES "public"."midnight_transactions_v1"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD CONSTRAINT "deposits_v1_start_txn_unique" UNIQUE("start_deposit_midnight_txn");--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD CONSTRAINT "deposits_v1_evm_txn_unique" UNIQUE("deposit_evm_txn");--> statement-breakpoint
ALTER TABLE "midnight_erc20_vault_deposits_v1" ADD CONSTRAINT "deposits_v1_complete_txn_unique" UNIQUE("complete_deposit_midnight_txn");