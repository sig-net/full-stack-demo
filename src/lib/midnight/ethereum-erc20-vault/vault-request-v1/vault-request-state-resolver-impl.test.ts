import type { SignetRequestResponseReader } from '@sig-net/midnight'
import {
  Action,
  type AttestationRecord,
  type OutputRequestEntry,
  type RequestBufferEntry,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { describe, expect, test } from 'vitest'

import type { UnitOfWork } from '@/lib/db/unit-of-work'
import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import {
  SIGNED_TRANSACTION,
  SIGNED_TX,
  TRANSACTION_IN_STATE as ETHEREUM_TRANSACTION_IN_STATE,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import type { RespondOutcomeSource } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type {
  RequestLedger,
  RequestLedgerState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  ledgerMap,
  requestLedgerState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'
import {
  type VaultRequest,
  type VaultRequestState,
  vaultRequestStateSchema,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  ATTESTATION,
  ATTESTATION_BLOCK_HEIGHT,
  ATTESTATION_FIELDS,
  ATTESTATION_OUTPUT,
  DEPOSIT_ACCOUNT,
  IN_INDEX,
  LAST_SEEN,
  MPC_RESPONSE_KEY,
  OUT_INDEX,
  OUT_INDEX_HEX,
  REQUEST_ID,
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
  VAULT_REQUEST_NAME,
  vaultRequestFixture,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import {
  VaultRequestStateConflict,
  type VaultRequestStateController,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { VaultRequestStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver-impl'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import { transactionFixture as midnightTransactionFixture } from '@/lib/midnight/transaction-v1/transaction-fixtures'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import { mock } from '@/lib/testing/mock'

/** Which controller method a resolve ended in, with its args. */
type Transition = { method: string; args: object }

type Stage = 'queued' | 'flushed' | 'sent' | 'attestationQueued' | 'attestationFlushed' | 'settled'

interface Case {
  name: string
  stored: VaultRequest | undefined
  /** Where the ledger holds the request, or undefined when the ledger must not be read. */
  ledger?: RequestLedgerState
  circuits?: Partial<VaultCircuits>
  reader?: Partial<SignetRequestResponseReader>
  outcomeSource?: Partial<RespondOutcomeSource>
  /** The newest Midnight child the repository finds, with the circuit it must be asked for. */
  midnightChild?: { circuit: string; rows: MidnightTransaction[] }
  ethereumChildren?: EthereumTransaction[]
  controller?: Partial<VaultRequestStateController>
  expectTransitions: Transition[]
  expectWrites?: number
  expectError?: string
}

const entry: RequestBufferEntry = {
  action: Action.deposit,
  useNextVaultAccountNonce: false,
  evmNonce: 7n,
  inIndex: IN_INDEX,
  commitment: new Uint8Array(32),
  argsHash: new Uint8Array(32),
}
const record: AttestationRecord = {
  blockHeight: ATTESTATION_BLOCK_HEIGHT,
  outputKind: 0,
  digest: new Uint8Array(32),
}
const depositArgs = {
  request: { erc20Address: new Uint8Array(20), amount: 1n },
  path: new Uint8Array(32),
  gas: { gasLimit: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
}

/** The ledger with the fixture request at `stage`. */
function ledgerAt(stage: Stage, lastSeen = LAST_SEEN): RequestLedgerState {
  const flushed: OutputRequestEntry = { entry, lastSeen }
  const base: Partial<RequestLedgerState> = {
    depositArgsMap: ledgerMap([[IN_INDEX, depositArgs]]),
    mpcResponseKey: MPC_RESPONSE_KEY,
  }
  switch (stage) {
    case 'queued':
      return requestLedgerState({ ...base, inputRequestBuffer: ledgerMap([[IN_INDEX, entry]]) })
    case 'flushed':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
      })
    case 'sent':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
        evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
      })
    case 'attestationQueued':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
        evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
        inputAttestationBuffer: ledgerMap([[REQUEST_ID, record]]),
      })
    case 'attestationFlushed':
      return requestLedgerState({
        ...base,
        outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
        evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
        outputAttestationBuffer: ledgerMap([[REQUEST_ID, record]]),
      })
    case 'settled':
      return requestLedgerState({ mpcResponseKey: MPC_RESPONSE_KEY })
    default: {
      const unhandled: never = stage
      throw new Error(`Unhandled stage ${JSON.stringify(unhandled)}`)
    }
  }
}

const liveSend = midnightTransactionFixture({
  parent: VAULT_REQUEST_NAME,
  circuit: 'sendDeposit',
  signer: 'relayer',
})
const failedSend = midnightTransactionFixture({
  parent: VAULT_REQUEST_NAME,
  circuit: 'sendDeposit',
  signer: 'relayer',
  state: 'Failed',
  unprovenTx: null,
  failure: 'Rejected',
  error: 'refused',
})
const liveQueue = { ...liveSend, circuit: 'queueAttestation1' }

const sendDepositFor = (outIndex: Uint8Array) => async (args: { outIndex: Uint8Array }) => {
  expect(args.outIndex).toEqual(outIndex)
  return 'send-call'
}

const signatureAnswering =
  (signed: typeof SIGNED_TRANSACTION | undefined) =>
  async (requestId: string, expectedSigner: string) => {
    expect(requestId).toBe(REQUEST_ID_HEX)
    expect(expectedSigner).toBe(DEPOSIT_ACCOUNT)
    return signed
  }

const cases: Case[] = [
  {
    name: 'AwaitingFlush - still queued, so the flusher owns it',
    stored: VAULT_REQUEST_IN_STATE.AwaitingFlush,
    ledger: ledgerAt('queued'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingFlush - flushed, so the request index is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingFlush,
    ledger: ledgerAt('flushed'),
    expectTransitions: [
      { method: 'recordFlushed', args: { name: VAULT_REQUEST_NAME, outIndex: OUT_INDEX_HEX } },
    ],
  },
  {
    name: 'AwaitingFlush - another actor sent and queued it already, one step is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingFlush,
    ledger: ledgerAt('attestationQueued'),
    expectTransitions: [
      { method: 'recordFlushed', args: { name: VAULT_REQUEST_NAME, outIndex: OUT_INDEX_HEX } },
    ],
  },
  {
    name: 'AwaitingFlush - settled on the ledger is an error that leaves the row alone',
    stored: VAULT_REQUEST_IN_STATE.AwaitingFlush,
    ledger: ledgerAt('settled'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingSend - no child, so the send call is built outside and started inside a transaction',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('flushed'),
    circuits: { sendDeposit: sendDepositFor(OUT_INDEX) },
    midnightChild: { circuit: 'sendDeposit', rows: [] },
    expectTransitions: [
      { method: 'startSend', args: { name: VAULT_REQUEST_NAME, unprovenTx: 'send-call' } },
    ],
  },
  {
    name: 'AwaitingSend - a live send child does the step, nothing started',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('flushed'),
    midnightChild: { circuit: 'sendDeposit', rows: [liveSend] },
    expectTransitions: [],
  },
  {
    name: 'AwaitingSend - the last send child failed and the ledger shows no send, so it is replaced',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('flushed'),
    circuits: { sendDeposit: sendDepositFor(OUT_INDEX) },
    midnightChild: { circuit: 'sendDeposit', rows: [failedSend] },
    expectTransitions: [
      { method: 'startSend', args: { name: VAULT_REQUEST_NAME, unprovenTx: 'send-call' } },
    ],
  },
  {
    name: 'AwaitingSend - another resolver started the send first, so the conflict is swallowed',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('flushed'),
    circuits: { sendDeposit: sendDepositFor(OUT_INDEX) },
    midnightChild: { circuit: 'sendDeposit', rows: [] },
    controller: {
      startSend: async () => {
        throw new VaultRequestStateConflict(VAULT_REQUEST_NAME, 'AwaitingSend', 'startSend')
      },
    },
    expectTransitions: [],
    expectWrites: 1,
  },
  {
    name: 'AwaitingSend - sent on the ledger, so the request id is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('sent'),
    expectTransitions: [
      { method: 'recordSent', args: { name: VAULT_REQUEST_NAME, requestId: REQUEST_ID_HEX } },
    ],
  },
  {
    name: 'AwaitingSend - attestation already flushed by another actor, one step is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('attestationFlushed'),
    expectTransitions: [
      { method: 'recordSent', args: { name: VAULT_REQUEST_NAME, requestId: REQUEST_ID_HEX } },
    ],
  },
  {
    name: 'AwaitingSend - settled on the ledger leaves the row alone',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSend,
    ledger: ledgerAt('settled'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingSignature - the reader has a verified post, so its transaction is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSignature,
    ledger: ledgerAt('sent'),
    reader: { getSignedEvmTransaction: signatureAnswering(SIGNED_TRANSACTION) },
    expectTransitions: [
      { method: 'recordSignature', args: { name: VAULT_REQUEST_NAME, signedTx: SIGNED_TX } },
    ],
  },
  {
    name: 'AwaitingSignature - no verified post yet',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSignature,
    ledger: ledgerAt('sent'),
    reader: { getSignedEvmTransaction: signatureAnswering(undefined) },
    expectTransitions: [],
  },
  {
    name: 'AwaitingSignature - the indexer is unreachable, so nothing is recorded and the error surfaces',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSignature,
    ledger: ledgerAt('sent'),
    reader: {
      getSignedEvmTransaction: async () => {
        throw new Error('fetch failed')
      },
    },
    expectTransitions: [],
    expectError: 'fetch failed',
  },
  {
    name: 'AwaitingSignature - settled on the ledger skips the poll',
    stored: VAULT_REQUEST_IN_STATE.AwaitingSignature,
    ledger: ledgerAt('settled'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingBroadcast - no child, so the signed transaction is started',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('sent'),
    ethereumChildren: [],
    expectTransitions: [{ method: 'startBroadcast', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingBroadcast - a live child, so nothing is done',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('sent'),
    ethereumChildren: [ETHEREUM_TRANSACTION_IN_STATE.AwaitingInclusion],
    expectTransitions: [],
  },
  {
    name: 'AwaitingBroadcast - the child succeeded, so the broadcast is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('sent'),
    ethereumChildren: [ETHEREUM_TRANSACTION_IN_STATE.Succeeded],
    expectTransitions: [{ method: 'recordBroadcast', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingBroadcast - the child reverted on chain, which the MPC attests',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('sent'),
    ethereumChildren: [
      {
        ...ETHEREUM_TRANSACTION_IN_STATE.Failed,
        failure: 'Reverted',
        error: null,
        blockNumber: 9n,
      },
    ],
    expectTransitions: [{ method: 'recordBroadcast', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingBroadcast - the nonce went elsewhere, which the MPC attests unviable',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('sent'),
    ethereumChildren: [
      { ...ETHEREUM_TRANSACTION_IN_STATE.Failed, failure: 'NonceConsumed', error: null },
    ],
    expectTransitions: [{ method: 'recordBroadcast', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingBroadcast - the node refused the child, so the same bytes are broadcast again',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('sent'),
    ethereumChildren: [ETHEREUM_TRANSACTION_IN_STATE.Failed],
    expectTransitions: [{ method: 'startBroadcast', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingBroadcast - settled on the ledger leaves the row alone',
    stored: VAULT_REQUEST_IN_STATE.AwaitingBroadcast,
    ledger: ledgerAt('settled'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestation - a post verified, so the attestation is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestation,
    ledger: ledgerAt('sent'),
    outcomeSource: {
      attestedOutcome: async ({ requestId, mpcResponseKey }) => {
        expect(requestId).toEqual(REQUEST_ID)
        expect(mpcResponseKey).toEqual(MPC_RESPONSE_KEY)
        return ATTESTATION
      },
    },
    expectTransitions: [
      { method: 'recordAttestation', args: { name: VAULT_REQUEST_NAME, ...ATTESTATION_FIELDS } },
    ],
  },
  {
    name: 'AwaitingAttestation - no post verifies yet',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestation,
    ledger: ledgerAt('sent'),
    outcomeSource: { attestedOutcome: async () => undefined },
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestation - settled on the ledger skips the poll',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestation,
    ledger: ledgerAt('settled'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestationQueue - no child, so the queue call is built for the row and started',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
    ledger: ledgerAt('sent'),
    circuits: {
      queueAttestation: async ({ attestation, serializedOutput }) => {
        expect(attestation).toEqual(ATTESTATION.event)
        expect(serializedOutput).toEqual(ATTESTATION_OUTPUT)
        return 'queue-call'
      },
    },
    midnightChild: { circuit: 'queueAttestation1', rows: [] },
    expectTransitions: [
      {
        method: 'startAttestationQueue',
        args: { name: VAULT_REQUEST_NAME, unprovenTx: 'queue-call' },
      },
    ],
  },
  {
    name: 'AwaitingAttestationQueue - a live queue child does the step',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
    ledger: ledgerAt('sent'),
    midnightChild: { circuit: 'queueAttestation1', rows: [liveQueue] },
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestationQueue - attested at or below lastSeen is a logged invariant violation',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
    ledger: ledgerAt('sent', ATTESTATION_BLOCK_HEIGHT),
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestationQueue - queued on the ledger, so it is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
    ledger: ledgerAt('attestationQueued'),
    expectTransitions: [{ method: 'recordAttestationQueued', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingAttestationQueue - flushed already, one step is recorded',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
    ledger: ledgerAt('attestationFlushed'),
    expectTransitions: [{ method: 'recordAttestationQueued', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingAttestationQueue - settled on the ledger leaves the row alone',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue,
    ledger: ledgerAt('settled'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestationFlush - still queued, so the flusher owns it',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationFlush,
    ledger: ledgerAt('attestationQueued'),
    expectTransitions: [],
  },
  {
    name: 'AwaitingAttestationFlush - flushed, so the request is attested',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationFlush,
    ledger: ledgerAt('attestationFlushed'),
    expectTransitions: [{ method: 'recordAttested', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'AwaitingAttestationFlush - completed by the caller already, so the request is attested',
    stored: VAULT_REQUEST_IN_STATE.AwaitingAttestationFlush,
    ledger: ledgerAt('settled'),
    expectTransitions: [{ method: 'recordAttested', args: { name: VAULT_REQUEST_NAME } }],
  },
  {
    name: 'a terminal request is left alone without a ledger read',
    stored: VAULT_REQUEST_IN_STATE.Attested,
    expectTransitions: [],
  },
  {
    name: 'a missing request is ignored',
    stored: undefined,
    expectTransitions: [],
  },
]

interface Doubles {
  stored: VaultRequest | undefined
  ledger?: RequestLedgerState
  circuits?: Partial<VaultCircuits>
  reader?: Partial<SignetRequestResponseReader>
  outcomeSource?: Partial<RespondOutcomeSource>
  midnightChild?: { circuit: string; rows: MidnightTransaction[] }
  ethereumChildren?: EthereumTransaction[]
  controller?: Partial<VaultRequestStateController>
  repository?: Partial<VaultRequestRepository>
  transitions: Transition[]
  counts: { writes: number; ledgerReads: number }
}

function resolverOver(doubles: Doubles): VaultRequestStateResolverImpl {
  const recordingRequest = (method: string) => async (args: object) => {
    doubles.transitions.push({ method, args })
    return doubles.stored ?? vaultRequestFixture()
  }
  const recordingMidnightChild = (method: string) => async (args: object) => {
    doubles.transitions.push({ method, args })
    return liveSend
  }
  return new VaultRequestStateResolverImpl(
    mock<VaultRequestRepository>('VaultRequestRepository', {
      get: async (name) => {
        expect(name).toBe(VAULT_REQUEST_NAME)
        return doubles.stored
      },
      ...doubles.repository,
    }),
    mock<VaultRequestStateController>('VaultRequestStateController', {
      recordFlushed: recordingRequest('recordFlushed'),
      recordSent: recordingRequest('recordSent'),
      recordSignature: recordingRequest('recordSignature'),
      recordBroadcast: recordingRequest('recordBroadcast'),
      recordAttestation: recordingRequest('recordAttestation'),
      recordAttestationQueued: recordingRequest('recordAttestationQueued'),
      recordAttested: recordingRequest('recordAttested'),
      startSend: recordingMidnightChild('startSend'),
      startAttestationQueue: recordingMidnightChild('startAttestationQueue'),
      startBroadcast: async (args) => {
        doubles.transitions.push({ method: 'startBroadcast', args })
        return ETHEREUM_TRANSACTION_IN_STATE.AwaitingSubmission
      },
      ...doubles.controller,
    }),
    mock<RequestLedger>(
      'RequestLedger',
      doubles.ledger === undefined
        ? {}
        : {
            state: async () => {
              doubles.counts.ledgerReads += 1
              return doubles.ledger ?? ledgerAt('settled')
            },
          },
    ),
    mock<VaultCircuits>('VaultCircuits', doubles.circuits),
    { deposit: mock<SignetRequestResponseReader>('SignetRequestResponseReader', doubles.reader) },
    { deposit: mock<RespondOutcomeSource>('RespondOutcomeSource', doubles.outcomeSource) },
    mock<MidnightTransactionRepository>('MidnightTransactionRepository', {
      search: async (args) => {
        const child = doubles.midnightChild
        if (child === undefined) throw new Error('no Midnight child search was expected')
        expect(args).toEqual({
          criteria: [
            { type: 'exact-text', field: 'parent', text: VAULT_REQUEST_NAME },
            { type: 'exact-text', field: 'circuit', text: child.circuit },
          ],
          order: { field: 'createTime', direction: 'desc' },
          limit: 1,
        })
        return child.rows
      },
    }),
    mock<EthereumTransactionRepository>('EthereumTransactionRepository', {
      search: async (args) => {
        const children = doubles.ethereumChildren
        if (children === undefined) throw new Error('no Ethereum child search was expected')
        expect(args).toEqual({
          criteria: [{ type: 'exact-text', field: 'parent', text: VAULT_REQUEST_NAME }],
          order: { field: 'createTime', direction: 'desc' },
          limit: 1,
        })
        return children
      },
    }),
    mock<UnitOfWork>('UnitOfWork', {
      runInTransaction: (work) => {
        doubles.counts.writes += 1
        return work()
      },
    }),
  )
}

describe('VaultRequestStateResolverImpl.resolveVaultRequest', () => {
  test.each(cases)('$name', async ({ expectTransitions, expectWrites, expectError, ...rest }) => {
    const doubles: Doubles = { ...rest, transitions: [], counts: { writes: 0, ledgerReads: 0 } }
    const resolving = resolverOver(doubles).resolveVaultRequest({ name: VAULT_REQUEST_NAME })
    if (expectError === undefined) await resolving
    else await expect(resolving).rejects.toThrow(expectError)
    expect(doubles.transitions).toEqual(expectTransitions)
    expect(doubles.counts.writes).toBe(expectWrites ?? expectTransitions.length)
  })
})

describe('VaultRequestStateResolverImpl sweeps', () => {
  const second = vaultRequestFixture({
    name: VAULT_REQUEST_NAME.replace(/[0-9a-f]{12}$/, '0a1b2c3d4e5f'),
  })

  function searching(rowsByState: Partial<Record<VaultRequestState, VaultRequest[]>>) {
    const searched: string[] = []
    const repository: Partial<VaultRequestRepository> = {
      search: async (args) => {
        const [criterion] = args.criteria
        if (criterion?.type !== 'exact-text' || criterion.field !== 'state') {
          throw new Error(`unexpected search ${JSON.stringify(args)}`)
        }
        searched.push(criterion.text)
        expect(args.order).toEqual({ field: 'createTime', direction: 'asc' })
        return rowsByState[vaultRequestStateSchema.parse(criterion.text)] ?? []
      },
    }
    return { searched, repository }
  }

  test('resolvePending reads the ledger once and resolves every waiting row', async () => {
    const { searched, repository } = searching({
      AwaitingFlush: [VAULT_REQUEST_IN_STATE.AwaitingFlush, second],
    })
    const doubles: Doubles = {
      stored: undefined,
      ledger: ledgerAt('flushed'),
      repository,
      transitions: [],
      counts: { writes: 0, ledgerReads: 0 },
    }
    await resolverOver(doubles).resolvePending()
    expect(searched).toEqual([
      'AwaitingFlush',
      'AwaitingSend',
      'AwaitingSignature',
      'AwaitingBroadcast',
      'AwaitingAttestation',
      'AwaitingAttestationQueue',
      'AwaitingAttestationFlush',
    ])
    expect(doubles.counts.ledgerReads).toBe(1)
    expect(doubles.transitions).toEqual([
      { method: 'recordFlushed', args: { name: VAULT_REQUEST_NAME, outIndex: OUT_INDEX_HEX } },
      { method: 'recordFlushed', args: { name: second.name, outIndex: OUT_INDEX_HEX } },
    ])
  })

  test('resolveWaitingFlushes resolves only the rows a flush moves', async () => {
    const { searched, repository } = searching({
      AwaitingAttestationFlush: [VAULT_REQUEST_IN_STATE.AwaitingAttestationFlush],
    })
    const doubles: Doubles = {
      stored: undefined,
      ledger: ledgerAt('attestationFlushed'),
      repository,
      transitions: [],
      counts: { writes: 0, ledgerReads: 0 },
    }
    await resolverOver(doubles).resolveWaitingFlushes()
    expect(searched).toEqual(['AwaitingFlush', 'AwaitingAttestationFlush'])
    expect(doubles.transitions).toEqual([
      { method: 'recordAttested', args: { name: VAULT_REQUEST_NAME } },
    ])
  })

  test('a sweep with nothing waiting reads no ledger', async () => {
    const { repository } = searching({})
    const doubles: Doubles = {
      stored: undefined,
      repository,
      transitions: [],
      counts: { writes: 0, ledgerReads: 0 },
    }
    await resolverOver(doubles).resolvePending()
    expect(doubles.counts.ledgerReads).toBe(0)
  })

  test("one row's failure is logged and the next row still resolves", async () => {
    const { repository } = searching({
      AwaitingSend: [
        VAULT_REQUEST_IN_STATE.AwaitingSend,
        { ...second, ...VAULT_REQUEST_IN_STATE.AwaitingSend, name: second.name },
      ],
    })
    let builds = 0
    const doubles: Doubles = {
      stored: undefined,
      ledger: ledgerAt('flushed'),
      repository,
      circuits: {
        sendDeposit: async () => {
          builds += 1
          if (builds === 1) throw new Error('indexer down')
          return 'send-call'
        },
      },
      midnightChild: { circuit: 'sendDeposit', rows: [] },
      transitions: [],
      counts: { writes: 0, ledgerReads: 0 },
    }
    await resolverOver(doubles).resolvePending()
    expect(doubles.transitions).toEqual([
      { method: 'startSend', args: { name: second.name, unprovenTx: 'send-call' } },
    ])
  })
})
