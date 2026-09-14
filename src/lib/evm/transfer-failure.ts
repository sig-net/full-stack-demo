import {
  BaseError,
  InsufficientFundsError,
  TransactionReceiptNotFoundError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";

/**
 * Terminal outcomes of the preparation ERC-20 transfer, each with exactly one safe next action.
 *
 * The submitted/unsubmitted split is the safety boundary: only a kind that proves no transaction
 * can settle may offer another send.
 */
export type TransferFailureKind =
  "rejected" | "fees" | "preflight" | "reverted" | "replaced" | "unknown" | "abandoned" | "session";

/** What a surface may offer after a terminal transfer failure. */
export type TransferRecovery = "send-again" | "recheck" | "reconnect";

/** Concise actionable feedback for one terminal transfer outcome. */
export interface TransferFailure {
  readonly kind: TransferFailureKind;
  /** One sentence naming the observed outcome. */
  readonly message: string;
  /** The step that clears it. */
  readonly nextAction: string;
  /** Provider or SDK wording kept behind an optional disclosure. */
  readonly detail: string | null;
  readonly recovery: TransferRecovery;
}

/** A classified transfer failure raised by the transfer and recheck entry points. */
export class Erc20TransferError extends Error {
  /**
   * @param kind - Classified outcome carried to presentation without message matching.
   * @param message - Provider-independent description of the outcome.
   * @param options - Standard error options.
   * @param options.cause - Originating provider or SDK failure kept for the disclosure.
   */
  constructor(
    readonly kind: TransferFailureKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "Erc20TransferError";
  }
}

const FAILURES: Record<TransferFailureKind, Omit<TransferFailure, "detail">> = {
  rejected: {
    kind: "rejected",
    message: "You declined the transfer in your wallet, so nothing was sent.",
    nextAction: "Check the amount and send again when you are ready.",
    recovery: "send-again",
  },
  fees: {
    kind: "fees",
    message: "This account cannot cover the network fee for the transfer.",
    nextAction: "Add native gas to the account, then send again.",
    recovery: "send-again",
  },
  preflight: {
    kind: "preflight",
    message: "The transfer was stopped before signing, so no tokens left your wallet.",
    nextAction: "Check the amount and your network connection, then send again.",
    recovery: "send-again",
  },
  reverted: {
    kind: "reverted",
    message: "The transfer was mined and reverted, so no tokens moved.",
    nextAction: "Check the transaction, then send again.",
    recovery: "send-again",
  },
  replaced: {
    kind: "replaced",
    message: "A different transaction settled for this account instead of the requested transfer.",
    nextAction: "Check the mined transaction before sending anything again.",
    recovery: "recheck",
  },
  unknown: {
    kind: "unknown",
    message: "The transfer was submitted and its outcome is not established yet.",
    nextAction: "Recheck the receipt. Do not send a second transfer until this one is resolved.",
    recovery: "recheck",
  },
  abandoned: {
    kind: "abandoned",
    message: "You stopped waiting locally. Your wallet may still approve and send this transfer.",
    nextAction: "Resolve or reject the request in your wallet, then recheck.",
    recovery: "recheck",
  },
  session: {
    kind: "session",
    message: "The wallet or vault session changed while the transfer was running.",
    nextAction: "Reconnect the same account and vault identity, then check before sending again.",
    recovery: "reconnect",
  },
};

/**
 * Extracts the provider or SDK wording worth keeping behind an optional disclosure.
 *
 * @param error - Failure raised by signing, settlement or a receipt recheck.
 * @returns The originating message, or null when the failure carries none.
 */
function detailOf(error: unknown): string | null {
  if (error instanceof BaseError) return error.details || error.shortMessage;
  if (error instanceof Error) return error.message;
  return null;
}

/** EIP-1193 rejection code, which some connectors raise without viem's own error wrapper. */
const USER_REJECTED_CODE = 4001;

function userRejected(error: unknown): boolean {
  if (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof UserRejectedRequestError)
  )
    return true;
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === USER_REJECTED_CODE) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/** Facts the caller establishes about the attempt, which the error itself cannot prove. */
export interface TransferAttempt {
  /** A transaction hash for this attempt is already known. */
  readonly submitted: boolean;
  /**
   * The captured wallet or vault session stopped being current during the attempt.
   *
   * The caller holds those sessions and their assertions, so it establishes this by evidence. The
   * error's own wording never decides it.
   */
  readonly sessionChanged: boolean;
}

/**
 * Classifies a transfer failure into one recoverable state without matching provider prose.
 *
 * @param error - Failure raised by signing, settlement or a receipt recheck.
 * @param attempt - Facts the caller established about the attempt.
 * @returns The recoverable state, its inline feedback and its one safe next action.
 */
export function describeTransferFailure(error: unknown, attempt: TransferAttempt): TransferFailure {
  const { submitted, sessionChanged } = attempt;
  const detail = detailOf(error);
  const resolve = (kind: TransferFailureKind): TransferFailure => ({ ...FAILURES[kind], detail });
  if (error instanceof Erc20TransferError) {
    // A mined receipt is the only evidence that settles a submitted transfer either way.
    if (error.kind === "reverted" || error.kind === "replaced") return resolve(error.kind);
    if (!submitted) return resolve(error.kind);
  }
  // Every other outcome of a submitted transfer leaves it able to settle, so it offers a recheck
  // and never a resend, whatever the local wait or the wallet reported.
  if (submitted) return resolve("unknown");
  if (userRejected(error)) return resolve("rejected");
  if (sessionChanged) return resolve("session");
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof InsufficientFundsError)) return resolve("fees");
    if (
      error.walk(
        (cause) =>
          cause instanceof WaitForTransactionReceiptTimeoutError ||
          cause instanceof TransactionReceiptNotFoundError,
      )
    )
      return resolve("unknown");
  }
  return resolve("preflight");
}
