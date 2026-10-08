/** Relays unsent outbox entries to Kafka. */
export interface OutboxEntryProcessor {
  /**
   * Relays every unsent entry, oldest first, and resolves when none remain. Concurrent calls
   * share one run and one follow-up run, so a burst of triggers never relays an entry twice.
   */
  process(): Promise<void>
}
