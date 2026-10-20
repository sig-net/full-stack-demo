import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import { SponsoredCallMismatch } from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import type {
  Swap,
  SwapCompleteInputs,
  SwapStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import type { SwapQuote } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import {
  completeSwapArgsSchema,
  getSwapArgsSchema,
  listSwapsArgsSchema,
  prepareCompleteSwapArgsSchema,
  prepareStartSwapArgsSchema,
  quoteSwapArgsSchema,
  startSwapArgsSchema,
  type SwapService,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the swap service to the wire: the caller secret stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after its row reads.
 */
export class SwapServiceAdaptor {
  private readonly swapService: SwapService
  private readonly logger: Logger

  constructor(swapService: SwapService, logger: Logger) {
    this.swapService = swapService
    this.logger = logger
  }

  async quoteSwap(callerSecret: string, args: unknown): Promise<SwapQuoteResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'quoteSwap', caller: caller.name })
    const parsed = quoteSwapArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const quote = await this.swapService.quoteSwap(caller, parsed.data)
    if (quote === undefined) {
      return { ok: false, error: 'No Uniswap pool prices this pair.' }
    }
    return { ok: true, quote }
  }

  async prepareStartSwap(callerSecret: string, args: unknown): Promise<SwapStartInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareStartSwap', caller: caller.name })
    const parsed = prepareStartSwapArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, inputs: await this.swapService.prepareStartSwap(caller, parsed.data) }
  }

  async startSwap(callerSecret: string, args: unknown): Promise<SwapResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'startSwap', caller: caller.name })
    const parsed = startSwapArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<SwapResult>(async () => ({
      ok: true,
      swap: await this.swapService.startSwap(caller, parsed.data),
    }))
  }

  async prepareCompleteSwap(
    callerSecret: string,
    args: unknown,
  ): Promise<SwapCompleteInputsResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'prepareCompleteSwap', caller: caller.name })
    const parsed = prepareCompleteSwapArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<SwapCompleteInputsResult>(async () => ({
      ok: true,
      inputs: await this.swapService.prepareCompleteSwap(caller, parsed.data),
    }))
  }

  async completeSwap(callerSecret: string, args: unknown): Promise<SwapResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'completeSwap', caller: caller.name })
    const parsed = completeSwapArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<SwapResult>(async () => ({
      ok: true,
      swap: await this.swapService.completeSwap(caller, parsed.data),
    }))
  }

  async getSwap(callerSecret: string, args: unknown): Promise<SwapResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getSwap', caller: caller.name })
    const parsed = getSwapArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const swap = await this.swapService.getSwap(caller, parsed.data)
    if (swap === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, swap }
  }

  async listSwaps(callerSecret: string, args: unknown): Promise<SwapListResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'listSwaps', caller: caller.name })
    const parsed = listSwapsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, swaps: await this.swapService.listSwaps(caller, parsed.data) }
  }
}

export type SwapResult = { readonly ok: true; readonly swap: Swap } | Refused

export type SwapListResult = { readonly ok: true; readonly swaps: Swap[] } | Refused

export type SwapQuoteResult = { readonly ok: true; readonly quote: SwapQuote } | Refused

export type SwapStartInputsResult =
  | { readonly ok: true; readonly inputs: SwapStartInputs }
  | Refused

export type SwapCompleteInputsResult =
  | { readonly ok: true; readonly inputs: SwapCompleteInputs }
  | Refused

type Refused = { readonly ok: false; readonly error: string }

/** A state conflict and bound bytes that are not the expected vault call are refusals the caller can act on. */
async function outcomeOf<Result>(action: () => Promise<Result>): Promise<Result | Refused> {
  try {
    return await action()
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict || error instanceof SponsoredCallMismatch) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
