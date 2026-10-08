import 'server-only'

import { type DatabaseExecutor, getDatabase } from '@/lib/db/database'
import { eventOutboxEntriesV1 } from '@/lib/db/schema'
import { type OutboxEntry, outboxEntrySchema } from '@/lib/event/outbox-entry-v1/outbox-entry'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { lazySingleton } from '@/lib/lazy-singleton'
import { SQLRepository } from '@/lib/repository/repository-sql-impl'

export class OutboxEntryRepositorySQLImpl
  extends SQLRepository<OutboxEntry, typeof eventOutboxEntriesV1>
  implements OutboxEntryRepository
{
  constructor(database: DatabaseExecutor) {
    super(database, eventOutboxEntriesV1, outboxEntrySchema, toOutboxEntryRow, fromOutboxEntryRow)
  }
}

/** One instance serves the whole server process. */
export const getOutboxEntryRepository: () => Promise<OutboxEntryRepository> = lazySingleton(
  async () => new OutboxEntryRepositorySQLImpl(await getDatabase()),
)

type OutboxEntryRow = typeof eventOutboxEntriesV1.$inferSelect

function toOutboxEntryRow(outboxEntry: OutboxEntry): OutboxEntryRow {
  return {
    name: outboxEntry.name,
    type: outboxEntry.type,
    data: outboxEntry.data,
    sent: outboxEntry.sent,
    createdAt: outboxEntry.createdAt,
  }
}

function fromOutboxEntryRow(row: OutboxEntryRow): OutboxEntry {
  return {
    name: row.name,
    type: row.type,
    data: row.data,
    sent: row.sent,
    createdAt: row.createdAt,
  }
}
