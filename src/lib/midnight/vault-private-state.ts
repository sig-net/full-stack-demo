import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js/types';
import type {
  VaultPrivateState,
  VaultPrivateStateId,
} from '@sig-net/midnight-examples-erc20-vault-contract';

type Provider = PrivateStateProvider<VaultPrivateStateId, VaultPrivateState>;

export function createVaultPrivateStateProvider(): Provider & {
  dispose(): void;
} {
  const states = new Map<string, Map<VaultPrivateStateId, VaultPrivateState>>();
  const signingKeys = new Map<
    string,
    Awaited<ReturnType<Provider['getSigningKey']>>
  >();
  let address: string | undefined;
  let disposed = false;
  const assertActive = () => {
    if (disposed) throw new Error('Vault private state has been disposed.');
  };
  const scopedStates = () => {
    assertActive();
    if (!address) throw new Error('Set the vault contract address first.');
    let scope = states.get(address);
    if (!scope) {
      scope = new Map();
      states.set(address, scope);
    }
    return scope;
  };
  const unsupported = async (): Promise<never> => {
    throw new Error('Use the vault secret copy and paste controls.');
  };
  return {
    setContractAddress(value) {
      assertActive();
      address = value;
    },
    async set(id, state) {
      scopedStates().set(id, { secretKey: state.secretKey.slice() });
    },
    async get(id) {
      const state = scopedStates().get(id);
      return state ? { secretKey: state.secretKey.slice() } : null;
    },
    async remove(id) {
      scopedStates().delete(id);
    },
    async clear() {
      assertActive();
      states.clear();
    },
    async setSigningKey(contract, key) {
      assertActive();
      signingKeys.set(contract, key);
    },
    async getSigningKey(contract) {
      assertActive();
      return signingKeys.get(contract) ?? null;
    },
    async removeSigningKey(contract) {
      assertActive();
      signingKeys.delete(contract);
    },
    async clearSigningKeys() {
      assertActive();
      signingKeys.clear();
    },
    exportPrivateStates: unsupported,
    importPrivateStates: unsupported,
    exportSigningKeys: unsupported,
    importSigningKeys: unsupported,
    dispose() {
      disposed = true;
      address = undefined;
      states.clear();
      signingKeys.clear();
    },
  };
}
