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
import {
  describeTransferFailure,
  Erc20TransferError,
  type TransferFailure,
} from "@/lib/evm/transfer-failure";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { parseTokenAmount } from "@/lib/utils/token-amount";

import { useConfiguration } from "./configuration-context";
import { useEvmBalances } from "./evm-balances-context";
import { useEvmWallet } from "./evm-wallet-context";
import { useMidnightReadiness } from "./midnight-readiness-context";
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
  /** Terminal outcome of the preparation transfer, never of the later MPC-signed sweep. */
  failure: TransferFailure | null;
  /** Midnight continuation failure, kept apart from the preparation transfer's own outcome. */
  sweepError: string | null;
  /** The local wait was released while the wallet request can still resolve. */
  abandoned: boolean;
  binding: VaultBinding;
  sweep: "ready" | "pending" | "complete";
}

interface EvmDepositState {
  transfer: DepositTransfer | null;
  rechecking: boolean;
  /** True while a submitted transfer could still settle, so another send is unsafe. */
  unresolved: boolean;
  sendDeposit: (binding: VaultBinding, token: string, amount: string) => Promise<void>;
  continueDeposit: () => Promise<void>;
  recheckTransfer: () => Promise<void>;
  abandonApproval: () => void;
  dismissTransfer: () => void;
}

/**
 * Reports whether a captured session assertion no longer holds.
 *
 * @param assertActive - Assertion owned by the captured wallet or vault session.
 * @returns True when the session it guards has been replaced or disposed.
 */
function ended(assertActive: () => void): boolean {
  try {
    assertActive();
    return false;
  } catch {
    return true;
  }
}

/**
 * A transfer that could still settle on chain, whatever the local wait reported.
 *
 * Both a live attempt and a submitted hash with an unestablished outcome qualify, so no surface
 * can offer a second send until the chain has answered for the first one.
 *
 * @param record - The captured transfer, or null when none has been started.
 * @returns Whether another transfer would risk sending the same tokens twice.
 */
function isUnresolved(record: DepositTransfer | null): boolean {
  if (!record) return false;
  if (record.status === "approving" || record.status === "confirming") return true;
  if (record.sweep === "pending") return true;
  return record.failure !== null && record.failure.recovery === "recheck";
}

