import {
  type ContractPrivateStates,
  type ImportPrivateStatesResult,
  type ImportSigningKeysResult,
  type PrivateStateExport,
  type PrivateStateId,
  PrivateStateExportError,
  PrivateStateImportError,
  type PrivateStateProvider,
  type SigningKeyExport,
  SigningKeyExportError,
} from '@midnight-ntwrk/midnight-js/types'

type ContractAddress = Parameters<PrivateStateProvider['forContract']>[0]
type SigningKey = Parameters<PrivateStateProvider['setSigningKey']>[1]

/**
 * A private state provider that lives for one circuit call. The vault's private state is the
 * caller's secret, which the runtime building the call holds only for the duration of that
 * call, so nothing is persisted and the export and import of states and keys is refused.
 */
export class MemoryPrivateStateProvider<PrivateState> implements PrivateStateProvider<
  PrivateStateId,
  PrivateState
> {
  private readonly statesByContract = new Map<string, Map<PrivateStateId, PrivateState>>()
  private readonly signingKeys = new Map<string, SigningKey>()

  /** A provider holding one state for one contract, as a circuit call needs it. */
  static async holding<PrivateState>(
    contractAddress: ContractAddress,
    privateStateId: PrivateStateId,
    state: PrivateState,
  ): Promise<MemoryPrivateStateProvider<PrivateState>> {
    const provider = new MemoryPrivateStateProvider<PrivateState>()
    await provider.forContract(contractAddress).set(privateStateId, state)
    return provider
  }

  forContract(
    contractAddress: ContractAddress,
  ): ContractPrivateStates<PrivateStateId, PrivateState> {
    const address = contractAddress.toLowerCase()
    return {
      contractAddress: address,
      set: async (privateStateId, state) => {
        const states = this.statesByContract.get(address) ?? new Map<PrivateStateId, PrivateState>()
        states.set(privateStateId, state)
        this.statesByContract.set(address, states)
      },
      get: async (privateStateId) =>
        this.statesByContract.get(address)?.get(privateStateId) ?? null,
      remove: async (privateStateId) => {
        this.statesByContract.get(address)?.delete(privateStateId)
      },
      clear: async () => {
        this.statesByContract.delete(address)
      },
      exportPrivateStates: (): Promise<PrivateStateExport> =>
        Promise.reject(
          new PrivateStateExportError('The in-memory private state provider does not export'),
        ),
      importPrivateStates: (): Promise<ImportPrivateStatesResult> =>
        Promise.reject(
          new PrivateStateImportError('The in-memory private state provider does not import'),
        ),
    }
  }

  async clearAll(): Promise<void> {
    this.statesByContract.clear()
  }

  async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
    this.signingKeys.set(address.toLowerCase(), signingKey)
  }

  async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
    return this.signingKeys.get(address.toLowerCase()) ?? null
  }

  async removeSigningKey(address: ContractAddress): Promise<void> {
    this.signingKeys.delete(address.toLowerCase())
  }

  async clearSigningKeys(): Promise<void> {
    this.signingKeys.clear()
  }

  exportSigningKeys(): Promise<SigningKeyExport> {
    return Promise.reject(
      new SigningKeyExportError('The in-memory private state provider does not export'),
    )
  }

  importSigningKeys(): Promise<ImportSigningKeysResult> {
    return Promise.reject(
      new PrivateStateImportError('The in-memory private state provider does not import'),
    )
  }
}
