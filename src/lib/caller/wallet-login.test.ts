import type { Signature, SignDataOptions } from '@midnight-ntwrk/dapp-connector-api'
import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import { LOGIN_WINDOW_MS, loginMessageOf } from '@/lib/caller/login-credential'
import { LOGIN_RENEWAL_MARGIN_MS, loginWithWallet } from '@/lib/caller/wallet-login'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const NETWORK_ID: MidnightNetworkId = MidnightNetwork.Stagenet
const START = new Date('2026-10-23T12:00:00.000Z')
const SCHNORR_KEY = 'ab'.repeat(32)
const ECDSA_KEY = `02${'cd'.repeat(32)}`

/** The n-th signature the double answers: 64 bytes whose last byte counts the signing. */
const signatureHex = (n: number): string => `${'00'.repeat(63)}${n.toString(16).padStart(2, '0')}`

/** What the double answers beyond the connector's `Signature`: a scheme, or a shape outside the wire form. */
type Answer = Error | Partial<Record<keyof Signature | 'scheme', string>> | undefined

/** A wallet that signs every request as a counter, recording what it was asked, over a clock the case moves. */
function walletOver(answers: ReadonlyArray<Answer> = []) {
  const signed: Array<{ data: string; options: SignDataOptions }> = []
  const remaining = [...answers]
  let clock = START
  const wallet = mock<Pick<Wallet, 'signData'>>('Wallet', {
    signData: async (data: string, options: SignDataOptions): Promise<Signature> => {
      const answer = remaining.shift()
      if (answer instanceof Error) throw answer
      signed.push({ data, options })
      return {
        data,
        signature: signatureHex(signed.length),
        verifyingKey: SCHNORR_KEY,
        ...answer,
      }
    },
  })
  return {
    wallet,
    signed,
    now: () => clock,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms)
    },
  }
}

describe('loginWithWallet', () => {
  test('signs the login message of the moment as text and exposes the key that signed', async () => {
    const { wallet, signed, now } = walletOver()
    const login = await loginWithWallet(wallet, NETWORK_ID, now)
    expect(signed).toEqual([
      {
        data: loginMessageOf(NETWORK_ID, START.toISOString()),
        options: { encoding: 'text', keyType: 'unshielded' },
      },
    ])
    expect(login.verifyingKey).toBe(SCHNORR_KEY)
    await expect(login.credential()).resolves.toEqual({
      issuedAt: START.toISOString(),
      signature: {
        scheme: 'schnorr_bip340',
        verifyingKey: SCHNORR_KEY,
        signature: signatureHex(1),
      },
    })
    expect(signed).toHaveLength(1)
  })

  test.each<{ name: string; answer: Answer; expectedScheme: string; expectedKey: string }>([
    {
      name: 'an answer without a scheme is read as Schnorr',
      answer: undefined,
      expectedScheme: 'schnorr_bip340',
      expectedKey: SCHNORR_KEY,
    },
    {
      name: 'an answer naming Schnorr',
      answer: { scheme: 'schnorr_bip340' },
      expectedScheme: 'schnorr_bip340',
      expectedKey: SCHNORR_KEY,
    },
    {
      name: 'an ECDSA answer keeps its scheme and compressed key',
      answer: { scheme: 'ecdsa_secp256k1_sha256', verifyingKey: ECDSA_KEY },
      expectedScheme: 'ecdsa_secp256k1_sha256',
      expectedKey: ECDSA_KEY,
    },
  ])('$name', async ({ answer, expectedScheme, expectedKey }) => {
    const { wallet, now } = walletOver([answer])
    const login = await loginWithWallet(wallet, NETWORK_ID, now)
    expect(login.verifyingKey).toBe(expectedKey)
    expect((await login.credential()).signature).toEqual({
      scheme: expectedScheme,
      verifyingKey: expectedKey,
      signature: signatureHex(1),
    })
  })

  test.each<{ name: string; answer: Answer; error: string }>([
    {
      name: 'a signature outside the wire form',
      answer: { signature: 'signature-1' },
      error: 'signature',
    },
    {
      name: 'a compressed key under an absent scheme',
      answer: { verifyingKey: ECDSA_KEY },
      error: 'verifyingKey',
    },
    {
      name: 'a scheme spelled as the ledger tag',
      answer: { scheme: 'schnorr' },
      error: 'scheme',
    },
  ])('refuses $name with the field named', async ({ answer, error }) => {
    const { wallet, now } = walletOver([answer])
    const refusal = await loginWithWallet(wallet, NETWORK_ID, now).then(
      () => undefined,
      (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)),
    )
    expect(refusal).toContain("The wallet's login signature is not in the connector's wire form")
    expect(refusal).toContain(error)
  })

  test('keeps the credential until the renewal margin and then signs a new moment', async () => {
    const { wallet, signed, now, advance } = walletOver()
    const login = await loginWithWallet(wallet, NETWORK_ID, now)
    advance(LOGIN_WINDOW_MS - LOGIN_RENEWAL_MARGIN_MS - 1)
    expect((await login.credential()).issuedAt).toBe(START.toISOString())
    advance(1)
    const renewed = await login.credential()
    expect(renewed.issuedAt).toBe(now().toISOString())
    expect(renewed.signature.signature).toBe(signatureHex(2))
    expect(signed).toHaveLength(2)
    expect((await login.credential()).signature.signature).toBe(signatureHex(2))
  })

  test('concurrent renewals share one signing', async () => {
    const { wallet, signed, now, advance } = walletOver()
    const login = await loginWithWallet(wallet, NETWORK_ID, now)
    advance(LOGIN_WINDOW_MS)
    const [first, second] = await Promise.all([login.credential(), login.credential()])
    expect(first).toBe(second)
    expect(signed).toHaveLength(2)
  })

  test('a wallet that refuses the first signature leaves no login', async () => {
    const { wallet, now } = walletOver([new Error('user declined')])
    await expect(loginWithWallet(wallet, NETWORK_ID, now)).rejects.toThrow('user declined')
  })

  test('a refused renewal is reported and tried again on the next call', async () => {
    const { wallet, signed, now, advance } = walletOver([undefined, new Error('user declined')])
    const login = await loginWithWallet(wallet, NETWORK_ID, now)
    advance(LOGIN_WINDOW_MS)
    await expect(login.credential()).rejects.toThrow('user declined')
    expect((await login.credential()).signature.signature).toBe(signatureHex(2))
    expect(signed).toHaveLength(2)
  })
})
