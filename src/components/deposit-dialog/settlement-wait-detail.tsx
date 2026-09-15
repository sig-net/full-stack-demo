"use client";

import type * as React from "react";

import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useAppliedExplorerLinks } from "@/hooks/use-explorer-links";
import { useSettlementWait } from "@/hooks/use-settlement-wait";

/**
 * Names what the running operation is waiting for and shows the chain evidence behind the wait.
 *
 * Only the headline announces, so a reader using assistive technology hears the stage change.
 *
 * @returns The waiting reason and its observed evidence, or nothing while no wait is outstanding.
 */
export function SettlementWaitDetail(): React.JSX.Element | null {
  const wait = useSettlementWait();
  const explorer = useAppliedExplorerLinks();
  if (wait.headline === null) return null;
  return (
    <div className="ds-stack-control ds-divider-top ds-top-inset-content w-full">
      <p className="ds-label" aria-live="polite">
        {wait.headline}
      </p>
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
