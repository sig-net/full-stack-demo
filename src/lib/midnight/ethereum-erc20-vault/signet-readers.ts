import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js/types'
import { signetEventSourceFromIndexer, SignetRequestResponseReader } from '@sig-net/midnight'
import {
  VAULT_APPROVE_REQUESTS_PATH,
  VAULT_DEPOSIT_REQUESTS_PATH,
  VAULT_SWAP_REQUESTS_PATH,
  VAULT_WITHDRAW_REQUESTS_PATH,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'

/** One reader per vault action, over the request map that action's send circuit writes. */
export type SignetReaders = Readonly<Record<VaultAction, SignetRequestResponseReader>>

export interface SignetReadersConfig {
  readonly vaultAddress: string
  readonly signetAddress: string
  readonly publicDataProvider: PublicDataProvider
  readonly indexerURL: string
}

/**
 * Every read walks the singleton's whole event history from the indexer: a lowest block would
 * hide the posts of a request older than it, and a row carries no block to bound by.
 */
export function signetReaders(config: SignetReadersConfig): SignetReaders {
  const eventSource = signetEventSourceFromIndexer({ queryUrl: config.indexerURL })
  const reader = (requestsPath: readonly number[]): SignetRequestResponseReader =>
    new SignetRequestResponseReader({
      requesterContractAddress: config.vaultAddress,
      requesterRequestsPath: requestsPath,
      signetContractAddress: config.signetAddress,
      publicDataProvider: config.publicDataProvider,
      eventSource,
    })
  return {
    deposit: reader(VAULT_DEPOSIT_REQUESTS_PATH),
    withdraw: reader(VAULT_WITHDRAW_REQUESTS_PATH),
    swap: reader(VAULT_SWAP_REQUESTS_PATH),
    approve: reader(VAULT_APPROVE_REQUESTS_PATH),
  }
}
