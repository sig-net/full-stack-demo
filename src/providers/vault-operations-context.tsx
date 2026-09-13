"use client";
import "./buffer-shim";

import { bytesToHex } from "@sig-net/midnight";
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

import type { RuntimeSnapshot } from "@/lib/config/runtime";
import { fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import type { GasTopUpRequest } from "@/lib/evm/gas-topup-request";
import { AAVE_USDC, STATA_USDC } from "@/lib/midnight/evm-stata";
import {
  flow,
  type FlowKind,
  type OperationProgress,
  type VaultExecutionResult,
} from "@/lib/midnight/flow";
import {
  type LendingPosition,
  midnightTxHistory,
  type MidnightTxRecord,
} from "@/lib/midnight/tx-history";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { fundingErrorSchema } from "@/lib/wallet-funding";

import { useMidnightReadiness } from "./midnight-readiness-context";
import { useRuntimeConfig } from "./runtime-config-context";
import { useVaultBalances } from "./vault-balances-context";
import { useVault } from "./vault-context";
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
  id: string;
  binding: VaultBinding;
  metadata: Record<string, number>;
  configuration: RuntimeSnapshot;
  progress: OperationProgress;
  recoveryError?: string;
  recordId: string | null;
}

function useVaultOperationOwner(): VaultOperationState {
  const vaultOwner = useVault();
  const runtime = useRuntimeConfig();
  const topUpGas = (request: GasTopUpRequest): Promise<void> =>
    requestGasTopUp(request, runtime.requireServerHeaders());
  const readiness = useMidnightReadiness();
  const { refresh } = useVaultBalances();
  const { binding } = vaultOwner;
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
  const currentOperation = useRef<CapturedOperation | null>(null);
  useEffect(() => {
    if (!binding && !locked.current) flow.reset();
  }, [binding]);

  const ownsPresentation = (operation: CapturedOperation): boolean => {
    if (!mounted.current || currentOperation.current !== operation) return false;
    try {
      operation.binding.assertActive();
      return true;
    } catch {
      return false;
    }
  };
  const progressFor = (operation: CapturedOperation, binding: VaultBinding): OperationProgress => ({
    set: (phase) => {
      if (!ownsPresentation(operation) || operation.binding !== binding) return;
      flow.set(phase);
    },
  });
  const append = (operation: CapturedOperation, m: string): void => {
    if (ownsPresentation(operation))
      setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${m}`]);
  };

  const tokenMeta = (
    operation: CapturedOperation,
    erc20: string,
  ): { symbol: string; decimals: number } => {
    const token = MIDNIGHT_TOKENS.find((t) => t.erc20Address.toLowerCase() === erc20.toLowerCase());
    const decimals = operation.metadata[erc20.toLowerCase()];
    if (decimals === undefined) throw new Error("Token decimals are unavailable.");
    return { symbol: token?.symbol ?? "ERC20", decimals };
  };
  const fmtAmount = (operation: CapturedOperation, amount: bigint, erc20: string): string => {
    const { symbol, decimals } = tokenMeta(operation, erc20);
    return `${formatUnits(amount, decimals)} ${symbol}`;
  };
  const nowSec = (): number => Math.floor(Date.now() / 1000);
  const position = (operation: CapturedOperation): LendingPosition => ({
    deploymentFingerprint: operation.configuration.fingerprint,
    commitment: bytesToHex(operation.binding.identity.commitment),
    midnightNetwork: operation.configuration.midnight.networkId,
    chainId: operation.configuration.evm.chainId,
    vaultContract: operation.binding.environment.contractAddress,
    assetToken: AAVE_USDC,
    shareToken: STATA_USDC,
    assetDecimals: tokenMeta(operation, AAVE_USDC).decimals,
    shareDecimals: tokenMeta(operation, STATA_USDC).decimals,
  });

  const withStaleStateRecovery = async <T,>(
    operation: CapturedOperation,
    op: (active: VaultBinding) => Promise<T>,
  ): Promise<T> => {
    const captured = operation.binding;
    captured.assertActive();
    try {
      const result = await op(captured);
      return result;
    } catch (error) {
      captured.assertActive();
      if (!isStaleStateError(error)) throw error;
      append(operation, "Wallet state drifted behind the chain. Resynchronising from scratch...");
      const recovered = await vaultOwner.rebuild(captured, (error) => {
        operation.recoveryError = describeFlowError(error);
        if (ownsPresentation(operation)) flow.fail(operation.recoveryError);
      });
      operation.binding = recovered;
      operation.progress = progressFor(operation, recovered);
      const result = await op(recovered);
      return result;
    }
  };

  const finishOperation = (
    operation: CapturedOperation,
    result: VaultExecutionResult,
    patch: Partial<MidnightTxRecord> = {},
  ): VaultExecutionResult => {
    if (operation.recordId)
      midnightTxHistory.update(operation.recordId, {
        ...patch,
        status: result.status === "refunded" ? "refunded" : "completed",
      });
    void refresh(operation.binding).catch(() => undefined);
    return result;
  };
  const failOperation = (operation: CapturedOperation, error: unknown): void => {
    const reason = describeFlowError(error);
    let interrupted = false;
    try {
      operation.binding.assertActive();
    } catch {
      interrupted = true;
    }
    if (operation.recordId)
      midnightTxHistory.update(operation.recordId, {
        status: interrupted ? "interrupted" : "failed",
        failureReason: interrupted
          ? (operation.recoveryError ?? "Vault session superseded.")
          : reason,
      });
    if (ownsPresentation(operation)) {
      console.error(`[midnight] operation failed: ${reason}`, error);
      flow.fail(reason);
    }
  };

  const runFlow = async (
    operation: CapturedOperation,
    kind: "deposit" | "withdraw",
    erc20Address: string,
    amountUnits: bigint,
    receiver?: string,
    recoveryRequestId?: string,
  ): Promise<VaultExecutionResult> => {
    const captured = operation.binding;
    const appendActive = (message: string): void => {
      append(operation, message);
    };
    const { runDeposit, runWithdraw } = await import("@/lib/midnight/vault");
    captured.assertActive();

    const amountStr = fmtAmount(operation, amountUnits, erc20Address);
    const { symbol } = tokenMeta(operation, erc20Address);
    const record = (
      rid: string,
      base: Omit<MidnightTxRecord, "id" | "status" | "timestampRaw" | "txHash">,
      evmTxHash?: string,
    ): void => {
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: operation.configuration.evm.chainId,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.environment.contractAddress,
        id: rid,
        ...base,
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      let result: VaultExecutionResult;
      if (kind === "deposit") {
        append(operation, "Requesting gas top-up from relayer...");
        captured.assertActive();
        await topUpGas({
          operation: "deposit",
          recipient: { kind: "deposit", path: captured.identity.pathHex },
        });
        result = await withStaleStateRecovery(operation, (active) =>
          runDeposit(
            operation.progress,
            active.providers,
            active.contract,
            active.environment,
            active.identity,
            erc20Address,
            amountUnits,
            (message) => {
              if (active === operation.binding) appendActive(message);
            },
            (rid, hash) => {
              record(
                rid,
                {
                  type: "Deposit",
                  fromSymbol: "WALLET",
                  fromAmount: captured.depositAddress,
                  toSymbol: symbol,
                  toAmount: amountStr,
                  counterparty: captured.depositAddress,
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
        append(operation, "Requesting gas top-up from relayer...");
        captured.assertActive();
        await topUpGas({ operation: "withdraw", recipient: { kind: "vault" } });
        result = await withStaleStateRecovery(operation, (active) =>
          runWithdraw(
            operation.progress,
            active.providers,
            active.contract,
            active.environment,
            active.identity,
            erc20Address,
            amountUnits,
            destHex,
            (message) => {
              if (active === operation.binding) appendActive(message);
            },
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
      return finishOperation(operation, result);
    } catch (e) {
      failOperation(operation, e);
      throw e;
    }
  };

  const runSwapFlow = async (
    operation: CapturedOperation,
    tokenInErc20: string,
    tokenOutErc20: string,
    amountUnits: bigint,
    fee = 500n,
    slippageBps = 100n,
  ): Promise<VaultExecutionResult> => {
    const captured = operation.binding;
    const appendActive = (message: string): void => {
      append(operation, message);
    };
    const { runSwap } = await import("@/lib/midnight/vault");
    captured.assertActive();

    const record = (rid: string, evmTxHash?: string): void => {
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: operation.configuration.evm.chainId,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.environment.contractAddress,
        id: rid,
        type: "Swap",
        fromSymbol: tokenMeta(operation, tokenInErc20).symbol,
        fromAmount: fmtAmount(operation, amountUnits, tokenInErc20),
        toSymbol: tokenMeta(operation, tokenOutErc20).symbol,
        toAmount: "",
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      append(operation, "Requesting gas top-up from relayer...");
      captured.assertActive();
      await topUpGas({ operation: "swap", recipient: { kind: "vault" } });
      const result = await withStaleStateRecovery(operation, (active) =>
        runSwap(
          operation.progress,
          active.providers,
          active.contract,
          active.environment,
          active.identity,
          tokenInErc20,
          tokenOutErc20,
          amountUnits,
          (message) => {
            if (active === operation.binding) appendActive(message);
          },
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
      return finishOperation(operation, result);
    } catch (e) {
      failOperation(operation, e);
      throw e;
    }
  };

  const runSupplyFlow = async (
    operation: CapturedOperation,
    amountUnits: bigint,
  ): Promise<VaultExecutionResult> => {
    const captured = operation.binding;
    const appendActive = (message: string): void => {
      append(operation, message);
    };
    const { runSupply } = await import("@/lib/midnight/vault");
    captured.assertActive();

    const record = (rid: string, evmTxHash?: string): void => {
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: operation.configuration.evm.chainId,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.environment.contractAddress,
        id: rid,
        type: "Supply",
        position: position(operation),
        assetUnits: amountUnits.toString(),
        fromSymbol: "USDC.a",
        fromAmount: fmtAmount(operation, amountUnits, AAVE_USDC),
        basisAssets: formatUnits(amountUnits, tokenMeta(operation, AAVE_USDC).decimals),
        toSymbol: "stataUSDC",
        toAmount: "",
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      append(operation, "Requesting gas top-up from relayer...");
      captured.assertActive();
      await topUpGas({ operation: "supply", recipient: { kind: "vault" } });
      const result = await withStaleStateRecovery(operation, (active) =>
        runSupply(
          operation.progress,
          active.providers,
          active.contract,
          active.environment,
          active.identity,
          amountUnits,
          (message) => {
            if (active === operation.binding) appendActive(message);
          },
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
      const mintedShares = result.status === "settled" ? result.outputUnits : null;
      return finishOperation(operation, result, {
        toAmount:
          mintedShares == null
            ? ""
            : `${formatUnits(mintedShares, tokenMeta(operation, STATA_USDC).decimals)} stataUSDC`,
        shareUnits: mintedShares?.toString(),
        sharesReceived:
          mintedShares == null
            ? undefined
            : formatUnits(mintedShares, tokenMeta(operation, STATA_USDC).decimals),
      });
    } catch (e) {
      failOperation(operation, e);
      throw e;
    }
  };

  const runRedeemFlow = async (
    operation: CapturedOperation,
    shares: bigint,
  ): Promise<VaultExecutionResult> => {
    const captured = operation.binding;
    const appendActive = (message: string): void => {
      append(operation, message);
    };
    const { runRedeem } = await import("@/lib/midnight/vault");
    captured.assertActive();

    const record = (rid: string, evmTxHash?: string): void => {
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: operation.configuration.evm.chainId,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.environment.contractAddress,
        id: rid,
        type: "Redeem",
        position: position(operation),
        shareUnits: shares.toString(),
        fromSymbol: "stataUSDC",
        fromAmount: fmtAmount(operation, shares, STATA_USDC),
        sharesBurned: formatUnits(shares, tokenMeta(operation, STATA_USDC).decimals),
        toSymbol: "USDC",
        toAmount: "",
        txHash: evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      append(operation, "Requesting gas top-up from relayer...");
      captured.assertActive();
      await topUpGas({ operation: "redeem", recipient: { kind: "vault" } });
      const result = await withStaleStateRecovery(operation, (active) =>
        runRedeem(
          operation.progress,
          active.providers,
          active.contract,
          active.environment,
          active.identity,
          shares,
          (message) => {
            if (active === operation.binding) appendActive(message);
          },
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
      const redeemedAssets = result.status === "settled" ? result.outputUnits : null;
      return finishOperation(operation, result, {
        toAmount:
          redeemedAssets == null
            ? ""
            : `${formatUnits(redeemedAssets, tokenMeta(operation, AAVE_USDC).decimals)} USDC.a`,
        assetUnits: redeemedAssets?.toString(),
        proceedsAssets:
          redeemedAssets == null
            ? undefined
            : formatUnits(redeemedAssets, tokenMeta(operation, AAVE_USDC).decimals),
      });
    } catch (e) {
      failOperation(operation, e);
      throw e;
    }
  };

  const execute = async (
    kind: FlowKind,
    tokens: string[],
    run: (operation: CapturedOperation) => Promise<VaultExecutionResult>,
  ): Promise<OperationResult> => {
    if (locked.current) throw new Error("A vault operation is already in progress.");
    runtime.requireServerHeaders();
    const active = vaultOwner.requireBinding();
    const operation: CapturedOperation = {
      id: crypto.randomUUID(),
      binding: active,
      metadata: {},
      recordId: null,
      configuration: runtime.applied,
      progress: {
        set: (phase) => {
          if (operation.binding !== active || !ownsPresentation(operation)) return;
          flow.set(phase);
        },
      },
    };
    currentOperation.current = operation;
    locked.current = true;
    setBusy(true);
    setLog([]);
    flow.start(kind);
    try {
      await readiness.requireReady();
      active.assertActive();
      const entries = await Promise.all(
        tokens.map(
          async (token) =>
            [
              token.toLowerCase(),
              await fetchErc20Decimals(token, operation.configuration.evm),
            ] as const,
        ),
      );
      active.assertActive();
      operation.metadata = Object.fromEntries(entries);
      const result = await run(operation);
      if (currentOperation.current === operation && mounted.current) {
        try {
          operation.binding.assertActive();
          if (result.status === "refunded") flow.finishRefunded();
          else flow.set("done");
        } catch {
          /* Captured evidence remains available after replacement. */
        }
      }
      return { refunded: result.status === "refunded" };
    } catch (error) {
      try {
        active.assertActive();
        if (ownsPresentation(operation) && !flow.error) flow.fail(describeFlowError(error));
      } catch {
        /* Superseded work cannot publish a terminal state. */
      }
      throw error;
    } finally {
      if (currentOperation.current === operation) {
        currentOperation.current = null;
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  };
  return {
    log,
    busy,
    ready: readiness.ready && !runtime.serverUnavailable,
    unavailable: runtime.serverUnavailable,
    deposit: (erc20: string, amount: bigint) =>
      execute("deposit", [erc20], (operation) => runFlow(operation, "deposit", erc20, amount)),
    recoverDeposit: (erc20: string, requestId: string) =>
      execute("deposit", [erc20], async (operation) => {
        const active = operation.binding;
        const { readPendingDeposit } = await import("@/lib/midnight/vault");
        const view = await readPendingDeposit(
          active.providers,
          active.environment,
          active.identity,
          erc20,
          requestId,
        );
        active.assertActive();
        return runFlow(operation, "deposit", erc20, view.amount, undefined, requestId);
      }),
    withdraw: (erc20: string, amount: bigint, receiver?: string) =>
      execute("withdraw", [erc20], (operation) =>
        runFlow(operation, "withdraw", erc20, amount, receiver),
      ),
    swap: (tokenIn: string, tokenOut: string, amount: bigint, fee?: bigint, slippageBps?: bigint) =>
      execute("swap", [tokenIn, tokenOut], (operation) =>
        runSwapFlow(operation, tokenIn, tokenOut, amount, fee, slippageBps),
      ),
    supply: (amount: bigint) =>
      execute("supply", [AAVE_USDC, STATA_USDC], (operation) => runSupplyFlow(operation, amount)),
    redeem: (shares: bigint) =>
      execute("redeem", [AAVE_USDC, STATA_USDC], (operation) => runRedeemFlow(operation, shares)),
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
