"use client";

import type * as React from "react";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import type { DepositAddressSweep } from "@/hooks/use-deposit-address-sweep";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { REQUEST_ID_UNSUPPORTED } from "@/lib/explorer";

interface DepositAddressBalanceProps {
  token: TokenConfig;
  sweep: DepositAddressSweep;
  amount: string;
  onAmountChange: (value: string) => void;
  disabled: boolean;
}

/**
 * Presents the unswept token balance at the deposit address and the amount a sweep will move.
 *
 * This balance is observed on chain and is independent of any transfer receipt: it stays correct
 * for tokens sent from outside the application and after page memory is cleared.
 *
 * @param properties - Token, observed sweep state and the amount draft.
 * @param properties.token - Token whose deposit-address balance is shown.
 * @param properties.sweep - Observed balance, pending requests and refresh owner.
 * @param properties.amount - Exact decimal amount text entered for the sweep.
 * @param properties.onAmountChange - Publishes an edited amount to the surface owner.
 * @param properties.disabled - Blocks amount entry while a sweep cannot be started.
 * @returns The deposit-address balance section.
 */
export function DepositAddressBalance(properties: DepositAddressBalanceProps): React.JSX.Element {
  const { token, sweep, amount, onAmountChange, disabled } = properties;
  const { balance } = sweep;
  const spendable = balance.kind === "available" && balance.units !== null;
  return (
    <div className="ds-stack-control ds-divider-top ds-top-inset-content w-full">
      <p className="ds-label">Tokens at your deposit address</p>
      <p className="ds-body">
        Unswept balance:{" "}
        {balance.units === null || balance.decimals === null
          ? balance.kind === "checking"
            ? "checking"
            : "unavailable"
          : `${formatUnits(balance.units, balance.decimals)} ${token.symbol}`}
      </p>
      {sweep.checkedAt !== null && (
        <p className="ds-muted ds-caption">
          Last checked {new Date(sweep.checkedAt).toLocaleTimeString()}
        </p>
      )}
      <div className="ds-actions">
        <Button
          variant="outline"
          disabled={sweep.refreshing}
          onClick={() => {
            sweep.refresh();
          }}
        >
          {sweep.refreshing
            ? "Refreshing deposit address balance…"
            : "Refresh deposit address balance"}
        </Button>
      </div>
      {sweep.pendingRequests.length > 0 && (
        <div className="ds-stack-control ds-body">
          <p className="ds-label">Pending deposit requests</p>
          {sweep.pendingRequests.map((request) => (
            <div key={request.requestId} className="ds-stack-control">
              <PublicIdentifier
                value={request.requestId}
                label="Pending deposit request ID"
                explorer={REQUEST_ID_UNSUPPORTED}
              />
              <p>
                {balance.decimals === null
                  ? `${request.units.toString()} base units`
                  : `${formatUnits(request.units, balance.decimals)} ${token.symbol}`}
              </p>
            </div>
          ))}
        </div>
      )}
      <Label htmlFor={`deposit-sweep-amount-${token.symbol}`}>
        Amount to deposit ({token.symbol})
      </Label>
      <Input
        id={`deposit-sweep-amount-${token.symbol}`}
        inputMode="decimal"
        value={amount}
        disabled={disabled}
        onChange={(event) => {
          onAmountChange(event.target.value);
        }}
      />
      <div className="ds-actions">
        <Button
          variant="outline"
          disabled={disabled || !spendable}
          onClick={() => {
            if (balance.units !== null && balance.decimals !== null)
              onAmountChange(formatUnits(balance.units, balance.decimals));
          }}
        >
          Max
        </Button>
      </div>
    </div>
  );
}
