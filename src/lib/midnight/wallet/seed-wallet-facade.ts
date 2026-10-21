import type {
  MidnightProvider,
  UnboundTransaction,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js/types'
import * as ledger from '@midnightntwrk/ledger-v9'
import { bytesToHex, hexToBytes as sigNetHexToBytes } from '@sig-net/midnight'
import {
  InMemoryTransactionHistoryStorage,
  SerializedTransaction,
} from '@midnightntwrk/wallet-sdk-abstractions'
import { type DefaultDustConfiguration, DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet'
import type { SyncService } from '@midnightntwrk/wallet-sdk-dust-wallet/v1'
import {
  mergeWalletEntries,
  WalletEntrySchema,
  WalletFacade,
} from '@midnightntwrk/wallet-sdk-facade'
import { HDWallet, Roles } from '@midnightntwrk/wallet-sdk-hd'
import {
  makeConfig,
  NodeClient,
  PolkadotNodeClient,
  type SubmissionEvent,
} from '@midnightntwrk/wallet-sdk-node-client/effect'
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded'
import {
  createKeystore,
  PublicKey as UnshieldedPublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from '@midnightntwrk/wallet-sdk-unshielded-wallet'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { Cause, Effect, Runtime } from 'effect'

import type { MidnightNetworkConfig, MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  type WalletSyncProgress,
  walletSyncProgress,
} from '@/lib/midnight/wallet/wallet-sync-progress'

export type { WalletFacade } from '@midnightntwrk/wallet-sdk-facade'

/** The live key material for one account, reused for signing and balancing. */
export interface AccountKeys {
  readonly shieldedSecretKeys: ledger.ZswapSecretKeys
  readonly dustSecretKey: ledger.DustSecretKey
  readonly unshieldedKeystore: UnshieldedKeystore
}

// The wallet SDK prices a proof-erased transaction while the node prices real proof bytes, so
// the overhead keeps balanced transactions clear of BalanceCheckOverspend.
const COST_PARAMETERS = {
  additionalFeeOverhead: 50_000_000_000_000n,
  feeBlocksMargin: 5,
}

const NODE_CONNECT_TIMEOUT_MS = 120_000

/**
 * Indexer events a shielded or DUST wallet applies per batch, by the runtime that syncs it. A batch
 * runs without yielding, so the browser's size bounds how long the page stalls: a full Stagenet
 * sync in the page took 96 s with stalls up to about 200 ms at 100, against 232 s with stalls up to
 * about 70 ms at the SDK's default of 10.
 */
export const SYNC_BATCH_SIZES = { browser: 100, server: 1000 } as const

function hexToBytes(hex: string): Uint8Array {
  const compact = hex.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2 !== 0) {
    throw new Error('Seed must be hex.')
  }
  return Uint8Array.from(compact.matchAll(/.{2}/g), (match) => parseInt(match[0], 16))
}

/**
 * Derives the account-zero keys retained by one wallet session and clears the HD derivation state.
 *
 * @param seed - Hex seed supplied through the transient connection form.
 * @param networkId - Network encoding for the unshielded keystore.
 * @returns Keys for shielded balances, dust and unshielded signing.
 * @throws {Error} If seed parsing or role derivation fails.
 */
export function deriveAccountKeys(seed: string, networkId: MidnightNetworkId): AccountKeys {
  const hd = HDWallet.fromSeed(hexToBytes(seed))
  if (hd.type !== 'seedOk') throw new Error('HDWallet.fromSeed failed (seedError).')

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0)
  if (derived.type !== 'keysDerived') throw new Error('deriveKeysAt failed (keyOutOfBounds).')
  hd.hdWallet.clear()

  return {
    shieldedSecretKeys: ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]),
    dustSecretKey: ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]),
    unshieldedKeystore: createKeystore(
      { kind: 'schnorr', secret: derived.keys[Roles.NightExternal] },
      networkId,
    ),
  }
}

/**
 * Owns each submission transport until completion or wallet teardown, including pending connection.
 *
 * @param keys - Memory-owned account capabilities.
 * @param config - Validated endpoints captured by the wallet generation.
 * @param syncBatchSize - Indexer events the shielded and DUST wallets apply per batch.
 * @returns The facade whose owner starts synchronisation and closes it on disposal.
 */
