import {
  createProofProvider,
  type MidnightProvider,
  type ProofProvider,
  type UnboundTransaction,
  type WalletProvider,
  type ZKConfigProvider,
  ZKConfigRegistry,
  zkConfigToProvingKeyMaterial,
} from "@midnight-ntwrk/midnight-js/types";
import { httpClientProvingProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import type { ProvingKeyMaterial, ProvingProvider } from "@midnightntwrk/ledger-v9";
import * as ledger from "@midnightntwrk/ledger-v9";
import { SerializedTransaction } from "@midnightntwrk/wallet-sdk-abstractions";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import {
  mergeWalletEntries,
  WalletEntrySchema,
  WalletFacade,
} from "@midnightntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import {
  makeConfig,
  NodeClient,
  PolkadotNodeClient,
  type SubmissionEvent,
} from "@midnightntwrk/wallet-sdk-node-client/effect";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  PublicKey as UnshieldedPublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Effect } from "effect";

export type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";

import type { MidnightNodeConfig, NetworkId } from "../config/runtime";

/** The live key material for one account. Reused for signing / balancing. */
export interface AccountKeys {
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

// Fee overhead: the wallet sdk prices a proof-erased tx while the node prices
// real proof bytes. The overhead prevents BalanceCheckOverspend.
const COST_PARAMETERS = {
  additionalFeeOverhead: 50_000_000_000_000n,
  feeBlocksMargin: 5,
};

const hexToBytes = (hex: string): Uint8Array => {
  const compact = hex.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2 !== 0) {
    throw new Error("Seed must be hex.");
  }
  return Uint8Array.from(compact.matchAll(/.{2}/g), (match) => parseInt(match[0], 16));
};

/**
 * Derives the account-zero keys retained by one wallet session and clears the HD derivation state.
 *
 * @param seed - Hex seed supplied through the transient connection form.
 * @param networkId - Network encoding for the unshielded keystore.
 * @returns Keys for shielded balances, dust and unshielded signing.
 * @throws {Error} If seed parsing or role derivation fails.
 */
export function deriveAccountKeys(seed: string, networkId: NetworkId): AccountKeys {
  const hd = HDWallet.fromSeed(hexToBytes(seed));
  if (hd.type !== "seedOk") throw new Error("HDWallet.fromSeed failed (seedError).");

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") throw new Error("deriveKeysAt failed (keyOutOfBounds).");
  hd.hdWallet.clear();

  return {
    shieldedSecretKeys: ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]),
    dustSecretKey: ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]),
    unshieldedKeystore: createKeystore(
      { kind: "schnorr", secret: derived.keys[Roles.NightExternal] },
      networkId,
    ),
  };
}

/**
 * Owns each submission transport until completion or wallet teardown, including pending connection.
 *
 * @param keys - Memory-owned account capabilities.
 * @param config - Validated endpoints captured by the wallet generation.
 * @returns The facade whose owner starts synchronisation and closes it on disposal.
 */
