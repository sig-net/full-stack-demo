import type { DatabaseExecutor } from '@/lib/db/database'
import type { OutboxEntry } from '@/lib/event/outbox-entry-v1/outbox-entry'

/** Durable storage of outbox entries. Every method runs on `executor` when one is given. */
export interface OutboxEntryRepository {
  createOutboxEntry(outboxEntry: OutboxEntry, executor?: DatabaseExecutor): Promise<OutboxEntry>
  /**
   * The oldest unsent entries, locked for the executor's transaction and skipping entries another
   * transaction already holds, so concurrent processors never relay the same entry.
   */
  listUnsentOutboxEntries(limit: number, executor?: DatabaseExecutor): Promise<OutboxEntry[]>
  updateOutboxEntry(outboxEntry: OutboxEntry, executor?: DatabaseExecutor): Promise<OutboxEntry>
}