export function initialiseWalletFacade(
  keys: AccountKeys,
  config: MidnightNetworkConfig,
  syncBatchSize: number,
): Promise<WalletFacade> {
  return WalletFacade.init({
    configuration: {
      networkId: config.networkId,
      indexerClientConnection: {
        indexerHttpUrl: config.indexerURL,
        indexerWsUrl: config.indexerWsURL,
      },
      provingServerUrl: new URL(config.proofServerURL),
      // The facade talks to the node over WebSocket, so http(s) becomes ws(s).
      relayURL: new URL(config.nodeURL.replace(/^http/, 'ws')),
      costParameters: COST_PARAMETERS,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
        mergeWalletEntries,
      ),
    },
    // The SDK's node client disconnects after reading metadata and races its first submission, so
    // each submission owns one connection for its whole lifetime.
    submissionService: (cfg) => {
      let closed = false
      let closing: Promise<void> | undefined
      const pending = new Map<AbortController, () => Promise<void>>()
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.Cases.Submitted['_tag'],
      ): Promise<SubmissionEvent.Cases.Submitted>
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.Cases.InBlock['_tag'],
      ): Promise<SubmissionEvent.Cases.InBlock>
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.Cases.Finalized['_tag'],
      ): Promise<SubmissionEvent.Cases.Finalized>
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
      ): Promise<SubmissionEvent.Cases.InBlock>
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus?: SubmissionEvent.SubmissionEvent['_tag'],
      ): Promise<SubmissionEvent.SubmissionEvent>
      async function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.SubmissionEvent['_tag'] = 'InBlock',
      ): Promise<SubmissionEvent.SubmissionEvent> {
        if (closed) throw new Error('Wallet disconnected.')
        const abort = new AbortController()
        const provider = new WsProvider(cfg.relayURL.toString(), false)
        const api = new ApiPromise({ provider, noInitWarn: true, throwOnConnect: true })
        let disconnecting: Promise<void> | undefined
        const disconnect = (): Promise<void> => (disconnecting ??= api.disconnect())
        pending.set(abort, disconnect)
        const timer = setTimeout(() => {
          abort.abort()
        }, NODE_CONNECT_TIMEOUT_MS)
        try {
          await Effect.runPromise(
            Effect.tryPromise(async () => {
              await provider.connect()
              await api.isReadyOrError
            }),
            { signal: abort.signal },
          )
          clearTimeout(timer)
          if (closed) throw new Error('Wallet disconnected.')
          const client = new PolkadotNodeClient(makeConfig({ nodeURL: cfg.relayURL }), api)
          const submission = NodeClient.sendMidnightTransactionAndWait(
            SerializedTransaction.from(transaction),
            waitForStatus,
          )
          return await Effect.runPromise(
            Effect.provideService(submission, NodeClient.NodeClient, client),
            { signal: abort.signal },
          )
        } catch (error) {
          if (abort.signal.aborted) {
            throw new Error(
              closed
                ? 'Wallet disconnected.'
                : 'Midnight node connection timed out. Check the node endpoint and retry.',
              { cause: error },
            )
          }
          throw unwrapFiberFailure(error)
        } finally {
          clearTimeout(timer)
          await disconnect()
          pending.delete(abort)
        }
      }
      return {
        submitTransaction,
        close: () => {
          closed = true
          closing ??= Promise.all(
            [...pending].map(async ([abort, disconnect]) => {
              abort.abort()
              await disconnect()
            }),
          ).then(() => undefined)
          return closing
        },
      }
    },
    shielded: (cfg) =>
      ShieldedWallet({ ...cfg, batchUpdates: { size: syncBatchSize } }).startWithSecretKeys(
        keys.shieldedSecretKeys,
      ),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        UnshieldedPublicKey.fromKeyStore(keys.unshieldedKeystore),
      ),
    dust: (cfg) => {
      // DustWallet's declared configuration omits the sync fields its default sync reads.
      const dustConfiguration: DefaultDustConfiguration & SyncService.DefaultSyncConfiguration = {
        ...cfg,
        batchUpdates: { size: syncBatchSize },
      }
      return DustWallet(dustConfiguration).startWithSecretKey(
        keys.dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      )
    },
  })
}

/** Starts a facade over the keys and resolves once it has synced with the chain, which can take minutes on a long chain. */
export async function startSyncedSeedFacade(
  keys: AccountKeys,
  config: MidnightNetworkConfig,
  syncBatchSize: number,
  onProgress: (progress: WalletSyncProgress) => void = () => undefined,
): Promise<WalletFacade> {
  const facade = await initialiseWalletFacade(keys, config, syncBatchSize)
  await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey)
  const subscription = facade.state().subscribe((state) => {
    onProgress(walletSyncProgress(state))
  })
  try {
    await facade.waitForSyncedState()
  } finally {
    subscription.unsubscribe()
  }
  return facade
}

/**
 * The failure an Effect fibre failure wraps, whose own cause chain carries the node's reason
 * for a rejection, or the error itself when it is not a fibre failure.
 */
function unwrapFiberFailure(error: unknown): unknown {
  return Runtime.isFiberFailure(error) ? Cause.squash(error[Runtime.FiberFailureCauseId]) : error
}

// Balancing recipes expire 30 minutes out.
const BALANCE_TTL_MS = 30 * 60 * 1000

/**
 * Balances with a bounded recipe lifetime and signs with the same account used for submission.
 *
 * @param facade - Started wallet facade owned by the calling session.
 * @param keys - Signing and balancing keys paired with that facade.
 * @returns SDK transaction capabilities for provider composition.
 */
export function createWalletAndMidnightProvider(
  facade: WalletFacade,
  keys: AccountKeys,
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey: () => keys.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => keys.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: UnboundTransaction, ttl?: Date): ReturnType<WalletProvider['balanceTx']> {
      const recipe = await facade.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: keys.shieldedSecretKeys, dustSecretKey: keys.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + BALANCE_TTL_MS) },
      )
      const signed = await facade.signRecipe(recipe, keys.unshieldedKeystore.signDataAsync)
      return await facade.finalizeRecipe(signed)
    },
    submitTx: (tx) => facade.submitTransaction(tx),
  }
}

/**
 * Balances, signs and finalises the unbound bytes of a proven call through the provider,
 * resolving with the finalised bytes, both in hex as the transaction resource carries them.
 */
export async function finalizeUnboundTransaction(
  provider: WalletProvider,
  unboundTx: string,
): Promise<string> {
  const finalized = await provider.balanceTx(unboundTransactionOf(unboundTx))
  return bytesToHex(finalized.serialize())
}

/** Releases the coins a finalised transaction holds as pending, for bytes that will not be submitted. */
export function releaseFinalizedTransaction(
  facade: WalletFacade,
  finalizedTx: string,
): Promise<void> {
  return facade.revertTransaction(
    ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.Binding>(
      'signature',
      'proof',
      'binding',
      sigNetHexToBytes(finalizedTx),
    ),
  )
}

function unboundTransactionOf(unboundTx: string): UnboundTransaction {
  return ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.PreBinding>(
    'signature',
    'proof',
    'pre-binding',
    sigNetHexToBytes(unboundTx),
  )
}
