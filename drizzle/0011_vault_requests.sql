CREATE TABLE "midnight_ethereum_erc20_vault_requests_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"parent" text NOT NULL,
	"action" text NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"deposit_account" text NOT NULL,
	"out_index" text,
	"request_id" text,
	"signed_tx" text,
	"attestation_block_height" numeric(39, 0),
	"attestation_output_kind" text,
	"attestation_digest" text,
	"attestation_signature" text,
	"attestation_output" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "midnight_ethereum_erc20_vault_requests_v1_live" ON "midnight_ethereum_erc20_vault_requests_v1" USING btree ("parent","action") WHERE "midnight_ethereum_erc20_vault_requests_v1"."state" not in ('Attested');