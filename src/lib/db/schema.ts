import { notInArray } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  index,
  numeric,
  pgTable,
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
