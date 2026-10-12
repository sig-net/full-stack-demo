import 'server-only'

import { randomUUID } from 'node:crypto'

import { bytesToHex, deriveEvmAddress, hexToBytes } from '@sig-net/midnight'
import { newInputIndex, pureCircuits } from '@sig-net/midnight-examples-erc20-vault-contract'
import type { Provider } from 'ethers'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type Deposit,
  depositName,
  isTerminalDepositState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-machine'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import type {
  CompleteDepositArgs,
  DepositService,
  GetDepositArgs,
  ListDepositsArgs,
  StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import {
  DepositStateConflict,
  type DepositStateController,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import type { GasEnvelope, VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'

export class DepositServiceImpl implements DepositService {
  private readonly depositRepository: DepositRepository
  private readonly depositStateController: DepositStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly circuits: VaultCircuits
  private readonly evmProvider: Provider
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    depositRepository: DepositRepository,
    depositStateController: DepositStateController,
    vaultRequestRepository: VaultRequestRepository,
    circuits: VaultCircuits,
    evmProvider: Provider,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.depositRepository = depositRepository
    this.depositStateController = depositStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.circuits = circuits
    this.evmProvider = evmProvider
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  async startDeposit(
    caller: Caller,
    { depositRequest, wallet }: StartDepositArgs,
  ): Promise<Deposit> {
    const depositAccount = this.depositAccountOf(caller)
    const inIndex = newInputIndex()
    const evmNonce = await this.nextEvmNonce(depositAccount)
    const unprovenTx = await this.circuits.startDeposit({
      secretKey: caller.secretKey,
      wallet,
      inIndex,
      evmNonce,
      gas: SWEEP_GAS,
      erc20Address: depositRequest.erc20Address,
      amount: depositRequest.amount,
    })
    return this.unitOfWork.runInTransaction(() =>
      this.depositStateController.startDeposit({
        name: depositName(caller.name, randomUUID()),
        erc20Address: depositRequest.erc20Address,
        amount: depositRequest.amount,
        inIndex,
        evmNonce,
        ...SWEEP_GAS,
        depositAccount,
        unprovenTx,
      }),
    )
  }

  /** The state table is asked before the slow build, and the controller asks it again under the lock. */
  async completeDeposit(caller: Caller, { name, wallet }: CompleteDepositArgs): Promise<Deposit> {
    const deposit = await this.ownDeposit(caller, name)
    if (nextState(deposit.state, 'complete') === undefined) {
      throw new DepositStateConflict(name, deposit.state, 'complete')
    }
    const request = await this.attestedRequestOf(name)
    const unprovenTx = await this.circuits.completeDeposit({
      secretKey: caller.secretKey,
      wallet,
      requestId: hexToBytes(request.requestId),
      serializedOutput: completionOutput(request),
      mintNonce: crypto.getRandomValues(new Uint8Array(32)),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.depositStateController.completeDeposit({ name, unprovenTx }),
    )
  }

  async getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.depositRepository.get(args.name)
  }

  /** Every deposit of a caller shares the deposit account, which stands in for the caller in the search. */
  async listDeposits(caller: Caller, _args: ListDepositsArgs): Promise<Deposit[]> {
    return this.depositRepository.search({
      criteria: [
        { type: 'exact-text', field: 'depositAccount', text: this.depositAccountOf(caller) },
      ],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  /** The MPC signs the sweep from the account derived over the caller's commitment, which the start circuit records as the request's path. */
  private depositAccountOf(caller: Caller): string {
    return deriveEvmAddress(
      this.signet.mpcRootPublicKey,
      this.vault.contractAddress,
      bytesToHex(pureCircuits.userCommitment(caller.secretKey)),
    ).toLowerCase()
  }

  /**
   * The chain's pending count covers every sweep broadcast so far, and one above the highest
   * nonce a live deposit holds covers the sweeps still to come, so no two requests of the
   * account are started with the same nonce.
   */
  private async nextEvmNonce(depositAccount: string): Promise<bigint> {
    const pending = BigInt(await this.evmProvider.getTransactionCount(depositAccount, 'pending'))
    const deposits = await this.depositRepository.search({
      criteria: [{ type: 'exact-text', field: 'depositAccount', text: depositAccount }],
    })
    return deposits
      .filter((deposit) => !isTerminalDepositState(deposit.state))
      .reduce((highest, deposit) => bigger(highest, deposit.evmNonce + 1n), pending)
  }

  private async ownDeposit(caller: Caller, name: string): Promise<Deposit> {
    const deposit = resourceOwnedByCaller(name, caller)
      ? await this.depositRepository.get(name)
      : undefined
    if (deposit === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return deposit
  }

  /** A deposit that may be completed has an attested request under it, so its fields are read without a state check. */
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

/**
 * The EIP-1559 envelope of every sweep, as the prep repository's deposit flow sets it: a
 * transfer needs under 100 000 gas, and the fork's base fee is a few wei, so 30 gwei with a
 * 1 gwei tip is never below the market.
 */
const SWEEP_GAS: GasEnvelope = {
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}

/** The circuit verifies the attested output only for an executed sweep, and ignores the byte otherwise. */
function completionOutput(request: AttestedRequestFields): Uint8Array {
  return request.attestationOutputKind === 'executed'
    ? hexToBytes(request.attestationOutput)
    : new Uint8Array([0])
}

function bigger(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}
