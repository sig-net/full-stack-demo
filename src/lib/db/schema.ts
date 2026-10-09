import { notInArray } from 'drizzle-orm'
import {
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
  ETHEREUM_TRANSACTION_STATES,
  ETHEREUM_TRANSACTION_TERMINAL_STATES,
} from '@/lib/ethereum/transaction-v1/transaction'
import { DEPOSIT_STATES } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  MIDNIGHT_TRANSACTION_STATES,
  MIDNIGHT_TRANSACTION_TERMINAL_STATES,
} from '@/lib/midnight/transaction-v1/transaction'

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
    unprovenTx: text('unproven_tx'),
    unboundTx: text('unbound_tx'),
    finalizedTx: text('finalized_tx'),
    expireTime: timestamp('expire_time', { withTimezone: true }),
    txId: text('tx_id'),
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
    unsignedTx: text('unsigned_tx'),
    signedTx: text('signed_tx'),
    txHash: text('tx_hash'),
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
  },
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
