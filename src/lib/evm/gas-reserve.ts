import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Address, getAddress } from "viem";

import type { EvmChainConfig } from "@/lib/config/runtime";
import { getEthereumProvider } from "@/lib/rpc";

/** Distinct observed conditions of a native fee reserve, each with its own user-facing meaning. */
export type GasReserveKind = "checking" | "unavailable" | "empty" | "insufficient" | "sufficient";

/** Accounts whose native reserve pays for MPC-signed transactions, with distinct purposes. */
export type GasReservePurpose = "deposit-sweep" | "vault-operations";

/** Presentation-ready description of one observed native fee reserve. */
export interface GasReserve {
  kind: GasReserveKind;
  purpose: GasReservePurpose;
  required: bigint;
  /** Observed native balance in wei, absent while checking and after a failed read. */
  observed: bigint | null;
  /** Missing wei, present only for a reserve observed below its requirement. */
  shortfall: bigint | null;
  reason: string;
  nextAction: string;
  tone: "neutral" | "warning" | "error";
}

/** Observed values a reserve description is derived from. */
export interface GasReserveInput {
  purpose: GasReservePurpose;
  required: bigint;
  /** Observed balance in wei, or undefined while no successful read exists. */
  observed: bigint | undefined;
  /** A completed read that failed, which is never the same as an observed zero balance. */
  failed: boolean;
}

const PURPOSE_SUBJECT: Readonly<Record<GasReservePurpose, string>> = Object.freeze({
  "deposit-sweep": "The deposit address",
  "vault-operations": "The EVM vault address",
});

const PURPOSE_FUNDING: Readonly<Record<GasReservePurpose, string>> = Object.freeze({
  "deposit-sweep": "Send ETH to the deposit address, then refresh its balance.",
  "vault-operations": "Send ETH to the EVM vault address, then refresh its balance.",
});

const PURPOSE_SPEND: Readonly<Record<GasReservePurpose, string>> = Object.freeze({
  "deposit-sweep": "pay for the token sweep into the vault",
  "vault-operations": "pay for vault swaps and withdrawals",
});

/**
 * Separates a pending read, a failed read, an empty account and a short balance.
 *
 * A failed read never becomes a zero balance and never becomes a satisfied requirement, so an
 * unreachable RPC blocks the operation instead of silently permitting or denying it on a guess.
 *
 * @param input - Observed balance, requirement and read outcome for one paying account.
 * @returns The reserve state with the text explaining it.
 */
export function describeGasReserve(input: GasReserveInput): GasReserve {
  const base = {
    purpose: input.purpose,
    required: input.required,
    observed: null,
    shortfall: null,
  } as const;
  if (input.failed)
    return {
      ...base,
      kind: "unavailable",
      reason: `${PURPOSE_SUBJECT[input.purpose]} ETH balance could not be read.`,
      nextAction: "Refresh the balance, or check the EVM RPC endpoint in Configuration.",
      tone: "error",
    };
  if (input.observed === undefined)
    return {
      ...base,
      kind: "checking",
      reason: `Checking the ${PURPOSE_SUBJECT[input.purpose].toLowerCase()} ETH balance.`,
      nextAction: "Wait for the balance read to finish.",
      tone: "neutral",
    };
  if (input.observed >= input.required)
    return {
      ...base,
      kind: "sufficient",
      observed: input.observed,
      reason: `${PURPOSE_SUBJECT[input.purpose]} holds enough ETH to ${PURPOSE_SPEND[input.purpose]}.`,
      nextAction: "No funding is needed.",
      tone: "neutral",
    };
  const shortfall = input.required - input.observed;
  if (input.observed === 0n)
    return {
      ...base,
      kind: "empty",
      observed: 0n,
      shortfall,
      reason: `${PURPOSE_SUBJECT[input.purpose]} holds no ETH, so it cannot ${PURPOSE_SPEND[input.purpose]}.`,
      nextAction: PURPOSE_FUNDING[input.purpose],
      tone: "warning",
    };
  return {
    ...base,
    kind: "insufficient",
    observed: input.observed,
    shortfall,
    reason: `${PURPOSE_SUBJECT[input.purpose]} ETH balance is below the reserve needed to ${PURPOSE_SPEND[input.purpose]}.`,
    nextAction: PURPOSE_FUNDING[input.purpose],
    tone: "warning",
  };
}

