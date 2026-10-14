import { getTableName, notInArray, type SQL, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  index,
  jsonb,
  numeric,
  type PgColumn,
  type PgTable,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import {
  ETHEREUM_TRANSACTION_FAILURES,
  ETHEREUM_TRANSACTION_STATES,
  ETHEREUM_TRANSACTION_TERMINAL_STATES,
} from '@/lib/ethereum/transaction-v1/transaction'
import {
  ACTIVITY_STATE_BY_DEPOSIT_STATE,
  ACTIVITY_STATES,
  ACTIVITY_TRANSACTION_STATE_BY_STATE,
  ACTIVITY_TYPES,
  ACTIVITY_WALLET_TRANSACTION_SIGNER,
  ACTIVITY_WALLET_TRANSACTION_STATE,
  type ActivityTransaction,
  type ActivityWalletTransaction,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  DEPOSIT_FAILURES,
  DEPOSIT_OUTCOMES,
  DEPOSIT_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { VAULT_ACTIONS } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import {
  ATTESTATION_OUTPUT_KINDS,
  VAULT_REQUEST_STATES,
  VAULT_REQUEST_TERMINAL_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  MIDNIGHT_TRANSACTION_FAILURES,
  MIDNIGHT_TRANSACTION_SIGNERS,
  MIDNIGHT_TRANSACTION_STATES,
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
} from '@/lib/midnight/transaction-v1/transaction'

// drizzle-kit loads this file through a CommonJS loader, so every resource module imported here
// must stay free of the Midnight packages, which ship no CommonJS build.

/**
 * One row per Midnight transaction resource, keyed by its resource name. The partial unique index
 * allows one live transaction per parent and circuit, so two resolvers cannot both start a retry.
 */
export const midnightTransactionsV1 = pgTable(
  'midnight_transactions_v1',
  {
    name: text('name').primaryKey(),
    parent: text('parent').notNull(),
    state: text('state', { enum: MIDNIGHT_TRANSACTION_STATES }).notNull(),
    circuit: text('circuit').notNull(),
    signer: text('signer', { enum: MIDNIGHT_TRANSACTION_SIGNERS }).notNull(),
    unprovenTx: text('unproven_tx'),
    unboundTx: text('unbound_tx'),
    finalizedTx: text('finalized_tx'),
    expireTime: timestamp('expire_time', { withTimezone: true }),
    txId: text('tx_id'),
    failure: text('failure', { enum: MIDNIGHT_TRANSACTION_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('midnight_transactions_v1_live')
      .on(table.parent, table.circuit)
      .where(notInArray(table.state, [...MIDNIGHT_TRANSACTION_TERMINAL_STATES]).inlineParams()),
  ],
)

/**
 * One row per Ethereum transaction resource, keyed by its resource name. The partial unique index
 * allows one live transaction per parent, so two resolvers cannot both start a retry.
 */
export const ethereumTransactionsV1 = pgTable(
  'ethereum_transactions_v1',
  {
    name: text('name').primaryKey(),
    parent: text('parent').notNull(),
    state: text('state', { enum: ETHEREUM_TRANSACTION_STATES }).notNull(),
    signedTx: text('signed_tx').notNull(),
    txHash: text('tx_hash'),
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    expireTime: timestamp('expire_time', { withTimezone: true }),
    failure: text('failure', { enum: ETHEREUM_TRANSACTION_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('ethereum_transactions_v1_live')
      .on(table.parent)
      .where(notInArray(table.state, [...ETHEREUM_TRANSACTION_TERMINAL_STATES]).inlineParams()),
  ],
)

/**
 * One row per ERC-20 vault deposit resource, keyed by its resource name. Contract integers are
 * unsigned 64 and 128 bit, beyond Postgres's signed `bigint`, so they are stored as `numeric`.
 * The deposit account index serves the caller's listing and the nonce assignment.
 */
export const midnightEthereumErc20VaultDepositsV1 = pgTable(
  'midnight_ethereum_erc20_vault_deposits_v1',
  {
    name: text('name').primaryKey(),
    erc20Address: text('erc20_address').notNull(),
    amount: contractInteger('amount').notNull(),
    state: text('state', { enum: DEPOSIT_STATES }).notNull(),
    inIndex: contractInteger('in_index').notNull(),
    evmNonce: contractInteger('evm_nonce').notNull(),
    gasLimit: contractInteger('gas_limit').notNull(),
    maxFeePerGas: contractInteger('max_fee_per_gas').notNull(),
    maxPriorityFeePerGas: contractInteger('max_priority_fee_per_gas').notNull(),
    depositAccount: text('deposit_account').notNull(),
    outcome: text('outcome', { enum: DEPOSIT_OUTCOMES }),
    failure: text('failure', { enum: DEPOSIT_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('midnight_ethereum_erc20_vault_deposits_v1_deposit_account').on(table.depositAccount),
  ],
)

/**
 * One row per ERC-20 vault request resource, keyed by its resource name. The partial unique index
 * allows one live request per parent and action, so two resolvers cannot both queue one.
 */
export const midnightEthereumErc20VaultRequestsV1 = pgTable(
  'midnight_ethereum_erc20_vault_requests_v1',
  {
    name: text('name').primaryKey(),
    parent: text('parent').notNull(),
    action: text('action', { enum: VAULT_ACTIONS }).notNull(),
    state: text('state', { enum: VAULT_REQUEST_STATES }).notNull(),
    inIndex: contractInteger('in_index').notNull(),
    depositAccount: text('deposit_account').notNull(),
    outIndex: text('out_index'),
    requestId: text('request_id'),
    signedTx: text('signed_tx'),
    attestationBlockHeight: contractInteger('attestation_block_height'),
    attestationOutputKind: text('attestation_output_kind', { enum: ATTESTATION_OUTPUT_KINDS }),
    attestationDigest: text('attestation_digest'),
    attestationSignature: text('attestation_signature'),
    attestationOutput: text('attestation_output'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('midnight_ethereum_erc20_vault_requests_v1_live')
      .on(table.parent, table.action)
      .where(notInArray(table.state, [...VAULT_REQUEST_TERMINAL_STATES]).inlineParams()),
  ],
)

/**
 * One row per vault activity, derived from the lifecycle tables: each deposit with its newest
 * start and complete calls, its newest vault request and that request's newest foreign chain
 * transaction. The states are aggregated here, so nothing above a repository derives them.
 */
export const midnightEthereumErc20VaultActivityV1 = pgView(
  'midnight_ethereum_erc20_vault_activity_v1',
  {
    name: text('name').notNull(),
    type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
    state: text('state', { enum: ACTIVITY_STATES }).notNull(),
    depositAccount: text('deposit_account').notNull(),
    erc20Address: text('erc20_address').notNull(),
    amount: contractInteger('amount').notNull(),
    outcome: text('outcome', { enum: DEPOSIT_OUTCOMES }),
    error: text('error'),
    depositState: text('deposit_state', { enum: DEPOSIT_STATES }).notNull(),
    vaultRequestState: text('vault_request_state', { enum: VAULT_REQUEST_STATES }),
    vaultRequestId: text('vault_request_id'),
    // The repository parses every row with the resource schema, which checks the shape claimed here.
    walletTransaction: jsonb('wallet_transaction').$type<ActivityWalletTransaction | null>(),
    startTransaction: jsonb('start_transaction').$type<ActivityTransaction | null>(),
    foreignChainTransaction: jsonb('foreign_chain_transaction').$type<ActivityTransaction | null>(),
    completeTransaction: jsonb('complete_transaction').$type<ActivityTransaction | null>(),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
).as(activityViewQuery())

/** The deposit branch of the view. A second activity type joins it with `UNION ALL`. */
function activityViewQuery(): SQL {
  const d = midnightEthereumErc20VaultDepositsV1
  const t = midnightTransactionsV1
  const r = midnightEthereumErc20VaultRequestsV1
  const e = ethereumTransactionsV1
  const newest = (table: PgTable, alias: string, where: string): string =>
    `LEFT JOIN LATERAL (SELECT * FROM "${getTableName(table)}" x WHERE ${where} ORDER BY x.create_time DESC, x.name LIMIT 1) ${alias} ON TRUE`
  const transaction = (alias: string, hash: PgColumn): string =>
    `CASE WHEN ${alias}.name IS NULL THEN NULL ELSE jsonb_build_object('hash', ${alias}.${hash.name}, 'state', ${caseOver(`${alias}.state`, ACTIVITY_TRANSACTION_STATE_BY_STATE, 'Pending')}, 'lifecycleState', ${alias}.state) END`
  const waitingForWallet = (alias: string): string =>
    `${alias}.${t.state.name} = '${ACTIVITY_WALLET_TRANSACTION_STATE}' AND ${alias}.${t.signer.name} = '${ACTIVITY_WALLET_TRANSACTION_SIGNER}'`
  const walletTransaction = (alias: string): string =>
    `jsonb_build_object('name', ${alias}.name, 'circuit', ${alias}.${t.circuit.name}, 'expireTime', ${alias}.${t.expireTime.name})`
  return sql.raw(`
    SELECT
      d.${d.name.name} AS name,
      '${ACTIVITY_TYPES[0]}' AS type,
      ${caseOver(`d.${d.state.name}`, ACTIVITY_STATE_BY_DEPOSIT_STATE, 'Pending')} AS state,
      d.${d.depositAccount.name} AS deposit_account,
      d.${d.erc20Address.name} AS erc20_address,
      d.${d.amount.name} AS amount,
      d.${d.outcome.name} AS outcome,
      d.${d.error.name} AS error,
      d.${d.state.name} AS deposit_state,
      r.${r.state.name} AS vault_request_state,
      r.${r.requestId.name} AS vault_request_id,
      CASE WHEN ${waitingForWallet('c')} THEN ${walletTransaction('c')} WHEN ${waitingForWallet('s')} THEN ${walletTransaction('s')} ELSE NULL END AS wallet_transaction,
      ${transaction('s', t.txId)} AS start_transaction,
      ${transaction('e', e.txHash)} AS foreign_chain_transaction,
      ${transaction('c', t.txId)} AS complete_transaction,
      d.${d.createTime.name} AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "${getTableName(d)}" d
    ${newest(t, 's', `x.${t.parent.name} = d.name AND x.${t.circuit.name} = 'startDeposit'`)}
    ${newest(r, 'r', `x.${r.parent.name} = d.name`)}
    ${newest(e, 'e', `x.${e.parent.name} = r.name`)}
    ${newest(t, 'c', `x.${t.parent.name} = d.name AND x.${t.circuit.name} = 'completeDeposit'`)}
  `)
}

/** A `CASE` over the column, mapping each listed value and falling back for the rest. */
function caseOver(
  column: string,
  mapping: Partial<Record<string, string>>,
  fallback: string,
): string {
  const arms = Object.entries(mapping)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(' ')
  return `CASE ${column} ${arms} ELSE '${fallback}' END`
}

/** Wide enough for a `Uint<128>`. */
function contractInteger(name: string) {
  return numeric(name, { precision: 39, scale: 0, mode: 'bigint' })
}

const bytea = customType<{ data: Uint8Array<ArrayBuffer>; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => Uint8Array.from(value),
})

/** One row per event waiting to be relayed to Kafka, keyed by its resource name. */
export const eventOutboxEntriesV1 = pgTable(
  'event_outbox_entries_v1',
  {
    name: text('name').primaryKey(),
    type: text('type').notNull(),
    data: bytea('data').notNull(),
    sent: boolean('sent').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('event_outbox_entries_v1_unsent').on(table.sent, table.createdAt)],
)
