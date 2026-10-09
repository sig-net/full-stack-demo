import 'server-only'

import type {
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js/types'

type ContractAddress = Parameters<PrivateStateProvider['setContractAddress']>[0]
type SigningKey = Parameters<PrivateStateProvider['setSigningKey']>[1]

/**
 * A private state provider that lives for one circuit call. The vault's private state is the
 * caller's secret, which the server holds only for the duration of the call that needs it, so
 * nothing is persisted and the export and import of states and keys is refused.
 */
export class PrivateStateProviderMemoryImpl<PrivateState> implements PrivateStateProvider<
  PrivateStateId,
  PrivateState
> {
  private readonly states = new Map<string, PrivateState>()
  private readonly signingKeys = new Map<ContractAddress, SigningKey>()
  private contractAddress: ContractAddress | undefined

  setContractAddress(address: ContractAddress): void {
    this.contractAddress = address
  }

  async set(privateStateId: PrivateStateId, state: PrivateState): Promise<void> {
    this.states.set(this.key(privateStateId), state)
  }

  async get(privateStateId: PrivateStateId): Promise<PrivateState | null> {
    return this.states.get(this.key(privateStateId)) ?? null
  }

  async remove(privateStateId: PrivateStateId): Promise<void> {
    this.states.delete(this.key(privateStateId))
  }

  async clear(): Promise<void> {
    this.states.clear()
  }

  async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
    this.signingKeys.set(address, signingKey)
  }

  async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
    return this.signingKeys.get(address) ?? null
  }

  async removeSigningKey(address: ContractAddress): Promise<void> {
    this.signingKeys.delete(address)
  }

  async clearSigningKeys(): Promise<void> {
    this.signingKeys.clear()
  }

  exportPrivateStates(): Promise<PrivateStateExport> {
    return Promise.reject(new Error('The in-memory private state provider does not export'))
  }

  importPrivateStates(): never {
    throw new Error('The in-memory private state provider does not import')
  }

  exportSigningKeys(): Promise<SigningKeyExport> {
    return Promise.reject(new Error('The in-memory private state provider does not export'))
  }

  importSigningKeys(): Promise<ImportSigningKeysResult> {
    return Promise.reject(new Error('The in-memory private state provider does not import'))
  }

  private key(privateStateId: PrivateStateId): string {
    return `${this.contractAddress ?? ''}/${privateStateId}`
  }
}
