import { describe, expect, test } from 'vitest'

import { CALLER_CREDENTIAL, FIXTURE_NETWORK_ID } from '@/lib/caller/caller-fixtures'
import type { ReadinessService } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service'
import {
  ReadinessServiceAdaptor,
  type VaultInitialisationResult,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/readiness-service-adaptor'
import type { VaultReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const USER_COMMITMENT = 'ab'.repeat(32)
const READINESS: VaultReadiness = {
  relayerDust: { status: 'ok', asset: 'DUST', account: 'mn1', available: 2n, required: 1n },
  depositAccountEth: {
    status: 'insufficient',
    asset: 'ETH',
    account: '0x1',
    available: 0n,
    required: 1n,
  },
  vaultAccountEth: { status: 'unavailable', asset: 'ETH', account: '0x2', reason: 'rpc down' },
}

function adaptorOver(callers: string[] = []): ReadinessServiceAdaptor {
  return new ReadinessServiceAdaptor(
    mock<ReadinessService>('ReadinessService', {
      getVaultReadiness: (caller) => {
        callers.push(caller.name)
        return Promise.resolve(READINESS)
      },
      getVaultInitialisation: (caller) => {
        callers.push(caller.name)
        return Promise.resolve({ status: 'uninitialised' })
      },
    }),
    FIXTURE_NETWORK_ID,
    new RecordingLogger(),
  )
}

describe('ReadinessServiceAdaptor.getVaultReadiness', () => {
  test('resolves the caller from the credential and answers the readiness', async () => {
    const callers: string[] = []
    await expect(
      adaptorOver(callers).getVaultReadiness(CALLER_CREDENTIAL, {
        userCommitment: USER_COMMITMENT,
      }),
    ).resolves.toEqual({
      ok: true,
      readiness: READINESS,
    })
    expect(callers).toEqual([expect.stringMatching(/^callers\/[0-9a-f]{64}$/)])
  })

  test('refuses arguments that are not an object', async () => {
    await expect(adaptorOver().getVaultReadiness(CALLER_CREDENTIAL, 'no')).resolves.toMatchObject({
      ok: false,
    })
  })

  test('refuses a malformed credential', async () => {
    await expect(adaptorOver().getVaultReadiness('nope', {})).rejects.toThrow(
      'wallet login signature',
    )
  })
})

describe('ReadinessServiceAdaptor.getVaultInitialisation', () => {
  test.each<{
    name: string
    credential: unknown
    args: unknown
    expected: VaultInitialisationResult
    callers: number
  }>([
    {
      name: 'resolves the caller from the credential and answers the initialisation',
      credential: CALLER_CREDENTIAL,
      args: {},
      expected: { ok: true, initialisation: { status: 'uninitialised' } },
      callers: 1,
    },
    {
      name: 'refuses arguments that are not an object',
      credential: CALLER_CREDENTIAL,
      args: 'no',
      expected: { ok: false, error: expect.any(String) },
      callers: 0,
    },
  ])('$name', async ({ credential, args, expected, callers }) => {
    const seen: string[] = []
    await expect(adaptorOver(seen).getVaultInitialisation(credential, args)).resolves.toEqual(
      expected,
    )
    expect(seen).toHaveLength(callers)
  })

  test('refuses a malformed credential', async () => {
    await expect(adaptorOver().getVaultInitialisation('nope', {})).rejects.toThrow(
      'wallet login signature',
    )
  })
})
