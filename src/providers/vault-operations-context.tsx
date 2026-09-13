"use client";

import "./buffer-shim";

import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatUnits } from "viem";

import { fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import type { GasTopUpRequest } from "@/lib/evm/gas-topup-request";
import { AAVE_USDC, STATA_USDC } from "@/lib/midnight/evm-stata";
import { flow, type FlowKind } from "@/lib/midnight/flow";
import { midnightTxHistory, type MidnightTxRecord } from "@/lib/midnight/tx-history";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { fundingErrorSchema } from "@/lib/wallet-funding";

import { useRuntimeConfig } from "./runtime-config-context";
import { useVaultBalances } from "./vault-balances-context";
import { useVault } from "./vault-context";
import { useWalletReadiness } from "./wallet-readiness-context";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// These node rejection codes permit one full resynchronisation and retry.
const STALE_STATE_ERROR_CODES = ["196", "195", "171", "170"];
function errorCauseMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<object>();
  let current = error;
  do {
    if ((typeof current === "object" && current !== null) || typeof current === "function") {
      if (seen.has(current)) break;
      seen.add(current);
      const message = "message" in current ? (current.message ?? current) : current;
      if (typeof message === "string") messages.push(message);
      else if (
        typeof message === "number" ||
        typeof message === "bigint" ||
        typeof message === "boolean" ||
        typeof message === "symbol"
      )
        messages.push(message.toString());
      else messages.push("Unknown failure");
      current = "cause" in current ? current.cause : undefined;
    } else {
      messages.push(String(current));
      break;
    }
  } while (current);
  return messages;
}

function isStaleStateError(error: unknown): boolean {
  return errorCauseMessages(error).some((message) =>
    STALE_STATE_ERROR_CODES.some((code) => message.includes(`Custom error: ${code}`)),
  );
}

function describeFlowError(error: unknown): string {
  const messages = errorCauseMessages(error);
  return (
    messages.find((message) => /Custom error: \d+|Invalid Transaction/.test(message)) ??
    messages.at(-1) ??
    "Unknown failure"
  );
}

function reportFlowFailure(
  flow: { kind: string | null; fail: (message: string) => void },
  error: unknown,
  recordId: string | null,
): void {
  const reason = describeFlowError(error);
  console.error(`[midnight] ${flow.kind ?? "flow"} failed: ${reason}`, error);
  if (recordId)
    midnightTxHistory.update(recordId, {
      status: "failed",
      failureReason: reason,
    });
  flow.fail(reason);
}

async function requestGasTopUp(
  request: GasTopUpRequest,
  headers: Record<string, string>,
): Promise<void> {
  const res = await fetch("/api/midnight/gas-topup", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const parsed = fundingErrorSchema.safeParse(body);
    throw new Error(
      parsed.success
        ? (parsed.data.error ?? `Gas top-up failed (${res.status.toString()})`)
        : `Gas top-up failed (${res.status.toString()})`,
    );
  }
}

interface OperationResult {
  refunded: boolean;
}
interface VaultOperationState {
  log: string[];
  busy: boolean;
  ready: boolean;
  unavailable: string | null;
  deposit: (erc20: string, amount: bigint) => Promise<OperationResult>;
  recoverDeposit: (erc20: string, requestId: string) => Promise<OperationResult>;
  withdraw: (erc20: string, amount: bigint, receiver?: string) => Promise<OperationResult>;
  swap: (
    tokenIn: string,
    tokenOut: string,
    amount: bigint,
    fee?: bigint,
    slippageBps?: bigint,
  ) => Promise<OperationResult>;
  supply: (amount: bigint) => Promise<OperationResult>;
  redeem: (shares: bigint) => Promise<OperationResult>;
}
interface CapturedOperation {
  binding: VaultBinding;
  recoveryError?: string;
  recordId: string | null;
}

