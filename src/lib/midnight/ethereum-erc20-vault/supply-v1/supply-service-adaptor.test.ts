import { describe, expect, test } from 'vitest'

import type { SupplyTarget } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'
import {
  STATA_ERC20_ADDRESS,
  SUPPLY_NAME,
  supplyFixture,
  UNDERLYING_ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-fixtures'
import type { SupplyService } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service'
import { SupplyServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-service-adaptor'
import { SupplyStateConflict } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply-state-controller'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const supply = supplyFixture()
const target: SupplyTarget = {
  underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
  stataErc20Address: STATA_ERC20_ADDRESS,
  allowance: 1n,
}
const REQUEST = { amount: 1_000_000n }

function adaptorOver(service: Partial<SupplyService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new SupplyServiceAdaptor(
    mock<SupplyService>('SupplyService', {
      getSupplyTarget: recording(target),
      startSupply: recording(supply),
      completeSupply: recording(supply),
      getSupply: recording(supply),
      listSupplies: recording([supply]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('SupplyServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: SupplyServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'getSupplyTarget takes no arguments',
      call: (a) => a.getSupplyTarget(CALLER_SECRET, {}),
      expectReceived: [{}],
    },
    {
      name: 'startSupply normalises the wallet keys and carries the amount as a bigint',
      call: (a) =>
        a.startSupply(CALLER_SECRET, { supplyRequest: { amount: '1000000' }, wallet: WALLET }),
      expectReceived: [{ supplyRequest: REQUEST, wallet: PARSED_WALLET }],
    },
    {
      name: 'startSupply refuses a zero amount',
      call: (a) => a.startSupply(CALLER_SECRET, { supplyRequest: { amount: 0n }, wallet: WALLET }),
      expectReceived: [],
      expectError: 'supplyRequest.amount',
    },
    {
      name: 'completeSupply passes the name and the wallet',
      call: (a) => a.completeSupply(CALLER_SECRET, { name: SUPPLY_NAME, wallet: WALLET }),
      expectReceived: [{ name: SUPPLY_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'completeSupply refuses a name that is not a supply',
      call: (a) => a.completeSupply(CALLER_SECRET, { name: 'supplies/1', wallet: WALLET }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-supplies/{uuid}',
    },
    {
      name: 'getSupply passes the name',
      call: (a) => a.getSupply(CALLER_SECRET, { name: SUPPLY_NAME }),
      expectReceived: [{ name: SUPPLY_NAME }],
    },
    {
      name: 'listSupplies takes no arguments',
      call: (a) => a.listSupplies(CALLER_SECRET, {}),
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

describe('SupplyServiceAdaptor outcomes', () => {
  test('a state conflict is a result the caller can act on', async () => {
    const adaptor = adaptorOver({
      completeSupply: async () => {
        throw new SupplyStateConflict(SUPPLY_NAME, 'AwaitingVaultRequest', 'complete')
      },
    })
    expect(
      await adaptor.completeSupply(CALLER_SECRET, { name: SUPPLY_NAME, wallet: WALLET }),
    ).toEqual({
      ok: false,
      error: `${SUPPLY_NAME} is AwaitingVaultRequest, which does not allow complete`,
    })
  })

  test("a contract assert at build time is the vault's refusal", async () => {
    const adaptor = adaptorOver({
      startSupply: async () => {
        throw new Error('failed assert: Coin is not the vault token for the underlying')
      },
    })
    expect(
      await adaptor.startSupply(CALLER_SECRET, { supplyRequest: REQUEST, wallet: WALLET }),
    ).toEqual({ ok: false, error: 'Coin is not the vault token for the underlying' })
  })

  test('any other failure propagates', async () => {
    const adaptor = adaptorOver({
      startSupply: async () => {
        throw new Error('indexer down')
      },
    })
    await expect(
      adaptor.startSupply(CALLER_SECRET, { supplyRequest: REQUEST, wallet: WALLET }),
    ).rejects.toThrow('indexer down')
  })
})
