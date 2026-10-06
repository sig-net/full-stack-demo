import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const exampleNotes = pgTable('example_notes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
