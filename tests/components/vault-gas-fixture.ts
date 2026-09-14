import { vi } from "vitest";

import type { VaultGasReserveObservation, VaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import { describeGasReserve, type GasReservePurpose } from "@/lib/evm/gas-reserve";
import { MPC_OPERATION_ETH_RESERVE, VAULT_EVM_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
import type { FlowKind } from "@/lib/midnight/flow";

/** Native balance well above every operation requirement, for surfaces that do not test funding. */
export const FUNDED_RESERVE_WEI = 1_000_000_000_000_000_000n;

/** Observed balance of one paying account, or a failed read, supplied by a test. */
export interface GasObservationFixture {
  purpose: GasReservePurpose;
  headline: bigint;
  address: string;
  observed: bigint | undefined;
  failed?: boolean;
}

/**
 * Builds one paying account's observation from a controlled balance.
 *
 * @param input - Purpose, headline requirement, account and observed read outcome.
 * @returns An observation using the real reserve policy over the supplied balance.
 */
export function gasObservationFixture(input: GasObservationFixture): VaultGasReserveObservation {
  const failed = input.failed ?? false;
  const against = (required: bigint): ReturnType<typeof describeGasReserve> =>
    describeGasReserve({
      purpose: input.purpose,
      required,
      observed: input.observed,
      failed,
    });
  return {
    reserve: against(input.headline),
    address: input.address,
    refreshing: false,
    checkedAt: failed ? null : 1_700_000_000_000,
    refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    against,
  };
}

/**
 * Builds both paying accounts from controlled balances, using the real reserve policy.
 *
 * @param input - Observed balances, defaulting both accounts to a fully funded reserve.
 * @param input.deposit - Observed deposit address balance in wei.
 * @param input.vault - Observed EVM vault address balance in wei.
 * @param input.depositFailed - Treats the deposit address read as failed.
 * @param input.vaultFailed - Treats the vault address read as failed.
 * @returns A controlled value for the vault gas reserve hook.
 */
export function vaultGasReservesFixture(
  input: {
    deposit?: bigint;
    vault?: bigint;
    depositFailed?: boolean;
    vaultFailed?: boolean;
  } = {},
): VaultGasReserves {
  const depositSweep = gasObservationFixture({
    purpose: "deposit-sweep",
    headline: MPC_OPERATION_ETH_RESERVE.deposit,
    address: "0x1111111111111111111111111111111111111111",
    observed: input.deposit ?? FUNDED_RESERVE_WEI,
    failed: input.depositFailed,
  });
  const vaultOperations = gasObservationFixture({
    purpose: "vault-operations",
    headline: VAULT_EVM_ETH_RESERVE,
    address: "0x2222222222222222222222222222222222222222",
    observed: input.vault ?? FUNDED_RESERVE_WEI,
    failed: input.vaultFailed,
  });
  return {
    network: null,
    depositSweep,
    vaultOperations,
    reserveFor: (kind: FlowKind) =>
      (kind === "deposit" ? depositSweep : vaultOperations).against(
        MPC_OPERATION_ETH_RESERVE[kind],
      ),
  };
}
