/**
 * The vault's circuit calls as unproven transactions, built by midnight-js under a one-call
 * private state, in any runtime that reaches the indexer and holds the prover material.
 */

import type { Contract as CompactContract } from '@midnight-ntwrk/compact-js/effect'
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
import { bytesToHex } from '@sig-net/midnight'
import {
  type Contract,
  createVaultPrivateState,
  evmAddressBytes,
  VAULT_PRIVATE_STATE_ID,
  type VaultCircuitId,
  type VaultCompiledContract,
  type VaultPrivateState,
} from '@sig-net/midnight-examples-erc20-vault-contract'

import { MemoryPrivateStateProvider } from '@/lib/midnight/memory-private-state-provider'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/** One private state provider per call: the secret lives only as long as the call it proves. */
export async function buildVaultCall<Circuit extends VaultCircuitId>(
  providers: VaultCallProviders,
  privateState: VaultPrivateState,
  wallet: WalletPublicKeys,
  options: CallTxOptions<VaultContract, Circuit>,
): Promise<string> {
  const privateStateProvider = await MemoryPrivateStateProvider.holding(
    providers.vaultAddress,
    VAULT_PRIVATE_STATE_ID,
    privateState,
  )
  const call = await createUnprovenCallTx(
    {
      publicDataProvider: providers.publicDataProvider,
      zkConfigProvider: providers.zkConfigProvider,
      walletProvider: walletProviderOf(wallet),
      privateStateProvider,
    },
    { ...options, privateStateId: VAULT_PRIVATE_STATE_ID },
  )
  return bytesToHex(call.private.unprovenTx.serialize())
}

/** What every call reads beside its private state: the contract's public state through the indexer, the prover material, and the contract it calls. */
export interface VaultCallProviders {
  readonly publicDataProvider: PublicDataProvider
  readonly zkConfigProvider: ZKConfigProvider<VaultCircuitId>
  readonly compiledContract: VaultCompiledContract
  readonly vaultAddress: string
}

export type VaultContract = Contract<VaultPrivateState>

/** A vault circuit proves in minutes on a loaded host, well past the SDK's five-minute default. */
export const PROOF_TIMEOUT_MS = 15 * 60 * 1000

export function vaultCallOptions<Circuit extends VaultCircuitId>(
  providers: VaultCallProviders,
  circuit: Circuit,
  args: CompactContract.Contract.CircuitParameters<VaultContract, Circuit>,
): CallTxOptions<VaultContract, Circuit> {
  return createCallTxOptions(
    providers.compiledContract,
    circuit,
    providers.vaultAddress,
    VAULT_PRIVATE_STATE_ID,
    undefined,
    args,
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

export function startDepositCallOptions(
  providers: VaultCallProviders,
  args: StartDepositCircuitArgs,
): CallTxOptions<VaultContract, 'startDeposit'> {
  return vaultCallOptions(providers, 'startDeposit', [
    args.inIndex,
    args.evmNonce,
    {
      gasLimit: args.gas.gasLimit,
      maxFeePerGas: args.gas.maxFeePerGas,
      maxPriorityFeePerGas: args.gas.maxPriorityFeePerGas,
    },
    { erc20Address: evmAddressBytes(args.erc20Address), amount: args.amount },
  ])
}

/** The caller's secret as the witness and the wallet's keys, which every caller circuit takes. */
export interface CallerCircuitArgs {
  readonly secretKey: Uint8Array
  readonly wallet: WalletPublicKeys
}

/** The EIP-1559 fee envelope of the request's EVM transaction, fixed at start. */
export interface GasEnvelope {
  readonly gasLimit: bigint
  readonly maxFeePerGas: bigint
  readonly maxPriorityFeePerGas: bigint
}

export interface StartDepositCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
  readonly evmNonce: bigint
  readonly gas: GasEnvelope
  /** `0x` plus 40 hex characters. */
  readonly erc20Address: string
  readonly amount: bigint
}

export function completeDepositCallOptions(
  providers: VaultCallProviders,
  args: CompleteDepositCircuitArgs,
): CallTxOptions<VaultContract, 'completeDeposit'> {
  return vaultCallOptions(providers, 'completeDeposit', [
    args.requestId,
    args.serializedOutput,
    args.mintNonce,
    NO_RECIPIENT,
  ])
}

export interface CompleteDepositCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** One byte: the attested transfer result for an executed sweep, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes, fresh per call. */
  readonly mintNonce: Uint8Array
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

/**
 * The contract's assert message when the error is the compact runtime refusing a call at build
 * time, which it reports as a plain `Error` whose message it prefixes, or undefined otherwise.
 */
export function circuitAssertMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.message.startsWith(ASSERT_PREFIX)) return undefined
  return error.message.slice(ASSERT_PREFIX.length)
}

const ASSERT_PREFIX = 'failed assert: '
