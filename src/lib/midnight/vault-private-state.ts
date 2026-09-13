import {
  PrivateStateExportError,
  PrivateStateImportError,
  type PrivateStateProvider,
  SigningKeyExportError,
} from "@midnight-ntwrk/midnight-js/types";
import type {
  VaultPrivateState,
  VaultPrivateStateId,
} from "@sig-net/midnight-examples-erc20-vault-contract";

type Provider = PrivateStateProvider<VaultPrivateStateId, VaultPrivateState>;

/**
 * Keeps per-contract state in session-owned memory and copies secrets at every read/write boundary.
 *
 * @returns Storage capabilities with idempotent disposal and explicitly rejected SDK backups.
 */
export function createVaultPrivateStateProvider(): Provider & {
  /** Releases all retained contract state and signing-key references. */
  dispose(): void;
} {
  const states = new Map<string, Map<VaultPrivateStateId, VaultPrivateState>>();
  const signingKeys = new Map<string, Awaited<ReturnType<Provider["getSigningKey"]>>>();
  let address: string | undefined;
  let disposed = false;
  const assertActive = (): void => {
    if (disposed) throw new Error("Vault private state has been disposed.");
  };
  const scopedStates = (): Map<VaultPrivateStateId, VaultPrivateState> => {
    assertActive();
    if (!address) throw new Error("Set the vault contract address first.");
    let scope = states.get(address);
    if (!scope) {
      scope = new Map();
      states.set(address, scope);
    }
    return scope;
  };
  const backupUnavailable = "Use the vault secret copy and paste controls.";
  return {
    setContractAddress(value) {
      assertActive();
      address = value;
    },
    set(id, state) {
      return new Promise((resolve) => {
        scopedStates().set(id, { secretKey: state.secretKey.slice() });
        resolve();
      });
    },
    get(id) {
      return new Promise((resolve) => {
        const state = scopedStates().get(id);
        resolve(state ? { secretKey: state.secretKey.slice() } : null);
      });
    },
    remove(id) {
      return new Promise((resolve) => {
        scopedStates().delete(id);
        resolve();
      });
    },
    clear() {
      return new Promise((resolve) => {
        assertActive();
        states.clear();
        resolve();
      });
    },
    setSigningKey(contract, key) {
      return new Promise((resolve) => {
        assertActive();
        signingKeys.set(contract, key);
        resolve();
      });
    },
    getSigningKey(contract) {
      return new Promise((resolve) => {
        assertActive();
        resolve(signingKeys.get(contract) ?? null);
      });
    },
    removeSigningKey(contract) {
      return new Promise((resolve) => {
        assertActive();
        signingKeys.delete(contract);
        resolve();
      });
    },
    clearSigningKeys() {
      return new Promise((resolve) => {
        assertActive();
        signingKeys.clear();
        resolve();
      });
    },
    // SDK-required backup methods reject here while vault-secret controls own explicit user copies.
    exportPrivateStates: () => Promise.reject(new PrivateStateExportError(backupUnavailable)),
    importPrivateStates: () => Promise.reject(new PrivateStateImportError(backupUnavailable)),
    exportSigningKeys: () => Promise.reject(new SigningKeyExportError(backupUnavailable)),
    importSigningKeys: () => Promise.reject(new PrivateStateImportError(backupUnavailable)),
    dispose() {
      disposed = true;
      address = undefined;
      states.clear();
      signingKeys.clear();
    },
  };
}
