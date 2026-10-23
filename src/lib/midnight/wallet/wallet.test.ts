import type { WalletConnectedAPI } from '@midnight-ntwrk/dapp-connector-api'
import { describe, expectTypeOf, test } from 'vitest'

import type { Wallet, WalletConnectorMethod } from '@/lib/midnight/wallet/wallet'

/**
 * A member of `Wallet` that a browser wallet extension cannot serve through the DApp connector
 * API blocks the move to the extensions, so the type check refuses one here: `yarn typecheck`
 * fails on these assertions before any test runs. Adding a connector method means declaring it
 * in `WalletConnectorMethods` as the connector declares it and adding its name to the pinned set
 * below, and adding anything else means naming the connector read it comes from in
 * `PageOwnedMember`.
 */
describe('Wallet is a subset of the DApp connector API', () => {
  /** Every member that is not a connector method, with the connector read it is taken from. */
  type PageOwnedMember =
    | 'kind' // the application's own wallet kind
    | 'name' // `InitialAPI.name`
    | 'addresses' // `getShieldedAddresses`, `getUnshieldedAddress` and `getDustAddress`
    | 'publicKeys' // `getShieldedAddresses`, decoded from Bech32m
    | 'disconnect' // drops the page's references, the extension owns the connection

  test('the picked connector methods are non-empty and exactly the ones the page calls', () => {
    expectTypeOf<WalletConnectorMethod>().toEqualTypeOf<
      | 'getShieldedBalances'
      | 'getUnshieldedBalances'
      | 'getDustBalance'
      | 'balanceUnsealedTransaction'
    >()
  })

  test('every connector method is declared with the connector signature', () => {
    expectTypeOf<Pick<Wallet, WalletConnectorMethod>>().toEqualTypeOf<
      Pick<WalletConnectedAPI, WalletConnectorMethod>
    >()
  })

  test('no member exists outside the connector methods and the page-owned reads', () => {
    expectTypeOf<
      Exclude<keyof Wallet, WalletConnectorMethod | PageOwnedMember>
    >().toEqualTypeOf<never>()
  })
})
