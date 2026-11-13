import 'server-only'

import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js/types'
import {
  readVaultLedger,
  type VaultLedgerState,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import type { VaultLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'

export class VaultLedgerIndexerImpl implements VaultLedger {
  private readonly publicDataProvider: PublicDataProvider
  private readonly vaultAddress: string

  constructor(publicDataProvider: PublicDataProvider, vaultAddress: string) {
    this.publicDataProvider = publicDataProvider
    this.vaultAddress = vaultAddress
  }

  state(): Promise<VaultLedgerState> {
    return readVaultLedger(this.publicDataProvider, this.vaultAddress)
  }
}
