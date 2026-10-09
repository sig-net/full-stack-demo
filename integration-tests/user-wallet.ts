import {
  DustSecretKey,
  LedgerParameters,
  type PreBinding,
  type Proof,
  type SignatureEnabled,
  Transaction,
  ZswapSecretKeys,
} from '@midnightntwrk/ledger-v9'
import { InMemoryTransactionHistoryStorage } from '@midnightntwrk/wallet-sdk-abstractions'
import { DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet'
import {
  mergeWalletEntries,
  WalletEntrySchema,
  WalletFacade,
} from '@midnightntwrk/wallet-sdk-facade'
import { HDWallet, Roles } from '@midnightntwrk/wallet-sdk-hd'
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded'
import {
  createKeystore,
  PublicKey as UnshieldedPublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from '@midnightntwrk/wallet-sdk-unshielded-wallet'

import type { MidnightNetworkConfig, MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/** The user's wallet as the browser plays it: it balances, signs and finalises the caller's calls. */
export interface UserWallet {
  readonly publicKeys: WalletPublicKeys
  /** The finalized bytes in hex of the unbound bytes in hex, as `submitTransaction` takes them. */
  balance(unboundTx: string): Promise<string>
  stop(): Promise<void>
}

/**
 * Starts and syncs the user wallet over the stack's indexer, node and proof server, configured as
 * the application's seed wallet is. The boundary rule keeps that module out of a test, so this
 * builds the same facade from the SDK packages.
 */
export async function startUserWallet(
  seedHex: string,
  config: MidnightNetworkConfig,
): Promise<UserWallet> {
  const keys = deriveKeys(seedHex, config.networkId)
  const facade = await WalletFacade.init({
    configuration: {
      networkId: config.networkId,
      indexerClientConnection: {
        indexerHttpUrl: config.indexerURL,
        indexerWsUrl: config.indexerWsURL,
      },
      provingServerUrl: new URL(config.proofServerURL),
      relayURL: new URL(config.nodeURL.replace(/^http/, 'ws')),
      costParameters: COST_PARAMETERS,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
        mergeWalletEntries,
      ),
    },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(keys.shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        UnshieldedPublicKey.fromKeyStore(keys.unshieldedKeystore),
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        keys.dustSecretKey,
        LedgerParameters.initialParameters().dust,
      ),
  })
  await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey)
  await facade.waitForSyncedState()
  return {
    publicKeys: {
      coinPublicKey: keys.shieldedSecretKeys.coinPublicKey,
      encryptionPublicKey: keys.shieldedSecretKeys.encryptionPublicKey,
    },
    async balance(unboundTx: string): Promise<string> {
      const unbound = Transaction.deserialize<SignatureEnabled, Proof, PreBinding>(
        'signature',
        'proof',
        'pre-binding',
        Uint8Array.from(Buffer.from(unboundTx, 'hex')),
      )
      const recipe = await facade.balanceUnboundTransaction(
        unbound,
        { shieldedSecretKeys: keys.shieldedSecretKeys, dustSecretKey: keys.dustSecretKey },
        { ttl: new Date(Date.now() + BALANCE_TTL_MS) },
      )
      const signed = await facade.signRecipe(recipe, keys.unshieldedKeystore.signDataAsync)
      const finalized = await facade.finalizeRecipe(signed)
      return Buffer.from(finalized.serialize()).toString('hex')
    },
    stop: () => facade.stop(),
  }
}

/** The public keys of the user wallet's account zero, derived as the application's seed wallet derives them. */
export function userWalletPublicKeys(seedHex: string): WalletPublicKeys {
  const keys = ZswapSecretKeys.fromSeed(deriveRoleKeys(seedHex)[Roles.Zswap])
  return { coinPublicKey: keys.coinPublicKey, encryptionPublicKey: keys.encryptionPublicKey }
}

/** `MIDNIGHT_USER_SEED` from `.env.local`, the harness-funded user wallet of the stack. */
export function userWalletSeed(): string {
  const seed = process.env.MIDNIGHT_USER_SEED
  if (seed === undefined) throw new Error('MIDNIGHT_USER_SEED is required')
  return seed
}

/** The seed wallet's cost parameters: the SDK prices proof-erased bytes, the overhead covers the real proof. */
const COST_PARAMETERS = {
  additionalFeeOverhead: 50_000_000_000_000n,
  feeBlocksMargin: 5,
}

const BALANCE_TTL_MS = 30 * 60 * 1000

interface UserKeys {
  readonly shieldedSecretKeys: ZswapSecretKeys
  readonly dustSecretKey: DustSecretKey
  readonly unshieldedKeystore: UnshieldedKeystore
}

function deriveKeys(seedHex: string, networkId: MidnightNetworkId): UserKeys {
  const roleKeys = deriveRoleKeys(seedHex)
  return {
    shieldedSecretKeys: ZswapSecretKeys.fromSeed(roleKeys[Roles.Zswap]),
    dustSecretKey: DustSecretKey.fromSeed(roleKeys[Roles.Dust]),
    unshieldedKeystore: createKeystore(
      { kind: 'schnorr', secret: roleKeys[Roles.NightExternal] },
      networkId,
    ),
  }
}

/** The three role keys of account zero, as the application's seed wallet derives them. */
type RoleKeys = Record<
  typeof Roles.Zswap | typeof Roles.NightExternal | typeof Roles.Dust,
  Uint8Array
>

function deriveRoleKeys(seedHex: string): RoleKeys {
  const hd = HDWallet.fromSeed(Uint8Array.from(Buffer.from(seedHex.replace(/^0x/i, ''), 'hex')))
  if (hd.type !== 'seedOk') throw new Error('HDWallet.fromSeed failed (seedError).')
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0)
  if (derived.type !== 'keysDerived') throw new Error('deriveKeysAt failed (keyOutOfBounds).')
  hd.hdWallet.clear()
  return derived.keys
}
