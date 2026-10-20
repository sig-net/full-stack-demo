import type { RespondBidirectionalEvent } from '@sig-net/midnight'
import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'

import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import type { CallerCircuitArgs } from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/**
 * Builds the circuit calls the backend makes as unproven transactions, hex in the ledger's
 * serialisation, for a Midnight transaction row to carry through its lifecycle. Building reads
 * the contract's state from the indexer, so each call takes a moment and is made outside any
 * database transaction. The caller circuits take the caller's secret as the witness, and the
 * permissionless ones prove under any private state. A caller circuit absent here is built in
 * the browser by its operation's call builder over `vault-call.ts`.
 */
export interface VaultCircuits {
  sendDeposit(args: SendRequestCircuitArgs): Promise<string>
  sendWithdraw(args: SendRequestCircuitArgs): Promise<string>
  /** Surrenders a fresh coin of the sold token worth `amountInMaximum`, which the caller's wallet funds when it balances the call. */
  startSwap(args: StartSwapCircuitArgs): Promise<string>
  completeSwap(args: CompleteSwapCircuitArgs): Promise<string>
  sendSwap(args: SendRequestCircuitArgs): Promise<string>
  sendSupply(args: SendRequestCircuitArgs): Promise<string>
  sendRedeem(args: SendRequestCircuitArgs): Promise<string>
  /** Deployer-gated: the contract refuses any other caller's secret at build time. */
  startApproveRouter(args: StartApproveRouterCircuitArgs): Promise<string>
  /** Deployer-gated: the contract refuses any other caller's secret at build time. */
  startApproveStata(args: StartApproveStataCircuitArgs): Promise<string>
  completeApprove(args: CompleteApproveCircuitArgs): Promise<string>
  sendApprove(args: SendRequestCircuitArgs): Promise<string>
  /** Queues an attestation from the post alone: the MPC's signature covers the output's width and hash, so the output is presented at completion. */
  queueAttestation(args: QueueAttestationCircuitArgs): Promise<string>
}

export interface StartSwapCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
  /** `0x` plus 40 hex characters, both of them. */
  readonly erc20AddressIn: string
  readonly erc20AddressOut: string
  /** The Uniswap V3 pool fee tier, such as 500 or 3000. */
  readonly fee: bigint
  readonly amountOut: bigint
  readonly amountInMaximum: bigint
  /** The shielded token type of the sold ERC20's vault coin, in hex. */
  readonly coinType: string
}

export interface CompleteSwapCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** 32 bytes: the attested `amountIn` for an executed swap, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes each, fresh per call and different from each other. */
  readonly mintNonce: Uint8Array
  readonly changeNonce: Uint8Array
}

export interface StartApproveRouterCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
  /** `0x` plus 40 hex characters. */
  readonly erc20Address: string
}

export interface StartApproveStataCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
}

export interface CompleteApproveCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** One byte: the attested approve result for an executed approval, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
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
