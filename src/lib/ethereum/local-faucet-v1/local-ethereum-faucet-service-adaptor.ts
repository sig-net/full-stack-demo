import 'server-only'

import { z } from 'zod'

import { messageOf } from '@/lib/message-of'

import type { AccountFunding } from '@/lib/ethereum/local-faucet-v1/account-funding'
import type { Erc20Funding } from '@/lib/ethereum/local-faucet-v1/erc20-funding'
import {
  fundAccountArgsSchema,
  fundErc20ArgsSchema,
  type LocalEthereumFaucetService,
} from '@/lib/ethereum/local-faucet-v1/local-ethereum-faucet-service'
import type { Logger } from '@/lib/logging/logger'

/** Adapts the local faucet to the wire. Built without a service outside the local stack, where every call is refused. */
export class LocalEthereumFaucetServiceAdaptor {
  private readonly localEthereumFaucetService: LocalEthereumFaucetService | null
  private readonly logger: Logger

  constructor(localEthereumFaucetService: LocalEthereumFaucetService | null, logger: Logger) {
    this.localEthereumFaucetService = localEthereumFaucetService
    this.logger = logger
  }

  async fundAccount(args: unknown): Promise<AccountFundingResult> {
    this.logger.debug('method called', { method: 'fundAccount' })
    if (this.localEthereumFaucetService === null) return { ok: false, error: NOT_LOCAL }
    const parsed = fundAccountArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, funding: await this.localEthereumFaucetService.fundAccount(parsed.data) }
  }

  async fundErc20(args: unknown): Promise<Erc20FundingResult> {
    this.logger.debug('method called', { method: 'fundErc20' })
    if (this.localEthereumFaucetService === null) return { ok: false, error: NOT_LOCAL }
    const parsed = fundErc20ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    try {
      return { ok: true, funding: await this.localEthereumFaucetService.fundErc20(parsed.data) }
    } catch (error: unknown) {
      // A token the faucet cannot write is an expected outcome the dialog reports, not a bug.
      return { ok: false, error: messageOf(error) }
    }
  }
}

const NOT_LOCAL = 'The faucet is available on the local stack only.'

export type AccountFundingResult =
  | { readonly ok: true; readonly funding: AccountFunding }
  | { readonly ok: false; readonly error: string }

export type Erc20FundingResult =
  | { readonly ok: true; readonly funding: Erc20Funding }
  | { readonly ok: false; readonly error: string }
