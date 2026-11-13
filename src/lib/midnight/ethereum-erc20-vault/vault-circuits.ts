import type { RespondBidirectionalEvent } from '@sig-net/midnight'
import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'

/**
 * Builds the permissionless circuit calls the relayer signs as unproven transactions, hex in the
 * ledger's serialisation, for a Midnight transaction row to carry through its lifecycle. Building
 * reads the contract's state from the indexer, so each call takes a moment and is made outside
 * any database transaction. Every caller circuit is built in the browser by its operation's call
 * builder over `vault-call.ts`.
 */
export interface VaultCircuits {
  sendDeposit(args: SendRequestCircuitArgs): Promise<string>
  sendWithdraw(args: SendRequestCircuitArgs): Promise<string>
  sendSwap(args: SendRequestCircuitArgs): Promise<string>
  sendSupply(args: SendRequestCircuitArgs): Promise<string>
  sendRedeem(args: SendRequestCircuitArgs): Promise<string>
  sendApprove(args: SendRequestCircuitArgs): Promise<string>
  /** Queues an attestation from the post alone: the MPC's signature covers the output's width and hash, so the output is presented at completion. */
  queueAttestation(args: QueueAttestationCircuitArgs): Promise<string>
}

/** The flushed entry's index in the output buffer, which every send circuit takes. */
export interface SendRequestCircuitArgs {
  readonly outIndex: Uint8Array
}

export interface QueueAttestationCircuitArgs {
  readonly attestation: RespondBidirectionalEvent
}

/** The circuit that sends each action's flushed request to the MPC. */
export const SEND_CIRCUIT_BY_ACTION: Readonly<Record<VaultAction, VaultCircuitId>> = {
  deposit: 'sendDeposit',
  withdraw: 'sendWithdraw',
  swap: 'sendSwap',
  supply: 'sendSupply',
  redeem: 'sendRedeem',
  approve: 'sendApprove',
}
