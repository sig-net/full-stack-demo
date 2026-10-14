import 'server-only'

import { randomUUID } from 'node:crypto'

import { bytesToHex, hexToBytes } from '@sig-net/midnight'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import {
  type Supply,
  supplyName,
  type SupplyTarget,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import type { SupplyRepository } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-repository'
import type {
  CompleteSupplyArgs,
  GetSupplyArgs,
  GetSupplyTargetArgs,
  ListSuppliesArgs,
  StartSupplyArgs,
  SupplyService,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import {
  type SupplyStateController,
  SupplyStateConflict,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { SpenderLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import { vaultTokenType } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'

export class SupplyServiceImpl implements SupplyService {
  private readonly supplyRepository: SupplyRepository
  private readonly supplyStateController: SupplyStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly circuits: VaultCircuits
  private readonly ledger: SpenderLedger
  private readonly erc20Reader: Erc20Reader
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    supplyRepository: SupplyRepository,
    supplyStateController: SupplyStateController,
    vaultRequestRepository: VaultRequestRepository,
    circuits: VaultCircuits,
    ledger: SpenderLedger,
    erc20Reader: Erc20Reader,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.supplyRepository = supplyRepository
    this.supplyStateController = supplyStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.circuits = circuits
    this.ledger = ledger
    this.erc20Reader = erc20Reader
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  async getSupplyTarget(_caller: Caller, _args: GetSupplyTargetArgs): Promise<SupplyTarget> {
    const pair = await this.stataPair()
    return {
      ...pair,
      allowance: await this.erc20Reader.allowance(
        pair.underlyingErc20Address,
        vaultAccountOf(this.signet, this.vault),
        pair.stataErc20Address,
      ),
    }
  }

  async startSupply(caller: Caller, { supplyRequest, wallet }: StartSupplyArgs): Promise<Supply> {
    const pair = await this.stataPair()
    const inIndex = newInputIndex()
    const unprovenTx = await this.circuits.startSupply({
      secretKey: caller.secretKey,
      wallet,
      inIndex,
      amount: supplyRequest.amount,
      coinType: vaultTokenType(pair.underlyingErc20Address, this.vault.contractAddress),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.supplyStateController.startSupply({
        name: supplyName(caller.name, randomUUID()),
        ...pair,
        amount: supplyRequest.amount,
        inIndex,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
        unprovenTx,
      }),
    )
  }

  /** The state table is asked before the slow build, and the controller asks it again under the lock. */
  async completeSupply(caller: Caller, { name, wallet }: CompleteSupplyArgs): Promise<Supply> {
    const supply = await this.ownSupply(caller, name)
    if (nextState(supply.state, 'complete') === undefined) {
      throw new SupplyStateConflict(name, supply.state, 'complete')
    }
    const request = await this.attestedRequestOf(name)
    const unprovenTx = await this.circuits.completeSupply({
      secretKey: caller.secretKey,
      wallet,
      requestId: hexToBytes(request.requestId),
      serializedOutput: completionOutput(request),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.supplyStateController.completeSupply({ name, unprovenTx }),
    )
  }

  async getSupply(caller: Caller, args: GetSupplyArgs): Promise<Supply | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.supplyRepository.get(args.name)
  }

  async listSupplies(caller: Caller, _args: ListSuppliesArgs): Promise<Supply[]> {
    return this.supplyRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  /** The pair the deployer pinned at initialisation, which every supply moves between. */
  private async stataPair(): Promise<
    Pick<SupplyTarget, 'underlyingErc20Address' | 'stataErc20Address'>
  > {
    const state = await this.ledger.state()
    return {
      underlyingErc20Address: `0x${bytesToHex(state.stataUnderlying)}`,
      stataErc20Address: `0x${bytesToHex(state.stataToken)}`,
    }
  }

  private async ownSupply(caller: Caller, name: string): Promise<Supply> {
    const supply = resourceOwnedByCaller(name, caller)
      ? await this.supplyRepository.get(name)
      : undefined
    if (supply === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return supply
  }

  /** A supply that may be completed has an attested request under it, so its fields are read without a state check. */
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

/** The circuit verifies the 32 attested bytes only for an executed deposit, and ignores them otherwise. */
function completionOutput(request: AttestedRequestFields): Uint8Array {
  return request.attestationOutputKind === 'executed'
    ? hexToBytes(request.attestationOutput)
    : new Uint8Array(32)
}
