"use client";

import { ArrowDown, Settings2 } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { formatUnits } from "viem";

import { Card, CardContent } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { TokenAmountDisplay } from "@/components/ui/token-amount-display";
import { useVaultSwap } from "@/hooks/use-vault-swap";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface SwapWidgetProps {
  className?: string;
}

const SLIPPAGE_PRESETS = [10n, 50n, 100n];
/**
 * Captures maximum spend and displays the quote used to choose a guaranteed swap output.
 *
 * @param root0 - Widget properties.
 * @param root0.className - Optional class name for the containing card.
 * @returns The swap controls and quote state.
 */
export function SwapWidget({ className }: SwapWidgetProps): React.JSX.Element {
  const {
    fromAmount,
    toAmount,
    setFromAmount,
    setFromTokenAddress,
    setToTokenAddress,
    slippageBps,
    setSlippageBps,
    fromTokens,
    toTokens,
    fromSel,
    toSel,
    enabled,
    inputDisabled,
    canSwap,
    buttonLabel,
    quoteError,
    retryQuote,
    handleSwap,
  } = useVaultSwap();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Card className={className}>
      <CardContent>
        <div className="ds-row justify-between">
          <h2 className="ds-text ds-heading ds-label">Swap</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSettingsOpen(true);
            }}
            aria-label="Swap settings"
          >
            <Settings2 className="ds-muted h-6 w-6" />
          </Button>
        </div>

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Swap settings</DialogTitle>
              <DialogDescription>
                Max slippage sets the minimum you receive for your spend. The swap reverts on-chain
                if the output would fall more than this below the quote.
              </DialogDescription>
            </DialogHeader>
            <div className="ds-control-gap flex flex-wrap">
              {SLIPPAGE_PRESETS.map((bps) => (
                <Button
                  key={String(bps)}
                  variant={slippageBps === bps ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSlippageBps(bps);
                  }}
                >
                  {formatUnits(bps, 2)}%
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <div className="ds-stack-content">
          <TokenAmountDisplay
            value={fromAmount}
            onChange={setFromAmount}
            tokens={enabled ? fromTokens : []}
            selectedToken={fromSel}
            onTokenSelect={(token) => {
              setFromTokenAddress(token.erc20Address);
            }}
            placeholder="0"
            disabled={inputDisabled}
          />

          <div className="flex justify-center">
            <ArrowDown className="ds-muted h-5 w-5" />
          </div>

          <TokenAmountDisplay
            value={toAmount}
            onChange={() => undefined}
            tokens={enabled ? toTokens : []}
            selectedToken={toSel}
            onTokenSelect={(token) => {
              setToTokenAddress(token.erc20Address);
            }}
            placeholder="0"
            disabled={!enabled}
            readOnly
          />
        </div>

        {quoteError && (
          <Feedback tone="error" role="alert">
            <p>{quoteError}</p>
            <Button variant="outline" onClick={retryQuote}>
              Retry pricing
            </Button>
          </Feedback>
        )}
        <Button
          onClick={() => {
            void handleSwap();
          }}
          disabled={!canSwap}
          variant="secondary"
          size="lg"
          className="w-full"
        >
          {buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
