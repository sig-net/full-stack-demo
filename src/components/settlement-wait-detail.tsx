"use client";

import type * as React from "react";

import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useAppliedExplorerLinks } from "@/hooks/use-explorer-links";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useSettlementWait } from "@/hooks/use-settlement-wait";
import type { FlowKind } from "@/lib/midnight/flow";
import type { SettlementWait } from "@/lib/midnight/settlement-wait";

const OPERATION_NAME: Record<FlowKind, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  swap: "Swap",
  supply: "Supply",
  redeem: "Redeem",
};

/**
 * Shows the chain evidence behind a settlement wait: the sweep, its readings and their freshness.
 *
 * @param properties - The derived wait whose evidence is rendered.
 * @param properties.wait - Waiting reason and observed chain evidence from the settlement owner.
 * @returns The observed evidence, or nothing while no reading has been taken.
 */
export function SettlementWaitEvidence({
  wait,
}: {
  wait: SettlementWait;
}): React.JSX.Element | null {
  const explorer = useAppliedExplorerLinks();
  if (wait.sweep === null && wait.details.length === 0) return null;
  return (
    <div className="ds-stack-control w-full">
      {wait.sweep !== null && (
        <>
          <p className="ds-body">Sweep transaction</p>
          <PublicIdentifier
            value={wait.sweep.evmTxHash}
            label="Sweep transaction hash"
            explorer={explorer.evmTransaction(wait.sweep.evmTxHash)}
          />
        </>
      )}
      {wait.details.map((detail) => (
        <p key={detail} className="ds-muted ds-caption">
          {detail}
        </p>
      ))}
      {wait.stale && (
        <p className="ds-body">The readings above are older than this surface's check interval.</p>
      )}
    </div>
  );
}

/**
 * Names what the running operation is waiting for, for every operation that shares the MPC path.
 *
 * Only the headline announces, so a reader using assistive technology hears the stage change and
 * not each polling tick. A surface that announces the same stage itself, such as the deposit
 * stepper, renders {@link SettlementWaitEvidence} instead of this panel.
 *
 * @returns The named operation, its waiting reason and the observed evidence, or nothing while no
 *   wait is outstanding.
 */
export function SettlementWaitDetail(): React.JSX.Element | null {
  const wait = useSettlementWait();
  const progress = useMidnightProgress();
  if (wait.headline === null) return null;
  return (
    <div className="ds-surface ds-stack-control ds-round ds-frame ds-inset-content w-full">
      <p className="ds-label" aria-live="polite">
        {progress.kind === null
          ? wait.headline
          : `${OPERATION_NAME[progress.kind]}: ${wait.headline}`}
      </p>
      <SettlementWaitEvidence wait={wait} />
    </div>
  );
}
