/**
 * The browser's provider set for building and proving a deposit call: the indexer for the
 * vault's public state, the prover material fetched from the page's own origin, the proof server
 * and the vault's generated contract.
 */

import { CompiledContract } from '@midnight-ntwrk/compact-js/effect'
import type { ProofProvider } from '@midnight-ntwrk/midnight-js/types'
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider'
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider'
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider'
import {
  Contract,
  type VaultCircuitId,
  type VaultCompiledContract,
  type VaultPrivateState,
  witnesses,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import type { MidnightEthereumErc20VaultConfig } from '@/lib/config/midnight-ethereum-erc20-vault-config'
import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import {
  PROOF_TIMEOUT_MS,
  type VaultCallProviders,
  type VaultContract,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** The fetch provider verifies every artefact against the bundle's manifest under `zkAssetsURL`. */
export function depositCallProviders({
  midnightNetwork,
  vault,
  zkAssetsURL,
}: DepositCallProvidersArgs): DepositCallProviders {
  const zkConfigProvider = new FetchZkConfigProvider<VaultCircuitId>(zkAssetsURL)
  return {
    providers: {
      publicDataProvider: indexerPublicDataProvider({
        queryURL: midnightNetwork.indexerURL,
        subscriptionURL: midnightNetwork.indexerWsURL,
      }),
      zkConfigProvider,
      compiledContract: browserVaultContract(),
      vaultAddress: vault.contractAddress,
    },
    proofProvider: httpClientProofProvider({
      url: midnightNetwork.proofServerURL,
      zkConfigProvider,
      timeout: PROOF_TIMEOUT_MS,
    }),
  }
}

export interface DepositCallProvidersArgs {
  readonly midnightNetwork: MidnightNetworkConfig
  readonly vault: MidnightEthereumErc20VaultConfig
  /** The absolute http(s) URL the vault's prover key bundle is served under. */
  readonly zkAssetsURL: string
}

export interface DepositCallProviders {
  readonly providers: VaultCallProviders
  readonly proofProvider: ProofProvider
}

/** The path under the page's origin that `yarn zk-assets:public` copies the vault's bundle to. */
export const ZK_ASSETS_PUBLIC_PATH = '/zk-assets/ethereum-erc20-vault'

/**
 * The vault's generated contract bound to its witnesses and, since the compiled contract type
 * demands one, to the public path as its file-assets path, which nothing reads: the call builder
 * resolves prover material through the ZK config provider alone.
 */
function browserVaultContract(): VaultCompiledContract {
  return CompiledContract.make<VaultContract, VaultPrivateState>('erc20-vault', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS_PUBLIC_PATH),
  )
}
