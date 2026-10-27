import { describe, expect, test } from 'vitest'

import { CALLER_CREDENTIAL, FIXTURE_NETWORK_ID } from '@/lib/caller/caller-fixtures'
import type { SupportedTokenService } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service'
import { SupportedTokenServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/supported-token-service-adaptor'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const USER_COMMITMENT = 'ab'.repeat(32)
const TOKEN = {
  erc20Address: `0x${'aa'.repeat(20)}`,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
}
const FUND = { erc20Address: TOKEN.erc20Address, amount: 5n }

function adaptorOver(callers: string[] = []): SupportedTokenServiceAdaptor {
  return new SupportedTokenServiceAdaptor(
    mock<SupportedTokenService>('SupportedTokenService', {
      listSupportedTokens: () => Promise.resolve([TOKEN]),
      listDepositAccountFunds: (caller) => {
        callers.push(caller.name)
        return Promise.resolve([FUND])
      },
    }),
    FIXTURE_NETWORK_ID,
    new RecordingLogger(),
  )
}

describe('SupportedTokenServiceAdaptor', () => {
  test('listSupportedTokens answers the tokens', async () => {
    await expect(adaptorOver().listSupportedTokens({})).resolves.toEqual({
      ok: true,
      tokens: [TOKEN],
    })
  })

  test('listDepositAccountFunds resolves the caller from the credential and answers the funds', async () => {
    const callers: string[] = []
    await expect(
      adaptorOver(callers).listDepositAccountFunds(CALLER_CREDENTIAL, {
        userCommitment: USER_COMMITMENT,
      }),
    ).resolves.toEqual({
      ok: true,
      funds: [FUND],
    })
    expect(callers).toEqual([expect.stringMatching(/^callers\/[0-9a-f]{64}$/)])
  })

  test.each([
    {
      name: 'listSupportedTokens',
      call: (a: SupportedTokenServiceAdaptor) => a.listSupportedTokens('no'),
    },
    {
      name: 'listDepositAccountFunds',
      call: (a: SupportedTokenServiceAdaptor) => a.listDepositAccountFunds(CALLER_CREDENTIAL, 'no'),
    },
  ])('$name refuses arguments that are not an object', async ({ call }) => {
    await expect(call(adaptorOver())).resolves.toMatchObject({ ok: false })
  })

  test('listDepositAccountFunds refuses a malformed credential', async () => {
    await expect(adaptorOver().listDepositAccountFunds('nope', {})).rejects.toThrow(
      'wallet login signature',
    )
  })
})
