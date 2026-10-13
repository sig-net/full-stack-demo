import 'server-only'

import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types'
import {
  type PreBinding,
  type Proof,
  type SignatureEnabled,
  Transaction,
} from '@midnightntwrk/ledger-v9'
import { bytesToHex, hexToBytes } from '@sig-net/midnight'

import type { MidnightNetworkConfig } from '@/lib/config/midnight-network-config'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import {
  type AccountKeys,
  createWalletAndMidnightProvider,
  deriveAccountKeys,
  initialiseWalletFacade,
  type WalletFacade,
} from '@/lib/midnight/wallet/seed-wallet-facade'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/** The relayer over a seed-derived wallet facade, the same facade the browser's seed wallet runs on. */
export class RelayerWalletSeedImpl implements RelayerWallet {
  private readonly config: MidnightNetworkConfig
  private readonly keys: AccountKeys
  private starting: Promise<StartedWallet> | undefined

  constructor(config: MidnightNetworkConfig, seed: string) {
    this.config = config
    this.keys = deriveAccountKeys(seed, config.networkId)
  }

  async start(): Promise<void> {
    await this.started()
  }

  publicKeys(): WalletPublicKeys {
    return {
      coinPublicKey: this.keys.shieldedSecretKeys.coinPublicKey,
      encryptionPublicKey: this.keys.shieldedSecretKeys.encryptionPublicKey,
    }
  }

  unshieldedAddress(): string {
    return this.keys.unshieldedKeystore.getBech32Address().toString()
  }

  async dustBalance(): Promise<bigint> {
    const { facade } = await this.started()
    const state = await facade.waitForSyncedState()
    return state.dust.balance(new Date())
  }

  async finalize(unboundTx: string): Promise<string> {
    if (this.starting === undefined) {
      throw new Error('The relayer wallet was not started: start the backend first')
    }
    const unbound = Transaction.deserialize<SignatureEnabled, Proof, PreBinding>(
      'signature',
      'proof',
      'pre-binding',
      hexToBytes(unboundTx),
    )
    const finalized = await (await this.starting).provider.balanceTx(unbound)
    return bytesToHex(finalized.serialize())
  }

  async provider(): Promise<WalletProvider & MidnightProvider> {
    return (await this.started()).provider
  }

  private started(): Promise<StartedWallet> {
    this.starting ??= this.sync().catch((error: unknown) => {
      this.starting = undefined
      throw error
    })
    return this.starting
  }

  private async sync(): Promise<StartedWallet> {
    const facade = await initialiseWalletFacade(this.keys, this.config)
    await facade.start(this.keys.shieldedSecretKeys, this.keys.dustSecretKey)
    await facade.waitForSyncedState()
    return { facade, provider: createWalletAndMidnightProvider(facade, this.keys) }
  }
}

interface StartedWallet {
  readonly facade: WalletFacade
  readonly provider: WalletProvider & MidnightProvider
}
