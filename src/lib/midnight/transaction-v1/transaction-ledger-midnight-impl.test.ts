import type { ProofProvider, UnboundTransaction } from '@midnight-ntwrk/midnight-js/types'
import { type FinalizedTransaction, Transaction } from '@midnightntwrk/ledger-v9'
import { SerializedTransaction } from '@midnightntwrk/wallet-sdk-abstractions'
import {
  type NodeClient,
  NodeClientError,
  SubmissionEvent,
} from '@midnightntwrk/wallet-sdk-node-client/effect'
import { Stream } from 'effect'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { messageOf } from '@/lib/message-of'
import type { MidnightLedgerTransactionStatus } from '@/lib/midnight/transaction-v1/transaction-ledger'
import {
  MidnightTransactionLedgerImpl,
  type SubmissionFailureKind,
  submissionFailureKind,
  submitThrough,
} from '@/lib/midnight/transaction-v1/transaction-ledger-midnight-impl'
import { mock } from '@/lib/testing/mock'

const INDEXER = 'http://indexer.test/graphql'
const NODE = 'http://node.test'
const PROVEN_BYTES = Uint8Array.from([1, 2, 255])

function ledgerWith(proofProvider: Partial<ProofProvider> = {}): MidnightTransactionLedgerImpl {
  return new MidnightTransactionLedgerImpl(
    async () => mock<ProofProvider>('ProofProvider', proofProvider),
    INDEXER,
    NODE,
  )
}

describe('MidnightTransactionLedgerImpl.prove', () => {
  test('deserialises the hex, proves it, and serialises what came back', async () => {
    const unproven = Transaction.fromParts('undeployed')
    const hex = Buffer.from(unproven.serialize()).toString('hex')
    const received: string[] = []
    const ledger = ledgerWith({
      proveTx: async (tx) => {
        received.push(Buffer.from(tx.serialize()).toString('hex'))
        return mock<UnboundTransaction>('UnboundTransaction', { serialize: () => PROVEN_BYTES })
      },
    })
    expect(await ledger.prove(hex)).toBe('0102ff')
    expect(received).toEqual([hex])
  })

  test('refuses bytes that are not hex before reaching the proof server', async () => {
    await expect(ledgerWith().prove('not hex')).rejects.toThrow('must be hex')
  })

  test('refuses hex that is not a transaction', async () => {
    await expect(ledgerWith().prove('deadbeef')).rejects.toThrow()
  })
})

describe('MidnightTransactionLedgerImpl.status', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function indexerAnswers(body: unknown, status = 200): { requests: unknown[] } {
    const requests: unknown[] = []
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body))
      return new Response(JSON.stringify(body), { status })
    })
    return { requests }
  }

  const cases: ReadonlyArray<[string, unknown, MidnightLedgerTransactionStatus]> = [
    ['no transaction yet', { data: { transactions: [] } }, { outcome: 'pending' }],
    [
      'SUCCESS',
      { data: { transactions: [{ transactionResult: { status: 'SUCCESS' } }] } },
      { outcome: 'succeeded' },
    ],
    [
      'FAILURE',
      { data: { transactions: [{ transactionResult: { status: 'FAILURE' } }] } },
      { outcome: 'failed', failure: 'FailEntirely', error: 'The ledger rejected the transaction' },
    ],
    [
      'PARTIAL_SUCCESS',
      { data: { transactions: [{ transactionResult: { status: 'PARTIAL_SUCCESS' } }] } },
      {
        outcome: 'failed',
        failure: 'FailFallible',
        error: 'The fallible section did not apply; the fee was paid',
      },
    ],
    [
      'a system transaction beside the regular one',
      { data: { transactions: [{}, { transactionResult: { status: 'SUCCESS' } }] } },
      { outcome: 'succeeded' },
    ],
  ]

  test.each(cases)('%s', async (_name, body, expected) => {
    const { requests } = indexerAnswers(body)
    expect(await ledgerWith().status('abcd')).toEqual(expected)
    expect(requests[0]).toMatchObject({ variables: { identifier: 'abcd' } })
  })

  test('a GraphQL error is an error, not a status', async () => {
    indexerAnswers({ data: { transactions: [] }, errors: [{ message: 'unknown field' }] })
    await expect(ledgerWith().status('abcd')).rejects.toThrow('refused the query: unknown field')
  })

  test('a malformed answer is an error, not a status', async () => {
    indexerAnswers({ data: { transactions: [{ transactionResult: { status: 'MAYBE' } }] } })
    await expect(ledgerWith().status('abcd')).rejects.toThrow('malformed')
  })

  test('an HTTP failure is an error, not a status', async () => {
    indexerAnswers({}, 503)
    await expect(ledgerWith().status('abcd')).rejects.toThrow('answered 503')
  })
})

const TX_DATA = SerializedTransaction.of(Uint8Array.from([7, 8, 9]))
const NODE_CLOSED = new Error('disconnected from ws://127.0.0.1:9944/: 1000:: Normal Closure')
const NODE_REFUSED = rpcError(1010, 'Invalid Transaction', 'Custom error: 3')
const NODE_HOLDS = rpcError(1013, 'Transaction Already Imported', 'Any { .. }')

/** The node's JSON-RPC error as polkadot's coder builds it: a plain `Error` with a hidden numeric `code`. */
function rpcError(code: number, message: string, data: string): Error {
  const error = new Error(`${code.toString()}: ${message}: ${data}`)
  Object.defineProperty(error, 'code', { value: code, enumerable: false })
  Object.defineProperty(error, 'data', { value: data, enumerable: false })
  return error
}

