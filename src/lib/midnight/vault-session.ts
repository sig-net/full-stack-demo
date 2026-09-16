import { queryOptions } from "@tanstack/react-query";

import type { MidnightNodeConfig } from "../config/runtime";
import type { Env, Identity, VaultSessionEnvironment } from "./vault";
import type { AppVaultProviders, StandaloneVaultContract } from "./vault-providers";
import type { Wallet } from "./wallet/Wallet";

/** Captures one generation so consumers cannot submit through a replaced signing session. */
export interface VaultBinding {
  sessionId: string;
  providers: AppVaultProviders;
  contract: StandaloneVaultContract;
  identity: Identity;
  environment: VaultSessionEnvironment;
  wallet: Wallet;
  depositAddress: string;
  vaultAddress: string;
  assertActive: () => void;
}

/**
 * Owns binding construction, retained secrets and transport teardown for one query generation.
 *
 * @param input - Captured wallet, deployment and generation check.
 * @param input.wallet - Connected wallet owning the transaction capability.
 * @param input.secret - Copied into generation-owned memory before construction.
 * @param input.configuration - Validated Midnight endpoints.
 * @param input.environment - Public contract and EVM configuration.
 * @param input.zkOrigin - Verified asset origin captured for this binding.
 * @param input.configurationRevision - Revision included in the query identity.
 * @param input.isCurrent - Checks ownership against the connection owner.
 * @returns Query options and idempotent disposal for this generation.
 */