/**
 * Rejects an observation that does not satisfy its requirement, with the reason and next action.
 *
 * Both enforcement boundaries compose the same two steps, so the wording a caller throws is
 * defined once beside the policy that produces it.
 *
 * @param input - Observed balance, requirement and read outcome for one paying account.
 * @throws {Error} If the balance is pending, unreadable or below the requirement.
 */
export function assertGasReserve(input: GasReserveInput): void {
  const reserve = describeGasReserve(input);
  if (reserve.kind !== "sufficient") throw new Error(`${reserve.reason} ${reserve.nextAction}`);
}

/**
 * Reads a native balance through the applied chain configuration, without a signing session.
 *
 * @param config - Captured chain and endpoint inputs owning this read.
 * @param address - Account whose native balance is observed.
 * @returns The observed balance in wei.
 * @throws {Error} If the configuration cannot construct a client or the RPC read fails.
 */
export async function readNativeBalance(config: EvmChainConfig, address: Address): Promise<bigint> {
  return getEthereumProvider(config).getBalance({ address });
}

/** Read interval and reuse window shared by every observer of a paying account's reserve. */
const RESERVE_POLL_MS = 20_000;
const RESERVE_STALE_MS = 5_000;

/** Endpoint, chain, session generation and account identifying one reserve observation. */
type GasReserveQueryKey = readonly (string | null)[];

/** Captured identity of one reserve observation, excluding every secret. */
export interface GasReserveScope {
  config: EvmChainConfig;
  /** Vault binding generation, so a replacement session never reuses a previous observation. */
  sessionId: string;
  address: string;
}

/**
 * Scopes a signer-free native balance read to its endpoint, chain, session and account.
 *
 * @param scope - Captured configuration, session generation and observed account.
 * @returns Query options usable by an observer or by a fresh read at an operation boundary.
 */
export function gasReserveQueryOptions(
  scope: GasReserveScope,
): ReturnType<typeof queryOptions<bigint, Error, bigint, GasReserveQueryKey>> {
  const address = getAddress(scope.address);
  const queryKey: GasReserveQueryKey = [
    "evm-gas-reserve",
    scope.config.rpcUrl,
    scope.config.chainId?.toString() ?? null,
    scope.sessionId,
    address,
  ];
  return queryOptions({
    queryKey,
    queryFn: () => readNativeBalance(scope.config, address),
    staleTime: RESERVE_STALE_MS,
    gcTime: 0,
    retry: false,
    refetchInterval: RESERVE_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/**
 * Rechecks the paying account against its requirement immediately before an operation is submitted.
 *
 * The observed indicator is only an estimate of a moving balance, so a submission reads the
 * account again rather than trusting a rendered state.
 *
 * @param input - Captured scope, purpose and requirement for the account paying this operation.
 * @param input.queries - Query owner performing the fresh read.
 * @param input.scope - Captured configuration, session generation and paying account.
 * @param input.purpose - Which paying account this requirement belongs to.
 * @param input.required - Exact wei the envelope needs before it can broadcast.
 * @throws {Error} If the balance cannot be read or is below the requirement.
 */
export async function requireGasReserve(input: {
  queries: QueryClient;
  scope: GasReserveScope;
  purpose: GasReservePurpose;
  required: bigint;
}): Promise<void> {
  const options = gasReserveQueryOptions(input.scope);
  let observed: bigint | undefined;
  let failed = false;
  try {
    observed = await input.queries.fetchQuery({ ...options, staleTime: 0 });
  } catch {
    failed = true;
  }
  assertGasReserve({ purpose: input.purpose, required: input.required, observed, failed });
}
