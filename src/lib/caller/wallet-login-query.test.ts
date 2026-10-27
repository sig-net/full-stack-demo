import type { Signature, SignDataOptions } from '@midnight-ntwrk/dapp-connector-api'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test, vi } from 'vitest'

import {
  loginBlockerOf,
  type LoginStatus,
  loginStatusOf,
  walletLoginQueryOptions,
} from '@/lib/caller/wallet-login-query'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const NETWORK_ID: MidnightNetworkId = MidnightNetwork.Stagenet
const VERIFYING_KEY = 'ab'.repeat(32)

/** A wallet that refuses the first `refusals` signatures and then signs, counting every request. */
function walletRefusing(refusals: number) {
  let requests = 0
  const wallet = mock<Pick<Wallet, 'signData'>>('Wallet', {
    signData: async (data: string, _options: SignDataOptions): Promise<Signature> => {
      requests += 1
      if (requests <= refusals) throw new Error('user declined')
      return { data, signature: '00'.repeat(64), verifyingKey: VERIFYING_KEY }
    },
  })
  return { wallet, requests: () => requests }
}

describe('the login query as the page observes it', () => {
  test('a refusal is reported once, without a retry, and a retry asks the wallet again', async () => {
    const { wallet, requests } = walletRefusing(1)
    const client = new QueryClient()
    const observer = new QueryObserver(client, walletLoginQueryOptions(wallet, NETWORK_ID, 0))
    const unsubscribe = observer.subscribe(() => undefined)
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().status).toBe('error')
    })
    expect(requests()).toBe(1)
    const refused = observer.getCurrentResult()
    expect(loginStatusOf(true, refused.status)).toBe('refused')
    expect(refused.error?.message).toBe('user declined')

    await observer.refetch()
    const signed = observer.getCurrentResult()
    expect(loginStatusOf(true, signed.status)).toBe('signed')
    expect(signed.data?.verifyingKey).toBe(VERIFYING_KEY)
    expect(requests()).toBe(2)
    unsubscribe()
  })

  test('a wallet that signs is signing until it answers, and the signed login is kept', async () => {
    const { wallet, requests } = walletRefusing(0)
    const client = new QueryClient()
    const observer = new QueryObserver(client, walletLoginQueryOptions(wallet, NETWORK_ID, 0))
    const unsubscribe = observer.subscribe(() => undefined)
    expect(loginStatusOf(true, observer.getCurrentResult().status)).toBe('signing')
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().status).toBe('success')
    })
    expect(requests()).toBe(1)
    unsubscribe()
  })

  test('without a wallet the query is skipped and the login is none', () => {
    const client = new QueryClient()
    const observer = new QueryObserver(client, walletLoginQueryOptions(null, NETWORK_ID, 0))
    expect(observer.getCurrentResult().status).toBe('pending')
    expect(loginStatusOf(false, observer.getCurrentResult().status)).toBe('none')
  })
})

describe('loginBlockerOf', () => {
  test.each<{ status: LoginStatus; error: string | null; expected: string | null }>([
    { status: 'none', error: null, expected: 'Connect a Midnight wallet to swap.' },
    { status: 'signing', error: null, expected: 'Sign the login in your wallet to swap.' },
    {
      status: 'refused',
      error: 'user declined',
      expected: 'The wallet refused the login: user declined',
    },
    { status: 'refused', error: null, expected: 'The wallet refused the login' },
    { status: 'signed', error: null, expected: null },
  ])('$status reads as $expected', ({ status, error, expected }) => {
    expect(loginBlockerOf(status, error, 'to swap')).toBe(expected)
  })
})
