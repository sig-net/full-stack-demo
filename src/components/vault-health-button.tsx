"use client";

import { Fuel } from "lucide-react";
import type * as React from "react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/feedback";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VaultGasAccount } from "@/components/vault-gas-account";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import type { GasReserveKind } from "@/lib/evm/gas-reserve";

const HEALTH_DESCRIPTION =
  "This indicator reports the ETH the EVM vault address holds for swap and withdrawal fees. It does not report the health of the vault contract, the MPC signers or any Midnight service.";

const STATE_TEXT: Readonly<Record<GasReserveKind, string>> = Object.freeze({
  checking: "checking ETH",
  unavailable: "ETH balance unavailable",
  empty: "no ETH",
  insufficient: "low ETH",
  sufficient: "ETH reserve ready",
});

const STATE_TONE: Readonly<
  Record<GasReserveKind, "neutral" | "success" | "error" | "warning" | "pending">
> = Object.freeze({
  checking: "pending",
  unavailable: "error",
  empty: "warning",
  insufficient: "warning",
  sufficient: "success",
});

/**
 * Reports the EVM vault address fee reserve in the toolbar, with its funding details.
 *
 * @returns The vault health trigger and its details panel.
 */
export function VaultHealthButton(): React.JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const reserves = useVaultGasReserves();
  const observation = reserves.vaultOperations;
  const kind = observation.reserve?.kind;
  const state = kind === undefined ? "vault address unavailable" : STATE_TEXT[kind];
  const tone = kind === undefined ? "neutral" : STATE_TONE[kind];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" aria-label={`Vault health: ${state}`}>
          <Fuel aria-hidden="true" />
          <span>Vault health</span>
          <span className="ds-muted">{state}</span>
          <StatusDot tone={tone} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        size="wide"
        align="end"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>Vault health</PopoverTitle>
          <PopoverDescription id={descriptionId}>{HEALTH_DESCRIPTION}</PopoverDescription>
        </PopoverHeader>
        <VaultGasAccount
          heading="EVM vault address"
          accountName="EVM vault address"
          purpose="ETH for swaps and withdrawals."
          guidance="Send ETH on this network to the EVM vault address so the vault can pay for swaps and withdrawals. This address is the vault's EVM account, not the Midnight vault contract, and sending ETH here does not credit any shielded balance."
          observation={observation}
          network={reserves.network}
        />
      </PopoverContent>
    </Popover>
  );
}
