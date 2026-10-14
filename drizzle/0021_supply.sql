CREATE TABLE "midnight_ethereum_erc20_vault_supplies_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"underlying_erc20_address" text NOT NULL,
	"stata_erc20_address" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
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
DROP VIEW "public"."midnight_ethereum_erc20_vault_activity_v1";--> statement-breakpoint
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
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN c.state = 'AwaitingWallet' AND c.signer = 'caller' THEN jsonb_build_object('name', c.name, 'circuit', c.circuit, 'expireTime', c.expire_time) WHEN s.state = 'AwaitingWallet' AND s.signer = 'caller' THEN jsonb_build_object('name', s.name, 'circuit', s.circuit, 'expireTime', s.expire_time) ELSE NULL END AS wallet_transaction,
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
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN c.state = 'AwaitingWallet' AND c.signer = 'caller' THEN jsonb_build_object('name', c.name, 'circuit', c.circuit, 'expireTime', c.expire_time) WHEN s.state = 'AwaitingWallet' AND s.signer = 'caller' THEN jsonb_build_object('name', s.name, 'circuit', s.circuit, 'expireTime', s.expire_time) ELSE NULL END AS wallet_transaction,
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
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN c.state = 'AwaitingWallet' AND c.signer = 'caller' THEN jsonb_build_object('name', c.name, 'circuit', c.circuit, 'expireTime', c.expire_time) WHEN s.state = 'AwaitingWallet' AND s.signer = 'caller' THEN jsonb_build_object('name', s.name, 'circuit', s.circuit, 'expireTime', s.expire_time) ELSE NULL END AS wallet_transaction,
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
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN c.state = 'AwaitingWallet' AND c.signer = 'caller' THEN jsonb_build_object('name', c.name, 'circuit', c.circuit, 'expireTime', c.expire_time) WHEN s.state = 'AwaitingWallet' AND s.signer = 'caller' THEN jsonb_build_object('name', s.name, 'circuit', s.circuit, 'expireTime', s.expire_time) ELSE NULL END AS wallet_transaction,
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
      d.state AS resource_state,
      r.state AS vault_request_state,
      r.request_id AS vault_request_id,
      CASE WHEN c.state = 'AwaitingWallet' AND c.signer = 'caller' THEN jsonb_build_object('name', c.name, 'circuit', c.circuit, 'expireTime', c.expire_time) WHEN s.state = 'AwaitingWallet' AND s.signer = 'caller' THEN jsonb_build_object('name', s.name, 'circuit', s.circuit, 'expireTime', s.expire_time) ELSE NULL END AS wallet_transaction,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'blockNumber', s.block_height, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', s.state) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'blockNumber', e.block_number, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', e.state) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'blockNumber', c.block_height, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END, 'lifecycleState', c.state) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_approvals_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit IN ('startApproveRouter', 'startApproveStata') ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeApprove' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE);