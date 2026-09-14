"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import { DisabledReason } from "@/components/ui/disabled-reason";
import { useLocalEthFunding } from "@/hooks/use-local-eth-funding";
import type { VaultGasReserveObservation } from "@/hooks/use-vault-gas-reserves";
import type { GasReserve } from "@/lib/evm/gas-reserve";

interface VaultGasGateProps {
  reserve: GasReserve;
  observation: VaultGasReserveObservation;
  id: string;
  label: string;
}

/**
 * Explains the EVM fee reserve blocking the operation controls that reference its id.
 *
 * The consumer owns the single derivation: it renders this panel only for a reserve it has
 * already found blocking, and sets `aria-describedby` on each explained control from that same
 * value.
 *
 * @param properties - The observed reserve, its refresh owner and the association identity.
 * @param properties.reserve - Blocking reserve state derived once by the surface.
 * @param properties.observation - Owner of the account, refresh action and read state.
 * @param properties.id - Element id carried by every control this panel explains.
 * @param properties.label - Accessible name distinguishing this panel from other live regions.
 * @returns The disabled-reason panel.
 */
export function VaultGasGate(properties: VaultGasGateProps): React.JSX.Element {
  const { reserve, observation, id, label } = properties;
  const funding = useLocalEthFunding(observation.refresh);
  const address = observation.address;
  return (
    <DisabledReason
      id={id}
      label={label}
      reason={reserve.reason}
      nextAction={reserve.nextAction}
      tone={reserve.tone}
      action={
        <div className="ds-actions">
          {funding.unavailable === null && address !== null && (
            <Button
              variant="outline"
              disabled={funding.isFunding(address)}
              onClick={() => {
                void funding.fund(address);
              }}
            >
              {funding.isFunding(address) ? "Funding ETH…" : "Fund this address with local ETH"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={observation.refreshing}
            onClick={() => {
              void observation.refresh();
            }}
          >
            {observation.refreshing ? "Refreshing balance…" : "Refresh ETH balance"}
          </Button>
        </div>
      }
    />
  );
}
