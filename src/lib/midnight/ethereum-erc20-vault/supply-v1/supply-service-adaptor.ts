import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { CallerOperationStateConflict } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-controller'
import type {
  Supply,
  SupplyCompleteInputs,
  SupplyStartInputs,
  SupplyTarget,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import {
  completeSupplyArgsSchema,
  getSupplyArgsSchema,
  getSupplyTargetArgsSchema,
  listSuppliesArgsSchema,
  prepareCompleteSupplyArgsSchema,
  prepareStartSupplyArgsSchema,
  startSupplyArgsSchema,
  type SupplyService,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the supply service to the wire: the login credential stands in for the caller, the
 * arguments are untrusted until parsed, and every outcome the caller can act on is a result.
 * The service opens the transaction of each user action itself, after its row reads.
 */
export class SupplyServiceAdaptor {
  private readonly supplyService: SupplyService
  private readonly networkId: MidnightNetworkId
  private readonly logger: Logger

  constructor(supplyService: SupplyService, networkId: MidnightNetworkId, logger: Logger) {
    this.supplyService = supplyService
    this.networkId = networkId
    this.logger = logger
  }

  async getSupplyTarget(credential: unknown, args: unknown): Promise<SupplyTargetResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'getSupplyTarget', caller: caller.name })
    const parsed = getSupplyTargetArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, target: await this.supplyService.getSupplyTarget(caller, parsed.data) }
  }

  async prepareStartSupply(credential: unknown, args: unknown): Promise<SupplyStartInputsResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'prepareStartSupply', caller: caller.name })
    const parsed = prepareStartSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, inputs: await this.supplyService.prepareStartSupply(caller, parsed.data) }
  }

  async startSupply(credential: unknown, args: unknown): Promise<SupplyResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'startSupply', caller: caller.name })
    const parsed = startSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<SupplyResult>(async () => ({
      ok: true,
      supply: await this.supplyService.startSupply(caller, parsed.data),
    }))
  }

  async prepareCompleteSupply(
    credential: unknown,
    args: unknown,
  ): Promise<SupplyCompleteInputsResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'prepareCompleteSupply', caller: caller.name })
    const parsed = prepareCompleteSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<SupplyCompleteInputsResult>(async () => ({
      ok: true,
      inputs: await this.supplyService.prepareCompleteSupply(caller, parsed.data),
    }))
  }

  async completeSupply(credential: unknown, args: unknown): Promise<SupplyResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'completeSupply', caller: caller.name })
    const parsed = completeSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return outcomeOf<SupplyResult>(async () => ({
      ok: true,
      supply: await this.supplyService.completeSupply(caller, parsed.data),
    }))
  }

  async getSupply(credential: unknown, args: unknown): Promise<SupplyResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'getSupply', caller: caller.name })
    const parsed = getSupplyArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const supply = await this.supplyService.getSupply(caller, parsed.data)
    if (supply === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, supply }
  }

  async listSupplies(credential: unknown, args: unknown): Promise<SupplyListResult> {
    const caller = resolveCaller(credential, this.networkId)
    this.logger.debug('method called', { method: 'listSupplies', caller: caller.name })
    const parsed = listSuppliesArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    return { ok: true, supplies: await this.supplyService.listSupplies(caller, parsed.data) }
  }
}

export type SupplyResult = { readonly ok: true; readonly supply: Supply } | Refused

export type SupplyListResult = { readonly ok: true; readonly supplies: Supply[] } | Refused

export type SupplyTargetResult = { readonly ok: true; readonly target: SupplyTarget } | Refused

export type SupplyStartInputsResult =
  | { readonly ok: true; readonly inputs: SupplyStartInputs }
  | Refused

export type SupplyCompleteInputsResult =
  | { readonly ok: true; readonly inputs: SupplyCompleteInputs }
  | Refused

type Refused = { readonly ok: false; readonly error: string }

/** A state conflict is a refusal the caller can act on. */
async function outcomeOf<Result>(action: () => Promise<Result>): Promise<Result | Refused> {
  try {
    return await action()
  } catch (error: unknown) {
    if (error instanceof CallerOperationStateConflict) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