function submissionError(cause: unknown): NodeClientError.SubmissionError {
  return new NodeClientError.SubmissionError({
    message: 'Transaction submission failed',
    txData: TX_DATA,
    cause,
  })
}

const kindCases: ReadonlyArray<[string, NodeClientError.NodeClientError, SubmissionFailureKind]> = [
  ['SubmissionError over the node refusing the bytes', submissionError(NODE_REFUSED), 'refused'],
  [
    'SubmissionError over the node already holding the bytes from an earlier submission',
    submissionError(NODE_HOLDS),
    'held',
  ],
  [
    'SubmissionError over the socket closing after the send',
    submissionError(NODE_CLOSED),
    'acknowledgementLost',
  ],
  [
    'SubmissionError over a send on a closed socket',
    submissionError(new Error('WebSocket is not connected')),
    'unsent',
  ],
  [
    'SubmissionError over a timed-out request',
    submissionError(new Error('No response received from RPC endpoint in 60s')),
    'acknowledgementLost',
  ],
  ['SubmissionError without a cause', submissionError(undefined), 'acknowledgementLost'],
  [
    'ConnectionError',
    new NodeClientError.ConnectionError({ message: 'Could not connect', cause: NODE_CLOSED }),
    'unsent',
  ],
  [
    'TransactionInvalidError',
    new NodeClientError.TransactionInvalidError({
      message: 'Transaction is invalid and was rejected by the node',
      txData: TX_DATA,
    }),
    'refused',
  ],
  [
    'TransactionDroppedError',
    new NodeClientError.TransactionDroppedError({
      message: 'Transaction got dropped',
      txData: TX_DATA,
    }),
    'refused',
  ],
  [
    'TransactionUsurpedError',
    new NodeClientError.TransactionUsurpedError({
      message: 'Transaction got usurped',
      txData: TX_DATA,
    }),
    'refused',
  ],
  [
    'TransactionProgressError',
    new NodeClientError.TransactionProgressError({
      message: 'Transaction did not reach desired stage',
      txData: TX_DATA,
      desiredStage: 'Submitted',
    }),
    'acknowledgementLost',
  ],
  [
    'ParseError',
    new NodeClientError.ParseError({ message: 'Failed to parse result provided by node' }),
    'acknowledgementLost',
  ],
]

describe('submissionFailureKind', () => {
  test.each(kindCases)('%s', (_name, error, expected) => {
    expect(submissionFailureKind(error)).toBe(expected)
  })
})

describe('submitThrough', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const transaction = mock<FinalizedTransaction>('FinalizedTransaction', {
    serialize: () => Uint8Array.from([7, 8, 9]),
  })

  function clientAnswering(
    stream: Stream.Stream<SubmissionEvent.SubmissionEvent, NodeClientError.NodeClientError>,
  ): { client: NodeClient.Service; sent: Uint8Array[] } {
    const sent: Uint8Array[] = []
    const client = mock<NodeClient.Service>('NodeClient', {
      sendMidnightTransaction: (serialized) => {
        sent.push(serialized)
        return stream
      },
    })
    return { client, sent }
  }

  test('resolves once the node acknowledges the bytes', async () => {
    const { client, sent } = clientAnswering(
      Stream.make(SubmissionEvent.Submitted({ tx: TX_DATA, txHash: '0xabcd' })),
    )
    await submitThrough(client, transaction)
    expect(sent).toEqual([Uint8Array.from([7, 8, 9])])
  })

  test('resolves and warns when the acknowledgement was lost after the send', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { client } = clientAnswering(Stream.fail(submissionError(NODE_CLOSED)))
    await submitThrough(client, transaction)
    expect(warned).toHaveBeenCalledTimes(1)
    expect(warned.mock.calls[0]?.[0]).toBe(
      "The Midnight node's acknowledgement was lost after the send, the ledger decides: Transaction submission failed: disconnected from ws://127.0.0.1:9944/: 1000:: Normal Closure",
    )
  })

  test('resolves without a warning when the node already holds the bytes', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { client } = clientAnswering(Stream.fail(submissionError(NODE_HOLDS)))
    await submitThrough(client, transaction)
    expect(warned).not.toHaveBeenCalled()
  })

  test("throws with the node's reason in the cause chain when it refused the bytes", async () => {
    const { client } = clientAnswering(Stream.fail(submissionError(NODE_REFUSED)))
    const thrown = await submitThrough(client, transaction).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(messageOf(thrown)).toBe(
      'The Midnight node refused the transaction: Transaction submission failed: 1010: Invalid Transaction: Custom error: 3',
    )
  })

  test('throws when nothing was sent', async () => {
    const { client } = clientAnswering(
      Stream.fail(new NodeClientError.ConnectionError({ message: 'Could not connect' })),
    )
    await expect(submitThrough(client, transaction)).rejects.toThrow(
      'The transaction never reached the Midnight node',
    )
  })

  test('a defect outside the error channel surfaces with its cause', async () => {
    const { client } = clientAnswering(Stream.die(new Error('registry missing')))
    const thrown = await submitThrough(client, transaction).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(messageOf(thrown)).toBe(
      'The submission ended outside the node client error channel: registry missing',
    )
  })
})
