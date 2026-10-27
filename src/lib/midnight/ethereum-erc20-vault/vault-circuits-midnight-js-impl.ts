import 'server-only'

import { CompiledContract } from '@midnight-ntwrk/compact-js/effect'
import type { CallTxOptions } from '@midnight-ntwrk/midnight-js/contracts'
import type { PublicDataProvider, ZKConfigProvider } from '@midnight-ntwrk/midnight-js/types'
import { respondBidirectionalEventToCircuitInput } from '@sig-net/midnight'
import {
  Contract,
  type VaultCircuitId,
  type VaultCompiledContract,
  type VaultPrivateState,
  witnesses,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import type { Logger } from '@/lib/logging/logger'
import {
  buildVaultCall,
  permissionlessVaultPrivateState,
  type VaultCallProviders,
  vaultCallOptions,
  type VaultContract,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import type {
  QueueAttestationCircuitArgs,
  SendRequestCircuitArgs,
  VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

export class VaultCircuitsMidnightJsImpl implements VaultCircuits {
  private readonly providers: VaultCallProviders
  private readonly relayerWallet: WalletPublicKeys
  private readonly logger: Logger

  /** The relayer's keys go into every permissionless call, since its wallet balances them. */
  constructor(
    publicDataProvider: PublicDataProvider,
    zkConfigProvider: ZKConfigProvider<VaultCircuitId>,
    compiledContract: VaultCompiledContract,
    vaultAddress: string,
    relayerWallet: WalletPublicKeys,
    logger: Logger,
  ) {
    this.providers = { publicDataProvider, zkConfigProvider, compiledContract, vaultAddress }
    this.relayerWallet = relayerWallet
    this.logger = logger
  }

  sendDeposit(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(vaultCallOptions(this.providers, 'sendDeposit', [args.outIndex]))
  }

  sendWithdraw(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(vaultCallOptions(this.providers, 'sendWithdraw', [args.outIndex]))
  }

  sendSwap(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(vaultCallOptions(this.providers, 'sendSwap', [args.outIndex]))
  }

  sendSupply(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(vaultCallOptions(this.providers, 'sendSupply', [args.outIndex]))
  }

  sendRedeem(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(vaultCallOptions(this.providers, 'sendRedeem', [args.outIndex]))
  }

  sendApprove(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(vaultCallOptions(this.providers, 'sendApprove', [args.outIndex]))
  }

  queueAttestation(args: QueueAttestationCircuitArgs): Promise<string> {
    return this.build(
      vaultCallOptions(this.providers, 'queueAttestation', [
        respondBidirectionalEventToCircuitInput(args.attestation),
      ]),
    )
  }

  /** Every call proves under a random private state with the relayer's keys: no permissionless circuit reads the witness. */
  private async build<Circuit extends VaultCircuitId>(
    options: CallTxOptions<VaultContract, Circuit>,
  ): Promise<string> {
    const started = Date.now()
    const unprovenTx = await buildVaultCall(
      this.providers,
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      options,
    )
    this.logger.debug('circuit call built', {
      circuit: options.circuitId,
      durationMs: Date.now() - started,
    })
    return unprovenTx
  }
}

/** The vault's generated contract bound to its witnesses and to the prover keys and ZKIR under `assetsPath`. */
export function compiledVaultContract(assetsPath: string): VaultCompiledContract {
  return CompiledContract.make<VaultContract, VaultPrivateState>('erc20-vault', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(assetsPath),
  )
}
