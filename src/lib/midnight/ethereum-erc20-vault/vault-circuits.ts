import type { RespondBidirectionalEvent } from '@sig-net/midnight'

import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/**
 * Builds the vault's circuit calls as unproven transactions, hex in the ledger's serialisation,
 * for a Midnight transaction row to carry through its lifecycle. Building reads the contract's
 * state from the indexer, so each call takes a moment and is made outside any database
 * transaction. The two user circuits take the caller's secret as the witness; the permissionless
 * ones prove under any private state.
 */
export interface VaultCircuits {
  startDeposit(args: StartDepositCircuitArgs): Promise<string>
  completeDeposit(args: CompleteDepositCircuitArgs): Promise<string>
  sendDeposit(args: SendDepositCircuitArgs): Promise<string>
  /** Picks the queue circuit for the output's width: 0, 1 or 32 bytes. */
  queueAttestation(args: QueueAttestationCircuitArgs): Promise<string>
}

/** The EIP-1559 fee envelope of the request's EVM transaction, fixed at start. */
export interface GasEnvelope {
  readonly gasLimit: bigint
  readonly maxFeePerGas: bigint
  readonly maxPriorityFeePerGas: bigint
}

export interface StartDepositCircuitArgs {
  readonly secretKey: Uint8Array
  readonly wallet: WalletPublicKeys
  readonly inIndex: bigint
  readonly evmNonce: bigint
  readonly gas: GasEnvelope
  /** `0x` plus 40 hex characters. */
  readonly erc20Address: string
  readonly amount: bigint
}

export interface CompleteDepositCircuitArgs {
  readonly secretKey: Uint8Array
  readonly wallet: WalletPublicKeys
  readonly requestId: Uint8Array
  /** One byte: the attested transfer result for an executed sweep, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes, fresh per call. */
  readonly mintNonce: Uint8Array
}

export interface SendDepositCircuitArgs {
  readonly outIndex: Uint8Array
}

export interface QueueAttestationCircuitArgs {
  readonly attestation: RespondBidirectionalEvent
  readonly serializedOutput: Uint8Array
}
