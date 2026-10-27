import { describe, expect, test } from 'vitest'

import { LocalMidnightFaucetServiceAdaptor } from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service-adaptor'
import {
  type LocalMidnightFaucetService,
  NIGHT_FAUCET_AMOUNT,
} from '@/lib/midnight/local-faucet-v1/local-midnight-faucet-service'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const ADDRESS =
  'mn_addr_undeployed1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'

function adaptorOver(error?: Error): LocalMidnightFaucetServiceAdaptor {
  return new LocalMidnightFaucetServiceAdaptor(
    mock<LocalMidnightFaucetService>('LocalMidnightFaucetService', {
      fundNight: ({ unshieldedAddress, amount }) =>
        error === undefined
          ? Promise.resolve({
              unshieldedAddress,
              amount: amount ?? NIGHT_FAUCET_AMOUNT,
              transactionId: 'tx',
            })
          : Promise.reject(error),
    }),
    new RecordingLogger(),
  )
}

describe('LocalMidnightFaucetServiceAdaptor.fundNight', () => {
  test('answers the funding at the default amount', async () => {
    await expect(adaptorOver().fundNight({ unshieldedAddress: ADDRESS })).resolves.toEqual({
      ok: true,
      funding: { unshieldedAddress: ADDRESS, amount: NIGHT_FAUCET_AMOUNT, transactionId: 'tx' },
    })
  })

  test('carries an amount given as a decimal string as a bigint', async () => {
    await expect(
      adaptorOver().fundNight({ unshieldedAddress: ADDRESS, amount: '5' }),
    ).resolves.toMatchObject({ ok: true, funding: { amount: 5n } })
  })

  test.each([
    { name: 'a missing address', args: {} },
    { name: 'a shielded address', args: { unshieldedAddress: 'mn_shield-addr_undeployed1qq' } },
    { name: 'a zero amount', args: { unshieldedAddress: ADDRESS, amount: '0' } },
    { name: 'arguments that are not an object', args: 'no' },
  ])('refuses $name', async ({ args }) => {
    await expect(adaptorOver().fundNight(args)).resolves.toMatchObject({ ok: false })
  })

  test('reports a transfer the funder cannot make as a refusal', async () => {
    await expect(
      adaptorOver(new Error('could not balance dust')).fundNight({ unshieldedAddress: ADDRESS }),
    ).resolves.toEqual({ ok: false, error: 'could not balance dust' })
  })

  test('refuses every call outside the local stack', async () => {
    await expect(
      new LocalMidnightFaucetServiceAdaptor(null, new RecordingLogger()).fundNight({
        unshieldedAddress: ADDRESS,
      }),
    ).resolves.toEqual({ ok: false, error: 'The faucet is available on the local stack only.' })
  })
})
