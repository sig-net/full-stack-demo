/**
 * Writes one structured line per call. The message is a constant lower-case fact, so lines group
 * by it, and every identity the line is about goes in `fields`.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** A logger whose every line carries `fields` beside its own. */
  child(fields: LogFields): Logger
}

/** The levels a line is written at and `LOG_LEVEL` selects from, least severe first. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

/**
 * The field vocabulary: a line names what it is about with these keys and no others, each a
 * flat value, so a resource, service arguments, a caller or a secret cannot reach a log line.
 */
export interface LogFields {
  /** The class or loop that wrote the line, bound once with `child()`. */
  readonly component?: string
  /** A resource name, such as `callers/{caller}/deposits/{deposit}`. */
  readonly resource?: string
  /** The resource a child resource serves. */
  readonly parent?: string
  /** The resource's state when the line was written. */
  readonly state?: string
  readonly fromState?: string
  readonly toState?: string
  /** A state machine action. */
  readonly action?: string
  /** An event type. */
  readonly event?: string
  readonly eventId?: string
  /** An event's Kafka key. */
  readonly key?: string
  readonly partition?: number
  readonly offset?: bigint
  /** The caller's derived name, `callers/{caller}`, never the caller secret. */
  readonly caller?: string
  /** The adaptor method a server action reached. */
  readonly method?: string
  /** A sweep task's name. */
  readonly task?: string
  /** A vault circuit. */
  readonly circuit?: string
  /** A Midnight transaction identifier or an Ethereum transaction hash. */
  readonly txId?: string
  /** A signet request id in hex. */
  readonly requestId?: string
  /** What an external read reported, such as a ledger status. */
  readonly outcome?: string
  readonly blockHeight?: bigint | number
  /** The last block height a vault queue entry saw. */
  readonly lastSeen?: bigint
  readonly count?: number
  readonly durationMs?: number
  readonly intervalMs?: number
  readonly networkId?: string
  readonly chainId?: number
  readonly logLevel?: string
  readonly logFormat?: string
  /** The error the line reports, serialised with its cause chain. */
  readonly err?: Error
}

/** A caught value as an Error, so a thrown non-Error still reaches the `err` field. */
export function caughtError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught))
}
