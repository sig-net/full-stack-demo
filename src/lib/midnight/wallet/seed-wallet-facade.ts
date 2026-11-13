import {
  createLedger9MidnightProvider,
  createLedger9WalletProvider,
  LedgerTransaction,
  type MidnightProvider,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js/types'
import * as ledger from '@midnightntwrk/ledger-v9'
import type { FacadeState } from '@midnightntwrk/wallet-sdk-facade'
import { bytesToHex, hexToBytes as sigNetHexToBytes } from '@sig-net/midnight'
import {
  type FinalizedTx,
  InMemoryTransactionHistoryStorage,
} from '@midnightntwrk/wallet-sdk-abstractions'
import { type DefaultDustConfiguration, DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet'
import type { SyncService } from '@midnightntwrk/wallet-sdk-dust-wallet/v1'
import {
  mergeWalletEntries,
  WalletEntrySchema,
  WalletFacade,
} from '@midnightntwrk/wallet-sdk-facade'
import { WalletSeeds } from '@midnightntwrk/wallet-sdk-hd'
import {
  NodeClient,
  NodeClientError,
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
import { Cause, Duration, Effect, Exit } from 'effect'

import type { MidnightNetworkConfig, MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  type WalletSyncProgress,
  walletSyncProgress,
} from '@/lib/midnight/wallet/wallet-sync-progress'

export type { WalletFacade } from '@midnightntwrk/wallet-sdk-facade'

/** The live key material for one account, reused for signing and balancing. */
export interface AccountKeys {
  /** The per-wallet seeds the facade starts from, as sensitive as the secret keys derived from them. */
  readonly seeds: WalletSeeds
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

const NODE_CONNECT_TIMEOUT = Duration.minutes(2)

/**
 * Indexer events a shielded or DUST wallet applies per batch, by the runtime that syncs it. A batch
 * runs without yielding, so the browser's size bounds how long the page stalls: a full sync of a
 * public test network in the page measured 96 s with stalls up to about 200 ms at 100, against
 * 232 s with stalls up to about 70 ms at the SDK's default of 10.
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
 * Derives the account-zero seeds and keys retained by one wallet session.
 *
 * @param seed - Hex seed supplied through the transient connection form.
 * @param networkId - Network encoding for the unshielded keystore.
 * @returns Seeds for starting the facade, and keys for shielded balances, dust and unshielded signing.
 * @throws {Error} If seed parsing or role derivation fails.
 */
export function deriveAccountKeys(seed: string, networkId: MidnightNetworkId): AccountKeys {
  const seeds = WalletSeeds.fromMasterSeed(hexToBytes(seed))
  return {
    seeds,
    shieldedSecretKeys: ledger.ZswapSecretKeys.fromSeed(seeds.shielded),
    dustSecretKey: ledger.DustSecretKey.fromSeed(seeds.dust),
    unshieldedKeystore: createKeystore({ kind: 'schnorr', secret: seeds.unshielded }, networkId),
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
    // Each submission owns one connection, bounded by NODE_CONNECT_TIMEOUT and closed with the
    // wallet, and rejects with the node client's own error, the node's reason in its cause chain.
    submissionService: (cfg) => {
      let closed = false
      let closing: Promise<void> | undefined
      const pending = new Map<AbortController, Promise<unknown>>()
      function submitTransaction(
        transaction: FinalizedTx,
        waitForStatus: SubmissionEvent.Cases.Submitted['_tag'],
      ): Promise<SubmissionEvent.Cases.Submitted>
      function submitTransaction(
        transaction: FinalizedTx,
        waitForStatus: SubmissionEvent.Cases.InBlock['_tag'],
      ): Promise<SubmissionEvent.Cases.InBlock>
      function submitTransaction(
        transaction: FinalizedTx,
        waitForStatus: SubmissionEvent.Cases.Finalized['_tag'],
      ): Promise<SubmissionEvent.Cases.Finalized>
      function submitTransaction(transaction: FinalizedTx): Promise<SubmissionEvent.Cases.InBlock>
      function submitTransaction(
        transaction: FinalizedTx,
        waitForStatus?: SubmissionEvent.SubmissionEvent['_tag'],
      ): Promise<SubmissionEvent.SubmissionEvent>
      async function submitTransaction(
        transaction: FinalizedTx,
        waitForStatus: SubmissionEvent.SubmissionEvent['_tag'] = 'InBlock',
      ): Promise<SubmissionEvent.SubmissionEvent> {
        if (closed) throw new Error(DISCONNECTED)
        const abort = new AbortController()
        const submission = Effect.runPromiseExit(
          Effect.scoped(
            Effect.flatMap(
              PolkadotNodeClient.make({
                nodeURL: cfg.relayURL,
                reconnectionTimeout: NODE_CONNECT_TIMEOUT,
              }),
              (client) =>
                Effect.provideService(
                  NodeClient.sendMidnightTransactionAndWait(transaction.serialize(), waitForStatus),
                  NodeClient.NodeClient,
                  client,
                ),
            ),
          ),
          { signal: abort.signal },
        )
        pending.set(abort, submission)
        try {
          const exit = await submission
          if (Exit.isSuccess(exit)) return exit.value
          const failure = Cause.squash(exit.cause)
          if (closed) throw new Error(DISCONNECTED, { cause: failure })
          if (failure instanceof NodeClientError.ConnectionError) {
            const message = 'Could not reach the Midnight node. Check the node endpoint and retry.'
            throw new Error(message, { cause: failure })
          }
          throw failure
        } finally {
          pending.delete(abort)
        }
      }
      return {
        submitTransaction,
        close: () => {
          closed = true
          closing ??= Promise.all(
            [...pending].map(([abort, submission]) => {
              abort.abort()
              return submission
            }),
          ).then(() => undefined)
          return closing
        },
      }
    },
    shielded: (cfg) =>
      ShieldedWallet({ ...cfg, batchUpdates: { size: syncBatchSize } }).startWithSeed(
        keys.seeds.shielded,
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
      return DustWallet(dustConfiguration).startWithSeed(
        keys.seeds.dust,
        ledger.LedgerParameters.initialParameters().dust,
      )
    },
  })
}

const DISCONNECTED = 'Wallet disconnected.'

/** Starts a facade over the keys and resolves once it has synced with the chain, which can take minutes on a long chain. */
export async function startSyncedSeedFacade(
  keys: AccountKeys,
  config: MidnightNetworkConfig,
  syncBatchSize: number,
  onProgress: (progress: WalletSyncProgress) => void = () => undefined,
): Promise<WalletFacade> {
  const facade = await initialiseWalletFacade(keys, config, syncBatchSize)
  await facade.start(keys.seeds)
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

// Balancing recipes expire 30 minutes out.
const BALANCE_TTL_MS = 30 * 60 * 1000

/**
 * Balances with a bounded recipe lifetime and signs with the same account used for submission.
 * Transactions cross between midnight-js and the facade as bytes, since each seals them in its own
 * handle type.
 *
 * @param facade - Started wallet facade owned by the calling session.
 * @param keys - Signing keys paired with that facade.
 * @returns SDK transaction capabilities for provider composition.
 */
export function createWalletAndMidnightProvider(
  facade: WalletFacade,
  keys: AccountKeys,
): WalletProvider & MidnightProvider {
  const walletProvider = createLedger9WalletProvider({
    getCoinPublicKey: () => keys.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => keys.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx, ttl) {
      const recipe = await facade.balanceUnboundTransaction(
        facade.adoptTransaction(tx.serialize(), 'Unbound'),
        { ttl: ttl ?? new Date(Date.now() + BALANCE_TTL_MS) },
      )
      const signed = await facade.signRecipe(recipe, keys.unshieldedKeystore.signDataAsync)
      return await facade.finalizeRecipe(signed)
    },
  })
  const midnightProvider = createLedger9MidnightProvider((tx) =>
    facade.submitTransaction(facade.adoptTransaction(tx.serialize(), 'Finalized')),
  )
  return {
    supportedEras: walletProvider.supportedEras,
    getCoinPublicKey: () => walletProvider.getCoinPublicKey(),
    getEncryptionPublicKey: () => walletProvider.getEncryptionPublicKey(),
    balanceTx: (tx, ttl) => walletProvider.balanceTx(tx, ttl),
    submitTx: (tx) => midnightProvider.submitTx(tx),
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

/**
 * The DUST every coin the wallet holds had generated at its latest synced block, in SPECK, the
 * coins a transaction in flight spends included. A spend takes its coin out of the spendable set
 * until the change lands, so a wallet holding one coin reads a spendable balance of 0 for a
 * transaction's whole flight, while this sum holds steady.
 */
export function totalDust(dust: FacadeState['dust']): bigint {
  return dust.totalCoins.reduce((sum, coin) => sum + coin.generatedNow, 0n)
}

function unboundTransactionOf(unboundTx: string): LedgerTransaction<'Unbound', 'v9'> {
  return LedgerTransaction.seal(
    'v9',
    'Unbound',
    ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.PreBinding>(
      'signature',
      'proof',
      'pre-binding',
      sigNetHexToBytes(unboundTx),
    ),
  )
}
