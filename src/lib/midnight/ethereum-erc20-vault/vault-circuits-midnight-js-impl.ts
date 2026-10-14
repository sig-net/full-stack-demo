import 'server-only'

import {
  CompiledContract,
  type Contract as CompactContract,
} from '@midnight-ntwrk/compact-js/effect'
import {
  type CallTxOptions,
  createCallTxOptions,
  createUnprovenCallTx,
} from '@midnight-ntwrk/midnight-js/contracts'
import type {
  PublicDataProvider,
  WalletProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js/types'
import { bytesToHex, hexToBytes, respondBidirectionalEventToCircuitInput } from '@sig-net/midnight'
import {
  Contract,
  createVaultPrivateState,
  evmAddressBytes,
  VAULT_PRIVATE_STATE_ID,
  type VaultCircuitId,
  type VaultCompiledContract,
  type VaultPrivateState,
  witnesses,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import {
  type CompleteApproveCircuitArgs,
  type CompleteDepositCircuitArgs,
  type CompleteSwapCircuitArgs,
  type QueueAttestationCircuitArgs,
  queueAttestationCircuit,
  type SendRequestCircuitArgs,
  type StartApproveRouterCircuitArgs,
  type StartApproveStataCircuitArgs,
  type StartDepositCircuitArgs,
  type StartSwapCircuitArgs,
  type VaultCircuits,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import { PrivateStateProviderMemoryImpl } from '@/lib/midnight/private-state-provider-memory-impl'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

type VaultContract = Contract<VaultPrivateState>

export class VaultCircuitsMidnightJsImpl implements VaultCircuits {
  private readonly publicDataProvider: PublicDataProvider
  private readonly zkConfigProvider: ZKConfigProvider<VaultCircuitId>
  private readonly compiledContract: VaultCompiledContract
  private readonly vaultAddress: string
  private readonly relayerWallet: WalletPublicKeys

  /** The relayer's keys go into every permissionless call, since its wallet balances them. */
  constructor(
    publicDataProvider: PublicDataProvider,
    zkConfigProvider: ZKConfigProvider<VaultCircuitId>,
    compiledContract: VaultCompiledContract,
    vaultAddress: string,
    relayerWallet: WalletPublicKeys,
  ) {
    this.publicDataProvider = publicDataProvider
    this.zkConfigProvider = zkConfigProvider
    this.compiledContract = compiledContract
    this.vaultAddress = vaultAddress
    this.relayerWallet = relayerWallet
  }

  startDeposit(args: StartDepositCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      this.options('startDeposit', [
        args.inIndex,
        args.evmNonce,
        {
          gasLimit: args.gas.gasLimit,
          maxFeePerGas: args.gas.maxFeePerGas,
          maxPriorityFeePerGas: args.gas.maxPriorityFeePerGas,
        },
        { erc20Address: evmAddressBytes(args.erc20Address), amount: args.amount },
      ]),
    )
  }

  completeDeposit(args: CompleteDepositCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      this.options('completeDeposit', [
        args.requestId,
        args.serializedOutput,
        args.mintNonce,
        NO_RECIPIENT,
      ]),
    )
  }

  sendDeposit(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      this.options('sendDeposit', [args.outIndex]),
    )
  }

  startSwap(args: StartSwapCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      this.options('startSwap', [
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
      this.options('completeSwap', [
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
      this.options('sendSwap', [args.outIndex]),
    )
  }

  startApproveRouter(args: StartApproveRouterCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      this.options('startApproveRouter', [args.inIndex, evmAddressBytes(args.erc20Address)]),
    )
  }

  startApproveStata(args: StartApproveStataCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      this.options('startApproveStata', [args.inIndex]),
    )
  }

  completeApprove(args: CompleteApproveCircuitArgs): Promise<string> {
    return this.build(
      createVaultPrivateState(args.secretKey),
      args.wallet,
      this.options('completeApprove', [args.requestId, args.serializedOutput]),
    )
  }

  sendApprove(args: SendRequestCircuitArgs): Promise<string> {
    return this.build(
      permissionlessVaultPrivateState(),
      this.relayerWallet,
      this.options('sendApprove', [args.outIndex]),
    )
  }

  queueAttestation(args: QueueAttestationCircuitArgs): Promise<string> {
    const attestation = respondBidirectionalEventToCircuitInput(args.attestation)
    const output = args.serializedOutput
    const circuit = queueAttestationCircuit(output.length)
    switch (circuit) {
      case 'queueAttestation0':
        return this.build(
          permissionlessVaultPrivateState(),
          this.relayerWallet,
          this.options('queueAttestation0', [attestation, output]),
        )
      case 'queueAttestation1':
        return this.build(
          permissionlessVaultPrivateState(),
          this.relayerWallet,
          this.options('queueAttestation1', [attestation, output]),
        )
      case 'queueAttestation32':
        return this.build(
          permissionlessVaultPrivateState(),
          this.relayerWallet,
          this.options('queueAttestation32', [attestation, output]),
        )
      default: {
        const unhandled: never = circuit
        throw new Error(`Unhandled circuit ${JSON.stringify(unhandled)}`)
      }
    }
  }

  private options<Circuit extends VaultCircuitId>(
    circuit: Circuit,
    args: CompactContract.Contract.CircuitParameters<VaultContract, Circuit>,
  ): CallTxOptions<VaultContract, Circuit> {
    return createCallTxOptions(
      this.compiledContract,
      circuit,
      this.vaultAddress,
      VAULT_PRIVATE_STATE_ID,
      undefined,
      args,
    )
  }

  /** One private state provider per call: the secret lives only as long as the call it proves. */
  private async build<Circuit extends VaultCircuitId>(
    privateState: VaultPrivateState,
    wallet: WalletPublicKeys,
    options: CallTxOptions<VaultContract, Circuit>,
  ): Promise<string> {
    const privateStateProvider = await PrivateStateProviderMemoryImpl.holding(
      this.vaultAddress,
      VAULT_PRIVATE_STATE_ID,
      privateState,
    )
    const call = await createUnprovenCallTx(
      {
        publicDataProvider: this.publicDataProvider,
        zkConfigProvider: this.zkConfigProvider,
        walletProvider: walletProviderOf(wallet),
        privateStateProvider,
      },
      { ...options, privateStateId: VAULT_PRIVATE_STATE_ID },
    )
    return bytesToHex(call.private.unprovenTx.serialize())
  }
}

/** The vault's generated contract bound to its witnesses and to the prover keys and ZKIR under `assetsPath`. */
export function compiledVaultContract(assetsPath: string): VaultCompiledContract {
  return CompiledContract.make<VaultContract, VaultPrivateState>('erc20-vault', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(assetsPath),
  )
}

/** The call builder reads the wallet's keys, and the wallet itself balances later, elsewhere. */
function walletProviderOf(wallet: WalletPublicKeys): WalletProvider {
  return {
    getCoinPublicKey: () => wallet.coinPublicKey,
    getEncryptionPublicKey: () => wallet.encryptionPublicKey,
    balanceTx: () =>
      Promise.reject(new Error('Balancing belongs to the signer wallet, not the call builder')),
  }
}

/** The private state of a permissionless call: those circuits never read the secret witness, so a random one proves. */
export function permissionlessVaultPrivateState(): VaultPrivateState {
  return createVaultPrivateState(crypto.getRandomValues(new Uint8Array(32)))
}

/** `completeDeposit` mints to the caller's own public key when no recipient is named. */
const NO_RECIPIENT = {
  is_some: false,
  value: {
    is_left: true,
    left: { bytes: new Uint8Array(32) },
    right: { bytes: new Uint8Array(32) },
  },
}
