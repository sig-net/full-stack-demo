import { queryOptions } from '@tanstack/react-query';
import type { DeployedVaultContract } from '@sig-net/midnight-examples-erc20-vault-contract';
import type { MidnightNodeConfig } from '../config/midnight';
import type { Wallet } from './wallet/Wallet';
import type { Env, Identity, VaultSessionEnvironment } from './vault';
import type { AppVaultProviders } from './vault-providers';

export interface VaultBinding {
  sessionId: string;
  providers: AppVaultProviders;
  contract: DeployedVaultContract;
  identity: Identity;
  environment: VaultSessionEnvironment;
  wallet: Wallet;
  depositAddress: string;
  vaultAddress: string;
  assertActive: () => void;
}

// SDK calls can continue after their caller is replaced, so check again at submission boundaries.
function sessionMethods<T extends object>(
  target: T,
  assertActive: () => void,
): T {
  return new Proxy(target, {
    get(owner, property) {
      assertActive();
      const value = Reflect.get(owner, property, owner);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        assertActive();
        const result: unknown = Reflect.apply(value, owner, args);
        if (result instanceof Promise)
          return result.then(value => {
            assertActive();
            return value;
          });
        return result;
      };
    },
  });
}

export function createVaultSession(input: {
  wallet: Wallet;
  secret: Uint8Array;
  configuration: MidnightNodeConfig;
  environment: Env;
  zkOrigin: string;
  isCurrent: () => boolean;
}) {
  const { secret: suppliedSecret, ...settings } = input;
  const id = crypto.randomUUID();
  let disposed = false;
  let started = false;
  let resources: AppVaultProviders | null = null;
  let secret: Uint8Array | null = suppliedSecret.slice();
  let identity: Identity | null = null;
  const assertActive = () => {
    if (disposed || !settings.isCurrent())
      throw new Error('Vault session superseded.');
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    secret?.fill(0);
    identity?.secretKey.fill(0);
    identity = null;
    secret = null;
    resources?.privateStateProvider.dispose();
    void resources?.publicDataProvider.dispose().catch(() => {});
    resources = null;
  };
  const options = queryOptions({
    queryKey: ['vault-binding', id],
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    structuralSharing: false,
    queryFn: async ({ signal }): Promise<VaultBinding> => {
      signal.addEventListener('abort', dispose, { once: true });
      try {
        assertActive();
        if (started) throw new Error('Retry requires a fresh vault session.');
        started = true;
        const [{ buildVaultProviders, joinVault }, vault] = await Promise.all([
          import('./vault-providers'),
          import('./vault'),
        ]);
        assertActive();
        const wallet = sessionMethods(settings.wallet, assertActive);
        resources = buildVaultProviders(
          wallet,
          settings.configuration,
          settings.zkOrigin,
        );
        const providers: AppVaultProviders = {
          ...resources,
          privateStateProvider: sessionMethods(
            resources.privateStateProvider,
            assertActive,
          ),
          publicDataProvider: sessionMethods(
            resources.publicDataProvider,
            assertActive,
          ),
          proofProvider: sessionMethods(resources.proofProvider, assertActive),
        };
        if (!secret) throw new Error('Vault session superseded.');
        await providers.privateStateProvider.setContractAddress(
          settings.environment.contractAddress,
        );
        identity = vault.deriveIdentity(secret.slice());
        const contract = await joinVault(
          providers,
          settings.environment.contractAddress,
          secret,
          settings.zkOrigin,
        );
        assertActive();
        const pathRendering = await vault.syncPathRendering(
          providers,
          settings.environment,
        );
        assertActive();
        const environment: VaultSessionEnvironment = {
          ...settings.environment,
          pathRendering,
          assertActive,
        };
        return {
          sessionId: id,
          providers,
          contract: {
            ...contract,
            callTx: sessionMethods(contract.callTx, assertActive),
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
        throw new Error(
          'Vault loading failed. Check the deployment and network, then retry.',
        );
      } finally {
        signal.removeEventListener('abort', dispose);
      }
    },
  });
  return { id, options, dispose, assertActive };
}
