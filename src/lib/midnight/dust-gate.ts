import { hasMidnightFees } from "@/lib/wallet-funding";

/** Distinct observed conditions that keep a Midnight fee-paying operation disabled. */
export type DustGateKind =
  | "transactions-unavailable"
  | "balance-unavailable"
  | "checking"
  | "registering"
  | "registration-failed"
  | "register-night"
  | "receive-night"
  | "generating-dust"
  | "insufficient-dust";

/** Action offered beside a blocked operation, using the readiness owner that already owns it. */
export type DustGateOffer = "registration" | "refresh" | null;

/** Presentation-ready description of one blocking readiness condition. */
export interface DustGate {
  kind: DustGateKind;
  reason: string;
  nextAction: string;
  tone: "neutral" | "warning" | "error";
  offer: DustGateOffer;
}

/** Observed readiness values the gate description is derived from. */
export interface DustGateInput {
  connected: boolean;
  transactionUnavailable: string | undefined;
  registrationUnavailable: string | undefined;
  canRegister: boolean;
  balances: { dust: bigint; night: bigint; unregisteredNight: bigint | undefined } | undefined;
  balancesFailed: boolean;
  registering: boolean;
  registrationError: string | undefined;
}

/**
 * Separates registration state from spendable DUST so each blocked operation names its own cause.
 *
 * Sufficient DUST clears the gate even when some NIGHT stays unregistered, and a completed
 * registration keeps the gate closed until spendable DUST is actually observed.
 *
 * @param input - Observed connection, capability and balance values.
 * @returns The blocking condition, or null when fee readiness permits the operation.
 */
export function describeDustGate(input: DustGateInput): DustGate | null {
  if (!input.connected) return null;
  if (input.transactionUnavailable !== undefined)
    return {
      kind: "transactions-unavailable",
      reason: input.transactionUnavailable,
      nextAction: "Connect a Midnight wallet that can sign and submit transactions.",
      tone: "error",
      offer: null,
    };
  if (input.balancesFailed)
    return {
      kind: "balance-unavailable",
      reason: "Midnight fee balances could not be read.",
      nextAction: "Refresh wallet readiness, then retry the operation.",
      tone: "error",
      offer: "refresh",
    };
  if (input.balances === undefined)
    return {
      kind: "checking",
      reason: "Checking Midnight fee balances.",
      nextAction: "Wait for the balance read to finish.",
      tone: "neutral",
      offer: null,
    };
  if (hasMidnightFees(input.balances.dust)) return null;
  if (input.registering)
    return {
      kind: "registering",
      reason: "NIGHT registration for DUST generation is in progress.",
      nextAction: "Wait for the registration transaction to settle and for DUST to appear.",
      tone: "neutral",
      offer: null,
    };
  if (input.registrationError !== undefined)
    return {
      kind: "registration-failed",
      reason: input.registrationError,
      nextAction: input.canRegister
        ? "Retry registration, or refresh wallet readiness once NIGHT arrives."
        : "Refresh wallet readiness once DUST is available in this wallet.",
      tone: "error",
      offer: input.canRegister ? "registration" : "refresh",
    };
  const unregistered = input.balances.unregisteredNight ?? 0n;
  if (unregistered > 0n)
    return {
      kind: "register-night",
      reason: "NIGHT in this wallet is not registered for DUST generation.",
      nextAction: input.canRegister
        ? "Register NIGHT for DUST generation with your connected wallet."
        : (input.registrationUnavailable ??
          "This wallet cannot register NIGHT for DUST. Register it in a wallet that supports registration."),
      tone: "warning",
      offer: input.canRegister ? "registration" : null,
    };
  if (input.balances.night === 0n)
    return {
      kind: "receive-night",
      reason: "This wallet holds no NIGHT, so it generates no DUST.",
      nextAction: "Receive NIGHT in this wallet, then register it for DUST generation.",
      tone: "warning",
      offer: "refresh",
    };
  if (input.balances.dust === 0n)
    return {
      kind: "generating-dust",
      reason: "Registered NIGHT has not generated spendable DUST yet.",
      nextAction: "Wait for DUST generation, then refresh wallet readiness.",
      tone: "neutral",
      offer: "refresh",
    };
  return {
    kind: "insufficient-dust",
    reason: "Spendable DUST is below the Midnight transaction threshold.",
    nextAction: "Wait for more DUST generation, then refresh wallet readiness.",
    tone: "warning",
    offer: "refresh",
  };
}
