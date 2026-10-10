import 'server-only'

import type { ProofProvider } from '@midnight-ntwrk/midnight-js/types'
import {
  type Binding,
  type FinalizedTransaction,
  type PreBinding,
  type PreProof,
  type Proof,
  type SignatureEnabled,
  Transaction,
} from '@midnightntwrk/ledger-v9'
import { SerializedTransaction } from '@midnightntwrk/wallet-sdk-abstractions'
import {
  makeConfig,
  NodeClient,
  NodeClientError,
  PolkadotNodeClient,
} from '@midnightntwrk/wallet-sdk-node-client/effect'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { Cause, Effect, Exit, Option } from 'effect'
import { z } from 'zod'

import { messageOf } from '@/lib/message-of'
import type {
  MidnightLedgerTransactionStatus,
  MidnightTransactionLedger,
} from '@/lib/midnight/transaction-v1/transaction-ledger'

/**
 * The ledger behind the proof server, the node and the indexer. Transaction bytes cross as hex
 * in the ledger's own serialisation, and the id a submission returns is one of the ledger
 * identifiers the indexer answers queries for.
 */
export class MidnightTransactionLedgerImpl implements MidnightTransactionLedger {
  private readonly proofProvider: () => Promise<ProofProvider>
  private readonly indexerQueryURL: string
  private readonly nodeURL: string

  /** The proof provider is reached through a function so that its key registry loads on first use. */
  constructor(
    proofProvider: () => Promise<ProofProvider>,
    indexerQueryURL: string,
    nodeURL: string,
  ) {
    this.proofProvider = proofProvider
    this.indexerQueryURL = indexerQueryURL
    this.nodeURL = nodeURL
  }

  async prove(unprovenTx: string): Promise<string> {
    const unproven = Transaction.deserialize<SignatureEnabled, PreProof, PreBinding>(
      'signature',
      'pre-proof',
      'pre-binding',
      bytesFromHex(unprovenTx),
    )
    const unbound = await (await this.proofProvider()).proveTx(unproven)
    return hexFromBytes(unbound.serialize())
  }

  async submit(finalizedTx: string): Promise<string> {
    const finalized = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      bytesFromHex(finalizedTx),
    )
    const [txId] = finalized.identifiers()
    if (txId === undefined) {
      throw new Error('The transaction carries no identifier')
    }
    await submitToNode(this.nodeURL, finalized)
    return txId
  }

  async status(txId: string): Promise<MidnightLedgerTransactionStatus> {
    const response = await fetch(this.indexerQueryURL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: TRANSACTION_STATUS_QUERY, variables: { identifier: txId } }),
    })
    if (!response.ok) {
      throw new Error(`The indexer answered ${response.status.toString()}`)
    }
    const parsed = transactionStatusResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new Error(`The indexer's answer is malformed: ${z.prettifyError(parsed.error)}`)
    }
    if (parsed.data.errors !== undefined) {
      throw new Error(
        `The indexer refused the query: ${parsed.data.errors.map((error) => error.message).join('; ')}`,
      )
    }
    const result = parsed.data.data.transactions.find(
      (transaction) => transaction.transactionResult !== undefined,
    )?.transactionResult
    // A transaction the ledger has not recorded, including one whose guaranteed section failed
    // and so never reaches a block, stays pending until its TTL expires it.
    if (result === undefined) return { outcome: 'pending' }
    switch (result.status) {
      case 'SUCCESS':
        return { outcome: 'succeeded' }
      case 'PARTIAL_SUCCESS':
        return {
          outcome: 'failed',
          failure: 'FailFallible',
          error: 'The fallible section did not apply; the fee was paid',
        }
      case 'FAILURE':
        return {
          outcome: 'failed',
          failure: 'FailEntirely',
          error: 'The ledger rejected the transaction',
        }
      default: {
        const unhandled: never = result.status
        throw new Error(`Unhandled status ${JSON.stringify(unhandled)}`)
      }
    }
  }
}

const TRANSACTION_STATUS_QUERY = `
  query TransactionStatus($identifier: HexEncoded!) {
    transactions(offset: { identifier: $identifier }) {
      ... on RegularTransaction {
        transactionResult {
          status
        }
      }
    }
  }
`

const transactionStatusResponseSchema = z.object({
  data: z.object({
    transactions: z.array(
      z.object({
        transactionResult: z
          .object({ status: z.enum(['SUCCESS', 'PARTIAL_SUCCESS', 'FAILURE']) })
          .optional(),
      }),
    ),
  }),
  errors: z
    .array(z.object({ message: z.string() }))
    .min(1)
    .optional(),
})

const NODE_CONNECT_TIMEOUT_MS = 30_000

/**
 * Sends the bytes over one node connection that lives for this submission alone. The node
 * answers over WebSocket, so http(s) becomes ws(s).
 */
