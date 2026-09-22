import type { Environment } from '@/lib/config/environment'

/** The configuration subset that is safe to send to the browser. */
export interface ClientConfig {
  readonly environment: Environment
  readonly nodeURL: string
}
