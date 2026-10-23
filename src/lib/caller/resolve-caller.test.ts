import { addressFromKey, signatureVerifyingKey, type SigningKey } from '@midnightntwrk/ledger-v9'
import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import {
  CALLER,
  CALLER_SIGNING_KEY,
  FIXTURE_NETWORK_ID,
  loginCredentialOver,
  loginCredentialSignedBy,
  STRANGER,
  STRANGER_SIGNING_KEY,
} from '@/lib/caller/caller-fixtures'
import { callerName } from '@/lib/caller/caller'
import {
  type LoginCredential,
  LOGIN_WINDOW_MS,
  loginMessageOf,
} from '@/lib/caller/login-credential'
import { resolveCaller } from '@/lib/caller/resolve-caller'

const NOW = new Date('2026-10-23T12:00:00.000Z')
const STAMP = NOW.toISOString()
/** MIP-0031's `key-a` under ECDSA. */
const ECDSA_SIGNING_KEY: SigningKey = { tag: 'ecdsa', value: '21'.repeat(32) }
const GOOD = loginCredentialSignedBy(CALLER_SIGNING_KEY, FIXTURE_NETWORK_ID, NOW)

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs)

describe('resolveCaller', () => {
  test.each<{ name: string; credential: LoginCredential; expected: string }>([
    { name: 'a Schnorr login signed now', credential: GOOD, expected: CALLER.name },
    {
      name: 'a login signed at the start of its window',
      credential: loginCredentialSignedBy(
        CALLER_SIGNING_KEY,
        FIXTURE_NETWORK_ID,
        at(-LOGIN_WINDOW_MS),
      ),
      expected: CALLER.name,
    },
    {
      name: 'an ECDSA login, named after the ECDSA key',
      credential: loginCredentialSignedBy(ECDSA_SIGNING_KEY, FIXTURE_NETWORK_ID, NOW),
      expected: callerName(addressFromKey(signatureVerifyingKey(ECDSA_SIGNING_KEY))),
    },
    {
      name: "another key's login, named after that key and never the caller",
      credential: loginCredentialSignedBy(STRANGER_SIGNING_KEY, FIXTURE_NETWORK_ID, NOW),
      expected: STRANGER.name,
    },
  ])('names $name', ({ credential, expected }) => {
    const caller = resolveCaller(credential, FIXTURE_NETWORK_ID, NOW)
    expect(caller.name).toBe(expected)
    if (expected === CALLER.name) expect(caller).toEqual(CALLER)
    if (expected === STRANGER.name) expect(caller).toEqual(STRANGER)
  })

  test.each<{ name: string; credential: unknown; error: string }>([
    {
      name: 'a value that is not an object',
      credential: 'mn_addr_stagenet1caller',
      error: 'wallet login signature',
    },
    {
      name: 'a credential without a stamp',
      credential: { signature: GOOD.signature },
      error: 'wallet login signature',
    },
    {
      name: 'a stamp that is not ISO 8601 UTC',
      credential: { ...GOOD, issuedAt: '2026-10-23 12:00:00' },
      error: 'wallet login signature',
    },
    {
      name: 'a scheme spelled as the ledger tag',
      credential: { ...GOOD, signature: { ...GOOD.signature, scheme: 'schnorr' } },
      error: 'wallet login signature',
    },
    {
      name: 'an upper-case signature',
      credential: {
        ...GOOD,
        signature: { ...GOOD.signature, signature: GOOD.signature.signature.toUpperCase() },
      },
      error: 'wallet login signature',
    },
    {
      name: 'a login one second past its window',
      credential: loginCredentialSignedBy(
        CALLER_SIGNING_KEY,
        FIXTURE_NETWORK_ID,
        at(-LOGIN_WINDOW_MS - 1000),
      ),
      error: 'has expired',
    },
    {
      name: 'a login dated one second in the future',
      credential: loginCredentialSignedBy(CALLER_SIGNING_KEY, FIXTURE_NETWORK_ID, at(1000)),
      error: 'in the future',
    },
    {
      name: 'a login signed for another network',
      credential: loginCredentialSignedBy(CALLER_SIGNING_KEY, MidnightNetwork.Undeployed, NOW),
      error: `does not verify for ${FIXTURE_NETWORK_ID}`,
    },
    {
      name: 'a signature over another moment than the stamp',
      credential: loginCredentialOver(
        CALLER_SIGNING_KEY,
        loginMessageOf(FIXTURE_NETWORK_ID, at(-1000).toISOString()),
        STAMP,
      ),
      error: `does not verify for ${FIXTURE_NETWORK_ID}`,
    },
    {
      name: 'a signature over the message without the MIP-0031 prefix',
      credential: {
        ...GOOD,
        signature: {
          ...GOOD.signature,
          signature: `${GOOD.signature.signature.slice(0, -2)}${GOOD.signature.signature.endsWith('00') ? '01' : '00'}`,
        },
      },
      error: `does not verify for ${FIXTURE_NETWORK_ID}`,
    },
    {
      name: "a signature presented under another wallet's key",
      credential: {
        ...GOOD,
        signature: { ...GOOD.signature, verifyingKey: STRANGER_SIGNING_KEY_VERIFYING },
      },
      error: `does not verify for ${FIXTURE_NETWORK_ID}`,
    },
  ])('refuses $name', ({ credential, error }) => {
    expect(() => resolveCaller(credential, FIXTURE_NETWORK_ID, NOW)).toThrow(error)
  })
})

const STRANGER_SIGNING_KEY_VERIFYING = signatureVerifyingKey(STRANGER_SIGNING_KEY).value
