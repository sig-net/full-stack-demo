import 'server-only'

import { bytesToHex, hexToBytes, parseRequestIdHex } from '@sig-net/midnight'
import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import {
  type EthereumTransaction,
  ETHEREUM_TRANSACTION_TERMINAL_STATES,
} from '@/lib/ethereum/transaction-v1/transaction'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import type { RespondOutcomeSource } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'
import type { SignetReaders } from '@/lib/midnight/ethereum-erc20-vault/signet-readers'
import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import {
  queueAttestationCircuit,
  SEND_CIRCUIT_BY_ACTION,
  type VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import {
  type RequestLedger,
  type RequestLedgerState,
  type RequestStage,
  requestStage,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  type VaultRequest,
  VAULT_REQUEST_STATES,
  VAULT_REQUEST_TERMINAL_STATES,
  type VaultRequestState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  attestationFields,
  attestationToEvent,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  VaultRequestStateConflict,
  type VaultRequestStateController,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import type {
  ResolveVaultRequestArgs,
  VaultRequestStateResolver,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver'
import { MIDNIGHT_TRANSACTION_TERMINAL_STATES } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'

/** One outcome source per vault action, over that action's reader. */
export type RespondOutcomeSources = Readonly<Record<VaultAction, RespondOutcomeSource>>

export class VaultRequestStateResolverImpl implements VaultRequestStateResolver {
  private readonly requestRepository: VaultRequestRepository
  private readonly stateController: VaultRequestStateController
  private readonly requestLedger: RequestLedger
  private readonly circuits: VaultCircuits
  private readonly signetReaders: SignetReaders
  private readonly respondOutcomeSources: RespondOutcomeSources
  private readonly midnightTransactionRepository: MidnightTransactionRepository
  private readonly ethereumTransactionRepository: EthereumTransactionRepository
  private readonly unitOfWork: UnitOfWork

  constructor(
    requestRepository: VaultRequestRepository,
    stateController: VaultRequestStateController,
    requestLedger: RequestLedger,
    circuits: VaultCircuits,
    signetReaders: SignetReaders,
    respondOutcomeSources: RespondOutcomeSources,
    midnightTransactionRepository: MidnightTransactionRepository,
    ethereumTransactionRepository: EthereumTransactionRepository,
    unitOfWork: UnitOfWork,
  ) {
    this.requestRepository = requestRepository
    this.stateController = stateController
    this.requestLedger = requestLedger
    this.circuits = circuits
    this.signetReaders = signetReaders
    this.respondOutcomeSources = respondOutcomeSources
    this.midnightTransactionRepository = midnightTransactionRepository
    this.ethereumTransactionRepository = ethereumTransactionRepository
    this.unitOfWork = unitOfWork
  }

  /** Reads outside any transaction: the controller re-reads under lock before it writes. */
  async resolveVaultRequest({ name }: ResolveVaultRequestArgs): Promise<void> {
    const request = await this.requestRepository.get(name)
    if (request === undefined || isTerminal(request.state)) return
    await this.resolve(request, await this.requestLedger.state())
  }

  resolveWaitingFlushes(): Promise<void> {
    return this.resolveEach(['AwaitingFlush', 'AwaitingAttestationFlush'])
  }

  resolvePending(): Promise<void> {
    return this.resolveEach(PENDING_STATES)
  }

  /** One ledger read serves the whole sweep, and one request's failure does not stop the rest. */
  private async resolveEach(states: readonly VaultRequestState[]): Promise<void> {
    const requests: VaultRequest[] = []
    for (const state of states) {
      requests.push(
        ...(await this.requestRepository.search({
          criteria: [{ type: 'exact-text', field: 'state', text: state }],
          order: { field: 'createTime', direction: 'asc' },
        })),
      )
    }
    if (requests.length === 0) return
    const ledger = await this.requestLedger.state()
    for (const request of requests) {
      try {
        await this.resolve(request, ledger)
      } catch (error: unknown) {
        console.error(`Resolving vault request ${request.name} failed`, error)
      }
    }
  }

  private resolve(request: VaultRequest, ledger: RequestLedgerState): Promise<void> {
    const stage = requestStage(ledger, request.action, request.inIndex, {
      requestId: request.requestId === null ? null : hexToBytes(request.requestId),
    })
    switch (request.state) {
      case 'AwaitingFlush':
        return this.resolveAwaitingFlush(request, stage)
      case 'AwaitingSend':
        return this.resolveAwaitingSend(request, stage)
      case 'AwaitingSignature':
        return this.resolveAwaitingSignature(request, stage)
      case 'AwaitingBroadcast':
        return this.resolveAwaitingBroadcast(request, stage)
      case 'AwaitingAttestation':
        return this.resolveAwaitingAttestation(request, stage, ledger)
      case 'AwaitingAttestationQueue':
        return this.resolveAwaitingAttestationQueue(request, stage)
      case 'AwaitingAttestationFlush':
        return this.resolveAwaitingAttestationFlush(request, stage)
      case 'Attested':
        return Promise.resolve()
      default: {
        const unhandled: never = request.state
        throw new Error(`Unhandled state ${JSON.stringify(unhandled)}`)
      }
    }
  }

  /** A queued request is the flusher's to-do: nothing here moves it. */
  private resolveAwaitingFlush({ name, state }: VaultRequest, stage: RequestStage): Promise<void> {
    switch (stage.stage) {
      case 'queued':
        return Promise.resolve()
      case 'settled':
        return settledEarly(name, state)
      case 'flushed':
      case 'sent':
      case 'attestationQueued':
      case 'attestationFlushed':
        return this.write(() =>
          this.stateController.recordFlushed({ name, outIndex: bytesToHex(stage.outIndex) }),
        )
      default:
        return unhandledStage(stage)
    }
  }

  private async resolveAwaitingSend(
    { name, state, action }: VaultRequest,
    stage: RequestStage,
  ): Promise<void> {
    switch (stage.stage) {
      case 'queued':
        return
      case 'settled':
        return settledEarly(name, state)
      case 'sent':
      case 'attestationQueued':
      case 'attestationFlushed':
        return this.write(() =>
          this.stateController.recordSent({ name, requestId: bytesToHex(stage.requestId) }),
        )
      case 'flushed': {
        if (await this.liveMidnightChild(name, SEND_CIRCUIT_BY_ACTION[action])) return
        const unprovenTx = await this.buildSend(action, stage.outIndex)
        return this.write(() => this.stateController.startSend({ name, unprovenTx }))
      }
      default:
        return unhandledStage(stage)
    }
  }

  /** The signature post is judged by the reader: a valid one recovers to the deposit account. */
  private async resolveAwaitingSignature(
    { name, state, action, requestId, depositAccount }: VaultRequest,
    stage: RequestStage,
  ): Promise<void> {
    if (stage.stage === 'settled') return settledEarly(name, state)
    if (requestId === null) return
    const signed = await this.signetReaders[action].getSignedEvmTransaction(
      parseRequestIdHex(requestId),
      depositAccount,
    )
    if (signed === undefined) return
    return this.write(() =>
      this.stateController.recordSignature({ name, signedTx: signed.serialized }),
    )
  }

  /**
   * The step is done once the chain holds the transaction either way, or can never hold it
   * (its nonce consumed): the MPC attests each of those. A child the node refused, or one the
   * backend stopped waiting for, put nothing on chain and is replaced.
   */
  private async resolveAwaitingBroadcast(
    { name, state }: VaultRequest,
    stage: RequestStage,
  ): Promise<void> {
    if (stage.stage === 'settled') return settledEarly(name, state)
    const child = await this.latestEthereumChild(name)
    if (child === undefined || isReplaceable(child)) {
      return this.write(() => this.stateController.startBroadcast({ name }))
    }
    if (isEthereumTerminal(child.state)) {
      return this.write(() => this.stateController.recordBroadcast({ name }))
    }
  }

  private async resolveAwaitingAttestation(
    { name, state, action, requestId }: VaultRequest,
    stage: RequestStage,
    ledger: RequestLedgerState,
  ): Promise<void> {
    if (stage.stage === 'settled') return settledEarly(name, state)
    if (requestId === null) return
    const outcome = await this.respondOutcomeSources[action].attestedOutcome({
      requestId: hexToBytes(requestId),
      mpcResponseKey: ledger.mpcResponseKey,
    })
    if (outcome === undefined) return
    return this.write(() =>
      this.stateController.recordAttestation({ name, ...attestationFields(outcome) }),
    )
  }

  private async resolveAwaitingAttestationQueue(
    request: VaultRequest,
    stage: RequestStage,
  ): Promise<void> {
    const { name, state, attestationBlockHeight, attestationOutput } = request
    switch (stage.stage) {
      case 'queued':
      case 'flushed':
        return
      case 'settled':
        return settledEarly(name, state)
      case 'attestationQueued':
      case 'attestationFlushed':
        return this.write(() => this.stateController.recordAttestationQueued({ name }))
      case 'sent': {
        if (attestationBlockHeight === null || attestationOutput === null) return
        if (attestationBlockHeight <= stage.lastSeen) {
          // Only a nonce consumed before the start reaches here, which the deposit service's
          // nonce assignment prevents, so the row is left for the sweep to re-check.
          console.error(
            `vault request ${name} attested at ${attestationBlockHeight.toString()}, at or below the entry's lastSeen ${stage.lastSeen.toString()}: nonce reuse at start`,
          )
          return
        }
        const serializedOutput = hexToBytes(attestationOutput)
        if (await this.liveMidnightChild(name, queueAttestationCircuit(serializedOutput.length)))
          return
        const unprovenTx = await this.circuits.queueAttestation({
          attestation: attestationToEvent(request),
          serializedOutput,
        })
        return this.write(() => this.stateController.startAttestationQueue({ name, unprovenTx }))
      }
      default:
        return unhandledStage(stage)
    }
  }

  /** A settled request was completed by the caller after a flush this row had not read. */
  private resolveAwaitingAttestationFlush(
    { name }: VaultRequest,
    stage: RequestStage,
  ): Promise<void> {
    switch (stage.stage) {
      case 'attestationFlushed':
      case 'settled':
        return this.write(() => this.stateController.recordAttested({ name }))
      default:
        return Promise.resolve()
    }
  }

  private buildSend(action: VaultAction, outIndex: Uint8Array): Promise<string> {
    switch (action) {
      case 'deposit':
        return this.circuits.sendDeposit({ outIndex })
      default: {
        const unhandled: never = action
        throw new Error(`Unhandled action ${JSON.stringify(unhandled)}`)
      }
    }
  }

  private async liveMidnightChild(name: string, circuit: VaultCircuitId): Promise<boolean> {
    const [latest] = await this.midnightTransactionRepository.search({
      criteria: [
        { type: 'exact-text', field: 'parent', text: name },
        { type: 'exact-text', field: 'circuit', text: circuit },
      ],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    return (
      latest !== undefined &&
      !MIDNIGHT_TRANSACTION_TERMINAL_STATES.some((terminal) => terminal === latest.state)
    )
  }

  private async latestEthereumChild(name: string): Promise<EthereumTransaction | undefined> {
    const [latest] = await this.ethereumTransactionRepository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: name }],
      order: { field: 'createTime', direction: 'desc' },
      limit: 1,
    })
    return latest
  }

  /** One transition per resolve. A conflict means another resolver applied it first. */
  private async write<Result>(transition: () => Promise<Result>): Promise<void> {
    try {
      await this.unitOfWork.runInTransaction(transition)
    } catch (error: unknown) {
      if (!(error instanceof VaultRequestStateConflict)) throw error
    }
  }
}

const PENDING_STATES: readonly VaultRequestState[] = VAULT_REQUEST_STATES.filter(
  (state) => !isTerminal(state),
)

function isTerminal(state: VaultRequestState): boolean {
  return VAULT_REQUEST_TERMINAL_STATES.some((terminal) => terminal === state)
}

function isEthereumTerminal(state: EthereumTransaction['state']): boolean {
  return ETHEREUM_TRANSACTION_TERMINAL_STATES.some((terminal) => terminal === state)
}

/** A failed child that put nothing on chain, so the same bytes are broadcast again. */
function isReplaceable(child: EthereumTransaction): boolean {
  return child.state === 'Failed' && (child.failure === 'Rejected' || child.failure === 'Expired')
}

/** Only the complete circuit removes a request's arguments, and it needs the request attested first. */
function settledEarly(name: string, state: VaultRequestState): Promise<void> {
  console.error(`vault request ${name} in ${state} is settled on the ledger`)
  return Promise.resolve()
}

function unhandledStage(stage: never): never {
  throw new Error(`Unhandled stage ${JSON.stringify(stage)}`)
}
