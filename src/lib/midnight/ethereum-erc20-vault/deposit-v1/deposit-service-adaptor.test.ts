import { describe, expect, test } from 'vitest'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type {
  DepositCompleteInputs,
  DepositStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import {
  DEPOSIT_ACCOUNT,
  DEPOSIT_NAME,
  depositFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import {
  DepositNonceConflict,
  DepositRecipientMismatch,
  type DepositService,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import {
  type DepositResult,
  DepositServiceAdaptor,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import { DepositStateConflict } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { SponsoredCallMismatch } from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'
import { UINT64_MAX } from '@/lib/value-schemas'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const deposit = depositFixture()
type Refusal = Extract<DepositResult, { ok: false }>
const START_INPUTS: DepositStartInputs = {
  inIndex: 42n,
  evmNonce: 7n,
  gasLimit: 100_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
}
const COMPLETE_INPUTS: DepositCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}

function adaptorOver(service: Partial<DepositService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new DepositServiceAdaptor(
    mock<DepositService>('DepositService', {
      prepareStartDeposit: recording(START_INPUTS),
      startDeposit: recording(deposit),
      prepareCompleteDeposit: recording(COMPLETE_INPUTS),
      completeDeposit: recording(deposit),
      getDeposit: recording(deposit),
      listDeposits: recording([deposit]),
      ...service,
    }),
    new RecordingLogger(),
  )
}

describe('DepositServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: DepositServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'prepareStartDeposit normalises the wallet keys and carries the amount as a bigint',
      call: (a) =>
        a.prepareStartDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: '1000000' },
          wallet: WALLET,
        }),
      expectReceived: [
        {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1_000_000n },
          wallet: PARSED_WALLET,
        },
      ],
    },
    {
      name: 'prepareStartDeposit refuses a zero amount',
      call: (a) =>
        a.prepareStartDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 0n },
          wallet: WALLET,
        }),
      expectReceived: [],
      expectError: 'depositRequest.amount',
    },
    {
      name: 'startDeposit carries the inputs as bigints and the bound bytes without the 0x prefix',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: '1000000' },
          wallet: WALLET,
          inIndex: '42',
          evmNonce: 7n,
          boundTx: '0xB0BD',
        }),
      expectReceived: [
        {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1_000_000n },
          wallet: PARSED_WALLET,
          inIndex: 42n,
          evmNonce: 7n,
          boundTx: 'b0bd',
        },
      ],
    },
    {
      name: 'startDeposit refuses a wallet key that is not 32 bytes',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
          wallet: { ...WALLET, coinPublicKey: 'aa' },
          inIndex: 42n,
          evmNonce: 7n,
          boundTx: 'b0bd',
        }),
      expectReceived: [],
      expectError: 'expected a 32-byte key in hex',
    },
    {
      name: 'startDeposit refuses bound bytes that are not hex',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
          wallet: WALLET,
          inIndex: 42n,
          evmNonce: 7n,
          boundTx: 'not hex',
        }),
      expectReceived: [],
      expectError: 'expected bytes in hex',
    },
    {
      name: 'startDeposit refuses a nonce above the 64-bit range',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
          wallet: WALLET,
          inIndex: 42n,
          evmNonce: UINT64_MAX + 1n,
          boundTx: 'b0bd',
        }),
      expectReceived: [],
      expectError: 'evmNonce',
    },
    {
      name: 'startDeposit refuses a missing input index',
      call: (a) =>
        a.startDeposit(CALLER_SECRET, {
          depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
          wallet: WALLET,
          evmNonce: 7n,
          boundTx: 'b0bd',
        }),
      expectReceived: [],
      expectError: 'inIndex',
    },
    {
      name: 'prepareCompleteDeposit passes the name and the wallet',
      call: (a) => a.prepareCompleteDeposit(CALLER_SECRET, { name: DEPOSIT_NAME, wallet: WALLET }),
      expectReceived: [{ name: DEPOSIT_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'prepareCompleteDeposit refuses a name that is not a deposit',
      call: (a) => a.prepareCompleteDeposit(CALLER_SECRET, { name: 'deposits/1', wallet: WALLET }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-deposits/{uuid}',
    },
    {
      name: 'completeDeposit passes the name, the wallet and the bound bytes',
      call: (a) =>
        a.completeDeposit(CALLER_SECRET, { name: DEPOSIT_NAME, wallet: WALLET, boundTx: 'B0BD' }),
      expectReceived: [{ name: DEPOSIT_NAME, wallet: PARSED_WALLET, boundTx: 'b0bd' }],
    },
    {
      name: 'completeDeposit refuses a missing bound call',
      call: (a) => a.completeDeposit(CALLER_SECRET, { name: DEPOSIT_NAME, wallet: WALLET }),
      expectReceived: [],
      expectError: 'boundTx',
    },
    {
      name: 'getDeposit passes the name',
      call: (a) => a.getDeposit(CALLER_SECRET, { name: DEPOSIT_NAME }),
      expectReceived: [{ name: DEPOSIT_NAME }],
    },
    {
      name: 'listDeposits takes no arguments',
      call: (a) => a.listDeposits(CALLER_SECRET, {}),
      expectReceived: [{}],
    },
    {
      name: 'listDeposits refuses a non-object',
      call: (a) => a.listDeposits(CALLER_SECRET, 'all'),
      expectReceived: [],
      expectError: 'expected object',
    },
  ]

  test.each(cases)('$name', async ({ call, expectReceived, expectError }) => {
    const received: object[] = []
    const result = await call(adaptorOver({}, received))
    expect(received).toEqual(expectReceived)
    if (expectError === undefined) expect(result.ok).toBe(true)
    else expect(result).toMatchObject({ ok: false, error: expect.stringContaining(expectError) })
  })

  test('an invalid caller secret throws before anything is parsed', async () => {
    await expect(adaptorOver({}).getDeposit('nope', { name: DEPOSIT_NAME })).rejects.toThrow(
      'caller secret',
    )
  })
})

