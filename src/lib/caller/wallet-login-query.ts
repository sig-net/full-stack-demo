import { type QueryFunction, type SkipToken, skipToken } from '@tanstack/query-core'

import { type CallerLogin, loginWithWallet } from '@/lib/caller/wallet-login'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * The page's login query: one signing per wallet generation, never retried on its own (a
 * refusal is the user's to retry), and dropped the moment the wallet it was signed with goes.
 * Built on the query core alone, so a test observes it without React.
 */
export function walletLoginQueryOptions(
  wallet: Pick<Wallet, 'signData'> | null,
  networkId: MidnightNetworkId,
  generation: number,
) {
  const queryKey: LoginQueryKey = ['wallet-login', networkId, generation]
  const queryFn: QueryFunction<CallerLogin, LoginQueryKey> | SkipToken =
    wallet === null ? skipToken : () => loginWithWallet(wallet, networkId)
  return {
    queryKey,
    queryFn,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } as const
}

type LoginQueryKey = readonly ['wallet-login', MidnightNetworkId, number]

/** Where the login stands: no wallet, the wallet has still to sign, signed, or the wallet refused. */
export const LOGIN_STATUSES = ['none', 'signing', 'signed', 'refused'] as const

export type LoginStatus = (typeof LOGIN_STATUSES)[number]

export function loginStatusOf(
  walletConnected: boolean,
  queryStatus: 'pending' | 'error' | 'success',
): LoginStatus {
  if (!walletConnected) return 'none'
  return QUERY_LOGIN_STATUS[queryStatus]
}

const QUERY_LOGIN_STATUS = {
  pending: 'signing',
  success: 'signed',
  error: 'refused',
} as const satisfies Record<'pending' | 'error' | 'success', LoginStatus>

/**
 * Why an action gated on the login cannot run, with `action` completing the sentence (`to
 * swap`, `first`), or null once the caller is signed in.
 */
export function loginBlockerOf(
  status: LoginStatus,
  error: string | null,
  action: string,
): string | null {
  return LOGIN_BLOCKER_BY_STATUS[status](error, action)
}

const LOGIN_BLOCKER_BY_STATUS: Record<
  LoginStatus,
  (error: string | null, action: string) => string | null
> = {
  signed: () => null,
  none: (_error, action) => `Connect a Midnight wallet ${action}.`,
  signing: (_error, action) => `Sign the login in your wallet ${action}.`,
  refused: (error) => `The wallet refused the login${error === null ? '' : `: ${error}`}`,
}
