import type {
  Signature,
  SignDataOptions,
  WalletConnectedAPI,
} from '@midnight-ntwrk/dapp-connector-api'

/**
 * A connected Midnight wallet as the page uses it: a subset of what a browser wallet extension
 * serves through the DApp connector API (`WalletConnectedAPI` in
 * `@midnight-ntwrk/dapp-connector-api`). Each method is one of that type's, declared with its
 * signature unchanged, each field is read from one of its methods once at connection, and
 * `disconnect` drops only what the page holds. `wallet.test.ts` fails the type check on any
 * member outside that set and on any drift from the connector's signatures, since the
 * application moves to the extensions the moment they support its chain version and a member
 * they cannot serve would block the move.
 */
export interface Wallet extends WalletMetadata, WalletConnectorMethods {
  /** Read at connection from `getShieldedAddresses`, `getUnshieldedAddress` and `getDustAddress`. */
  readonly addresses: WalletAddresses
  /** The coin and encryption public keys of `getShieldedAddresses`, decoded from Bech32m to hex. */
  readonly publicKeys: WalletPublicKeys
  /** Drops the page's own references, since the extension owns the connection itself. */
  disconnect(): Promise<void>
}

/**
 * The connector methods the page calls, declared as the connector declares them:
 * `wallet.test.ts` holds this interface equal to `Pick<WalletConnectedAPI, WalletConnectorMethod>`.
 */
export interface WalletConnectorMethods {
  getShieldedBalances(): Promise<Record<string, bigint>>
  getUnshieldedBalances(): Promise<Record<string, bigint>>
  getDustBalance(): Promise<{ cap: bigint; balance: bigint }>
  balanceUnsealedTransaction(tx: string, options?: { payFees?: boolean }): Promise<{ tx: string }>
  signData(data: string, options: SignDataOptions): Promise<Signature>
}

export type WalletConnectorMethod = keyof WalletConnectorMethods

/** Display identity of a connected wallet: its kind, and the name the connector's `InitialAPI` carries. */
export interface WalletMetadata {
  readonly kind: WalletKind
  readonly name: string
}

/** The wallet implementations the application can connect. */
export const WALLET_KINDS = ['seed'] as const

export type WalletKind = (typeof WALLET_KINDS)[number]

/** The wallet's addresses in Bech32m, as the connector's three address reads answer them. */
export type WalletAddresses = Readonly<
  Pick<Awaited<ReturnType<WalletConnectedAPI['getShieldedAddresses']>>, 'shieldedAddress'> &
    Awaited<ReturnType<WalletConnectedAPI['getUnshieldedAddress']>> &
    Awaited<ReturnType<WalletConnectedAPI['getDustAddress']>>
>

/** The public keys of the wallet that balances a call and receives anything it mints, in hex. */
export interface WalletPublicKeys {
  readonly coinPublicKey: string
  readonly encryptionPublicKey: string
}
