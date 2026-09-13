"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { erc20Abi, getAddress, type Hash } from "viem";

import { isErc20Allowed } from "@/lib/constants/token-metadata";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { parseTokenAmount } from "@/lib/utils/token-amount";

import { useEvmBalances } from "./evm-balances-context";
import { useEvmWallet } from "./evm-wallet-context";
import { useMidnightReadiness } from "./midnight-readiness-context";
import { useRuntimeConfig } from "./runtime-config-context";
import { useVaultBalances } from "./vault-balances-context";
import { useVault } from "./vault-context";
import { useVaultOperations } from "./vault-operations-context";

interface DepositTransfer {
  destination: string;
  token: string;
  account: string;
  chainId: number;
  amount: string;
  explorerUrl?: string;
  hash?: Hash;
  units?: bigint;
  status: "approving" | "confirming" | "confirmed" | "error";
  error?: string;
  binding: VaultBinding;
  sweep: "ready" | "pending" | "complete";
}

interface EvmDepositState {
  transfer: DepositTransfer | null;
  sendDeposit: (binding: VaultBinding, token: string, amount: string) => Promise<void>;
  continueDeposit: () => Promise<void>;
}

function useEvmDepositOwner(): EvmDepositState {
  const runtime = useRuntimeConfig();
  const { wallet } = useEvmWallet();
  const balances = useEvmBalances();
  const queries = useQueryClient();
  const operations = useVaultOperations();
  const vaultBalances = useVaultBalances();
  const vault = useVault();
  const readiness = useMidnightReadiness();
  const transferRef = useRef<DepositTransfer | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const [transfer, setTransfer] = useState<DepositTransfer | null>(null);
  const sendDeposit = async (
    binding: VaultBinding,
    token: string,
    amount: string,
  ): Promise<void> => {
    if (busy.current || transferRef.current?.sweep === "pending") return;
    runtime.requireServerHeaders();
    const owner = wallet;
    if (!owner) throw new Error("Connect an EVM wallet first.");
    binding.assertActive();
    const record: DepositTransfer = {
      binding,
      destination: binding.depositAddress,
      token,
      account: owner.account,
      chainId: owner.chain.id,
      amount,
      explorerUrl: runtime.applied.evm.explorerUrl,
      status: "approving",
      sweep: "ready",
    };
    transferRef.current = record;
    busy.current = true;
    setTransfer(record);
    const publish = (): void => {
      if (mounted.current) setTransfer({ ...record });
    };
    try {
      await readiness.requireReady();
      owner.assertActive();
      binding.assertActive();
      if (!isErc20Allowed(token)) throw new Error("Unsupported deposit token.");
      if (!balances.isSuccess)
        throw new Error("Wallet balances are unavailable. Refresh balances and retry.");
      const observed = balances.data.tokens.find(
        (value) => value.erc20Address.toLowerCase() === token.toLowerCase(),
      );
      if (!observed) throw new Error("Token balance and decimals are unavailable.");
      const decimals = await owner.publicClient.readContract({
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "decimals",
      });
      if (!Number.isInteger(decimals) || decimals < 0)
        throw new Error("Token decimals are unavailable.");
      const units = parseTokenAmount(amount, decimals);
      if (observed.units < units) throw new Error("Insufficient token balance.");
      record.units = units;
      const result = await owner.transferErc20({
        token: getAddress(token),
        destination: getAddress(record.destination),
        units,
        beforeSubmit: () => {
          if (!mounted.current) throw new Error("Deposit workflow closed.");
          binding.assertActive();
          runtime.requireServerHeaders();
        },
        submitted: (hash) => {
          record.hash = hash;
          record.status = "confirming";
          publish();
        },
      });
      record.hash = result.hash;
      record.units = result.units;
      record.status = "confirmed";
      try {
        binding.assertActive();
        void vaultBalances.refresh(binding).catch(() => undefined);
      } catch {
        /* The captured vault can be replaced while the transaction confirms. */
      }
      void queries.invalidateQueries({
        queryKey: ["evm-balances", owner.sessionId],
      });
    } catch (failure) {
      record.status = "error";
      record.error = failure instanceof Error ? failure.message : "EVM transfer failed.";
    } finally {
      busy.current = false;
      publish();
    }
  };
  const continueDeposit = async (): Promise<void> => {
    const record = transferRef.current;
    if (record?.status !== "confirmed" || record.sweep !== "ready" || !record.units) return;
    try {
      record.binding.assertActive();
      if (vault.requireBinding() !== record.binding) throw new Error("Vault session changed.");
      record.sweep = "pending";
      record.error = undefined;
      setTransfer({ ...record });
      await operations.deposit(record.token, record.units);
      record.sweep = "complete";
    } catch (failure) {
      record.sweep = "ready";
      record.error = failure instanceof Error ? failure.message : "Midnight deposit failed.";
    } finally {
      if (mounted.current && transferRef.current === record) setTransfer({ ...record });
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return { transfer, sendDeposit, continueDeposit };
}
const EvmDepositContext = createContext<ReturnType<typeof useEvmDepositOwner> | null>(null);
/**
 * Retains transfer receipts and continuation ownership across deposit dialog mounts.
 *
 * @param properties - Descendants sharing the captured transfer.
 * @param properties.children - Consumers retaining access across dialog mounts.
 * @returns The deposit operation context.
 */
export function EvmDepositProvider(properties: { children: ReactNode }): JSX.Element {
  const { children } = properties;
  const value = useEvmDepositOwner();
  return <EvmDepositContext.Provider value={value}>{children}</EvmDepositContext.Provider>;
}
/**
 * Reads the shared transfer record and explicit continuation actions.
 *
 * @returns The current transfer and operation entry points.
 * @throws {Error} If the operation owner is missing.
 */
export function useEvmDeposit(): EvmDepositState {
  const value = useContext(EvmDepositContext);
  if (!value) throw new Error("useEvmDeposit requires EvmDepositProvider.");
  return value;
}
