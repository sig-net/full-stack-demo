import {
  boolAbiWord,
  bytesToHex,
  MPCDestination,
  MPCSignatureAlgorithm,
  OutputKind,
  type RespondBidirectionalEvent,
  type SignatureRespondedEvent,
  type SignBidirectionalEvent,
  signBidirectionalEventToUnsignedEvmTransaction,
  type SignetRequestResponseReader,
  TxParamType,
} from '@sig-net/midnight'
import {
  attestRespondBidirectional,
  signatureToSignatureRespondedEvent,
} from '@sig-net/midnight/testing'
import {
  type JsonRpcApiProvider,
  type Provider,
  SigningKey,
  type Transaction,
  TransactionReceipt,
} from 'ethers'
import { describe, expect, test } from 'vitest'

import { RespondOutcomeSourceEvmNodeImpl } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source-evm-node-impl'
import {
  ATTESTATION,
  ATTESTATION_BLOCK_HEIGHT,
  MPC_RESPONSE_KEY,
  MPC_RESPONSE_SECRET,
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'

/** A transfer request whose output schema is the vault's single bool, as the send circuit records it. */
const REQUEST: SignBidirectionalEvent = {
  keyVersion: 1n,
  sender: { bytes: new Uint8Array(32).fill(5) },
  path: new Uint8Array(32),
  algo: MPCSignatureAlgorithm.ecdsa,
  txParamType: TxParamType.evmType2,
  txParams: {
    chainId: 11155111n,
    nonce: 7n,
    maxPriorityFeePerGas: 1_000_000_000n,
    maxFeePerGas: 30_000_000_000n,
    gasLimit: 100_000n,
    to: new Uint8Array(20).fill(0xaa),
    value: 0n,
    calldata: {
      is_some: true,
      value: {
        selector: new Uint8Array([0xa9, 0x05, 0x9c, 0xbb]),
        noWords: 2n,
        words: [new Uint8Array(32).fill(1), new Uint8Array(32).fill(2)],
      },
    },
    accessListEntryCount: 0n,
    accessList: [],
  },
  executionDest: new Uint8Array(32),
  signatureDest: MPCDestination.unused,
  params: new Uint8Array(64),
  outputDeserializationSchema: new TextEncoder().encode('[{"name":"success","type":"bool"}]'),
  respondSerializationSchema: new Uint8Array(0),
}

/** The MPC's signature post for the request, signed with a throwaway key so the transaction has a hash. */
const SIGNATURE_POST: SignatureRespondedEvent = signaturePost()
const MINED: Transaction = signedTransaction()

function signedTransaction(): Transaction {
  const key = new SigningKey(`0x${'11'.repeat(32)}`)
  const transaction = signBidirectionalEventToUnsignedEvmTransaction(REQUEST)
  transaction.signature = key.sign(transaction.unsignedHash)
  return transaction
}

function signaturePost(): SignatureRespondedEvent {
  const transaction = signedTransaction()
  if (transaction.signature === null) throw new Error('unsigned')
  return signatureToSignatureRespondedEvent(REQUEST_ID, transaction.signature)
}

const FAILED_ATTESTATION: RespondBidirectionalEvent = attestRespondBidirectional(
  {
    requestId: REQUEST_ID,
    blockHeight: ATTESTATION_BLOCK_HEIGHT,
    outputKind: OutputKind.failed,
    serializedOutput: new Uint8Array(0),
  },
  MPC_RESPONSE_SECRET,
)

/** A genuine signature over another block height: the verifier recomputes the digest, so it fails. */
const FORGED_POST: RespondBidirectionalEvent = {
  ...ATTESTATION.event,
  blockHeight: ATTESTATION_BLOCK_HEIGHT + 1n,
}

function receipt(status: number): TransactionReceipt {
  return new TransactionReceipt(
    {
      to: MINED.to,
      from: MINED.from ?? '',
      contractAddress: null,
      hash: MINED.hash ?? '',
      index: 0,
      blockHash: `0x${'22'.repeat(32)}`,
      blockNumber: Number(ATTESTATION_BLOCK_HEIGHT),
      logsBloom: `0x${'00'.repeat(256)}`,
      logs: [],
      gasUsed: 50_000n,
      cumulativeGasUsed: 50_000n,
      type: 2,
      status,
      root: null,
    },
    mock<Provider>('Provider'),
  )
}

interface Case {
  name: string
  posts: RespondBidirectionalEvent[]
  reader?: Partial<SignetRequestResponseReader>
  provider?: Partial<JsonRpcApiProvider>
  expected: { event: RespondBidirectionalEvent; serializedOutput: Uint8Array } | undefined
}

const TRANSFER_RETURNED_TRUE = { type: 'CALL', output: `0x${bytesToHex(boolAbiWord(true))}` }

const readerFor = (posts: SignatureRespondedEvent[]): Partial<SignetRequestResponseReader> => ({
  getSignatureRequest: async (id) => {
    expect(id).toBe(REQUEST_ID_HEX)
    return REQUEST
  },
  getSignatureRespondedEvents: async (id) => {
    expect(id).toBe(REQUEST_ID_HEX)
    return posts
  },
})

const minedProvider = (status: number, frame: unknown): Partial<JsonRpcApiProvider> => ({
  getTransactionReceipt: async (hash) => {
    expect(hash).toBe(MINED.hash)
    return receipt(status)
  },
  send: async (method, params) => {
    expect(method).toBe('debug_traceTransaction')
    expect(params).toEqual([
      MINED.hash,
      { tracer: 'callTracer', tracerConfig: { onlyTopCall: true } },
    ])
    return frame
  },
})

const cases: Case[] = [
  {
    name: 'no post yet means no outcome and no chain read',
    posts: [],
    expected: undefined,
  },
  {
    name: 'an executed post verifies over the traced return data serialised as the MPC does',
    posts: [ATTESTATION.event],
    reader: readerFor([SIGNATURE_POST]),
    provider: minedProvider(1, TRANSFER_RETURNED_TRUE),
    expected: ATTESTATION,
  },
  {
    name: 'a failed post verifies over the empty output without a chain read',
    posts: [FAILED_ATTESTATION],
    expected: { event: FAILED_ATTESTATION, serializedOutput: new Uint8Array(0) },
  },
  {
    name: 'a forged executed post is skipped and the genuine one after it wins',
    posts: [FORGED_POST, ATTESTATION.event],
    reader: readerFor([SIGNATURE_POST]),
    provider: minedProvider(1, TRANSFER_RETURNED_TRUE),
    expected: ATTESTATION,
  },
  {
    name: 'an executed post cannot be checked while no signed transaction has mined',
    posts: [ATTESTATION.event],
    reader: readerFor([SIGNATURE_POST]),
    provider: { getTransactionReceipt: async () => null },
    expected: undefined,
  },
  {
    name: 'an executed post cannot be checked against a reverted transaction',
    posts: [ATTESTATION.event],
    reader: readerFor([SIGNATURE_POST]),
    provider: { getTransactionReceipt: async () => receipt(0) },
    expected: undefined,
  },
  {
    name: 'an executed post whose traced output does not decode is bogus, so only failure posts count',
    posts: [ATTESTATION.event, FAILED_ATTESTATION],
    reader: readerFor([SIGNATURE_POST]),
    provider: minedProvider(1, { type: 'CALL', output: '0x' }),
    expected: { event: FAILED_ATTESTATION, serializedOutput: new Uint8Array(0) },
  },
  {
    name: 'a malformed signature post is skipped on the way to the mined one',
    posts: [ATTESTATION.event],
    reader: readerFor([
      { ...SIGNATURE_POST, signature: { ...SIGNATURE_POST.signature, s: new Uint8Array(3) } },
      SIGNATURE_POST,
    ]),
    provider: minedProvider(1, TRANSFER_RETURNED_TRUE),
    expected: ATTESTATION,
  },
]

describe('RespondOutcomeSourceEvmNodeImpl.attestedOutcome', () => {
  test.each(cases)('$name', async ({ posts, reader, provider, expected }) => {
    const source = new RespondOutcomeSourceEvmNodeImpl(
      mock<SignetRequestResponseReader>('SignetRequestResponseReader', {
        getRespondBidirectionalEvents: async (id) => {
          expect(id).toBe(REQUEST_ID_HEX)
          return posts
        },
        ...reader,
      }),
      mock<JsonRpcApiProvider>('JsonRpcApiProvider', provider),
    )
    expect(
      await source.attestedOutcome({ requestId: REQUEST_ID, mpcResponseKey: MPC_RESPONSE_KEY }),
    ).toEqual(expected)
  })

  test('a post is rejected against another response key', async () => {
    const source = new RespondOutcomeSourceEvmNodeImpl(
      mock<SignetRequestResponseReader>('SignetRequestResponseReader', {
        getRespondBidirectionalEvents: async () => [FAILED_ATTESTATION],
      }),
      mock<JsonRpcApiProvider>('JsonRpcApiProvider'),
    )
    expect(
      await source.attestedOutcome({
        requestId: REQUEST_ID,
        mpcResponseKey: { ...MPC_RESPONSE_KEY, x: MPC_RESPONSE_KEY.x + 1n },
      }),
    ).toBeUndefined()
  })
})
