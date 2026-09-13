"use client";

import { bytesToHex } from "@sig-net/midnight";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";

import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { discoverSwappablePairs, pairKey, quoteBestFeeExactInput } from "@/lib/midnight/evm-swap";
import type { Token } from "@/lib/types/token.types";
import { parseTokenAmount } from "@/lib/utils/token-amount";
import { useRuntimeConfig } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { useMidnightProgress } from "./use-midnight-progress";
import { useVaultActionFeedback } from "./use-vault-action-feedback";

type SwapToken = Token & { balance: string; units: bigint };
interface SwapInputs {
  amount: string;
  from: string | undefined;
  to: string | undefined;
  slippage: bigint;
  revision: number;
}
interface VaultSwapModel {
  fromAmount: string;
  toAmount: string;
  setFromAmount: (amount: string) => void;
  setFromTokenAddress: (address: string) => void;
  setToTokenAddress: (address: string) => void;
  slippageBps: bigint;
  setSlippageBps: (bps: bigint) => void;
  fromTokens: SwapToken[];
  toTokens: SwapToken[];
  fromSel: SwapToken | undefined;
  toSel: SwapToken | undefined;
  enabled: boolean;
  inputDisabled: boolean;
  canSwap: boolean;
  buttonLabel: string;
  quoteError: string | null;
  retryQuote: () => void;
  handleSwap: () => Promise<void>;
}

/**
 * Scopes quotes and completion feedback to the current vault and exact entered spend.
 *
 * @returns Current selections, derived quote output and guarded swap controls.
 */
