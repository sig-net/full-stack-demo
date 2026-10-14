CREATE TABLE "midnight_ethereum_erc20_vault_approvals_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"erc20_address" text NOT NULL,
	"spender" text NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"vault_account" text NOT NULL,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_ethereum_erc20_vault_swaps_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"erc20_address_in" text NOT NULL,
	"erc20_address_out" text NOT NULL,
	"fee" numeric(39, 0) NOT NULL,
	"amount_out" numeric(39, 0) NOT NULL,
	"amount_in_maximum" numeric(39, 0) NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"vault_account" text NOT NULL,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "midnight_ethereum_erc20_vault_requests_v1" RENAME COLUMN "deposit_account" TO "signer_account";