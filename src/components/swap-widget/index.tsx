"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Settings2 } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";

import { Card, CardContent } from "@/components/ui/card";
import { TokenAmountDisplay } from "@/components/ui/token-amount-display";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { discoverSwappablePairs, pairKey, quoteBestFeeExactInput } from "@/lib/midnight/evm-swap";
import type { Token } from "@/lib/types/token.types";
import { parseTokenAmount } from "@/lib/utils/token-amount";
import { useRuntimeConfig } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface SwapWidgetProps {
  className?: string;
}

const SLIPPAGE_PRESETS = [10n, 50n, 100n];
const DEFAULT_SLIPPAGE_BPS = 100n;

type TokenWithBalance = Token & { balance: string; units: bigint };

/**
 * Captures maximum spend and displays the quote used to choose a guaranteed swap output.
 *
 * @param root0 - Widget properties.
 * @param root0.className - Optional class name for the containing card.
 * @returns The swap controls and quote state.
 */
export function SwapWidget({ className }: SwapWidgetProps): React.JSX.Element {
  const { applied } = useRuntimeConfig();
  const vault = useVault();
  const { balances } = useVaultBalances();
  const operations = useVaultOperations();
  const progress = useMidnightProgress();

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromTokenAddress, setFromTokenAddress] = useState<string>();
  const [toTokenAddress, setToTokenAddress] = useState<string>();
  const [swapping, setSwapping] = useState(false);
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enabled = vault.binding !== null;
  const rpc = enabled ? applied.evm.rpcUrl : null;
  const pairs = useQuery({
    queryKey: ["vault-swap-pairs", rpc],
    enabled: rpc !== null,
    queryFn: () => {
      if (rpc === null) throw new Error("Vault is not ready.");
      return discoverSwappablePairs(
        rpc,
        MIDNIGHT_TOKENS.filter((token) => !token.noSwap).map((token) => token.erc20Address),
      );
    },
  });
  const swappablePairs = pairs.isError ? null : (pairs.data ?? null);
  const tokens: TokenWithBalance[] = MIDNIGHT_TOKENS.filter((token) => !token.noSwap).flatMap(
    (token) => {
      const balance = balances?.perToken[token.erc20Address.toLowerCase()];
      if (balance?.decimals == null || balance.vaultUnits == null) return [];
      return [
        {
          ...token,
          chain: "midnight" as const,
          decimals: balance.decimals,
          units: balance.vaultUnits,
          balance: formatUnits(balance.vaultUnits, balance.decimals),
        },
      ];
    },
  );
  const fromTokens = swappablePairs
    ? tokens.filter((token) =>
        tokens.some(
          (other) =>
            other.erc20Address !== token.erc20Address &&
            swappablePairs.has(pairKey(token.erc20Address, other.erc20Address)),
        ),
      )
    : [];
  const toTokens =
    swappablePairs && fromTokenAddress
      ? tokens.filter(
          (token) =>
            token.erc20Address !== fromTokenAddress &&
            swappablePairs.has(pairKey(fromTokenAddress, token.erc20Address)),
        )
      : [];

  const fromTokenKeys = fromTokens.map((token) => token.erc20Address).join(",");
  const defaultFromTokenAddress =
    fromTokens.find((token) => token.units > 0n)?.erc20Address ?? fromTokens[0]?.erc20Address;
  useEffect(() => {
    if (!enabled || defaultFromTokenAddress === undefined) return;
    setFromTokenAddress((previous) =>
      previous && fromTokenKeys.split(",").includes(previous) ? previous : defaultFromTokenAddress,
    );
  }, [defaultFromTokenAddress, enabled, fromTokenKeys]);

  const toTokenKeys = toTokens.map((token) => token.erc20Address).join(",");
  const defaultToTokenAddress = toTokens[0]?.erc20Address;
  useEffect(() => {
    if (defaultToTokenAddress === undefined) return;
    setToTokenAddress((previous) =>
      previous && toTokenKeys.split(",").includes(previous) ? previous : defaultToTokenAddress,
    );
  }, [defaultToTokenAddress, toTokenKeys]);

  const fromSel = tokens.find((token) => token.erc20Address === fromTokenAddress);
  const toSel = tokens.find((token) => token.erc20Address === toTokenAddress);

  let quoteUnits: bigint | null = null;
  try {
    if (fromSel) quoteUnits = parseTokenAmount(fromAmount, fromSel.decimals);
  } catch {
    /* Invalid input disables the quote. */
  }
  const quote = useQuery({
    queryKey: [
      "vault-swap-quote",
      vault.binding?.sessionId,
      rpc,
      fromSel?.erc20Address,
      toSel?.erc20Address,
      quoteUnits?.toString(),
    ],
    enabled:
      enabled &&
      !!fromSel &&
      !!toSel &&
      quoteUnits !== null &&
      fromSel.erc20Address !== toSel.erc20Address,
    staleTime: 10_000,
    queryFn: () => {
      if (rpc === null || fromSel === undefined || toSel === undefined || quoteUnits === null) {
        throw new Error("Swap quote is unavailable.");
      }
      return quoteBestFeeExactInput(rpc, fromSel.erc20Address, toSel.erc20Address, quoteUnits);
    },
  });
  const fee = quote.isError ? null : (quote.data?.fee ?? null);
  const quoting = quote.isFetching;
  useEffect(() => {
    setToAmount(
      quote.data && !quote.isError && toSel
        ? formatUnits(quote.data.amountOut, toSel.decimals)
        : "",
    );
  }, [quote.data, quote.isError, toSel]);

  const amountValid = (() => {
    if (!fromSel || !toSel) return false;
    try {
      const spend = parseTokenAmount(fromAmount || "0", fromSel.decimals);
      return spend > 0n && spend <= fromSel.units;
    } catch {
      return false;
    }
  })();

  const inEntered = (() => {
    if (!fromSel) return false;
    try {
      return parseTokenAmount(fromAmount || "0", fromSel.decimals) > 0n;
    } catch {
      return false;
    }
  })();

  const swapInputs = fromSel && toSel && fee !== null ? { from: fromSel, to: toSel, fee } : null;
  const canSwap =
    enabled &&
    swapInputs !== null &&
    swapInputs.from.erc20Address !== swapInputs.to.erc20Address &&
    amountValid &&
    fee !== null &&
    !quoting &&
    !progress.active &&
    !operations.busy &&
    operations.ready;

  const handleSwap = (): void => {
    const swapRequest = canSwap ? swapInputs : null;
    if (swapRequest === null) return;
    const amountIn = parseTokenAmount(fromAmount, swapRequest.from.decimals);
    setSwapping(true);
    operations
      .swap(
        swapRequest.from.erc20Address,
        swapRequest.to.erc20Address,
        amountIn,
        swapRequest.fee,
        slippageBps,
      )
      .then(() => {
        setFromAmount("");
        setToAmount("");
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Swap failed"))
      .finally(() => {
        setSwapping(false);
      });
  };

  const noPool = inEntered && !quoting && fee === null;
  const buttonLabel = !enabled
    ? vault.status === "disconnected"
      ? "Connect Midnight to swap"
      : vault.status === "missing-identity"
        ? "Set a vault identity"
        : vault.status === "loading"
          ? "Loading vault…"
          : "Retry vault loading"
    : pairs.isError
      ? "Pools unavailable"
      : tokens.length === 0
        ? "Balances unavailable"
        : swappablePairs === null
          ? "Loading pools…"
          : swapping
            ? "Swapping…"
            : quoting
              ? "Fetching quote…"
              : noPool
                ? "No pool for this pair"
                : "Swap";

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
            disabled={!enabled || progress.active}
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

        <Button
          onClick={handleSwap}
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
