import 'server-only'

import { asc, eq } from 'drizzle-orm'

import { type DatabaseExecutor, getDatabase } from '@/lib/db/database'
import { eventOutboxEntriesV1 } from '@/lib/db/schema'
import { currentTransaction } from '@/lib/db/unit-of-work'
import type { OutboxEntry } from '@/lib/event/outbox-entry-v1/outbox-entry'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { lazySingleton } from '@/lib/lazy-singleton'

type OutboxEntryRow = typeof eventOutboxEntriesV1.$inferSelect

export class OutboxEntryRepositorySQLImpl implements OutboxEntryRepository {
  private readonly database: DatabaseExecutor

  constructor(database: DatabaseExecutor) {
    this.database = database
  }

  private executor(): DatabaseExecutor {
    return currentTransaction() ?? this.database
  }

  async createOutboxEntry(outboxEntry: OutboxEntry): Promise<OutboxEntry> {
    const [stored] = await this.executor()
      .insert(eventOutboxEntriesV1)
      .values(toOutboxEntryRow(outboxEntry))
      .returning()
    if (stored === undefined) {
      throw new Error('The insert returned no row')
    }
    return fromOutboxEntryRow(stored)
  }

  async listUnsentOutboxEntries(limit: number): Promise<OutboxEntry[]> {
    const rows = await this.executor()
      .select()
      .from(eventOutboxEntriesV1)
      .where(eq(eventOutboxEntriesV1.sent, false))
      .orderBy(asc(eventOutboxEntriesV1.createdAt), asc(eventOutboxEntriesV1.name))
      .limit(limit)
      .for('update', { skipLocked: true })
    return rows.map(fromOutboxEntryRow)
  }

  async updateOutboxEntry(outboxEntry: OutboxEntry): Promise<OutboxEntry> {
    const [stored] = await this.executor()
      .update(eventOutboxEntriesV1)
      .set(toOutboxEntryRow(outboxEntry))
      .where(eq(eventOutboxEntriesV1.name, outboxEntry.name))
      .returning()
    if (stored === undefined) {
      throw new Error(`${outboxEntry.name} does not exist`)
    }
    return fromOutboxEntryRow(stored)
  }
}

/** One instance serves the whole server process. */
export const getOutboxEntryRepository: () => Promise<OutboxEntryRepository> = lazySingleton(
  async () => new OutboxEntryRepositorySQLImpl(await getDatabase()),
)

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
