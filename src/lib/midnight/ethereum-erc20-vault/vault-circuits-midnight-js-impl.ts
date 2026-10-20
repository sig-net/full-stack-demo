import 'server-only'

import { CompiledContract } from '@midnight-ntwrk/compact-js/effect'
import type { CallTxOptions } from '@midnight-ntwrk/midnight-js/contracts'
import type { PublicDataProvider, ZKConfigProvider } from '@midnight-ntwrk/midnight-js/types'
import { hexToBytes, respondBidirectionalEventToCircuitInput } from '@sig-net/midnight'
import {
  Contract,
  createVaultPrivateState,
  evmAddressBytes,
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
  CompleteApproveCircuitArgs,
  CompleteSwapCircuitArgs,
  QueueAttestationCircuitArgs,
  SendRequestCircuitArgs,
  StartApproveRouterCircuitArgs,
  StartApproveStataCircuitArgs,
  StartSwapCircuitArgs,
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
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'sendDeposit', [args.outIndex]),
    )
  }

  sendWithdraw(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'sendWithdraw', [args.outIndex]),
    )
  }

  startSwap(args: StartSwapCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      vaultCallOptions(this.providers, 'startSwap', [
        args.inIndex,
        {
          erc20AddressIn: evmAddressBytes(args.erc20AddressIn),
          erc20AddressOut: evmAddressBytes(args.erc20AddressOut),
          fee: args.fee,
          amountOut: args.amountOut,
          amountInMaximum: args.amountInMaximum,
        },
        {
          nonce: crypto.getRandomValues(new Uint8Array(32)),
          color: hexToBytes(args.coinType),
          value: args.amountInMaximum,
        },
      ]),
    )
  }

  completeSwap(args: CompleteSwapCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      vaultCallOptions(this.providers, 'completeSwap', [
        args.requestId,
        args.serializedOutput,
        args.mintNonce,
        args.changeNonce,
      ]),
    )
  }

  sendSwap(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'sendSwap', [args.outIndex]),
    )
  }

  sendSupply(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'sendSupply', [args.outIndex]),
    )
  }

  sendRedeem(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'sendRedeem', [args.outIndex]),
    )
  }

  startApproveRouter(args: StartApproveRouterCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      vaultCallOptions(this.providers, 'startApproveRouter', [
        args.inIndex,
        evmAddressBytes(args.erc20Address),
      ]),
    )
  }

  startApproveStata(args: StartApproveStataCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      vaultCallOptions(this.providers, 'startApproveStata', [args.inIndex]),
    )
  }

  completeApprove(args: CompleteApproveCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      vaultCallOptions(this.providers, 'completeApprove', [args.requestId, args.serializedOutput]),
    )
  }

  sendApprove(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'sendApprove', [args.outIndex]),
    )
  }

  queueAttestation(args: QueueAttestationCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      vaultCallOptions(this.providers, 'queueAttestation', [
        respondBidirectionalEventToCircuitInput(args.attestation),
      ]),
    )
  }

  private async build<Circuit extends VaultCircuitId>(
    privateState: VaultPrivateState,
    wallet: WalletPublicKeys,
    options: CallTxOptions<VaultContract, Circuit>,
  ): Promise<string> {
    const started = Date.now()
    const unprovenTx = await buildVaultCall(this.providers, privateState, wallet, options)
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
