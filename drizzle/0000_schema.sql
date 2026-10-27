CREATE TABLE "ethereum_transactions_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"parent" text NOT NULL,
	"state" text NOT NULL,
	"signed_tx" text NOT NULL,
	"tx_hash" text,
	"block_number" bigint,
	"expire_time" timestamp with time zone,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_outbox_entries_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_ethereum_erc20_vault_approvals_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"erc20_address" text NOT NULL,
	"spender" text NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"user_commitment" text NOT NULL,
	"vault_account" text NOT NULL,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_ethereum_erc20_vault_deposits_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"erc20_address" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"user_commitment" text NOT NULL,
	"evm_nonce" numeric(39, 0) NOT NULL,
	"gas_limit" numeric(39, 0) NOT NULL,
	"max_fee_per_gas" numeric(39, 0) NOT NULL,
	"max_priority_fee_per_gas" numeric(39, 0) NOT NULL,
	"deposit_account" text NOT NULL,
	"recipient" text,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_ethereum_erc20_vault_redeems_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"stata_erc20_address" text NOT NULL,
	"underlying_erc20_address" text NOT NULL,
	"shares" numeric(39, 0) NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"user_commitment" text NOT NULL,
	"vault_account" text NOT NULL,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_ethereum_erc20_vault_requests_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"parent" text NOT NULL,
	"action" text NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"signer_account" text NOT NULL,
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
CREATE TABLE "midnight_ethereum_erc20_vault_supplies_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"underlying_erc20_address" text NOT NULL,
	"stata_erc20_address" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"user_commitment" text NOT NULL,
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
	"user_commitment" text NOT NULL,
	"vault_account" text NOT NULL,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_ethereum_erc20_vault_withdraws_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"erc20_address" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"dest_evm_address" text NOT NULL,
	"state" text NOT NULL,
	"in_index" numeric(39, 0) NOT NULL,
	"user_commitment" text NOT NULL,
	"vault_account" text NOT NULL,
	"outcome" text,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midnight_transactions_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"parent" text NOT NULL,
	"state" text NOT NULL,
	"circuit" text NOT NULL,
	"signer" text NOT NULL,
	"unproven_tx" text,
	"unbound_tx" text,
	"finalized_tx" text,
	"expire_time" timestamp with time zone,
	"tx_id" text,
	"block_height" bigint,
	"failure" text,
	"error" text,
	"create_time" timestamp with time zone NOT NULL,
	"update_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ethereum_transactions_v1_live" ON "ethereum_transactions_v1" USING btree ("parent") WHERE "ethereum_transactions_v1"."state" not in ('Succeeded', 'Failed');--> statement-breakpoint
CREATE INDEX "event_outbox_entries_v1_unsent" ON "event_outbox_entries_v1" USING btree ("sent","created_at");--> statement-breakpoint
CREATE INDEX "midnight_ethereum_erc20_vault_deposits_v1_deposit_account" ON "midnight_ethereum_erc20_vault_deposits_v1" USING btree ("deposit_account");--> statement-breakpoint
CREATE UNIQUE INDEX "midnight_ethereum_erc20_vault_requests_v1_live" ON "midnight_ethereum_erc20_vault_requests_v1" USING btree ("parent","action") WHERE "midnight_ethereum_erc20_vault_requests_v1"."state" not in ('Attested');--> statement-breakpoint
CREATE UNIQUE INDEX "midnight_transactions_v1_live" ON "midnight_transactions_v1" USING btree ("parent","circuit") WHERE "midnight_transactions_v1"."state" not in ('Succeeded', 'Failed');--> statement-breakpoint
CREATE VIEW "public"."midnight_ethereum_erc20_vault_activity_v1" AS (
    SELECT
      d.name AS name,
      'Deposit' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.erc20_address AS erc20_address,
      d.amount AS amount,
      NULL::text AS erc20_address_out,
      NULL::numeric(39, 0) AS amount_out,
      NULL::text AS spender,
      d.recipient AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.user_commitment AS user_commitment,
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_deposits_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startDeposit') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeDeposit' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE
    UNION ALL

    SELECT
      d.name AS name,
      'Withdraw' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.erc20_address AS erc20_address,
      d.amount AS amount,
      NULL::text AS erc20_address_out,
      NULL::numeric(39, 0) AS amount_out,
      NULL::text AS spender,
      d.dest_evm_address AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.user_commitment AS user_commitment,
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_withdraws_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startWithdraw') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeWithdraw' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE
    UNION ALL

    SELECT
      d.name AS name,
      'Swap' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.erc20_address_in AS erc20_address,
      d.amount_in_maximum AS amount,
      d.erc20_address_out AS erc20_address_out,
      d.amount_out AS amount_out,
      NULL::text AS spender,
      NULL::text AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.user_commitment AS user_commitment,
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_swaps_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startSwap') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeSwap' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE
    UNION ALL

    SELECT
      d.name AS name,
      'Supply' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.underlying_erc20_address AS erc20_address,
      d.amount AS amount,
      NULL::text AS erc20_address_out,
      NULL::numeric(39, 0) AS amount_out,
      NULL::text AS spender,
      d.stata_erc20_address AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.user_commitment AS user_commitment,
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_supplies_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startSupply') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeSupply' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE
    UNION ALL

    SELECT
      d.name AS name,
      'Redeem' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.stata_erc20_address AS erc20_address,
      d.shares AS amount,
      NULL::text AS erc20_address_out,
      NULL::numeric(39, 0) AS amount_out,
      NULL::text AS spender,
      d.underlying_erc20_address AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.user_commitment AS user_commitment,
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_redeems_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startRedeem') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeRedeem' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE
    UNION ALL

    SELECT
      d.name AS name,
      'Approval' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.erc20_address AS erc20_address,
      NULL::numeric(39, 0) AS amount,
      NULL::text AS erc20_address_out,
      NULL::numeric(39, 0) AS amount_out,
      d.spender AS spender,
      NULL::text AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.user_commitment AS user_commitment,
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_approvals_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startApproveRouter', 'startApproveStata') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeApprove' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE);--> statement-breakpoint
-- Wakes the outbox entry processor as soon as an entry's transaction commits: pg_notify inside a
-- transaction is delivered on commit, never before.
CREATE FUNCTION event_outbox_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('event_outbox', NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER event_outbox_entries_v1_notify
  AFTER INSERT ON event_outbox_entries_v1
  FOR EACH ROW EXECUTE FUNCTION event_outbox_notify();
