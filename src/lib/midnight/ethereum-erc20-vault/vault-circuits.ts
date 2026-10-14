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
  sendDeposit(args: SendRequestCircuitArgs): Promise<string>
  /** Surrenders a fresh coin of the token worth exactly `amount`, which the caller's wallet funds when it balances the call. */
  startWithdraw(args: StartWithdrawCircuitArgs): Promise<string>
  completeWithdraw(args: CompleteWithdrawCircuitArgs): Promise<string>
  sendWithdraw(args: SendRequestCircuitArgs): Promise<string>
  /** Surrenders a fresh coin of the sold token worth `amountInMaximum`, which the caller's wallet funds when it balances the call. */
  startSwap(args: StartSwapCircuitArgs): Promise<string>
  completeSwap(args: CompleteSwapCircuitArgs): Promise<string>
  sendSwap(args: SendRequestCircuitArgs): Promise<string>
  /** Surrenders a fresh coin of the stata underlying worth exactly `amount`, which the caller's wallet funds when it balances the call. */
  startSupply(args: StartSupplyCircuitArgs): Promise<string>
  completeSupply(args: CompleteSupplyCircuitArgs): Promise<string>
  sendSupply(args: SendRequestCircuitArgs): Promise<string>
  /** Surrenders a fresh coin of the wrapper's vault token worth exactly `shares`, which the caller's wallet funds when it balances the call. */
  startRedeem(args: StartRedeemCircuitArgs): Promise<string>
  completeRedeem(args: CompleteRedeemCircuitArgs): Promise<string>
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

export interface CompleteDepositCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** One byte: the attested transfer result for an executed sweep, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes, fresh per call. */
  readonly mintNonce: Uint8Array
}

export interface StartWithdrawCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
  /** `0x` plus 40 hex characters, both of them. */
  readonly erc20Address: string
  readonly destEvmAddress: string
  readonly amount: bigint
  /** The shielded token type of the sent ERC20's vault coin, in hex. */
  readonly coinType: string
}

export interface CompleteWithdrawCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** One byte: the attested transfer result for an executed withdrawal, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes, fresh per call. */
  readonly mintNonce: Uint8Array
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

export interface StartSupplyCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
  readonly amount: bigint
  /** The shielded token type of the stata underlying's vault coin, in hex. */
  readonly coinType: string
}

export interface CompleteSupplyCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** 32 bytes: the attested shares for an executed deposit, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes, fresh per call. */
  readonly mintNonce: Uint8Array
}

export interface StartRedeemCircuitArgs extends CallerCircuitArgs {
  readonly inIndex: bigint
  readonly shares: bigint
  /** The shielded token type of the wrapper's vault coin, in hex. */
  readonly coinType: string
}

export interface CompleteRedeemCircuitArgs extends CallerCircuitArgs {
  readonly requestId: Uint8Array
  /** 32 bytes: the attested assets paid out for an executed redeem, ignored for the other verdicts. */
  readonly serializedOutput: Uint8Array
  /** 32 random bytes, fresh per call. */
  readonly mintNonce: Uint8Array
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

/**
 * The contract's assert message when the error is the compact runtime refusing a call at build
 * time, which it reports as a plain `Error` whose message it prefixes, or undefined otherwise.
 */
export function circuitAssertMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.message.startsWith(ASSERT_PREFIX)) return undefined
  return error.message.slice(ASSERT_PREFIX.length)
}

const ASSERT_PREFIX = 'failed assert: '
