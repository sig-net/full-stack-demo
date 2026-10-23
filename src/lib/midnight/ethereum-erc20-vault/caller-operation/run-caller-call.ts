import { hexToBytes } from '@sig-net/midnight'

import type { CallerLogin } from '@/lib/caller/wallet-login'
import {
  type CallerCircuitArgs,
  circuitAssertMessage,
} from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/**
 * Runs one caller circuit call as the page runs every one of them: the server assigns the
 * call's inputs, the page builds and proves the call with the vault secret as its witness, the
 * wallet balances it with its own coins and DUST fee, signs and finalises it, and the server
 * records the finalised bytes. Every stage is reported as it begins, a refusal at either server
 * call is thrown with the server's message, a contract assert while building is thrown as the
 * vault refusing the operation, and a refusal `retryOnce` matches is prepared and built once more.
 * The wallet keeps the coins of finalised bytes the server refuses pending until it frees them
 * by its own rules, as a browser wallet would.
 */
export async function runCallerCall<
  Inputs,
  CircuitArgs extends CallerCircuitArgs,
  Recorded extends CallOutcome,
>(
  call: CallerCall<Inputs, CircuitArgs, Recorded>,
  options: RunCallerCallOptions = {},
): Promise<Accepted<Recorded>> {
  try {
    return await attempt(call)
  } catch (error: unknown) {
    if (!(error instanceof CallRefused) || options.retryOnce?.(error.refusal) !== true) throw error
    return attempt(call)
  }
}

/** One caller call's parts, generic in the inputs the server assigns, the circuit's arguments and the record's answer. */
export interface CallerCall<
  Inputs,
  CircuitArgs extends CallerCircuitArgs,
  Recorded extends CallOutcome,
> extends CallerCallContext {
  /** The noun the page uses for the operation in a vault refusal (`deposit`, `send`). */
  readonly operation: string
  readonly prepare: () => Promise<PreparedInputs<Inputs>>
  /** The circuit's arguments from the assigned inputs and the caller's witness and keys. */
  readonly circuitArgs: (inputs: Inputs, caller: CallerCircuitArgs) => CircuitArgs
  /** Builds and proves the call, resolving with the unbound bytes in hex. */
  readonly build: (args: CircuitArgs) => Promise<string>
  readonly record: (inputs: Inputs, finalizedTx: string) => Promise<Recorded>
}

/** What every call from the page carries beside its operation's own parts. */
export interface CallerCallContext {
  readonly wallet: Wallet
  /** The connected wallet's login, whose credential every server action takes first. */
  readonly login: CallerLogin
  /** The stored vault secret, lower-case hex without `0x`, which is the call's witness. */
  readonly vaultSecret: string
  readonly onStage?: (stage: CallerCallStage) => void
}

/** The step a caller call is at in the page, reported as each begins. */
export type CallerCallStage = 'preparing' | 'building' | 'signing' | 'recording'

export interface RunCallerCallOptions {
  /** Whether a refusal is prepared and built once more, for a refusal the server answers with a recoverable reason. */
  readonly retryOnce?: (refusal: CallRefusal) => boolean
}

/** A server answer: accepted with the operation's payload, or refused with the message and an optional recoverable reason. */
export type CallOutcome = { readonly ok: true } | CallRefusal

export interface CallRefusal {
  readonly ok: false
  readonly error: string
  readonly reason?: string
}

export type PreparedInputs<Inputs> = { readonly ok: true; readonly inputs: Inputs } | CallRefusal

export type Accepted<Recorded extends CallOutcome> = Extract<Recorded, { readonly ok: true }>

/** The arguments every operation's start and complete take from the page, beside the operation's own. */
export interface CallerCallArgs<Builder> extends CallerCallContext {
  readonly builder: Builder
}

/** One pass from prepare to record, thrown as `CallRefused` at either server refusal so the runner can read the reason. */
async function attempt<Inputs, CircuitArgs extends CallerCircuitArgs, Recorded extends CallOutcome>(
  call: CallerCall<Inputs, CircuitArgs, Recorded>,
): Promise<Accepted<Recorded>> {
  const { wallet, vaultSecret, onStage } = call
  onStage?.('preparing')
  const prepared = await call.prepare()
  assertAccepted(prepared)
  onStage?.('building')
  const unboundTx = await vaultRefusalOf(
    call.build(
      call.circuitArgs(prepared.inputs, {
        secretKey: hexToBytes(vaultSecret),
        wallet: wallet.publicKeys,
      }),
    ),
    call.operation,
  )
  onStage?.('signing')
  const { tx: finalizedTx } = await wallet.balanceUnsealedTransaction(unboundTx)
  onStage?.('recording')
  const recorded = await call.record(prepared.inputs, finalizedTx)
  assertAccepted(recorded)
  return recorded
}

/** The server refused the call: the message is the server's, and the refusal carries its reason for the retry decision. */
class CallRefused extends Error {
  readonly name = 'CallRefused'
  readonly refusal: CallRefusal

  constructor(refusal: CallRefusal) {
    super(refusal.error)
    this.refusal = refusal
  }
}

/** The compiler cannot narrow a generic answer by its discriminant, so the accepted member is asserted here and nowhere else. */
function assertAccepted<Outcome extends CallOutcome>(
  outcome: Outcome,
): asserts outcome is Accepted<Outcome> {
  if (!outcome.ok) throw new CallRefused(outcome)
}

/** A contract assert firing while the call is built is the vault refusing `operation`, the noun the page uses for it. */
async function vaultRefusalOf(building: Promise<string>, operation: string): Promise<string> {
  try {
    return await building
  } catch (error: unknown) {
    const refusal = circuitAssertMessage(error)
    if (refusal === undefined) throw error
    throw new Error(`the vault refused the ${operation}: ${refusal}`, { cause: error })
  }
}
