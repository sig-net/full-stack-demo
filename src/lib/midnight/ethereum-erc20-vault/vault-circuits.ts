import type { RespondBidirectionalEvent } from '@sig-net/midnight'
import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/**
 * Builds the vault's circuit calls as unproven transactions, hex in the ledger's serialisation,
 * for a Midnight transaction row to carry through its lifecycle. Building reads the contract's
 * state from the indexer, so each call takes a moment and is made outside any database
 * transaction. The two user circuits take the caller's secret as the witness, and the permissionless
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

/** The circuit that sends each action's flushed request to the MPC. */
export const SEND_CIRCUIT_BY_ACTION: Readonly<Record<VaultAction, VaultCircuitId>> = {
  deposit: 'sendDeposit',
}

/** The queue circuits, one per output width the contract verifies. */
export const QUEUE_ATTESTATION_CIRCUITS = [
  'queueAttestation0',
  'queueAttestation1',
  'queueAttestation32',
] as const satisfies readonly VaultCircuitId[]

export type QueueAttestationCircuit = (typeof QUEUE_ATTESTATION_CIRCUITS)[number]

/** The queue circuit that takes an output of `outputLength` bytes, or throws for a width none takes. */
export function queueAttestationCircuit(outputLength: number): QueueAttestationCircuit {
  switch (outputLength) {
    case 0:
      return 'queueAttestation0'
    case 1:
      return 'queueAttestation1'
    case 32:
      return 'queueAttestation32'
    default:
      throw new Error(`No queue circuit takes a ${outputLength.toString()}-byte output`)
  }
}
