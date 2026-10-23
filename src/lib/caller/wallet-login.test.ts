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
const VERIFYING_KEY = 'ab'.repeat(32)

/** A wallet that signs every request as a counter, recording what it was asked, over a clock the case moves. */
function walletOver(answers: ReadonlyArray<Error | undefined> = []) {
  const signed: Array<{ data: string; options: SignDataOptions }> = []
  const remaining = [...answers]
  let clock = START
  const wallet = mock<Pick<Wallet, 'signData'>>('Wallet', {
    signData: async (data: string, options: SignDataOptions): Promise<Signature> => {
      const answer = remaining.shift()
      if (answer instanceof Error) throw answer
      signed.push({ data, options })
      return { data, signature: `signature-${signed.length}`, verifyingKey: VERIFYING_KEY }
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
    expect(login.verifyingKey).toBe(VERIFYING_KEY)
    await expect(login.credential()).resolves.toEqual({
      issuedAt: START.toISOString(),
      signature: {
        scheme: 'schnorr_bip340',
        verifyingKey: VERIFYING_KEY,
        signature: 'signature-1',
      },
    })
    expect(signed).toHaveLength(1)
  })

  test('keeps the credential until the renewal margin and then signs a new moment', async () => {
    const { wallet, signed, now, advance } = walletOver()
    const login = await loginWithWallet(wallet, NETWORK_ID, now)
    advance(LOGIN_WINDOW_MS - LOGIN_RENEWAL_MARGIN_MS - 1)
    expect((await login.credential()).issuedAt).toBe(START.toISOString())
    advance(1)
    const renewed = await login.credential()
    expect(renewed.issuedAt).toBe(now().toISOString())
    expect(renewed.signature.signature).toBe('signature-2')
    expect(signed).toHaveLength(2)
    expect((await login.credential()).signature.signature).toBe('signature-2')
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
    expect((await login.credential()).signature.signature).toBe('signature-2')
    expect(signed).toHaveLength(2)
  })
})
