CREATE VIEW "public"."midnight_ethereum_erc20_vault_activity_v1" AS (
    SELECT
      d.name AS name,
      'Deposit' AS type,
      CASE d.state WHEN 'Completed' THEN 'Complete' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END AS state,
      d.deposit_account AS deposit_account,
      d.erc20_address AS erc20_address,
      d.amount AS amount,
      d.outcome AS outcome,
      d.error AS error,
      CASE WHEN s.name IS NULL THEN NULL ELSE jsonb_build_object('hash', s.tx_id, 'state', CASE s.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END) END AS start_transaction,
      CASE WHEN e.name IS NULL THEN NULL ELSE jsonb_build_object('hash', e.tx_hash, 'state', CASE e.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END) END AS foreign_chain_transaction,
      CASE WHEN c.name IS NULL THEN NULL ELSE jsonb_build_object('hash', c.tx_id, 'state', CASE c.state WHEN 'Succeeded' THEN 'Succeeded' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END) END AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "midnight_ethereum_erc20_vault_deposits_v1" d
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'startDeposit' ORDER BY x.create_time DESC, x.name LIMIT 1) s ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_ethereum_erc20_vault_requests_v1" x WHERE x.parent = d.name ORDER BY x.create_time DESC, x.name LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "ethereum_transactions_v1" x WHERE x.parent = r.name ORDER BY x.create_time DESC, x.name LIMIT 1) e ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM "midnight_transactions_v1" x WHERE x.parent = d.name AND x.circuit = 'completeDeposit' ORDER BY x.create_time DESC, x.name LIMIT 1) c ON TRUE
  );