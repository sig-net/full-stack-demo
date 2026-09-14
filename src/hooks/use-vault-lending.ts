"use client";

import { bytesToHex } from "@sig-net/midnight";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";

import { resolveEvmChain } from "@/lib/config/evm";
import {
  AAVE_USDC,
  STATA_USDC,
  stataAssetsPerShare,
  stataSupplyApy,
} from "@/lib/midnight/evm-stata";
import type { FlowKind } from "@/lib/midnight/flow";
import { attributedLendingHistory, lendingNetCost } from "@/lib/midnight/lending-position";
import { parseTokenAmount } from "@/lib/utils/token-amount";
import { useRuntimeConfiguration } from "@/providers/runtime-config-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { useMidnightHistory } from "./use-midnight-history";
import { useVaultActionFeedback } from "./use-vault-action-feedback";

type LendingAction = Extract<FlowKind, "supply" | "redeem">;

interface LendingInputs {
  supply: string;
  redeem: string;
  revision: number;
}
interface VaultLendingModel {
  connected: boolean;
  disabled: boolean;
  supplyAmount: string;
  redeemAmount: string;
  setSupplyAmount: (amount: string) => void;
  setRedeemAmount: (amount: string) => void;
  supplyLabel: string;
  redeemLabel: string;
  supplyReady: boolean;
  redeemReady: boolean;
  busy: LendingAction | null;
  runSupply: () => Promise<void>;
  runRedeem: () => Promise<void>;
  apy: number | null;
  positionAssets: number | null;
  earnings: number | null;
}

/**
 * Reconciles attributed base-unit history before presenting a display-only lending valuation.
 *
 * @returns Current balances, independent amount inputs and session-guarded lending actions.
 */
export function useVaultLending(): VaultLendingModel {
  const { applied } = useRuntimeConfiguration();
  const { binding } = useVault();
  const { balances } = useVaultBalances();
  const operations = useVaultOperations();
  const history = useMidnightHistory();
  const connected = binding !== null;
  const rpc = connected ? applied.evm.rpcUrl : null;
  const scope = JSON.stringify([
    applied.fingerprint,
    binding?.sessionId,
    binding ? bytesToHex(binding.identity.commitment) : null,
  ]);
  const [inputs, setInputs] = useState<LendingInputs>({ supply: "", redeem: "", revision: 0 });
  const [pending, setPending] = useState<{ scope: string; kind: LendingAction } | null>(null);
  const supplyToken = connected ? balances?.perToken[AAVE_USDC.toLowerCase()] : undefined;
  const redeemToken = connected ? balances?.perToken[STATA_USDC.toLowerCase()] : undefined;
  const supplyAvailable = supplyToken?.vaultUnits ?? null;
  const redeemAvailable = redeemToken?.vaultUnits ?? null;
  const assetDecimals = supplyToken?.decimals ?? null;
  const shareDecimals = redeemToken?.decimals ?? null;
  const feedback = useVaultActionFeedback(
    JSON.stringify([scope, assetDecimals, shareDecimals]),
    inputs.revision,
  );
  const update = (patch: Partial<Omit<LendingInputs, "revision">>): void => {
    setInputs((current) => ({ ...current, ...patch, revision: current.revision + 1 }));
  };
  const supplyReady = supplyAvailable !== null && assetDecimals !== null;
  const redeemReady = redeemAvailable !== null && shareDecimals !== null;
  const supplyLabel = supplyReady ? formatUnits(supplyAvailable, assetDecimals) : "Unavailable";
  const redeemLabel = redeemReady ? formatUnits(redeemAvailable, shareDecimals) : "Unavailable";
  const rates = useQuery({
    queryKey: ["vault-lending-rates", scope, rpc],
    enabled: rpc !== null,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (rpc === null) throw new Error("Vault is not ready.");
      const [rate, apy] = await Promise.all([
        stataAssetsPerShare(rpc).catch(() => null),
        stataSupplyApy(rpc).catch(() => null),
      ]);
      return { rate, apy };
    },
  });
  const finite = (value: number | null | undefined): number | null =>
    value != null && Number.isFinite(value) ? value : null;
  const apy = connected && !rates.isError ? finite(rates.data?.apy) : null;
  const assetsPerShare = connected && !rates.isError ? finite(rates.data?.rate) : null;
  const positionAssets =
    assetsPerShare !== null && redeemReady
      ? finite(Number(formatUnits(redeemAvailable, shareDecimals)) * assetsPerShare)
      : null;
  const attributed =
    binding && assetDecimals !== null && shareDecimals !== null
      ? attributedLendingHistory(history, {
          deploymentFingerprint: applied.fingerprint,
          commitment: bytesToHex(binding.identity.commitment),
          midnightNetwork: applied.midnight.networkId,
          chainId: resolveEvmChain(applied.evm).chain.id,
          vaultContract: binding.environment.contractAddress,
          assetToken: AAVE_USDC,
          shareToken: STATA_USDC,
          assetDecimals,
          shareDecimals,
        })
      : [];
  const netCost = redeemAvailable !== null ? lendingNetCost(attributed, redeemAvailable) : null;
  const earnings =
    netCost !== null && assetDecimals !== null && positionAssets !== null
      ? finite(positionAssets - Number(formatUnits(netCost, assetDecimals)))
      : null;
  const disabled = !connected || !operations.ready || operations.busy || pending !== null;
  const run = async (kind: LendingAction): Promise<void> => {
    const amount = inputs[kind];
    const decimals = kind === "supply" ? assetDecimals : shareDecimals;
    const available = kind === "supply" ? supplyAvailable : redeemAvailable;
    if (disabled || !amount || decimals === null || available === null) return;
    let units: bigint;
    try {
      units = parseTokenAmount(amount, decimals);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to parse lending amount.");
      return;
    }
    if (units > available) {
      toast.error(
        kind === "supply" ? "Not enough shielded USDC" : "Not enough shielded stataUSDC",
        {
          description:
            kind === "supply"
              ? `You hold ${supplyLabel} shielded Aave USDC. Deposit Aave USDC into the vault first.`
              : `You hold ${redeemLabel} shielded stataUSDC. Supply USDC first to receive shares.`,
        },
      );
      return;
    }
    const ticket = feedback.begin();
    if (ticket === null) return;
    setPending({ scope, kind });
    try {
      const result = await operations[kind](units);
      if (feedback.isCurrent(ticket)) {
        if (!result.refunded)
          toast.success(
            kind === "supply" ? "Supplied USDC into stataUSDC" : "Redeemed stataUSDC back to USDC",
          );
        update({ [kind]: "" });
      }
    } catch (error) {
      if (feedback.isCurrent(ticket))
        toast.error(
          error instanceof Error
            ? error.message
            : `${kind === "supply" ? "Supply" : "Redeem"} failed.`,
        );
    } finally {
      if (feedback.finish(ticket)) setPending(null);
    }
  };
  return {
    connected,
    disabled,
    supplyAmount: inputs.supply,
    redeemAmount: inputs.redeem,
    setSupplyAmount: (supply) => {
      update({ supply });
    },
    setRedeemAmount: (redeem) => {
      update({ redeem });
    },
    supplyLabel,
    redeemLabel,
    supplyReady,
    redeemReady,
    busy: pending?.scope === scope ? pending.kind : null,
    runSupply: () => run("supply"),
    runRedeem: () => run("redeem"),
    apy,
    positionAssets,
    earnings,
  };
}