function useVaultOperationOwner(): VaultOperationState {
  const vaultOwner = useVault();
  const runtime = useRuntimeConfig();
  const topUpGas = (request: GasTopUpRequest): Promise<void> =>
    requestGasTopUp(request, runtime.requireServerHeaders());
  const readiness = useWalletReadiness();
  const { refresh } = useVaultBalances();
  const { binding } = vaultOwner;
  const depositAddress = binding?.depositAddress ?? "";
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const metadata = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!binding && !locked.current) flow.reset();
  }, [binding]);

  const append = (m: string): void => {
    setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${m}`]);
  };

  const tokenMeta = (erc20: string): { symbol: string; decimals: number } => {
    const token = MIDNIGHT_TOKENS.find((t) => t.erc20Address.toLowerCase() === erc20.toLowerCase());
    const decimals = metadata.current[erc20.toLowerCase()];
    if (decimals === undefined) throw new Error("Token decimals are unavailable.");
    return { symbol: token?.symbol ?? "ERC20", decimals };
  };
  const fmtAmount = (amount: bigint, erc20: string): string => {
    const { symbol, decimals } = tokenMeta(erc20);
    return `${formatUnits(amount, decimals)} ${symbol}`;
  };
  const nowSec = (): number => Math.floor(Date.now() / 1000);

  const requireOperationBinding = (kind: FlowKind): VaultBinding => {
    try {
      return vaultOwner.requireBinding();
    } catch (error) {
      flow.start(kind);
      flow.fail("Vault is not ready. Check the wallet and vault identity.");
      throw error;
    }
  };

  const withStaleStateRecovery = async <T,>(
    operation: CapturedOperation,
    op: (active: VaultBinding) => Promise<T>,
  ): Promise<T> => {
    const captured = operation.binding;
    captured.assertActive();
    try {
      const result = await op(captured);
      captured.assertActive();
      return result;
    } catch (error) {
      captured.assertActive();
      if (!isStaleStateError(error)) throw error;
      append("Wallet state drifted behind the chain. Resynchronising from scratch...");
      const recovered = await vaultOwner.rebuild(captured, (error) => {
        operation.recoveryError = describeFlowError(error);
        if (mounted.current) flow.fail(operation.recoveryError);
      });
      operation.binding = recovered;
      const result = await op(recovered);
      recovered.assertActive();
      return result;
    }
  };

  const runFlow = async (
    kind: "deposit" | "withdraw",
    erc20Address: string,
    amountUnits: bigint,
    receiver?: string,
    recoveryRequestId?: string,
  ): Promise<void> => {
    const captured = requireOperationBinding(kind);
    const operation: CapturedOperation = {
      binding: captured,
      recordId: null,
    };
    const appendActive = (message: string): void => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runDeposit, runWithdraw } = await import("@/lib/midnight/vault");
    captured.assertActive();
    flow.start(kind);
    const amountStr = fmtAmount(amountUnits, erc20Address);
    const { symbol } = tokenMeta(erc20Address);
    const record = (
      rid: string,
      base: Omit<MidnightTxRecord, "id" | "status" | "timestampRaw" | "txHash">,
      evmTxHash?: string,
    ): void => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: runtime.applied.midnight.networkId,
        chainId: runtime.applied.evm.chainId,
        rpcUrl: runtime.applied.evm.rpcUrl,
        explorerUrl: runtime.applied.evm.explorerUrl,
        vaultContractAddress: runtime.applied.environment.contractAddress,
        id: rid,
        ...base,
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      if (kind === "deposit") {
        append("Requesting gas top-up from relayer...");
        captured.assertActive();
        await topUpGas({
          operation: "deposit",
          recipient: { kind: "deposit", path: captured.identity.pathHex },
        });
        await withStaleStateRecovery(operation, (active) =>
          runDeposit(
            active.providers,
            active.contract,
            active.environment,
            active.identity,
            erc20Address,
            amountUnits,
            appendActive,
            (rid, hash) => {
              record(
                rid,
                {
                  type: "Deposit",
                  fromSymbol: "WALLET",
                  fromAmount: depositAddress,
                  toSymbol: symbol,
                  toAmount: amountStr,
                  counterparty: depositAddress,
                },
                hash,
              );
            },
            recoveryRequestId,
          ),
        );
      } else {
        const hex = (receiver ?? "").trim().replace(/^0x/, "");
        const destHex = hex.length === 40 ? `0x${hex}` : DEAD_ADDRESS;
        append("Requesting gas top-up from relayer...");
        captured.assertActive();
        await topUpGas({ operation: "withdraw", recipient: { kind: "vault" } });
        await withStaleStateRecovery(operation, (active) =>
          runWithdraw(
            active.providers,
            active.contract,
            active.environment,
            active.identity,
            erc20Address,
            amountUnits,
            destHex,
            appendActive,
            () => {
              active.assertActive();
              return topUpGas({
                operation: "withdraw",
                recipient: { kind: "vault" },
              });
            },
            (rid, hash) => {
              record(
                rid,
                {
                  type: "Withdraw",
                  fromSymbol: symbol,
                  fromAmount: amountStr,
                  toSymbol: "WALLET",
                  toAmount: destHex,
                  counterparty: destHex,
                },
                hash,
              );
            },
          ),
        );
      }
      if (operation.recordId)
        midnightTxHistory.update(operation.recordId, {
          status: flow.refunded ? "refunded" : "completed",
        });
      void refresh(operation.binding).catch(() => undefined);
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, operation.recordId);
      } catch {
        if (operation.recordId)
          midnightTxHistory.update(operation.recordId, {
            status: "failed",
            failureReason: operation.recoveryError ?? "Vault session superseded.",
          });
      }
      throw e;
    }
  };

  const runSwapFlow = async (
    tokenInErc20: string,
    tokenOutErc20: string,
    amountUnits: bigint,
    fee = 500n,
    slippageBps = 100n,
  ): Promise<void> => {
    const captured = requireOperationBinding("swap");
    const operation: CapturedOperation = {
      binding: captured,
      recordId: null,
    };
    const appendActive = (message: string): void => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runSwap } = await import("@/lib/midnight/vault");
    const { flow } = await import("@/lib/midnight/flow");
    captured.assertActive();
    flow.start("swap");
    const record = (rid: string, evmTxHash?: string): void => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: runtime.applied.midnight.networkId,
        chainId: runtime.applied.evm.chainId,
        rpcUrl: runtime.applied.evm.rpcUrl,
        explorerUrl: runtime.applied.evm.explorerUrl,
        vaultContractAddress: runtime.applied.environment.contractAddress,
        id: rid,
        type: "Swap",
        fromSymbol: tokenMeta(tokenInErc20).symbol,
        fromAmount: fmtAmount(amountUnits, tokenInErc20),
        toSymbol: tokenMeta(tokenOutErc20).symbol,
        toAmount: "",
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      append("Requesting gas top-up from relayer...");
      captured.assertActive();
      await topUpGas({ operation: "swap", recipient: { kind: "vault" } });
      await withStaleStateRecovery(operation, (active) =>
        runSwap(
          active.providers,
          active.contract,
          active.environment,
          active.identity,
          tokenInErc20,
          tokenOutErc20,
          amountUnits,
          appendActive,
          fee,
          slippageBps,
          () => {
            active.assertActive();
            return topUpGas({
              operation: "swap",
              recipient: { kind: "vault" },
            });
          },
          (rid, hash) => {
            record(rid, hash);
          },
        ),
      );
      if (operation.recordId)
        midnightTxHistory.update(operation.recordId, {
          status: flow.refunded ? "refunded" : "completed",
        });
      void refresh(operation.binding).catch(() => undefined);
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, operation.recordId);
      } catch {
        if (operation.recordId)
          midnightTxHistory.update(operation.recordId, {
            status: "failed",
            failureReason: operation.recoveryError ?? "Vault session superseded.",
          });
      }
      throw e;
    }
  };

  const runSupplyFlow = async (amountUnits: bigint): Promise<void> => {
    const captured = requireOperationBinding("supply");
    const operation: CapturedOperation = {
      binding: captured,
      recordId: null,
    };
    const appendActive = (message: string): void => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runSupply } = await import("@/lib/midnight/vault");
    const { flow } = await import("@/lib/midnight/flow");
    captured.assertActive();
    flow.start("supply");
    const record = (rid: string, evmTxHash?: string): void => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: runtime.applied.midnight.networkId,
        chainId: runtime.applied.evm.chainId,
        rpcUrl: runtime.applied.evm.rpcUrl,
        explorerUrl: runtime.applied.evm.explorerUrl,
        vaultContractAddress: runtime.applied.environment.contractAddress,
        id: rid,
        type: "Supply",
        fromSymbol: "USDC.a",
        fromAmount: fmtAmount(amountUnits, AAVE_USDC),
        basisAssets: formatUnits(amountUnits, tokenMeta(AAVE_USDC).decimals),
        toSymbol: "stataUSDC",
        toAmount: "",
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      append("Requesting gas top-up from relayer...");
      captured.assertActive();
      await topUpGas({ operation: "supply", recipient: { kind: "vault" } });
      const mintedShares = await withStaleStateRecovery(operation, (active) =>
        runSupply(
          active.providers,
          active.contract,
          active.environment,
          active.identity,
          amountUnits,
          appendActive,
          () => {
            active.assertActive();
            return topUpGas({
              operation: "supply",
              recipient: { kind: "vault" },
            });
          },
          (rid, hash) => {
            record(rid, hash);
          },
        ),
      );
      if (operation.recordId)
        midnightTxHistory.update(operation.recordId, {
          status: flow.refunded ? "refunded" : "completed",
          toAmount:
            mintedShares == null
              ? ""
              : `${formatUnits(mintedShares, tokenMeta(STATA_USDC).decimals)} stataUSDC`,
          sharesReceived:
            mintedShares == null
              ? undefined
              : formatUnits(mintedShares, tokenMeta(STATA_USDC).decimals),
        });
      void refresh(operation.binding).catch(() => undefined);
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, operation.recordId);
      } catch {
        if (operation.recordId)
          midnightTxHistory.update(operation.recordId, {
            status: "failed",
            failureReason: operation.recoveryError ?? "Vault session superseded.",
          });
      }
      throw e;
    }
  };

  const runRedeemFlow = async (shares: bigint): Promise<void> => {
    const captured = requireOperationBinding("redeem");
    const operation: CapturedOperation = {
      binding: captured,
      recordId: null,
    };
    const appendActive = (message: string): void => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runRedeem } = await import("@/lib/midnight/vault");
    const { flow } = await import("@/lib/midnight/flow");
    captured.assertActive();
    flow.start("redeem");
    const record = (rid: string, evmTxHash?: string): void => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: runtime.applied.midnight.networkId,
        chainId: runtime.applied.evm.chainId,
        rpcUrl: runtime.applied.evm.rpcUrl,
        explorerUrl: runtime.applied.evm.explorerUrl,
        vaultContractAddress: runtime.applied.environment.contractAddress,
        id: rid,
        type: "Redeem",
        fromSymbol: "stataUSDC",
        fromAmount: fmtAmount(shares, STATA_USDC),
        sharesBurned: formatUnits(shares, tokenMeta(STATA_USDC).decimals),
        toSymbol: "USDC",
        toAmount: "",
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      append("Requesting gas top-up from relayer...");
      captured.assertActive();
      await topUpGas({ operation: "redeem", recipient: { kind: "vault" } });
      const redeemedAssets = await withStaleStateRecovery(operation, (active) =>
        runRedeem(
          active.providers,
          active.contract,
          active.environment,
          active.identity,
          shares,
          appendActive,
          () => {
            active.assertActive();
            return topUpGas({
              operation: "redeem",
              recipient: { kind: "vault" },
            });
          },
          (rid, hash) => {
            record(rid, hash);
          },
        ),
      );
      if (operation.recordId)
        midnightTxHistory.update(operation.recordId, {
          status: flow.refunded ? "refunded" : "completed",
          toAmount:
            redeemedAssets == null
              ? ""
              : `${formatUnits(redeemedAssets, tokenMeta(AAVE_USDC).decimals)} USDC.a`,
          proceedsAssets:
            redeemedAssets == null
              ? undefined
              : formatUnits(redeemedAssets, tokenMeta(AAVE_USDC).decimals),
        });
      void refresh(operation.binding).catch(() => undefined);
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, operation.recordId);
      } catch {
        if (operation.recordId)
          midnightTxHistory.update(operation.recordId, {
            status: "failed",
            failureReason: operation.recoveryError ?? "Vault session superseded.",
          });
      }
      throw e;
    }
  };

  const execute = async (
    kind: FlowKind,
    tokens: string[],
    run: () => Promise<void>,
  ): Promise<OperationResult> => {
    if (locked.current) throw new Error("A vault operation is already in progress.");
    runtime.requireServerHeaders();
    const active = vaultOwner.requireBinding();
    locked.current = true;
    setBusy(true);
    flow.start(kind);
    try {
      await readiness.requireReady();
      active.assertActive();
      const entries = await Promise.all(
        tokens.map(
          async (token) =>
            [token.toLowerCase(), await fetchErc20Decimals(token, runtime.applied.evm)] as const,
        ),
      );
      active.assertActive();
      metadata.current = Object.fromEntries(entries);
      await run();
      return { refunded: flow.refunded };
    } catch (error) {
      try {
        active.assertActive();
        if (mounted.current && !flow.error) flow.fail(describeFlowError(error));
      } catch {
        /* Superseded work cannot publish a terminal state. */
      }
      throw error;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return {
    log,
    busy,
    ready: readiness.ready && !runtime.serverUnavailable,
    unavailable: runtime.serverUnavailable,
    deposit: (erc20: string, amount: bigint) =>
      execute("deposit", [erc20], () => runFlow("deposit", erc20, amount)),
    recoverDeposit: (erc20: string, requestId: string) =>
      execute("deposit", [erc20], async () => {
        const active = vaultOwner.requireBinding();
        const { readPendingDeposit } = await import("@/lib/midnight/vault");
        const view = await readPendingDeposit(
          active.providers,
          active.environment,
          active.identity,
          erc20,
          requestId,
        );
        active.assertActive();
        await runFlow("deposit", erc20, view.amount, undefined, requestId);
      }),
    withdraw: (erc20: string, amount: bigint, receiver?: string) =>
      execute("withdraw", [erc20], () => runFlow("withdraw", erc20, amount, receiver)),
    swap: (tokenIn: string, tokenOut: string, amount: bigint, fee?: bigint, slippageBps?: bigint) =>
      execute("swap", [tokenIn, tokenOut], () =>
        runSwapFlow(tokenIn, tokenOut, amount, fee, slippageBps),
      ),
    supply: (amount: bigint) =>
      execute("supply", [AAVE_USDC, STATA_USDC], () => runSupplyFlow(amount)),
    redeem: (shares: bigint) =>
      execute("redeem", [AAVE_USDC, STATA_USDC], () => runRedeemFlow(shares)),
  };
}

const VaultOperationsContext = createContext<ReturnType<typeof useVaultOperationOwner> | null>(
  null,
);
/**
 * Serialises vault operations and retains captured request identities through recovery.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing operation ownership and progress.
 * @returns The operation context for the current vault owner.
 */
export function VaultOperationsProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useVaultOperationOwner();
  return (
    <VaultOperationsContext.Provider value={value}>{children}</VaultOperationsContext.Provider>
  );
}
/**
 * Reads operation actions sharing one lock across every vault widget.
 *
 * @returns Current readiness, progress and guarded operation actions.
 * @throws {Error} If the operation provider is missing.
 */
export function useVaultOperations(): VaultOperationState {
  const value = useContext(VaultOperationsContext);
  if (!value) throw new Error("useVaultOperations requires VaultOperationsProvider.");
  return value;
}