export function initialiseWalletFacade(
  keys: AccountKeys,
  config: MidnightNodeConfig,
): Promise<WalletFacade> {
  return WalletFacade.init({
    configuration: {
      networkId: config.networkId,
      indexerClientConnection: {
        indexerHttpUrl: config.indexerUrl,
        indexerWsUrl: config.indexerWsUrl,
      },
      provingServerUrl: new URL(config.proofServerUrl),
      // The facade talks to the node over WebSocket, so flip http(s) -> ws(s).
      relayURL: new URL(config.nodeUrl.replace(/^http/, "ws")),
      costParameters: COST_PARAMETERS,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
        mergeWalletEntries,
      ),
    },
    // Node-client beta.2 disconnects after metadata and races its first submission.
    // Remove this transport ownership when its factory waits for a completed close.
    submissionService: (cfg) => {
      let closed = false;
      const isClosed = (): boolean => closed;
      let closing: Promise<void> | undefined;
      const pending = new Map<AbortController, () => Promise<void>>();
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.Cases.Submitted["_tag"],
      ): Promise<SubmissionEvent.Cases.Submitted>;
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.Cases.InBlock["_tag"],
      ): Promise<SubmissionEvent.Cases.InBlock>;
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.Cases.Finalized["_tag"],
      ): Promise<SubmissionEvent.Cases.Finalized>;
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
      ): Promise<SubmissionEvent.Cases.InBlock>;
      function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus?: SubmissionEvent.SubmissionEvent["_tag"],
      ): Promise<SubmissionEvent.SubmissionEvent>;
      async function submitTransaction(
        transaction: ledger.FinalizedTransaction,
        waitForStatus: SubmissionEvent.SubmissionEvent["_tag"] = "InBlock",
      ): Promise<SubmissionEvent.SubmissionEvent> {
        if (isClosed()) throw new Error("Wallet disconnected.");
        const abort = new AbortController();
        const provider = new WsProvider(cfg.relayURL.toString(), false);
        const api = new ApiPromise({ provider, noInitWarn: true, throwOnConnect: true });
        let disconnecting: Promise<void> | undefined;
        const disconnect = (): Promise<void> => (disconnecting ??= api.disconnect());
        pending.set(abort, disconnect);
        const timer = setTimeout(() => {
          abort.abort();
        }, 120_000);
        try {
          await Effect.runPromise(
            Effect.tryPromise(async () => {
              await provider.connect();
              await api.isReadyOrError;
            }),
            { signal: abort.signal },
          );
          clearTimeout(timer);
          if (isClosed()) throw new Error("Wallet disconnected.");
          const client = new PolkadotNodeClient(makeConfig({ nodeURL: cfg.relayURL }), api);
          return await Effect.runPromise(
            NodeClient.sendMidnightTransactionAndWait(
              SerializedTransaction.from(transaction),
              waitForStatus,
            ).pipe(Effect.provideService(NodeClient.NodeClient, client)),
            { signal: abort.signal },
          );
        } catch (error) {
          if (abort.signal.aborted)
            throw new Error(
              closed
                ? "Wallet disconnected."
                : "Midnight node connection timed out. Check local services and retry.",
            );
          throw error;
        } finally {
          clearTimeout(timer);
          await disconnect();
          pending.delete(abort);
        }
      }
      return {
        submitTransaction,
        close: () => {
          closed = true;
          closing ??= Promise.all(
            [...pending].map(async ([abort, disconnect]) => {
              abort.abort();
              await disconnect();
            }),
          ).then(() => undefined);
          return closing;
        },
      };
    },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(keys.shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        UnshieldedPublicKey.fromKeyStore(keys.unshieldedKeystore),
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        keys.dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });
}

// Balancing recipes expire 30 min out.
const BALANCE_TTL_MS = 30 * 60 * 1000;

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
    async balanceTx(tx: UnboundTransaction, ttl?: Date): ReturnType<WalletProvider["balanceTx"]> {
      const recipe = await facade.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: keys.shieldedSecretKeys, dustSecretKey: keys.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + BALANCE_TTL_MS) },
      );
      const signed = await facade.signRecipe(recipe, keys.unshieldedKeystore.signDataAsync);
      return await facade.finalizeRecipe(signed);
    },
    submitTx: (tx) => facade.submitTransaction(tx),
  };
}

/**
 * Resolves prover keys across the registered contract roots, including ledger key-location lookup.
 *
 * @param proofServerUrl - Captured proof server endpoint.
 * @param zkConfigProviders - Verified roots needed by the complete cross-contract call tree.
 * @returns Proof capability with a timeout suitable for cross-contract proving.
 */
export function createCrossContractProofServerProvider(
  proofServerUrl: string,
  zkConfigProviders: readonly ZKConfigProvider<string>[],
): ProofProvider {
  const registry = new ZKConfigRegistry([...zkConfigProviders]);
  const base = httpClientProvingProvider(proofServerUrl, registry, { timeout: 15 * 60 * 1000 });
  const lookupKey = async (keyLocation: string): Promise<ProvingKeyMaterial | undefined> => {
    const resolved = await registry.resolveKeyLocation(keyLocation);
    if (resolved !== undefined) return zkConfigToProvingKeyMaterial(resolved);
    // Bare circuit names: try each provider. Protocol builtins resolve undefined.
    for (const provider of zkConfigProviders) {
      try {
        return zkConfigToProvingKeyMaterial(await provider.get(keyLocation));
      } catch {
        /* try next */
      }
    }
    return undefined;
  };
  const provingProvider: ProvingProvider = { ...base, lookupKey };
  return createProofProvider(provingProvider);
}
