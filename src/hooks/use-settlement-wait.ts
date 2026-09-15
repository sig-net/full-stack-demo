"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { withEthersProvider } from "@/lib/evm/ethers-provider";
import { readSweepObservation, type SweepObservation } from "@/lib/evm/sweep-observation";
import {
  describeSettlementWait,
  settlementStage,
  type SettlementWait,
  sweepReceiptObserved,
  sweepTxHash,
} from "@/lib/midnight/settlement-wait";
import { useVault } from "@/providers/vault-context";

const OBSERVATION_POLL_MS = 5000;
const OBSERVATION_READ_TIMEOUT_MS = 20_000;
// The lag and head-stall readings move with wall-clock time, so the surface refreshes them on its
// own clock while an operation waits.
const LAG_TICK_MS = 1000;

/**
 * Observes the sweep transaction of the running operation and names what the operation waits for.
 *
 * The observation is scoped to the vault binding, so a replaced session never inherits it, and it
 * runs only while a sweep is on the network and its outcome is outstanding. Finality is observed
 * evidence only: this hook never reports a required depth, since neither the installed reader API
 * nor the local responder exposes one.
 *
 * @returns The waiting reason, the observed chain evidence and the freshness of the reads.
 */
export function useSettlementWait(): SettlementWait {
  const progress = useMidnightProgress();
  const vault = useVault();
  const queries = useQueryClient();
  const binding = vault.binding;
  const { events } = progress;
  const stage = settlementStage(events);
  const evmTxHash = sweepTxHash(events);
  const includedBefore = sweepReceiptObserved(events);
  const observing =
    progress.active &&
    binding !== null &&
    evmTxHash !== null &&
    (stage === "sweep-inclusion" || stage === "mpc-attestation");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!progress.active) return undefined;
    const tick = setInterval(() => {
      setNow(Date.now());
    }, LAG_TICK_MS);
    return () => {
      clearInterval(tick);
    };
  }, [progress.active]);

  const queryKey = ["sweep-observation", binding?.sessionId ?? "disabled", evmTxHash ?? "none"];
  const observation = useQuery({
    queryKey,
    enabled: observing,
    gcTime: 0,
    retry: 2,
    refetchInterval: OBSERVATION_POLL_MS,
    queryFn: async ({ signal }): Promise<SweepObservation> => {
      if (!binding || evmTxHash === null)
        throw new Error("No sweep transaction is being observed.");
      binding.assertActive();
      const previous = queries.getQueryData<SweepObservation>(queryKey) ?? null;
      const read = await withEthersProvider(
        binding.environment.evmRpcUrl,
        (provider) => readSweepObservation(provider, { evmTxHash, includedBefore, previous }),
        { timeoutMs: OBSERVATION_READ_TIMEOUT_MS, signal },
      );
      binding.assertActive();
      return read;
    },
  });

  const sweep = observing ? (observation.data ?? null) : null;
  const sweepReadAt = sweep === null ? null : observation.dataUpdatedAt;
  const lastObservedAt =
    sweepReadAt === null
      ? progress.lastObservedAt
      : Math.max(sweepReadAt, progress.lastObservedAt ?? 0);
  return describeSettlementWait({
    events,
    sweep,
    lastObservedAt,
    readError:
      observing && observation.isError
        ? observation.error instanceof Error
          ? observation.error.message
          : "The chain read failed."
        : null,
    now,
  });
}
