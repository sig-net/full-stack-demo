"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResolvedEvmChainConfig } from "@/lib/config/runtime";
import {
  describeGasReserve,
  type GasReserve,
  type GasReservePurpose,
  gasReserveQueryOptions,
} from "@/lib/evm/gas-reserve";
import { MPC_OPERATION_ETH_RESERVE, VAULT_EVM_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
import type { FlowKind } from "@/lib/midnight/flow";
import { useConfiguration } from "@/providers/configuration-context";
import { useVault } from "@/providers/vault-context";

/** One paying account's observed reserve, its account and the freshness of that observation. */
export interface VaultGasReserveObservation {
  /** Reserve against this account's headline requirement, absent until the account resolves. */
  reserve: GasReserve | null;
  /** Paying account, absent until the vault binding resolves it. */
  address: string | null;
  /** A read is in flight, whether or not a previous observation is already displayed. */
  refreshing: boolean;
  /** Completion time of the displayed observation, so a stale value is not shown as live. */
  checkedAt: number | null;
  refresh: () => Promise<void>;
  /** Re-describes the same observation against one operation's own requirement. */
  against: (required: bigint) => GasReserve | null;
}

/** Both MPC-signed paying accounts, with the chain their balances were read on. */
export interface VaultGasReserves {
  /** Applied chain, absent when the EVM configuration cannot construct a client. */
  network: ResolvedEvmChainConfig | null;
  depositSweep: VaultGasReserveObservation;
  vaultOperations: VaultGasReserveObservation;
  /** The paying account and requirement belonging to one operation, absent until both resolve. */
  reserveFor: (kind: FlowKind) => GasReserve | null;
}

interface ReserveInputs {
  network: ResolvedEvmChainConfig | null;
  sessionId: string | null;
  address: string | null;
  purpose: GasReservePurpose;
  headline: bigint;
}

function useReserve(inputs: ReserveInputs): VaultGasReserveObservation {
  const { network, sessionId, address, purpose, headline } = inputs;
  const scoped = network !== null && sessionId !== null && address !== null;
  const query = useQuery({
    ...(scoped
      ? gasReserveQueryOptions({ config: network, sessionId, address })
      : {
          queryKey: ["evm-gas-reserve", "unbound"],
          queryFn: (): Promise<bigint> => Promise.reject(new Error("No paying account resolved.")),
          gcTime: 0,
        }),
    enabled: scoped,
  });
  const refetch = query.refetch;
  const against = (required: bigint): GasReserve | null =>
    scoped
      ? describeGasReserve({ purpose, required, observed: query.data, failed: query.isError })
      : null;
  return {
    reserve: against(headline),
    address: scoped ? address : null,
    refreshing: scoped && query.isFetching,
    checkedAt: scoped && query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
    refresh: async () => {
      if (!scoped) return;
      await refetch();
    },
    against,
  };
}

/**
 * Observes the native reserve of both accounts that pay for MPC-signed vault transactions.
 *
 * Neither read needs an EVM signing session: both use the applied chain configuration, and both
 * are scoped to the vault binding generation, so a replacement identity cannot display a previous
 * identity's balance.
 *
 * @returns The applied chain, one observation per paying account and the per-operation requirement.
 */
export function useVaultGasReserves(): VaultGasReserves {
  const { applied } = useConfiguration();
  const vault = useVault();
  const network = applied.readiness.evm.status === "ready" ? applied.readiness.evm.value : null;
  const binding = vault.binding;
  const sessionId = binding?.sessionId ?? null;
  const depositSweep = useReserve({
    network,
    sessionId,
    address: binding?.depositAddress ?? null,
    purpose: "deposit-sweep",
    headline: MPC_OPERATION_ETH_RESERVE.deposit,
  });
  const vaultOperations = useReserve({
    network,
    sessionId,
    address: binding?.vaultAddress ?? null,
    purpose: "vault-operations",
    headline: VAULT_EVM_ETH_RESERVE,
  });
  return {
    network,
    depositSweep,
    vaultOperations,
    reserveFor: (kind) =>
      (kind === "deposit" ? depositSweep : vaultOperations).against(
        MPC_OPERATION_ETH_RESERVE[kind],
      ),
  };
}
