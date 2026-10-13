import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { DepositAccountFund } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/deposit-account-fund'
import type { SupportedToken } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token'
import {
  listDepositAccountFundsArgsSchema,
  listSupportedTokensArgsSchema,
  type SupportedTokenService,
} from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service'

/** Adapts the supported token service to the wire: untrusted arguments are parsed, and the funds read takes the caller secret. */
export class SupportedTokenServiceAdaptor {
  private readonly supportedTokenService: SupportedTokenService

  constructor(supportedTokenService: SupportedTokenService) {
    this.supportedTokenService = supportedTokenService
  }

  async listSupportedTokens(args: unknown): Promise<SupportedTokenListResult> {
    const parsed = listSupportedTokensArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, tokens: await this.supportedTokenService.listSupportedTokens(parsed.data) }
  }

  async listDepositAccountFunds(
    callerSecret: string,
    args: unknown,
  ): Promise<DepositAccountFundListResult> {
    const caller = resolveCaller(callerSecret)
    const parsed = listDepositAccountFundsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return {
      ok: true,
      funds: await this.supportedTokenService.listDepositAccountFunds(caller, parsed.data),
    }
  }
}

export type SupportedTokenListResult =
  | { readonly ok: true; readonly tokens: SupportedToken[] }
  | { readonly ok: false; readonly error: string }

export type DepositAccountFundListResult =
  | { readonly ok: true; readonly funds: DepositAccountFund[] }
  | { readonly ok: false; readonly error: string }