async function submitToNode(nodeURL: string, transaction: FinalizedTransaction): Promise<void> {
  const relayURL = new URL(nodeURL.replace(/^http/, 'ws'))
  const provider = new WsProvider(relayURL.toString(), false)
  const api = new ApiPromise({ provider, noInitWarn: true, throwOnConnect: true })
  const abort = new AbortController()
  const timer = setTimeout(() => {
    abort.abort()
  }, NODE_CONNECT_TIMEOUT_MS)
  try {
    await Effect.runPromise(
      Effect.tryPromise(async () => {
        await provider.connect()
        await api.isReadyOrError
      }),
      { signal: abort.signal },
    )
    clearTimeout(timer)
    await submitThrough(new PolkadotNodeClient(makeConfig({ nodeURL: relayURL }), api), transaction)
  } catch (error: unknown) {
    if (abort.signal.aborted) {
      throw new Error(`Connecting to the Midnight node at ${nodeURL} timed out`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
    await api.disconnect()
  }
}

/**
 * Runs the SDK's submission to its `Submitted` acknowledgement and settles by what a failure
 * established: a refusal or an unsent transaction throws with the node's words in the cause
 * chain, and a lost acknowledgement resolves, since the ledger decides what became of the bytes.
 */
export async function submitThrough(
  client: NodeClient.Service,
  transaction: FinalizedTransaction,
): Promise<void> {
  const submission = NodeClient.sendMidnightTransactionAndWait(
    SerializedTransaction.from(transaction),
    'Submitted',
  )
  const exit = await Effect.runPromiseExit(
    Effect.provideService(submission, NodeClient.NodeClient, client),
  )
  if (Exit.isSuccess(exit)) return
  const failure = Cause.failureOption(exit.cause)
  if (Option.isNone(failure)) {
    throw new Error('The submission ended outside the node client error channel', {
      cause: Cause.squash(exit.cause),
    })
  }
  const kind = submissionFailureKind(failure.value)
  switch (kind) {
    case 'held':
      return
    case 'acknowledgementLost':
      console.warn(
        `The Midnight node's acknowledgement was lost after the send, the ledger decides: ${messageOf(failure.value)}`,
      )
      return
    case 'refused':
      throw new Error('The Midnight node refused the transaction', { cause: failure.value })
    case 'unsent':
      throw new Error('The transaction never reached the Midnight node', { cause: failure.value })
    default: {
      const unhandled: never = kind
      throw new Error(`Unhandled submission failure ${JSON.stringify(unhandled)}`)
    }
  }
}

/** What a failed submission established about the bytes. */
export type SubmissionFailureKind =
  /** The node answered with a reason, so the bytes will never apply. */
  | 'refused'
  /** The node answered that an earlier submission already put the bytes in its pool. */
  | 'held'
  /** The bytes never left this process. */
  | 'unsent'
  /** The bytes went out and the node's answer did not come back, so only the ledger knows. */
  | 'acknowledgementLost'

/**
 * The SDK wraps the rejection of polkadot's `send` as `SubmissionError` whatever rejected it:
 * the node's answer arrives as polkadot's `RpcError` with a numeric `code`, a send on a closed
 * socket throws before anything goes out, and a socket that closed after the send rejects the
 * pending request with a plain `Error`. Two resolvers submitting the same bytes at once is
 * ordinary (the event consumer and the sweep), and the node answers the later one with
 * `ALREADY_IMPORTED_CODE`.
 */
export function submissionFailureKind(
  error: NodeClientError.NodeClientError,
): SubmissionFailureKind {
  if (error instanceof NodeClientError.SubmissionError) {
    if (isRpcError(error.cause)) {
      return error.cause.code === ALREADY_IMPORTED_CODE ? 'held' : 'refused'
    }
    if (error.cause instanceof Error && error.cause.message === UNCONNECTED_SEND_MESSAGE) {
      return 'unsent'
    }
    return 'acknowledgementLost'
  }
  if (error instanceof NodeClientError.ConnectionError) return 'unsent'
  if (
    error instanceof NodeClientError.TransactionInvalidError ||
    error instanceof NodeClientError.TransactionDroppedError ||
    error instanceof NodeClientError.TransactionUsurpedError
  ) {
    return 'refused'
  }
  if (
    error instanceof NodeClientError.TransactionProgressError ||
    error instanceof NodeClientError.ParseError
  ) {
    return 'acknowledgementLost'
  }
  const unhandled: never = error
  throw new Error(`Unhandled node client error ${JSON.stringify(unhandled)}`)
}

/** Substrate's author RPC code for `Transaction Already Imported`. */
const ALREADY_IMPORTED_CODE = 1013

/** Polkadot's `WsProvider` rejects a send on a closed socket with exactly this message. */
const UNCONNECTED_SEND_MESSAGE = 'WebSocket is not connected'

/** Polkadot's `RpcError`: the node's JSON-RPC error, carrying its numeric code. */
function isRpcError(error: unknown): error is Error & { readonly code: number } {
  return error instanceof Error && 'code' in error && typeof error.code === 'number'
}

function bytesFromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
    throw new Error('Transaction bytes must be hex')
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function hexFromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}