export function createVaultSession(input: {
  wallet: Wallet;
  secret: Uint8Array;
  configuration: MidnightNodeConfig;
  environment: Env;
  zkOrigin: string;
  configurationRevision?: string;
  isCurrent: () => boolean;
}): {
  id: string;
  options: ReturnType<
    typeof queryOptions<VaultBinding, Error, VaultBinding, (string | undefined)[]>
  >;
  dispose: () => void;
  assertActive: () => void;
} {
  const { secret: suppliedSecret, ...settings } = input;
  const id = crypto.randomUUID();
  let disposed = false;
  let started = false;
  let resources: AppVaultProviders | null = null;
  let secret: Uint8Array | null = suppliedSecret.slice();
  let identity: Identity | null = null;
  const assertActive = (): void => {
    if (disposed || !settings.isCurrent()) throw new Error("Vault session superseded.");
  };
  const callOwned = <Result>(call: () => Result): Result => {
    assertActive();
    return call();
  };
  const awaitOwned = <Result>(call: () => Promise<Result>): Promise<Result> => {
    assertActive();
    return call().then((value) => {
      assertActive();
      return value;
    });
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    secret?.fill(0);
    identity?.secretKey.fill(0);
    identity = null;
    secret = null;
    resources?.privateStateProvider.dispose();
    void resources?.publicDataProvider.dispose().catch(() => undefined);
    resources = null;
  };
  const options = queryOptions({
    queryKey: ["vault-binding", id, settings.configurationRevision],
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    structuralSharing: false,
    queryFn: async ({ signal }): Promise<VaultBinding> => {
      signal.addEventListener("abort", dispose, { once: true });
      try {
        assertActive();
        if (started) throw new Error("Retry requires a fresh vault session.");
        started = true;
        const [{ buildVaultProviders, joinVault }, vault] = await Promise.all([
          import("./vault-providers"),
          import("./vault"),
        ]);
        assertActive();
        const constructedProviders = buildVaultProviders(
          settings.wallet,
          settings.configuration,
          settings.zkOrigin,
        );
        resources = constructedProviders;
        assertActive();
        const sessionProviders: AppVaultProviders = {
          ...constructedProviders,
          balancesSource: {
            shielded: () => awaitOwned(() => constructedProviders.balancesSource.shielded()),
            unshielded: () => awaitOwned(() => constructedProviders.balancesSource.unshielded()),
            dust: () => awaitOwned(() => constructedProviders.balancesSource.dust()),
          },
          privateStateProvider: {
            setContractAddress: (...args) => {
              callOwned(() => {
                constructedProviders.privateStateProvider.setContractAddress(...args);
              });
            },
            set: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.set(...args)),
            get: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.get(...args)),
            remove: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.remove(...args)),
            clear: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.clear(...args)),
            setSigningKey: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.setSigningKey(...args)),
            getSigningKey: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.getSigningKey(...args)),
            removeSigningKey: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.removeSigningKey(...args)),
            clearSigningKeys: (...args) =>
              awaitOwned(() => constructedProviders.privateStateProvider.clearSigningKeys(...args)),
            exportPrivateStates: (...args) =>
              awaitOwned(() =>
                constructedProviders.privateStateProvider.exportPrivateStates(...args),
              ),
            importPrivateStates: (...args) =>
              awaitOwned(() =>
                constructedProviders.privateStateProvider.importPrivateStates(...args),
              ),
            exportSigningKeys: (...args) =>
              awaitOwned(() =>
                constructedProviders.privateStateProvider.exportSigningKeys(...args),
              ),
            importSigningKeys: (...args) =>
              awaitOwned(() =>
                constructedProviders.privateStateProvider.importSigningKeys(...args),
              ),
            dispose: (...args) => {
              callOwned(() => {
                constructedProviders.privateStateProvider.dispose(...args);
              });
            },
          },
          publicDataProvider: {
            queryBlock: (...args) =>
              awaitOwned(() => constructedProviders.publicDataProvider.queryBlock(...args)),
            queryContractState: (...args) =>
              awaitOwned(() => constructedProviders.publicDataProvider.queryContractState(...args)),
            queryZSwapAndContractState: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.queryZSwapAndContractState(...args),
              ),
            queryDeployContractState: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.queryDeployContractState(...args),
              ),
            queryUnshieldedBalances: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.queryUnshieldedBalances(...args),
              ),
            watchForContractState: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.watchForContractState(...args),
              ),
            watchForUnshieldedBalances: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.watchForUnshieldedBalances(...args),
              ),
            watchForDeployTxData: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.watchForDeployTxData(...args),
              ),
            watchForTxData: (...args) =>
              awaitOwned(() => constructedProviders.publicDataProvider.watchForTxData(...args)),
            contractStateObservable: (...args) =>
              callOwned(() =>
                constructedProviders.publicDataProvider.contractStateObservable(...args),
              ),
            unshieldedBalancesObservable: (...args) =>
              callOwned(() =>
                constructedProviders.publicDataProvider.unshieldedBalancesObservable(...args),
              ),
            queryContractEvents: (...args) =>
              awaitOwned(() =>
                constructedProviders.publicDataProvider.queryContractEvents(...args),
              ),
            contractEventsObservable: (...args) =>
              callOwned(() =>
                constructedProviders.publicDataProvider.contractEventsObservable(...args),
              ),
            dispose: (...args) =>
              awaitOwned(() => constructedProviders.publicDataProvider.dispose(...args)),
          },
          walletProvider: {
            balanceTx: (...args) =>
              awaitOwned(() => constructedProviders.walletProvider.balanceTx(...args)),
            getCoinPublicKey: (...args) =>
              callOwned(() => constructedProviders.walletProvider.getCoinPublicKey(...args)),
            getEncryptionPublicKey: (...args) =>
              callOwned(() => constructedProviders.walletProvider.getEncryptionPublicKey(...args)),
          },
          midnightProvider: {
            submitTx: (...args) =>
              awaitOwned(() => constructedProviders.midnightProvider.submitTx(...args)),
          },
          proofProvider: {
            proveTx: (...args) =>
              awaitOwned(() => constructedProviders.proofProvider.proveTx(...args)),
          },
        };
        if (!secret) throw new Error("Vault session superseded.");
        sessionProviders.privateStateProvider.setContractAddress(
          settings.environment.contractAddress,
        );
        identity = vault.deriveIdentity(secret.slice());
        const contract = await joinVault(
          sessionProviders,
          settings.environment.contractAddress,
          secret,
          settings.zkOrigin,
        );
        assertActive();
        const pathRendering = await vault.resolveVaultDeployment(
          sessionProviders,
          settings.environment,
          signal,
        );
        assertActive();
        const environment: VaultSessionEnvironment = {
          ...settings.environment,
          pathRendering,
          assertActive,
        };
        return {
          sessionId: id,
          providers: sessionProviders,
          contract: {
            ...contract,
            callTx: {
              initialise: (...args) => awaitOwned(() => contract.callTx.initialise(...args)),
              approveStata: (...args) => awaitOwned(() => contract.callTx.approveStata(...args)),
              approveRouter: (...args) => awaitOwned(() => contract.callTx.approveRouter(...args)),
              startDeposit: (...args) => awaitOwned(() => contract.callTx.startDeposit(...args)),
              completeDeposit: (...args) =>
                awaitOwned(() => contract.callTx.completeDeposit(...args)),
              startWithdraw: (...args) => awaitOwned(() => contract.callTx.startWithdraw(...args)),
              completeWithdraw: (...args) =>
                awaitOwned(() => contract.callTx.completeWithdraw(...args)),
              refundWithdraw: (...args) =>
                awaitOwned(() => contract.callTx.refundWithdraw(...args)),
              startSwap: (...args) => awaitOwned(() => contract.callTx.startSwap(...args)),
              completeSwap: (...args) => awaitOwned(() => contract.callTx.completeSwap(...args)),
              refundSwap: (...args) => awaitOwned(() => contract.callTx.refundSwap(...args)),
              startSupply: (...args) => awaitOwned(() => contract.callTx.startSupply(...args)),
              completeSupply: (...args) =>
                awaitOwned(() => contract.callTx.completeSupply(...args)),
              refundSupply: (...args) => awaitOwned(() => contract.callTx.refundSupply(...args)),
              startRedeem: (...args) => awaitOwned(() => contract.callTx.startRedeem(...args)),
              completeRedeem: (...args) =>
                awaitOwned(() => contract.callTx.completeRedeem(...args)),
              refundRedeem: (...args) => awaitOwned(() => contract.callTx.refundRedeem(...args)),
            },
          },
          identity,
          environment,
          wallet: settings.wallet,
          depositAddress: vault.depositAddress(environment, identity),
          vaultAddress: vault.vaultAddress(environment),
          assertActive,
        };
      } catch {
        dispose();
        throw new Error("Vault loading failed. Check the deployment and network, then retry.");
      } finally {
        signal.removeEventListener("abort", dispose);
      }
    },
  });
  return { id, options, dispose, assertActive };
}
