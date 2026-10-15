import { describe, expect, test } from 'vitest'

import {
  REDEEM_NAME,
  redeemFixture,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-fixtures'
import type { RedeemService } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import { RedeemServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import { RedeemStateConflict } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-state-controller'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const redeem = redeemFixture()
const REQUEST = { shares: 300_000n }

function adaptorOver(service: Partial<RedeemService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new RedeemServiceAdaptor(
    mock<RedeemService>('RedeemService', {
      startRedeem: recording(redeem),
      completeRedeem: recording(redeem),
      getRedeem: recording(redeem),
      listRedeems: recording([redeem]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('RedeemServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: RedeemServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'startRedeem normalises the wallet keys and carries the shares as a bigint',
      call: (a) =>
        a.startRedeem(CALLER_SECRET, { redeemRequest: { shares: '300000' }, wallet: WALLET }),
      expectReceived: [{ redeemRequest: REQUEST, wallet: PARSED_WALLET }],
    },
    {
      name: 'startRedeem refuses zero shares',
      call: (a) => a.startRedeem(CALLER_SECRET, { redeemRequest: { shares: 0n }, wallet: WALLET }),
      expectReceived: [],
      expectError: 'redeemRequest.shares',
    },
    {
      name: 'completeRedeem passes the name and the wallet',
      call: (a) => a.completeRedeem(CALLER_SECRET, { name: REDEEM_NAME, wallet: WALLET }),
      expectReceived: [{ name: REDEEM_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'completeRedeem refuses a name that is not a redeem',
      call: (a) => a.completeRedeem(CALLER_SECRET, { name: 'redeems/1', wallet: WALLET }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-redeems/{uuid}',
    },
    {
      name: 'getRedeem passes the name',
      call: (a) => a.getRedeem(CALLER_SECRET, { name: REDEEM_NAME }),
      expectReceived: [{ name: REDEEM_NAME }],
    },
    {
      name: 'listRedeems takes no arguments',
      call: (a) => a.listRedeems(CALLER_SECRET, {}),
      expectReceived: [{}],
    },
  ]

  test.each(cases)('$name', async ({ call, expectReceived, expectError }) => {
    const received: object[] = []
    const result = await call(adaptorOver({}, received))
    expect(received).toEqual(expectReceived)
    if (expectError === undefined) expect(result.ok).toBe(true)
    else expect(result).toMatchObject({ ok: false, error: expect.stringContaining(expectError) })
  })
})

describe('RedeemServiceAdaptor outcomes', () => {
  test('a state conflict is a result the caller can act on', async () => {
    const adaptor = adaptorOver({
      completeRedeem: async () => {
        throw new RedeemStateConflict(REDEEM_NAME, 'AwaitingVaultRequest', 'complete')
      },
    })
    expect(
      await adaptor.completeRedeem(CALLER_SECRET, { name: REDEEM_NAME, wallet: WALLET }),
    ).toEqual({
      ok: false,
      error: `${REDEEM_NAME} is AwaitingVaultRequest, which does not allow complete`,
    })
  })

  test("a contract assert at build time is the vault's refusal", async () => {
    const adaptor = adaptorOver({
      startRedeem: async () => {
        throw new Error('failed assert: Coin is not the vault token for the wrapper')
      },
    })
    expect(
      await adaptor.startRedeem(CALLER_SECRET, { redeemRequest: REQUEST, wallet: WALLET }),
    ).toEqual({ ok: false, error: 'Coin is not the vault token for the wrapper' })
  })

  test('any other failure propagates', async () => {
    const adaptor = adaptorOver({
      startRedeem: async () => {
        throw new Error('indexer down')
      },
    })
    await expect(
      adaptor.startRedeem(CALLER_SECRET, { redeemRequest: REQUEST, wallet: WALLET }),
    ).rejects.toThrow('indexer down')
  })
})