function useEvmDepositOwner(): EvmDepositState {
  const runtime = useConfiguration();
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
  const sweepOwner = useRef<DepositTransfer | null>(null);
  const recheckOwner = useRef<DepositTransfer | null>(null);
  const [transfer, setTransfer] = useState<DepositTransfer | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const publish = (record: DepositTransfer): void => {
    if (mounted.current && transferRef.current === record) setTransfer({ ...record });
  };
  const sendDeposit = async (
    binding: VaultBinding,
    token: string,
    amount: string,
  ): Promise<void> => {
    if (busy.current || sweepOwner.current || isUnresolved(transferRef.current)) return;
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
      failure: null,
      sweepError: null,
      abandoned: false,
      sweep: "ready",
    };
    transferRef.current = record;
    busy.current = true;
    setTransfer(record);
    try {
      await readiness.requireReady();
      owner.assertActive();
      binding.assertActive();
      if (!isErc20Allowed(token))
        throw new Erc20TransferError("preflight", "Unsupported deposit token.");
      if (!balances.isSuccess)
        throw new Erc20TransferError(
          "preflight",
          "Wallet balances are unavailable. Refresh balances and retry.",
        );
      const observed = balances.data.tokens.find(
        (value) => value.erc20Address.toLowerCase() === token.toLowerCase(),
      );
      if (!observed)
        throw new Erc20TransferError("preflight", "Token balance and decimals are unavailable.");
      const decimals = await owner.publicClient.readContract({
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "decimals",
      });
      if (!Number.isInteger(decimals) || decimals < 0)
        throw new Erc20TransferError("preflight", "Token decimals are unavailable.");
      const units = parseTokenAmount(amount, decimals);
      if (observed.units < units)
        throw new Erc20TransferError("preflight", "Insufficient token balance.");
      record.units = units;
      const result = await owner.transferErc20({
        token: getAddress(token),
        destination: getAddress(record.destination),
        units,
        beforeSubmit: () => {
          if (!mounted.current) throw new Error("Deposit workflow closed.");
          binding.assertActive();
        },
        submitted: (hash) => {
          // A late approval still produces a hash, which supersedes any abandoned local wait.
          record.hash = hash;
          record.status = "confirming";
          record.failure = null;
          record.abandoned = false;
          publish(record);
        },
      });
      record.hash = result.hash;
      record.units = result.units;
      record.status = "confirmed";
      record.failure = null;
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
      record.failure = describeTransferFailure(failure, {
        submitted: record.hash !== undefined,
        // The captured wallet and vault sessions are held here, so their own assertions establish
        // the session change rather than any wording the failure happens to carry.
        sessionChanged:
          !mounted.current ||
          ended(() => {
            owner.assertActive();
          }) ||
          ended(() => {
            binding.assertActive();
          }),
      });
    } finally {
      busy.current = false;
      record.abandoned = false;
      publish(record);
    }
  };
  const continueDeposit = async (): Promise<void> => {
    // Ownership is taken before every check that a delayed preflight could invalidate, so a
    // second mount or a repeated click cannot reach the sweep at all.
    if (sweepOwner.current) return;
    const record = transferRef.current;
    if (record?.status !== "confirmed" || record.sweep !== "ready" || record.units === undefined)
      return;
    sweepOwner.current = record;
    record.sweep = "pending";
    record.sweepError = null;
    publish(record);
    try {
      record.binding.assertActive();
      if (vault.requireBinding() !== record.binding) throw new Error("Vault session changed.");
      await operations.deposit(record.token, record.units);
      record.sweep = "complete";
    } catch (failure) {
      record.sweep = "ready";
      record.sweepError = failure instanceof Error ? failure.message : "Midnight deposit failed.";
    } finally {
      if (sweepOwner.current === record) sweepOwner.current = null;
      publish(record);
    }
  };
  const recheckTransfer = async (): Promise<void> => {
    if (recheckOwner.current) return;
    const record = transferRef.current;
    if (!record?.hash || record.units === undefined) return;
    recheckOwner.current = record;
    setRechecking(true);
    const units = record.units;
    const hash = record.hash;
    try {
      const owner = wallet;
      if (!owner) throw new Error("Connect an EVM wallet first.");
      const result = await owner.recheckErc20Transfer({
        hash,
        token: getAddress(record.token),
        destination: getAddress(record.destination),
        units,
      });
      record.hash = result.hash;
      record.units = result.units;
      record.status = "confirmed";
      record.failure = null;
      record.abandoned = false;
    } catch (failure) {
      record.status = "error";
      record.failure = describeTransferFailure(failure, {
        submitted: true,
        sessionChanged: false,
      });
    } finally {
      if (recheckOwner.current === record) recheckOwner.current = null;
      if (mounted.current) setRechecking(false);
      publish(record);
    }
  };
  const abandonApproval = (): void => {
    const record = transferRef.current;
    if (record?.status !== "approving") return;
    record.abandoned = true;
    record.status = "error";
    record.failure = describeTransferFailure(
      new Erc20TransferError("abandoned", "Wait released."),
      {
        submitted: false,
        sessionChanged: false,
      },
    );
    publish(record);
  };
  const dismissTransfer = (): void => {
    const record = transferRef.current;
    if (!record || busy.current || isUnresolved(record)) return;
    transferRef.current = null;
    if (mounted.current) setTransfer(null);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return {
    transfer,
    rechecking,
    unresolved: isUnresolved(transfer),
    sendDeposit,
    continueDeposit,
    recheckTransfer,
    abandonApproval,
    dismissTransfer,
  };
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
