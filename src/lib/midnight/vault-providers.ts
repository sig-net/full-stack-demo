import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { createVaultPrivateStateProvider } from './vault-private-state';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';

import { createCrossContractProofServerProvider } from './seedlib';
import type { Wallet } from './wallet/Wallet';
import {
  Contract,
  witnesses,
  createVaultPrivateState,
  VAULT_PRIVATE_STATE_ID,
  type VaultProviders,
  type VaultCircuitId,
  type VaultPrivateState,
  type VaultPrivateStateId,
  type DeployedVaultContract,
} from '@sig-net/midnight-examples-erc20-vault-contract';
import type { MidnightNodeConfig } from '../config/midnight';
import {
  SIGNET_ZK_MANIFEST_SHA256,
  VAULT_ZK_MANIFEST_SHA256,
} from './zk-manifest-hashes';

export { VAULT_PRIVATE_STATE_ID };

export type VaultBalanceSource = {
  shielded: Wallet['getShieldedBalances'];
  unshielded: Wallet['getUnshieldedBalances'];
  dust: Wallet['getDustBalance'];
};

export type AppVaultProviders = VaultProviders & {
  privateStateProvider: ReturnType<typeof createVaultPrivateStateProvider>;
  publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  balancesSource: VaultBalanceSource;
};

// Concurrent proof consumers share one retained key per root to bound large artefact memory.
class CachingZkConfigProvider<
  K extends string,
> extends FetchZkConfigProvider<K> {
  private lastCircuitId?: string;
  private lastProverKey?: Promise<
    Awaited<ReturnType<FetchZkConfigProvider<K>['getProverKey']>>
  >;

  override getProverKey(circuitId: K) {
    if (this.lastCircuitId !== circuitId || !this.lastProverKey) {
      this.lastCircuitId = circuitId;
      const request = super.getProverKey(circuitId).catch(e => {
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

export function buildVaultProviders(
  wallet: Wallet,
  cfg: MidnightNodeConfig,
  zkOrigin: string,
): AppVaultProviders {
  // Each origin's manifest is pinned to the hash `yarn zk-assets` printed, so a tampered origin
  // cannot certify its own artefacts by rewriting the manifest it serves beside them.
  type ZkOptions = ConstructorParameters<
    typeof FetchZkConfigProvider<string>
  >[1];
  const zkOpts = (expectedManifestHash: string): ZkOptions => ({
    fetchFunc: fetch.bind(window),
    verify: 'require',
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
    proofProvider: createCrossContractProofServerProvider(cfg.proofServerUrl, [
      vaultZk,
      signetZk,
    ]),
    publicDataProvider: indexerPublicDataProvider({
      queryURL: cfg.indexerUrl,
      subscriptionURL: cfg.indexerWsUrl,
    }),
    balancesSource: {
      shielded: () => wallet.getShieldedBalances(),
      unshielded: () => wallet.getUnshieldedBalances(),
      dust: () => wallet.getDustBalance(),
    },
    walletProvider: wallet,
    midnightProvider: wallet,
  };
}

export async function joinVault(
  providers: VaultProviders,
  contractAddress: string,
  secretKey: Uint8Array,
  zkOrigin: string,
): Promise<DeployedVaultContract> {
  const vaultCompiledContract = CompiledContract.make<
    Contract<VaultPrivateState>
  >('erc20-vault', Contract).pipe(
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
