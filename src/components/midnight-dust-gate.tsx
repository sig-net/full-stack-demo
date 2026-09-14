"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import { DisabledReason } from "@/components/ui/disabled-reason";
import type { DustGate } from "@/lib/midnight/dust-gate";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";

interface MidnightDustGateProps {
  gate: DustGate;
  id: string;
  label: string;
}

/**
 * Explains the Midnight fee condition blocking the operation controls that reference its id.
 *
 * The consumer owns the single derivation: it renders this panel only for a non-null gate and
 * sets `aria-describedby` on each explained control from that same value.
 *
 * @param properties - The blocking condition, association identity and accessible panel name.
 * @param properties.gate - Condition derived once by the surface that renders this panel.
 * @param properties.id - Element id carried by every control this panel explains.
 * @param properties.label - Accessible name distinguishing this panel from other live regions.
 * @returns The disabled-reason panel.
 */
export function MidnightDustGate(properties: MidnightDustGateProps): React.JSX.Element {
  const { gate, id, label } = properties;
  const readiness = useMidnightReadiness();
  return (
    <DisabledReason
      id={id}
      label={label}
      reason={gate.reason}
      nextAction={gate.nextAction}
      tone={gate.tone}
      action={
        gate.offer === "registration" ? (
          <Button
            disabled={readiness.registration.isPending}
            onClick={() => {
              void readiness.registerNight().catch(() => undefined);
            }}
          >
            Register NIGHT for DUST
          </Button>
        ) : gate.offer === "refresh" ? (
          <Button
            variant="outline"
            disabled={readiness.balances.isFetching}
            onClick={() => {
              void readiness.balances.refetch();
            }}
          >
            Refresh wallet readiness
          </Button>
        ) : null
      }
    />
  );
}
