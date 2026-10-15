import 'server-only'

import { z } from 'zod'

import { messageOf } from '@/lib/message-of'
import { explainDustSpendRejection } from '@/lib/midnight/wallet/dust-spend-rejection'

import {
  fundNightArgsSchema,
  type LocalMidnightFaucetService,
} from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service'
import type { NightFunding } from '@/lib/midnight/local-faucet-v1/night-funding'
import type { Logger } from '@/lib/logging/logger'

/** Adapts the local NIGHT faucet to the wire. Built without a service outside the local stack, where every call is refused. */
export class LocalMidnightFaucetServiceAdaptor {
  private readonly localMidnightFaucetService: LocalMidnightFaucetService | null
  private readonly logger: Logger

  constructor(localMidnightFaucetService: LocalMidnightFaucetService | null, logger: Logger) {
    this.localMidnightFaucetService = localMidnightFaucetService
    this.logger = logger
  }

  async fundNight(args: unknown): Promise<NightFundingResult> {
    this.logger.debug('method called', { method: 'fundNight' })
    if (this.localMidnightFaucetService === null) return { ok: false, error: NOT_LOCAL }
    const parsed = fundNightArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    try {
      return { ok: true, funding: await this.localMidnightFaucetService.fundNight(parsed.data) }
    } catch (error: unknown) {
      // A transfer the funder cannot build or the node refuses is an outcome the wand reports, not a bug.
      return { ok: false, error: explainDustSpendRejection(messageOf(error)) }
    }
  }
}

const NOT_LOCAL = 'The faucet is available on the local stack only.'

export type NightFundingResult =
  | { readonly ok: true; readonly funding: NightFunding }
  | { readonly ok: false; readonly error: string }
