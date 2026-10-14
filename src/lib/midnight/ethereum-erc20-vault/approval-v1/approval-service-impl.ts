import 'server-only'

import { randomUUID } from 'node:crypto'

import { bytesToHex, hexToBytes } from '@sig-net/midnight'
import { newInputIndex } from '@sig-net/midnight-examples-erc20-vault-contract'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightSignetConfig } from '@/lib/config/midnight-signet-config'
import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type Approval,
  approvalName,
  type ApprovalTarget,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { ApprovalRepository } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-repository'
import type {
  ApprovalService,
  CompleteApprovalArgs,
  GetApprovalArgs,
  ListApprovalsArgs,
  ListApprovalTargetsArgs,
  StartApprovalArgs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import {
  ApprovalStateConflict,
  type ApprovalStateController,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import { nextState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
import type { Erc20Reader } from '@/lib/midnight/ethereum-erc20-vault/erc20-reader'
import { vaultAccountOf } from '@/lib/midnight/ethereum-erc20-vault/vault-account'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type {
  SpenderLedger,
  SpenderLedgerState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  type AttestedRequestFields,
  attestedRequestFields,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'

export class ApprovalServiceImpl implements ApprovalService {
  private readonly approvalRepository: ApprovalRepository
  private readonly approvalStateController: ApprovalStateController
  private readonly vaultRequestRepository: VaultRequestRepository
  private readonly circuits: VaultCircuits
  private readonly ledger: SpenderLedger
  private readonly erc20Reader: Erc20Reader
  private readonly unitOfWork: UnitOfWork
  private readonly signet: MidnightSignetConfig
  private readonly vault: MidnightEthereumErc20VaultConfig

  constructor(
    approvalRepository: ApprovalRepository,
    approvalStateController: ApprovalStateController,
    vaultRequestRepository: VaultRequestRepository,
    circuits: VaultCircuits,
    ledger: SpenderLedger,
    erc20Reader: Erc20Reader,
    unitOfWork: UnitOfWork,
    signet: MidnightSignetConfig,
    vault: MidnightEthereumErc20VaultConfig,
  ) {
    this.approvalRepository = approvalRepository
    this.approvalStateController = approvalStateController
    this.vaultRequestRepository = vaultRequestRepository
    this.circuits = circuits
    this.ledger = ledger
    this.erc20Reader = erc20Reader
    this.unitOfWork = unitOfWork
    this.signet = signet
    this.vault = vault
  }

  /** The router on every allowed token, then the wrapper on its underlying, each with the chain's allowance. */
  async listApprovalTargets(
    _caller: Caller,
    _args: ListApprovalTargetsArgs,
  ): Promise<ApprovalTarget[]> {
    const state = await this.ledger.state()
    const vaultAccount = vaultAccountOf(this.signet, this.vault)
    const spenders: Pick<ApprovalTarget, 'kind' | 'erc20Address' | 'spender'>[] = [
      ...[...state.allowedTokens].map((token) => ({
        kind: 'router' as const,
        erc20Address: evmAddress(token),
        spender: evmAddress(state.uniswapRouter),
      })),
      {
        kind: 'stata' as const,
        erc20Address: evmAddress(state.stataUnderlying),
        spender: evmAddress(state.stataToken),
      },
    ]
    return Promise.all(
      spenders.map(async (target) => ({
        ...target,
        allowance: await this.erc20Reader.allowance(
          target.erc20Address,
          vaultAccount,
          target.spender,
        ),
      })),
    )
  }

  async startApproval(
    caller: Caller,
    { approvalRequest, wallet }: StartApprovalArgs,
  ): Promise<Approval> {
    const state = await this.ledger.state()
    const inIndex = newInputIndex()
    const callerArgs = { secretKey: caller.secretKey, wallet, inIndex }
    const target =
      approvalRequest.kind === 'router'
        ? {
            kind: approvalRequest.kind,
            erc20Address: approvalRequest.erc20Address,
            spender: evmAddress(state.uniswapRouter),
            unprovenTx: await this.circuits.startApproveRouter({
              ...callerArgs,
              erc20Address: approvalRequest.erc20Address,
            }),
          }
        : {
            kind: approvalRequest.kind,
            erc20Address: evmAddress(state.stataUnderlying),
            spender: evmAddress(state.stataToken),
            unprovenTx: await this.circuits.startApproveStata(callerArgs),
          }
    return this.unitOfWork.runInTransaction(() =>
      this.approvalStateController.startApproval({
        name: approvalName(caller.name, randomUUID()),
        ...target,
        inIndex,
        vaultAccount: vaultAccountOf(this.signet, this.vault),
      }),
    )
  }

  /** The state table is asked before the slow build, and the controller asks it again under the lock. */
  async completeApproval(
    caller: Caller,
    { name, wallet }: CompleteApprovalArgs,
  ): Promise<Approval> {
    const approval = await this.ownApproval(caller, name)
    if (nextState(approval.state, 'complete') === undefined) {
      throw new ApprovalStateConflict(name, approval.state, 'complete')
    }
    const request = await this.attestedRequestOf(name)
    const unprovenTx = await this.circuits.completeApprove({
      secretKey: caller.secretKey,
      wallet,
      requestId: hexToBytes(request.requestId),
      serializedOutput: completionOutput(request),
    })
    return this.unitOfWork.runInTransaction(() =>
      this.approvalStateController.completeApproval({ name, unprovenTx }),
    )
  }

  async getApproval(caller: Caller, args: GetApprovalArgs): Promise<Approval | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.approvalRepository.get(args.name)
  }

  async listApprovals(caller: Caller, _args: ListApprovalsArgs): Promise<Approval[]> {
    return this.approvalRepository.search({
      criteria: [{ type: 'prefix-text', field: 'name', prefix: `${caller.name}/` }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  private async ownApproval(caller: Caller, name: string): Promise<Approval> {
    const approval = resourceOwnedByCaller(name, caller)
      ? await this.approvalRepository.get(name)
      : undefined
    if (approval === undefined) {
      throw new Error(`${name} does not exist`)
    }
    return approval
  }

  /** An approval that may be completed has an attested request under it, so its fields are read without a state check. */
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

/** The circuit verifies the attested output only for an executed approve, and ignores the byte otherwise. */
function completionOutput(request: AttestedRequestFields): Uint8Array {
  return request.attestationOutputKind === 'executed'
    ? hexToBytes(request.attestationOutput)
    : new Uint8Array([0])
}

/** A 20-byte ledger value as the lower-case `0x` address the resources carry. */
function evmAddress(bytes: Pick<SpenderLedgerState, 'uniswapRouter'>['uniswapRouter']): string {
  return `0x${bytesToHex(bytes)}`
}
