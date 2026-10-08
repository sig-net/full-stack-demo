import { bigint, pgTable, text } from 'drizzle-orm/pg-core'

/** One row per ERC-20 vault deposit resource, keyed by its resource name. */
export const midnightErc20VaultDepositsV1 = pgTable('midnight_erc20_vault_deposits_v1', {
  name: text('name').primaryKey(),
  erc20Address: text('erc20_address').notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
})
