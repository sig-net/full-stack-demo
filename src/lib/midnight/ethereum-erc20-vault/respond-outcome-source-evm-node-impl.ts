import 'server-only'

import {
  type EvmTraceOutput,
  evmTraceOutputFromCallFrame,
  EvmTraceOutputKind,
  executedEvmRespondOutput,
  isEvmContractCall,
  type JsonValue,
  OutputKind,
  type RequestIdHex,
  requestIdHex,
  type SignBidirectionalEvent,
  signBidirectionalEventToSignedEvmTransaction,
  type SignetRequestResponseReader,
} from '@sig-net/midnight'
import type { JsonRpcApiProvider, Transaction, TransactionReceipt } from 'ethers'
import { z } from 'zod'

import {
  type AttestedOutcomeArgs,
  firstVerifiedOutcome,
  type RespondOutcome,
  type RespondOutcomeSource,
} from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'

/**
 * Recomputes the attested bytes from the EVM chain: the mined transaction's top call frame is
 * traced with `debug_traceTransaction`, which the node must serve, and decoded and serialised
 * as the MPC does. A post declaring a failed or unviable execution is checked over the empty
 * output, which needs no trace.
 */
export class RespondOutcomeSourceEvmNodeImpl implements RespondOutcomeSource {
  private readonly reader: SignetRequestResponseReader
  private readonly provider: JsonRpcApiProvider

  constructor(reader: SignetRequestResponseReader, provider: JsonRpcApiProvider) {
    this.reader = reader
    this.provider = provider
  }

  async attestedOutcome({
    requestId,
    mpcResponseKey,
  }: AttestedOutcomeArgs): Promise<RespondOutcome | undefined> {
    const id = requestIdHex(requestId)
    const posts = await this.reader.getRespondBidirectionalEvents(id)
    if (posts.length === 0) return undefined
    const executed = posts.some((post) => post.outputKind === OutputKind.executed)
      ? await this.executedOutput(id)
      : undefined
    return firstVerifiedOutcome(
      posts,
      (post) => (post.outputKind === OutputKind.executed ? executed : EMPTY_OUTPUT),
      mpcResponseKey,
    )
  }

  /**
   * The bytes the MPC serialised for an executed transaction, or undefined while no post's
   * transaction has mined, it reverted, or its return data does not decode under the request's
   * schema (which the MPC refuses to attest, so such a post can only be bogus).
   */
  private async executedOutput(id: RequestIdHex): Promise<Uint8Array | undefined> {
    const request = await this.reader.getSignatureRequest(id)
    const mined = await this.minedTransaction(request, id)
    if (mined === undefined || mined.receipt.status !== 1) return undefined
    const isContractCall = isEvmContractCall(mined.transaction.data)
    const trace: EvmTraceOutput = isContractCall
      ? evmTraceOutputFromCallFrame(await this.traceTopFrame(mined.receipt.hash))
      : { kind: EvmTraceOutputKind.NotTraced }
    try {
      return executedEvmRespondOutput(request.outputDeserializationSchema, isContractCall, trace)
    } catch (error: unknown) {
      console.warn(`The traced output of request ${id} does not decode under its schema`, error)
      return undefined
    }
  }

  /** The transaction one of the request's signature posts signs that the chain holds a receipt for. */
  private async minedTransaction(
    request: SignBidirectionalEvent,
    id: RequestIdHex,
  ): Promise<{ transaction: Transaction; receipt: TransactionReceipt } | undefined> {
    for (const post of await this.reader.getSignatureRespondedEvents(id)) {
      let transaction: Transaction
      try {
        transaction = signBidirectionalEventToSignedEvmTransaction(request, post)
      } catch {
        continue
      }
      if (transaction.hash === null) continue
      const receipt = await this.provider.getTransactionReceipt(transaction.hash)
      if (receipt !== null) return { transaction, receipt }
    }
    return undefined
  }

  private async traceTopFrame(txHash: string): Promise<JsonValue> {
    return z.json().parse(await this.provider.send(TRACE_METHOD, [txHash, CALL_TRACER]))
  }
}

const EMPTY_OUTPUT = new Uint8Array(0)

const TRACE_METHOD = 'debug_traceTransaction'

const CALL_TRACER = { tracer: 'callTracer', tracerConfig: { onlyTopCall: true } } as const
