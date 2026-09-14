"use client";

import { describeDustGate, type DustGate } from "@/lib/midnight/dust-gate";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";

/**
 * Reads the shared readiness owner and names the condition blocking fee-paying operations.
 *
 * @returns The blocking condition, or null when observed fee readiness permits an operation.
 */
export function useMidnightDustGate(): DustGate | null {
  const readiness = useMidnightReadiness();
  return describeDustGate({
    connected: readiness.wallet !== null,
    transactionUnavailable: readiness.transactionUnavailable,
    registrationUnavailable: readiness.registrationUnavailable,
    canRegister: readiness.wallet?.registerNightForDust !== undefined,
    balances: readiness.balances.data,
    balancesFailed: readiness.balances.isError,
    registering: readiness.registration.isPending,
    registrationError: readiness.registration.error?.message,
  });
}
