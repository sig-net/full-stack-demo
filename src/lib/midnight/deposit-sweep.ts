/** One ledger-observed deposit request that still has to be settled for this identity and token. */
export interface PendingDepositRequest {
  requestId: string;
  units: bigint;
}

/** Distinct observed conditions of the unswept token balance held at the deposit address. */
export type DepositSweepKind =
  "unbound" | "reserved" | "checking" | "unavailable" | "empty" | "available";

/** Presentation-ready description of the balance a sweep may be started from. */
export interface DepositSweepBalance {
  kind: DepositSweepKind;
  units: bigint | null;
  decimals: number | null;
  reason: string | null;
  nextAction: string | null;
  tone: "neutral" | "warning" | "error";
}

/** Observed values the balance description is derived from. */
export interface DepositSweepInput {
  bound: boolean;
  loading: boolean;
  failed: boolean;
  units: bigint | null;
  decimals: number | null;
  pendingRequests: readonly PendingDepositRequest[];
  pendingFailed: boolean;
  symbol: string;
}

function reservedReason(requests: readonly PendingDepositRequest[]): string {
  return requests.length === 1
    ? "A deposit request from this address is still pending, and its sweep spends the address's next EVM nonce."
    : `${requests.length.toString()} deposit requests from this address are still pending, and their sweeps share the address's next EVM nonce.`;
}

/**
 * Separates an unreadable balance from an empty one and from funds a pending request already claims.
 *
 * A pending request wins over every balance state: its signed sweep occupies the deposit address's
 * next EVM nonce, so a second request created beside it could never be mined, whatever the address
 * currently holds.
 *
 * @param input - Observed binding, balance, precision and pending-request values.
 * @returns The balance state, with the reason and next action for every state a sweep cannot start from.
 */
export function describeDepositSweepBalance(input: DepositSweepInput): DepositSweepBalance {
  const empty: Pick<DepositSweepBalance, "units" | "decimals"> = {
    units: null,
    decimals: input.decimals,
  };
  if (!input.bound)
    return {
      kind: "unbound",
      ...empty,
      reason: "No vault identity is loaded, so this deposit address cannot be observed.",
      nextAction: "Connect Midnight and enter your vault secret to derive the deposit address.",
      tone: "warning",
    };
  if (input.pendingRequests.length > 0)
    return {
      kind: "reserved",
      units: input.units,
      decimals: input.decimals,
      reason: reservedReason(input.pendingRequests),
      nextAction:
        "Finish or recover the pending request by its ID below before sweeping from this address again.",
      tone: "warning",
    };
  if (input.pendingFailed)
    return {
      kind: "unavailable",
      ...empty,
      reason: "Pending deposit requests for this identity could not be read.",
      nextAction: "Refresh to read the pending requests before starting another sweep.",
      tone: "error",
    };
  if (input.failed || (input.units !== null && input.decimals === null))
    return {
      kind: "unavailable",
      ...empty,
      reason: `The ${input.symbol} balance at the deposit address could not be read.`,
      nextAction: "Refresh the deposit address balance.",
      tone: "error",
    };
  if (input.units === null || input.decimals === null)
    return input.loading
      ? {
          kind: "checking",
          ...empty,
          reason: `Reading the ${input.symbol} balance at the deposit address.`,
          nextAction: "Wait for the balance observation to finish.",
          tone: "neutral",
        }
      : {
          kind: "unavailable",
          ...empty,
          reason: `The ${input.symbol} balance at the deposit address could not be read.`,
          nextAction: "Refresh the deposit address balance.",
          tone: "error",
        };
  if (input.units === 0n)
    return {
      kind: "empty",
      units: 0n,
      decimals: input.decimals,
      reason: `The deposit address holds no ${input.symbol}.`,
      nextAction: `Transfer ${input.symbol} to the deposit address, then refresh this balance.`,
      tone: "neutral",
    };
  return {
    kind: "available",
    units: input.units,
    decimals: input.decimals,
    reason: null,
    nextAction: null,
    tone: "neutral",
  };
}
