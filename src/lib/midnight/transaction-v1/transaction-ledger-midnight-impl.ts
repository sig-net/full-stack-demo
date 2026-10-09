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
  PolkadotNodeClient,
} from '@midnightntwrk/wallet-sdk-node-client/effect'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { Effect } from 'effect'
import { z } from 'zod'

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
 * Sends the bytes over one node connection that lives for this submission alone, and resolves
 * once the node has accepted them. The node answers over WebSocket, so http(s) becomes ws(s).
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
    const client = new PolkadotNodeClient(makeConfig({ nodeURL: relayURL }), api)
    const submission = NodeClient.sendMidnightTransactionAndWait(
      SerializedTransaction.from(transaction),
      'Submitted',
    )
    await Effect.runPromise(Effect.provideService(submission, NodeClient.NodeClient, client))
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

function bytesFromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
    throw new Error('Transaction bytes must be hex')
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function hexFromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}
