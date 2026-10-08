import type { OutboxEntry } from '@/lib/event/outbox-entry-v1/outbox-entry'

/** Durable storage of outbox entries. Every method joins the transaction open on its call chain. */
export interface OutboxEntryRepository {
  createOutboxEntry(outboxEntry: OutboxEntry): Promise<OutboxEntry>
  /**
   * The oldest unsent entries, locked for the open transaction and skipping entries another
   * transaction already holds, so concurrent processors never relay the same entry.
   */
  listUnsentOutboxEntries(limit: number): Promise<OutboxEntry[]>
  updateOutboxEntry(outboxEntry: OutboxEntry): Promise<OutboxEntry>
}