export function useVaultSwap(): VaultSwapModel {
  const { applied } = useRuntimeConfig();
  const vault = useVault();
  const { balances } = useVaultBalances();
  const operations = useVaultOperations();
  const progress = useMidnightProgress();
  const binding = vault.binding;
  const enabled = binding !== null;
  const rpc = enabled ? applied.evm.rpcUrl : null;
  const scope = JSON.stringify([
    applied.fingerprint,
    binding?.sessionId,
    binding ? bytesToHex(binding.identity.commitment) : null,
  ]);
  const [inputs, setInputs] = useState<SwapInputs>({
    amount: "",
    from: undefined,
    to: undefined,
    slippage: 100n,
    revision: 0,
  });
  const [pendingScope, setPendingScope] = useState<string | null>(null);
  const update = (patch: Partial<Omit<SwapInputs, "revision">>): void => {
    setInputs((current) => ({ ...current, ...patch, revision: current.revision + 1 }));
  };
  const pairs = useQuery({
    queryKey: ["vault-swap-pairs", applied.fingerprint, applied.evm.chainId, rpc],
    enabled: rpc !== null,
    retry: false,
    queryFn: ({ signal }) => {
      if (rpc === null) throw new Error("Vault is not ready.");
      return discoverSwappablePairs(
        rpc,
        MIDNIGHT_TOKENS.filter((token) => !token.noSwap).map((token) => token.erc20Address),
        signal,
      );
    },
  });
  const swappablePairs = enabled && !pairs.isError ? (pairs.data ?? null) : null;
  const tokens: SwapToken[] = enabled
    ? MIDNIGHT_TOKENS.filter((token) => !token.noSwap).flatMap((token) => {
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
      })
    : [];
  const fromTokens = swappablePairs
    ? tokens.filter((token) =>
        tokens.some(
          (other) =>
            other.erc20Address !== token.erc20Address &&
            swappablePairs.has(pairKey(token.erc20Address, other.erc20Address)),
        ),
      )
    : [];
  const fromSel =
    fromTokens.find((token) => token.erc20Address === inputs.from) ??
    fromTokens.find((token) => token.units > 0n) ??
    fromTokens[0];
  const toTokens =
    swappablePairs && fromSel
      ? tokens.filter(
          (token) =>
            token.erc20Address !== fromSel.erc20Address &&
            swappablePairs.has(pairKey(fromSel.erc20Address, token.erc20Address)),
        )
      : [];
  const toSel = toTokens.find((token) => token.erc20Address === inputs.to) ?? toTokens[0];
  const feedback = useVaultActionFeedback(
    JSON.stringify([
      scope,
      fromSel?.erc20Address,
      fromSel?.decimals,
      toSel?.erc20Address,
      toSel?.decimals,
    ]),
    inputs.revision,
  );
  let quoteUnits: bigint | null = null;
  try {
    if (fromSel) quoteUnits = parseTokenAmount(inputs.amount, fromSel.decimals);
  } catch {
    /* Invalid precision must not reach the quote provider. */
  }
  const quoteEnabled =
    enabled && fromSel !== undefined && toSel !== undefined && quoteUnits !== null;
  const quote = useQuery({
    queryKey: [
      "vault-swap-quote",
      scope,
      rpc,
      fromSel?.erc20Address,
      fromSel?.decimals,
      toSel?.erc20Address,
      toSel?.decimals,
      quoteUnits?.toString(),
    ],
    enabled: quoteEnabled,
    staleTime: 10_000,
    retry: false,
    queryFn: ({ signal }) => {
      if (rpc === null || fromSel === undefined || toSel === undefined || quoteUnits === null)
        throw new Error("Swap quote is unavailable.");
      return quoteBestFeeExactInput(
        rpc,
        fromSel.erc20Address,
        toSel.erc20Address,
        quoteUnits,
        signal,
      );
    },
  });
  const currentQuote = quoteEnabled && !quote.isError ? quote.data : undefined;
  const fee = currentQuote?.fee ?? null;
  const quoting = quoteEnabled && quote.isFetching;
  const failedRead = enabled ? (pairs.error ?? (quoteEnabled ? quote.error : null)) : null;
  const quoteError = failedRead
    ? failedRead.message.includes("timed out")
      ? "Swap pricing timed out. Check the local RPC connection and retry."
      : "Swap pricing could not be read from the EVM network. Check the connection and retry."
    : null;
  const amountValid = fromSel !== undefined && quoteUnits !== null && quoteUnits <= fromSel.units;
  const canSwap =
    enabled &&
    fromSel !== undefined &&
    toSel !== undefined &&
    amountValid &&
    fee !== null &&
    !quoting &&
    !progress.active &&
    !operations.busy &&
    operations.ready &&
    pendingScope === null;
  const handleSwap = async (): Promise<void> => {
    if (!canSwap || quoteUnits === null) return;
    const ticket = feedback.begin();
    if (ticket === null) return;
    setPendingScope(scope);
    try {
      await operations.swap(
        fromSel.erc20Address,
        toSel.erc20Address,
        quoteUnits,
        fee,
        inputs.slippage,
      );
      if (feedback.isCurrent(ticket)) update({ amount: "" });
    } catch (error) {
      if (feedback.isCurrent(ticket))
        toast.error(error instanceof Error ? error.message : "Swap failed");
    } finally {
      if (feedback.finish(ticket)) setPendingScope(null);
    }
  };
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
          : pendingScope === scope
            ? "Swapping…"
            : quoting
              ? "Fetching quote…"
              : quoteError
                ? "Quote unavailable"
                : quoteUnits !== null && fee === null
                  ? "No viable quote for this pair"
                  : "Swap";
  return {
    fromAmount: inputs.amount,
    toAmount: currentQuote && toSel ? formatUnits(currentQuote.amountOut, toSel.decimals) : "",
    setFromAmount: (amount) => {
      update({ amount });
    },
    setFromTokenAddress: (from) => {
      update({ from });
    },
    setToTokenAddress: (to) => {
      update({ to });
    },
    slippageBps: inputs.slippage,
    setSlippageBps: (slippage) => {
      update({ slippage });
    },
    fromTokens,
    toTokens,
    fromSel,
    toSel,
    enabled,
    inputDisabled: !enabled || progress.active,
    canSwap,
    buttonLabel,
    quoteError,
    retryQuote: () => {
      if (pairs.isError) void pairs.refetch();
      else if (quoteEnabled) void quote.refetch();
    },
    handleSwap,
  };
}
