import {
  Action,
  type AttestationRecord,
  type OutputRequestEntry,
  type RequestBufferEntry,
} from '@sig-net/midnight-examples-erc20-vault-contract'
import { describe, expect, test } from 'vitest'

import {
  type RequestLedgerView,
  type RequestStage,
  requestStage,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import {
  ledgerMap,
  requestLedgerState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-fixtures'

const IN_INDEX = 42n
const OUT_INDEX = new Uint8Array(32).fill(1)
const REQUEST_ID = new Uint8Array(32).fill(2)
const OTHER_REQUEST_ID = new Uint8Array(32).fill(3)

const entry: RequestBufferEntry = {
  action: Action.deposit,
  useNextVaultAccountNonce: false,
  evmNonce: 7n,
  inIndex: IN_INDEX,
  commitment: new Uint8Array(32),
  argsHash: new Uint8Array(32),
}
const flushed: OutputRequestEntry = { entry, lastSeen: 100n }
const record: AttestationRecord = { blockHeight: 120n, outputKind: 0, digest: new Uint8Array(32) }
const args = {
  request: { erc20Address: new Uint8Array(20), amount: 1n },
  path: new Uint8Array(32),
  gas: { gasLimit: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
}

function view(overrides: Partial<RequestLedgerView> = {}): RequestLedgerView {
  return requestLedgerState({ depositArgsMap: ledgerMap([[IN_INDEX, args]]), ...overrides })
}

interface Case {
  name: string
  state: RequestLedgerView
  knownRequestId: Uint8Array | null
  expected: RequestStage
}

const cases: Case[] = [
  {
    name: 'queued: the input buffer still holds the index',
    state: view({ inputRequestBuffer: ledgerMap([[IN_INDEX, entry]]) }),
    knownRequestId: null,
    expected: { stage: 'queued' },
  },
  {
    name: 'flushed: the output buffer holds the entry and nothing points at it yet',
    state: view({ outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]) }),
    knownRequestId: null,
    expected: { stage: 'flushed', outIndex: OUT_INDEX, lastSeen: 100n },
  },
  {
    name: 'sent: the eviction map points a request id at the entry, found by scan',
    state: view({
      outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
      evictionMap: ledgerMap([
        [OTHER_REQUEST_ID, new Uint8Array(32).fill(9)],
        [REQUEST_ID, OUT_INDEX],
      ]),
    }),
    knownRequestId: null,
    expected: { stage: 'sent', outIndex: OUT_INDEX, lastSeen: 100n, requestId: REQUEST_ID },
  },
  {
    name: 'sent: the known request id is used without a scan',
    state: view({
      outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
      evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
    }),
    knownRequestId: REQUEST_ID,
    expected: { stage: 'sent', outIndex: OUT_INDEX, lastSeen: 100n, requestId: REQUEST_ID },
  },
  {
    name: 'flushed: a known request id the eviction map does not hold means the send is not on chain',
    state: view({ outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]) }),
    knownRequestId: REQUEST_ID,
    expected: { stage: 'flushed', outIndex: OUT_INDEX, lastSeen: 100n },
  },
  {
    name: 'attestationQueued: the input attestation buffer holds the request id',
    state: view({
      outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
      evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
      inputAttestationBuffer: ledgerMap([[REQUEST_ID, record]]),
    }),
    knownRequestId: REQUEST_ID,
    expected: {
      stage: 'attestationQueued',
      outIndex: OUT_INDEX,
      lastSeen: 100n,
      requestId: REQUEST_ID,
    },
  },
  {
    name: 'attestationFlushed: the output attestation buffer holds the record',
    state: view({
      outputRequestBuffer: ledgerMap([[OUT_INDEX, flushed]]),
      evictionMap: ledgerMap([[REQUEST_ID, OUT_INDEX]]),
      outputAttestationBuffer: ledgerMap([[REQUEST_ID, record]]),
    }),
    knownRequestId: REQUEST_ID,
    expected: {
      stage: 'attestationFlushed',
      outIndex: OUT_INDEX,
      lastSeen: 100n,
      requestId: REQUEST_ID,
      record,
    },
  },
  {
    name: 'settled: the args map has released the index',
    state: view({ depositArgsMap: ledgerMap([]) }),
    knownRequestId: REQUEST_ID,
    expected: { stage: 'settled' },
  },
]

describe('requestStage', () => {
  test.each(cases)('$name', ({ state, knownRequestId, expected }) => {
    expect(requestStage(state, 'deposit', IN_INDEX, { requestId: knownRequestId })).toEqual(
      expected,
    )
  })

  test('an open request of another action under the same index is not this request', () => {
    const withdraw: OutputRequestEntry = {
      entry: { ...entry, action: Action.withdraw },
      lastSeen: 1n,
    }
    expect(() =>
      requestStage(
        view({ outputRequestBuffer: ledgerMap([[OUT_INDEX, withdraw]]) }),
        'deposit',
        IN_INDEX,
        { requestId: null },
      ),
    ).toThrow('No open deposit request carries input index 42')
  })
})
