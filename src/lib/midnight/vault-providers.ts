import * as CompiledContract from "@midnight-ntwrk/compact-js/effect/CompiledContract";
import type { Contract as CompactContract } from "@midnight-ntwrk/compact-js/effect/Contract";
import type { FinalizedCallTxData } from "@midnight-ntwrk/midnight-js/contracts";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import {
  type IndexerPublicDataProvider,
  indexerPublicDataProvider,
} from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  Contract,
  createVaultPrivateState,
  type DeployedVaultContract,
  VAULT_PRIVATE_STATE_ID,
  type VaultCircuitId,
  type VaultPrivateState,
  type VaultPrivateStateId,
  type VaultProviders,
  witnesses,
} from "@sig-net/midnight-examples-erc20-vault-contract";

import type { MidnightNodeConfig } from "../config/midnight";
import { createCrossContractProofServerProvider } from "./seedlib";
import { createVaultPrivateStateProvider } from "./vault-private-state";
import type { Wallet } from "./wallet/Wallet";
import { SIGNET_ZK_MANIFEST_SHA256, VAULT_ZK_MANIFEST_SHA256 } from "./zk-manifest-hashes";

export { VAULT_PRIVATE_STATE_ID };

/** Reads wallet balances through the same generation guard as contract operations. */
export interface VaultBalanceSource {
  shielded: Wallet["getShieldedBalances"];
  unshielded: Wallet["getUnshieldedBalances"];
  dust: Wallet["getDustBalance"];
}

/** Combines SDK capabilities with resource teardown and the captured wallet balance source. */
export type AppVaultProviders = VaultProviders & {
  privateStateProvider: ReturnType<typeof createVaultPrivateStateProvider>;
  publicDataProvider: VaultProviders["publicDataProvider"] &
    Pick<IndexerPublicDataProvider, "dispose">;
  balancesSource: VaultBalanceSource;
};

/** Session calls each submit one circuit transaction and return its finalised data. */
export type StandaloneVaultContract = Omit<DeployedVaultContract, "callTx"> & {
  readonly callTx: {
    [Circuit in VaultCircuitId]: (
      ...args: CompactContract.CircuitParameters<Contract<VaultPrivateState>, Circuit>
    ) => Promise<FinalizedCallTxData<Contract<VaultPrivateState>, Circuit>>;
  };
};

// Concurrent proof consumers share one retained key per root to bound large artefact memory.
class CachingZkConfigProvider<K extends string> extends FetchZkConfigProvider<K> {
  private lastCircuitId?: string;
  private lastProverKey?: Promise<Awaited<ReturnType<FetchZkConfigProvider<K>["getProverKey"]>>>;

  override getProverKey(circuitId: K): ReturnType<FetchZkConfigProvider<K>["getProverKey"]> {
    if (this.lastCircuitId !== circuitId || !this.lastProverKey) {
      this.lastCircuitId = circuitId;
      const request = super.getProverKey(circuitId).catch((e: unknown) => {
        if (this.lastProverKey === request) {
          this.lastCircuitId = undefined;
          this.lastProverKey = undefined;
        }
        throw e;
      });
      this.lastProverKey = request;
    }
    return this.lastProverKey;
  }
}

/**
 * Captures wallet transaction capabilities and pins each proving origin to its verified manifest.
 *
 * @param wallet - Wallet whose session owns signing and balances.
 * @param cfg - Validated public Midnight endpoints.
 * @param zkOrigin - Vault asset origin with its Signet child origin.
 * @returns Providers whose transport and private-state resources require session disposal.
 * @throws {Error} If the wallet has no transaction capability.
 */
export function buildVaultProviders(
  wallet: Wallet,
  cfg: MidnightNodeConfig,
  zkOrigin: string,
): AppVaultProviders {
  const transactions = wallet.transactions;
  if (!transactions)
    throw new Error(
      wallet.transactionUnavailable ?? "Vault transactions are unavailable for this wallet.",
    );
  /** Pins each origin independently so a replacement manifest cannot certify itself. */
  type ZkOptions = ConstructorParameters<typeof FetchZkConfigProvider<string>>[1];
  const zkOpts = (expectedManifestHash: string): ZkOptions => ({
    fetchFunc: fetch.bind(window),
    verify: "require",
    expectedManifestHash,
  });
  const vaultZk = new CachingZkConfigProvider<VaultCircuitId>(
    zkOrigin,
    zkOpts(VAULT_ZK_MANIFEST_SHA256),
  );
  const signetZk = new CachingZkConfigProvider<string>(
    `${zkOrigin}/signet`,
    zkOpts(SIGNET_ZK_MANIFEST_SHA256),
  );

  return {
    privateStateProvider: createVaultPrivateStateProvider(),
    zkConfigProvider: vaultZk,
    proofProvider: createCrossContractProofServerProvider(cfg.proofServerUrl, [vaultZk, signetZk]),
    publicDataProvider: indexerPublicDataProvider({
      queryURL: cfg.indexerUrl,
      subscriptionURL: cfg.indexerWsUrl,
    }),
    balancesSource: {
      shielded: () => wallet.getShieldedBalances(),
      unshielded: () => wallet.getUnshieldedBalances(),
      dust: () => wallet.getDustBalance(),
    },
    walletProvider: transactions,
    midnightProvider: transactions,
  };
}

/**
 * Binds the generated contract to the captured deployment and session-owned private state.
 *
 * @param providers - Captured provider capabilities.
 * @param contractAddress - Deployment to bind.
 * @param secretKey - Session-owned secret retained in private state.
 * @param zkOrigin - Origin paired with the provider asset configuration.
 * @returns The generated deployed contract with authoritative circuit signatures.
 */
export async function joinVault(
  providers: VaultProviders,
  contractAddress: string,
  secretKey: Uint8Array,
  zkOrigin: string,
): Promise<DeployedVaultContract> {
  const vaultCompiledContract = CompiledContract.make<Contract<VaultPrivateState>>(
    "erc20-vault",
    Contract,
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkOrigin),
  );
  const privateStateId: VaultPrivateStateId = VAULT_PRIVATE_STATE_ID;
  return findDeployedContract(providers, {
    contractAddress,
    compiledContract: vaultCompiledContract,
    privateStateId,
    initialPrivateState: createVaultPrivateState(secretKey),
  });
}
