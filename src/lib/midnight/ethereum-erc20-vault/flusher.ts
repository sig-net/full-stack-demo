/**
 * The vault-level batch that moves queued requests and attestations through `flushQueue`. It
 * has no row: the ledger holds the queue, and the relayer wallet pays for every flush.
 */
export interface Flusher {
  /** Flushes until nothing waits. A call during a run makes the run go again, and shares its promise. */
  flush(): Promise<void>
}
