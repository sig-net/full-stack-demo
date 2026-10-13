import 'server-only'

import { z } from 'zod'

import type { AccountFunding } from '@/lib/ethereum/local-faucet-v1/account-funding'
import {
  fundAccountArgsSchema,
  type LocalFaucetService,
} from '@/lib/ethereum/local-faucet-v1/local-faucet-service'

/** Adapts the local faucet to the wire. Built without a service outside the local stack, where every call is refused. */
export class LocalFaucetServiceAdaptor {
  private readonly localFaucetService: LocalFaucetService | null

  constructor(localFaucetService: LocalFaucetService | null) {
    this.localFaucetService = localFaucetService
  }

  async fundAccount(args: unknown): Promise<AccountFundingResult> {
    if (this.localFaucetService === null) {
      return { ok: false, error: 'The faucet is available on the local stack only.' }
    }
    const parsed = fundAccountArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, funding: await this.localFaucetService.fundAccount(parsed.data) }
  }
}

export type AccountFundingResult =
  | { readonly ok: true; readonly funding: AccountFunding }
  | { readonly ok: false; readonly error: string }
