import type { LogFields, Logger, LogLevel } from '@/lib/logging/logger'

/** A logger that keeps every line written through it or its children, for a test to assert on. */
export class RecordingLogger implements Logger {
  /** Shared with every child, in the order the lines were written. */
  readonly lines: RecordedLine[]
  private readonly bound: LogFields

  constructor(lines: RecordedLine[] = [], bound: LogFields = {}) {
    this.lines = lines
    this.bound = bound
  }

  debug(message: string, fields: LogFields = {}): void {
    this.record('debug', message, fields)
  }

  info(message: string, fields: LogFields = {}): void {
    this.record('info', message, fields)
  }

  warn(message: string, fields: LogFields = {}): void {
    this.record('warn', message, fields)
  }

  error(message: string, fields: LogFields = {}): void {
    this.record('error', message, fields)
  }

  child(fields: LogFields): RecordingLogger {
    return new RecordingLogger(this.lines, { ...this.bound, ...fields })
  }

  /** The lines at `level`, with the fields their children bound. */
  at(level: LogLevel): RecordedLine[] {
    return this.lines.filter((line) => line.level === level)
  }

  private record(level: LogLevel, message: string, fields: LogFields): void {
    this.lines.push({ level, message, fields: { ...this.bound, ...fields } })
  }
}

export interface RecordedLine {
  readonly level: LogLevel
  readonly message: string
  readonly fields: LogFields
}
