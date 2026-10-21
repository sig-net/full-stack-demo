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
  ACTIVITY_STATE_BY_OPERATION_STATE,
  ACTIVITY_STATES,
  ACTIVITY_TRANSACTION_STATE_BY_STATE,
  ACTIVITY_TYPES,
  type ActivityType,
  type ActivityTransaction,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  DEPOSIT_FAILURES,
  DEPOSIT_OUTCOMES,
  DEPOSIT_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { CALLER_OPERATION_STATES } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import {
  APPROVAL_FAILURES,
  APPROVAL_KINDS,
  APPROVAL_OUTCOMES,
  APPROVAL_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  SWAP_FAILURES,
  SWAP_OUTCOMES,
  SWAP_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import { VAULT_ACTIONS } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import {
  REDEEM_FAILURES,
  REDEEM_OUTCOMES,
  REDEEM_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'
import {
  SUPPLY_FAILURES,
  SUPPLY_OUTCOMES,
  SUPPLY_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import {
  WITHDRAW_FAILURES,
  WITHDRAW_OUTCOMES,
  WITHDRAW_STATES,
} from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'
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
    blockHeight: bigint('block_height', { mode: 'number' }),
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
    recipient: text('recipient'),
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
 * One row per ERC-20 vault withdraw resource, keyed by its resource name: an ERC20 transfer from
 * the vault account to a destination on Ethereum paid from a surrendered vault coin.
 */
export const midnightEthereumErc20VaultWithdrawsV1 = pgTable(
  'midnight_ethereum_erc20_vault_withdraws_v1',
  {
    name: text('name').primaryKey(),
    erc20Address: text('erc20_address').notNull(),
    amount: contractInteger('amount').notNull(),
    destEvmAddress: text('dest_evm_address').notNull(),
    state: text('state', { enum: WITHDRAW_STATES }).notNull(),
    inIndex: contractInteger('in_index').notNull(),
    vaultAccount: text('vault_account').notNull(),
    outcome: text('outcome', { enum: WITHDRAW_OUTCOMES }),
    failure: text('failure', { enum: WITHDRAW_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
)

/**
 * One row per ERC-20 vault swap resource, keyed by its resource name: an exact-output trade on
 * the vault's router paid from a surrendered vault coin.
 */
export const midnightEthereumErc20VaultSwapsV1 = pgTable('midnight_ethereum_erc20_vault_swaps_v1', {
  name: text('name').primaryKey(),
  erc20AddressIn: text('erc20_address_in').notNull(),
  erc20AddressOut: text('erc20_address_out').notNull(),
  fee: contractInteger('fee').notNull(),
  amountOut: contractInteger('amount_out').notNull(),
  amountInMaximum: contractInteger('amount_in_maximum').notNull(),
  state: text('state', { enum: SWAP_STATES }).notNull(),
  inIndex: contractInteger('in_index').notNull(),
  vaultAccount: text('vault_account').notNull(),
  outcome: text('outcome', { enum: SWAP_OUTCOMES }),
  failure: text('failure', { enum: SWAP_FAILURES }),
  error: text('error'),
  createTime: timestamp('create_time', { withTimezone: true }).notNull(),
  updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
})

/**
 * One row per ERC-20 vault supply resource, keyed by its resource name: a deposit of the stata
 * underlying into Aave's static wrapper paid from a surrendered vault coin.
 */
export const midnightEthereumErc20VaultSuppliesV1 = pgTable(
  'midnight_ethereum_erc20_vault_supplies_v1',
  {
    name: text('name').primaryKey(),
    underlyingErc20Address: text('underlying_erc20_address').notNull(),
    stataErc20Address: text('stata_erc20_address').notNull(),
    amount: contractInteger('amount').notNull(),
    state: text('state', { enum: SUPPLY_STATES }).notNull(),
    inIndex: contractInteger('in_index').notNull(),
    vaultAccount: text('vault_account').notNull(),
    outcome: text('outcome', { enum: SUPPLY_OUTCOMES }),
    failure: text('failure', { enum: SUPPLY_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
)

/**
 * One row per ERC-20 vault redeem resource, keyed by its resource name: a redemption of shares
 * of Aave's static wrapper for its underlying paid from a surrendered vault coin.
 */
export const midnightEthereumErc20VaultRedeemsV1 = pgTable(
  'midnight_ethereum_erc20_vault_redeems_v1',
  {
    name: text('name').primaryKey(),
    stataErc20Address: text('stata_erc20_address').notNull(),
    underlyingErc20Address: text('underlying_erc20_address').notNull(),
    shares: contractInteger('shares').notNull(),
    state: text('state', { enum: REDEEM_STATES }).notNull(),
    inIndex: contractInteger('in_index').notNull(),
    vaultAccount: text('vault_account').notNull(),
    outcome: text('outcome', { enum: REDEEM_OUTCOMES }),
    failure: text('failure', { enum: REDEEM_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
)

/**
 * One row per ERC-20 vault approval resource, keyed by its resource name: the vault account
 * granting one of its pinned spenders an allowance, which only the deployer starts.
 */
export const midnightEthereumErc20VaultApprovalsV1 = pgTable(
  'midnight_ethereum_erc20_vault_approvals_v1',
  {
    name: text('name').primaryKey(),
    kind: text('kind', { enum: APPROVAL_KINDS }).notNull(),
    erc20Address: text('erc20_address').notNull(),
    spender: text('spender').notNull(),
    state: text('state', { enum: APPROVAL_STATES }).notNull(),
    inIndex: contractInteger('in_index').notNull(),
    vaultAccount: text('vault_account').notNull(),
    outcome: text('outcome', { enum: APPROVAL_OUTCOMES }),
    failure: text('failure', { enum: APPROVAL_FAILURES }),
    error: text('error'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
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
    signerAccount: text('signer_account').notNull(),
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
 * One row per vault activity, derived from the lifecycle tables: each deposit, withdrawal, swap,
 * supply, redeem and approval with its newest start and complete calls, its newest vault request and that
 * request's newest foreign chain transaction. The states are aggregated here, so nothing above
 * a repository derives them.
 */
export const midnightEthereumErc20VaultActivityV1 = pgView(
  'midnight_ethereum_erc20_vault_activity_v1',
  {
    name: text('name').notNull(),
    type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
    state: text('state', { enum: ACTIVITY_STATES }).notNull(),
    erc20Address: text('erc20_address').notNull(),
    amount: contractInteger('amount'),
    erc20AddressOut: text('erc20_address_out'),
    amountOut: contractInteger('amount_out'),
    spender: text('spender'),
    destination: text('destination'),
    outcome: text('outcome'),
    error: text('error'),
    resourceState: text('resource_state', { enum: CALLER_OPERATION_STATES }).notNull(),
    vaultRequestState: text('vault_request_state', { enum: VAULT_REQUEST_STATES }),
    vaultRequestId: text('vault_request_id'),
    // The repository parses every row with the resource schema, which checks the shape claimed here.
    startTransaction: jsonb('start_transaction').$type<ActivityTransaction | null>(),
    foreignChainTransaction: jsonb('foreign_chain_transaction').$type<ActivityTransaction | null>(),
    completeTransaction: jsonb('complete_transaction').$type<ActivityTransaction | null>(),
    createTime: timestamp('create_time', { withTimezone: true }).notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull(),
  },
).as(activityViewQuery())

/**
 * One branch of the view per caller operation, joined with `UNION ALL`. A column a branch
 * lacks is a typed `NULL`: the union resolves its types pairwise from the left, so two bare
 * nulls in a row would fix the column as text before a later branch's numeric joins.
 */
function activityViewQuery(): SQL {
  const deposits = midnightEthereumErc20VaultDepositsV1
  const withdraws = midnightEthereumErc20VaultWithdrawsV1
  const swaps = midnightEthereumErc20VaultSwapsV1
  const supplies = midnightEthereumErc20VaultSuppliesV1
  const redeems = midnightEthereumErc20VaultRedeemsV1
  const approvals = midnightEthereumErc20VaultApprovalsV1
  return sql.raw(
    [
      activityBranch({
        type: 'Deposit',
        table: deposits,
        startCircuits: ['startDeposit'],
        completeCircuit: 'completeDeposit',
        erc20Address: deposits.erc20Address,
        amount: deposits.amount,
        erc20AddressOut: null,
        amountOut: null,
        spender: null,
        destination: deposits.recipient,
      }),
      activityBranch({
        type: 'Withdraw',
        table: withdraws,
        startCircuits: ['startWithdraw'],
        completeCircuit: 'completeWithdraw',
        erc20Address: withdraws.erc20Address,
        amount: withdraws.amount,
        erc20AddressOut: null,
        amountOut: null,
        spender: null,
        destination: withdraws.destEvmAddress,
      }),
      activityBranch({
        type: 'Swap',
        table: swaps,
        startCircuits: ['startSwap'],
        completeCircuit: 'completeSwap',
        erc20Address: swaps.erc20AddressIn,
        amount: swaps.amountInMaximum,
        erc20AddressOut: swaps.erc20AddressOut,
        amountOut: swaps.amountOut,
        spender: null,
        destination: null,
      }),
      activityBranch({
        type: 'Supply',
        table: supplies,
        startCircuits: ['startSupply'],
        completeCircuit: 'completeSupply',
        erc20Address: supplies.underlyingErc20Address,
        amount: supplies.amount,
        erc20AddressOut: null,
        amountOut: null,
        spender: null,
        destination: supplies.stataErc20Address,
      }),
      activityBranch({
        type: 'Redeem',
        table: redeems,
        startCircuits: ['startRedeem'],
        completeCircuit: 'completeRedeem',
        erc20Address: redeems.stataErc20Address,
        amount: redeems.shares,
        erc20AddressOut: null,
        amountOut: null,
        spender: null,
        destination: redeems.underlyingErc20Address,
      }),
      activityBranch({
        type: 'Approval',
        table: approvals,
        startCircuits: ['startApproveRouter', 'startApproveStata'],
        completeCircuit: 'completeApprove',
        erc20Address: approvals.erc20Address,
        amount: null,
        erc20AddressOut: null,
        amountOut: null,
        spender: approvals.spender,
        destination: null,
      }),
    ].join('\n    UNION ALL\n'),
  )
}

interface ActivityBranch {
  readonly type: ActivityType
  readonly table: PgTable
  readonly startCircuits: readonly string[]
  readonly completeCircuit: string
  /** The column of the operation's own table holding the token it surrenders or moves. */
  readonly erc20Address: PgColumn
  /** The operation's own columns behind the typed fields, null where the type has none. */
  readonly amount: PgColumn | null
  readonly erc20AddressOut: PgColumn | null
  readonly amountOut: PgColumn | null
  readonly spender: PgColumn | null
  readonly destination: PgColumn | null
}

/**
 * The operation row as `d`, its newest start call `s`, request `r`, foreign transaction `e` and
 * complete call `c`. Every operation table shares the caller operation's columns by name.
 */
function activityBranch(branch: ActivityBranch): string {
  const t = midnightTransactionsV1
  const r = midnightEthereumErc20VaultRequestsV1
  const e = ethereumTransactionsV1
  const newest = (table: PgTable, alias: string, where: string): string =>
    `LEFT JOIN LATERAL (SELECT * FROM "${getTableName(table)}" x WHERE ${where} ORDER BY x.create_time DESC, x.name LIMIT 1) ${alias} ON TRUE`
  const transaction = (alias: string, hash: PgColumn, block: PgColumn): string =>
    `CASE WHEN ${alias}.name IS NULL THEN NULL ELSE jsonb_build_object('hash', ${alias}.${hash.name}, 'blockNumber', ${alias}.${block.name}, 'state', ${caseOver(`${alias}.state`, ACTIVITY_TRANSACTION_STATE_BY_STATE, 'Pending')}, 'lifecycleState', ${alias}.state) END`
  const circuits = (names: readonly string[]): string => names.map((name) => `'${name}'`).join(', ')
  const amountType = midnightEthereumErc20VaultSwapsV1.amountOut.getSQLType()
  const addressType = midnightEthereumErc20VaultSwapsV1.erc20AddressOut.getSQLType()
  const field = (column: PgColumn | null, sqlType: string): string =>
    column === null ? `NULL::${sqlType}` : `d.${column.name}`
  return `
    SELECT
      d.name AS name,
      '${branch.type}' AS type,
      ${caseOver('d.state', ACTIVITY_STATE_BY_OPERATION_STATE, 'Pending')} AS state,
      d.${branch.erc20Address.name} AS erc20_address,
      ${field(branch.amount, amountType)} AS amount,
      ${field(branch.erc20AddressOut, addressType)} AS erc20_address_out,
      ${field(branch.amountOut, amountType)} AS amount_out,
      ${field(branch.spender, addressType)} AS spender,
      ${field(branch.destination, addressType)} AS destination,
      d.outcome AS outcome,
      d.error AS error,
      d.state AS resource_state,
      r.${r.state.name} AS vault_request_state,
      r.${r.requestId.name} AS vault_request_id,
      ${transaction('s', t.txId, t.blockHeight)} AS start_transaction,
      ${transaction('e', e.txHash, e.blockNumber)} AS foreign_chain_transaction,
      ${transaction('c', t.txId, t.blockHeight)} AS complete_transaction,
      d.create_time AS create_time,
      GREATEST(d.update_time, s.update_time, r.update_time, e.update_time, c.update_time) AS update_time
    FROM "${getTableName(branch.table)}" d
    ${newest(t, 's', `x.${t.parent.name} = d.name AND x.${t.circuit.name} IN (${circuits(branch.startCircuits)})`)}
    ${newest(r, 'r', `x.${r.parent.name} = d.name`)}
    ${newest(e, 'e', `x.${e.parent.name} = r.name`)}
    ${newest(t, 'c', `x.${t.parent.name} = d.name AND x.${t.circuit.name} = '${branch.completeCircuit}'`)}`
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
