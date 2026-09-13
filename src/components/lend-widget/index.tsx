"use client";
import type * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVaultLending } from "@/hooks/use-vault-lending";

import { Button } from "../ui/button";

interface LendWidgetProps {
  className?: string;
}

/**
 * Tracks the vault's Aave lending position and submits supply or redeem operations.
 *
 * @param root0 - Widget properties.
 * @param root0.className - Optional class name for the containing card.
 * @returns The lending controls and position summary.
 */
export function LendWidget({ className }: LendWidgetProps): React.JSX.Element {
  const {
    connected,
    disabled,
    supplyAmount,
    redeemAmount,
    setSupplyAmount,
    setRedeemAmount,
    supplyLabel,
    redeemLabel,
    supplyReady,
    redeemReady,
    busy,
    runSupply,
    runRedeem,
    apy,
    positionAssets,
    earnings,
  } = useVaultLending();

  return (
    <Card className={className}>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <span className="ds-body ds-label">Aave lending</span>
          <span className="ds-text ds-caption">
            {apy === null ? "APY unavailable" : `${(apy * 100).toFixed(2)}% APY`}
          </span>
        </div>

        {earnings !== null && (
          <div className="ds-caption flex items-baseline justify-between">
            <span className="ds-text">Earned</span>
            <span className={earnings >= 0 ? "ds-success" : "ds-error"}>
              {earnings >= 0 ? "+" : ""}
              {earnings.toFixed(6)} USDC.a
            </span>
          </div>
        )}

        <div className="ds-stack-control">
          <Label>
            <span>Supply USDC → stataUSDC</span>
            <span>Available: {supplyLabel}</span>
          </Label>
          <div className="ds-control-gap flex">
            <Input
              className="flex-1"
              inputMode="decimal"
              placeholder="0.0"
              aria-label="Supply amount"
              value={supplyAmount}
              onChange={(e) => {
                setSupplyAmount(e.target.value);
              }}
              disabled={disabled}
            />
            <Button
              onClick={() => {
                void runSupply();
              }}
              disabled={disabled || !supplyReady || !supplyAmount}
            >
              {busy === "supply" ? "Supplying…" : "Supply"}
            </Button>
          </div>
        </div>

        <div className="ds-stack-control">
          <Label>
            <span>Redeem stataUSDC → USDC</span>
            <span>
              Available: {redeemLabel}
              {positionAssets === null ? "" : ` ≈ ${positionAssets.toFixed(6)} USDC.a`}
            </span>
          </Label>
          <div className="ds-control-gap flex">
            <Input
              className="flex-1"
              inputMode="decimal"
              placeholder="0.0"
              aria-label="Redeem amount"
              value={redeemAmount}
              onChange={(e) => {
                setRedeemAmount(e.target.value);
              }}
              disabled={disabled}
            />
            <Button
              onClick={() => {
                void runRedeem();
              }}
              disabled={disabled || !redeemReady || !redeemAmount}
            >
              {busy === "redeem" ? "Redeeming…" : "Redeem"}
            </Button>
          </div>
        </div>

        {!connected && (
          <div className="ds-text ds-caption">
            Connect Midnight and set a vault identity to supply or redeem.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
