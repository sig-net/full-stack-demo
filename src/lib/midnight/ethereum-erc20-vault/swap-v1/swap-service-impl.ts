import 'server-only'

import { randomUUID } from 'node:crypto'

import { hexToBytes } from '@sig-net/midnight'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { UniswapQuoter } from '@/lib/ethereum/uniswap-quoter'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import { type Swap, swapName } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'
import {
  amountOutMinimumOf,
  SWAP_FEE_TIERS,
  type SwapQuote,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import type { SwapRepository } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-repository'
import type {
  CompleteSwapArgs,
  GetSwapArgs,
  ListSwapsArgs,
  QuoteSwapArgs,
  StartSwapArgs,
  SwapService,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import {
  type SwapStateController,
  SwapStateConflict,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-state-controller'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import { vaultTokenType } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'

export class SwapServiceImpl implements SwapService {
  private readonly swapRepository: SwapRepository
  private readonly swapStateController: SwapStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly circuits: VaultCircuits
  private readonly quoter: UniswapQuoter
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    swapRepository: SwapRepository,
    swapStateController: SwapStateController,
    vaultRequestRepository: VaultRequestRepository,
    circuits: VaultCircuits,
    quoter: UniswapQuoter,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.swapRepository = swapRepository
    this.swapStateController = swapStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.circuits = circuits
    this.quoter = quoter
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  /** Every tier is asked and the one paying most wins, so a pair with one thin pool still quotes. */
  async quoteSwap(_caller: Caller, args: QuoteSwapArgs): Promise<SwapQuote | undefined> {
    let best: { fee: bigint; amountOut: bigint } | undefined
    for (const fee of SWAP_FEE_TIERS) {
      const amountOut = await this.quoter.quoteExactInputSingle({
        tokenIn: args.erc20AddressIn,
        tokenOut: args.erc20AddressOut,
        amountIn: args.amountIn,
        fee,
      })
      if (
        amountOut !== undefined &&
        amountOut > 0n &&
        (best === undefined || amountOut > best.amountOut)
      ) {
        best = { fee, amountOut }
      }
    }
    if (best === undefined) return undefined
    const amountOutMinimum = amountOutMinimumOf(best.amountOut)
    if (amountOutMinimum === 0n) return undefined
    return { ...args, fee: best.fee, amountOut: best.amountOut, amountOutMinimum }
  }

  async startSwap(caller: Caller, { swapRequest, wallet }: StartSwapArgs): Promise<Swap> {
    const inIndex = newInputIndex()
    const unprovenTx = await this.circuits.startSwap({
      secretKey: caller.secretKey,
      wallet,
      inIndex,
      ...swapRequest,
      coinType: vaultTokenType(swapRequest.erc20AddressIn, this.vault.contractAddress),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.swapStateController.startSwap({
        name: swapName(caller.name, randomUUID()),
        ...swapRequest,
        inIndex,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
        unprovenTx,
      }),
    )
  }

  /** The state table is asked before the slow build, and the controller asks it again under the lock. */
  async completeSwap(caller: Caller, { name, wallet }: CompleteSwapArgs): Promise<Swap> {
    const swap = await this.ownSwap(caller, name)
    if (nextState(swap.state, 'complete') === undefined) {
      throw new SwapStateConflict(name, swap.state, 'complete')
    }
    const request = await this.attestedRequestOf(name)
    const unprovenTx = await this.circuits.completeSwap({
      secretKey: caller.secretKey,
      wallet,
      requestId: hexToBytes(request.requestId),
      serializedOutput: completionOutput(request),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
      changeNonce: crypto.getRandomValues(new Uint8Array(32)),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.swapStateController.completeSwap({ name, unprovenTx }),
    )
  }

  async getSwap(caller: Caller, args: GetSwapArgs): Promise<Swap | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.swapRepository.get(args.name)
  }

  async listSwaps(caller: Caller, _args: ListSwapsArgs): Promise<Swap[]> {
    return this.swapRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  private async ownSwap(caller: Caller, name: string): Promise<Swap> {
    const swap = resourceOwnedByCaller(name, caller)
      ? await this.swapRepository.get(name)
      : undefined
    if (swap === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return swap
  }

  /** A swap that may be completed has an attested request under it, so its fields are read without a state check. */
  private async attestedRequestOf(name: string): Promise<AttestedRequestFields> {
    const [request] = await this.vaultRequestRepository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: name }],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    if (request === undefined) {
      throw new Error(`${name} has no vault request`)
    }
    return attestedRequestFields(request)
  }
}

/** The circuit verifies the 32 attested bytes only for an executed trade, and ignores them otherwise. */
function completionOutput(request: AttestedRequestFields): Uint8Array {
  return request.attestationOutputKind === 'executed'
    ? hexToBytes(request.attestationOutput)
    : new Uint8Array(32)
}