describe('DepositServiceAdaptor outcomes', () => {
  test('a missing deposit is a not-found result', async () => {
    const adaptor = adaptorOver({ getDeposit: async () => undefined })
    expect(await adaptor.getDeposit(CALLER_SECRET, { name: DEPOSIT_NAME })).toEqual({
      ok: false,
      error: `${DEPOSIT_NAME} was not found.`,
    })
  })

  test('the prepare methods answer with the inputs the service assigned or read', async () => {
    const adaptor = adaptorOver({})
    expect(
      await adaptor.prepareStartDeposit(CALLER_SECRET, {
        depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
        wallet: WALLET,
      }),
    ).toEqual({ ok: true, inputs: START_INPUTS })
    expect(
      await adaptor.prepareCompleteDeposit(CALLER_SECRET, { name: DEPOSIT_NAME, wallet: WALLET }),
    ).toEqual({ ok: true, inputs: COMPLETE_INPUTS })
  })

  const refusals: ReadonlyArray<[string, Error, Refusal | undefined]> = [
    [
      'a state conflict',
      new DepositStateConflict(DEPOSIT_NAME, 'AwaitingVaultRequest', 'completeDeposit'),
      {
        ok: false,
        error: `${DEPOSIT_NAME} is AwaitingVaultRequest, which does not allow completeDeposit`,
      },
    ],
    [
      'a wallet other than the one the deposit mints to',
      new DepositRecipientMismatch(DEPOSIT_NAME),
      {
        ok: false,
        error: `${DEPOSIT_NAME} mints to the wallet it was started with: complete it with that wallet`,
      },
    ],
    [
      'a moved nonce',
      new DepositNonceConflict(DEPOSIT_ACCOUNT),
      {
        ok: false,
        error: `the next nonce of ${DEPOSIT_ACCOUNT} moved since the start call was prepared: prepare and build it again`,
        reason: 'nonceConflict',
      },
    ],
    [
      'bound bytes that are not the expected vault call',
      new SponsoredCallMismatch('startDeposit'),
      {
        ok: false,
        error:
          'the bound bytes must be exactly one startDeposit call to the vault, spending no coins',
      },
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a user action', async (_name, error, expectRefusal) => {
    const refusing = async () => {
      throw error
    }
    const adaptor = adaptorOver({
      startDeposit: refusing,
      prepareCompleteDeposit: refusing,
      completeDeposit: refusing,
    })
    const starting = adaptor.startDeposit(CALLER_SECRET, {
      depositRequest: { erc20Address: ERC20_ADDRESS, amount: 1n },
      wallet: WALLET,
      inIndex: 42n,
      evmNonce: 7n,
      boundTx: 'b0bd',
    })
    const preparing = adaptor.prepareCompleteDeposit(CALLER_SECRET, {
      name: DEPOSIT_NAME,
      wallet: WALLET,
    })
    const completing = adaptor.completeDeposit(CALLER_SECRET, {
      name: DEPOSIT_NAME,
      wallet: WALLET,
      boundTx: 'b0bd',
    })
    for (const acting of [starting, preparing, completing]) {
      if (expectRefusal === undefined) await expect(acting).rejects.toBe(error)
      else expect(await acting).toEqual(expectRefusal)
    }
  })
})

describe('DepositServiceAdaptor logging', () => {
  const cases: ReadonlyArray<{
    method: string
    call: (adaptor: DepositServiceAdaptor) => Promise<unknown>
  }> = [
    { method: 'prepareStartDeposit', call: (a) => a.prepareStartDeposit(CALLER_SECRET, {}) },
    { method: 'startDeposit', call: (a) => a.startDeposit(CALLER_SECRET, {}) },
    { method: 'prepareCompleteDeposit', call: (a) => a.prepareCompleteDeposit(CALLER_SECRET, {}) },
    { method: 'completeDeposit', call: (a) => a.completeDeposit(CALLER_SECRET, {}) },
    { method: 'getDeposit', call: (a) => a.getDeposit(CALLER_SECRET, { name: DEPOSIT_NAME }) },
    { method: 'listDeposits', call: (a) => a.listDeposits(CALLER_SECRET, {}) },
  ]

  test.each(cases)(
    '$method logs one line naming the method and the derived caller, never the secret',
    async ({ method, call }) => {
      const logger = new RecordingLogger()
      await call(
        new DepositServiceAdaptor(
          mock<DepositService>('DepositService', {
            getDeposit: async () => deposit,
            listDeposits: async () => [deposit],
          }),
          logger,
        ),
      )
      expect(logger.lines).toEqual([
        {
          level: 'debug',
          message: 'method called',
          fields: { method, caller: resolveCaller(CALLER_SECRET).name },
        },
      ])
      expect(JSON.stringify(logger.lines)).not.toContain(CALLER_SECRET)
    },
  )
})
