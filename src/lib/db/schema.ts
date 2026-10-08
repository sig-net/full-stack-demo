import { bigint, boolean, customType, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { DEPOSIT_STATES } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'

/** One row per ERC-20 vault deposit resource, keyed by its resource name. */
export const midnightErc20VaultDepositsV1 = pgTable('midnight_erc20_vault_deposits_v1', {
  name: text('name').primaryKey(),
  erc20Address: text('erc20_address').notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  state: text('state', { enum: DEPOSIT_STATES }).notNull(),
  startDepositMidnightTxn: text('start_deposit_midnight_txn'),
  depositEVMTxn: text('deposit_evm_txn'),
  completeDepositMidnightTxn: text('complete_deposit_midnight_txn'),
})

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
