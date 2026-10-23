import {
  type MpcOutputCacheReader,
  OutputKind,
  type RespondBidirectionalEvent,
  type SignetRequestResponseReader,
} from '@sig-net/midnight'
import { attestRespondBidirectional } from '@sig-net/midnight/testing'
import { describe, expect, test } from 'vitest'

import { RespondOutcomeSourceMpcCacheImpl } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source-mpc-cache-impl'
import {
  ATTESTATION,
  ATTESTATION_BLOCK_HEIGHT,
  ATTESTATION_OUTPUT,
  MPC_RESPONSE_KEY,
  MPC_RESPONSE_SECRET,
  REQUEST_ID,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'

const UNVIABLE_ATTESTATION: RespondBidirectionalEvent = attestRespondBidirectional(
  {
    requestId: REQUEST_ID,
    blockHeight: ATTESTATION_BLOCK_HEIGHT,
    outputKind: OutputKind.unviable,
    serializedOutput: new Uint8Array(0),
  },
  MPC_RESPONSE_SECRET,
)

interface Case {
  name: string
  posts: RespondBidirectionalEvent[]
  cached: Uint8Array | undefined
  expected: { event: RespondBidirectionalEvent; serializedOutput: Uint8Array } | undefined
}

const cases: Case[] = [
  {
    name: 'no post yet means no outcome and no cache read',
    posts: [],
    cached: new Uint8Array(0),
    expected: undefined,
  },
  {
    name: 'the cached bytes verify the executed post',
    posts: [ATTESTATION.event],
    cached: ATTESTATION_OUTPUT,
    expected: ATTESTATION,
  },
  {
    name: 'the cached empty object verifies an unviable post',
    posts: [UNVIABLE_ATTESTATION],
    cached: new Uint8Array(0),
    expected: { event: UNVIABLE_ATTESTATION, serializedOutput: new Uint8Array(0) },
  },
  {
    name: 'a post the cached bytes do not verify is skipped for one they do',
    posts: [UNVIABLE_ATTESTATION, ATTESTATION.event],
    cached: ATTESTATION_OUTPUT,
    expected: ATTESTATION,
  },
  {
    name: 'no cached object yet means no outcome',
    posts: [ATTESTATION.event],
    cached: undefined,
    expected: undefined,
  },
]

describe('RespondOutcomeSourceMpcCacheImpl.attestedOutcome', () => {
  test.each(cases)('$name', async ({ posts, cached, expected }) => {
    const reads: string[] = []
    const source = new RespondOutcomeSourceMpcCacheImpl(
      mock<SignetRequestResponseReader>('SignetRequestResponseReader', {
        getRespondBidirectionalEvents: async (id) => {
          expect(id).toBe(REQUEST_ID_HEX)
          return posts
        },
      }),
      mock<MpcOutputCacheReader>('MpcOutputCacheReader', {
        fetchSerializedOutput: async (id) => {
          reads.push(id)
          return cached
        },
      }),
    )
    expect(
      await source.attestedOutcome({ requestId: REQUEST_ID, mpcResponseKey: MPC_RESPONSE_KEY }),
    ).toEqual(expected)
    expect(reads).toEqual(posts.length === 0 ? [] : [REQUEST_ID_HEX])
  })
})
