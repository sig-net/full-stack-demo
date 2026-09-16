"use client";

import "./buffer-shim";

import { bytesToHex } from "@sig-net/midnight";
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
import { formatUnits } from "viem";

import { resolveEvmChain, type RuntimeSnapshot } from "@/lib/config/runtime";
import { fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { requireGasReserve } from "@/lib/evm/gas-reserve";
import { type DepositLookup, describeDepositLookup } from "@/lib/midnight/deposit-lookup";
import { MPC_OPERATION_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
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
  type MidnightTxStatus,
} from "@/lib/midnight/tx-history";
import type { VaultBinding } from "@/lib/midnight/vault-session";

import { useConfiguration } from "./configuration-context";
import { useMidnightReadiness } from "./midnight-readiness-context";
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
  // A superseded-during failure already names both facts, and unwrapping to its cause would
  // publish the interrupted failure alone, as if the session were still the one that observed it.
  if (error instanceof SupersededDuringFailure) return error.message;
  const messages = errorCauseMessages(error);
  return (
    messages.find((message) => /Custom error: \d+|Invalid Transaction/.test(message)) ??
    messages.at(-1) ??
    "Unknown failure"
  );
}

/** Terminal failure of work whose captured session was replaced before it could report. */
class SupersededDuringFailure extends Error {}

/**
 * Keeps a node rejection visible when the session that observed it was replaced mid-flight.
 *
 * Both facts reach the terminal message: the session replacement that ended the work, and the
 * failure it interrupted, which is the only evidence of why the operation stopped progressing.
 *
 * @param cause - Failure the captured session was reporting when it was replaced.
 * @param superseded - Ownership rejection raised by the replaced session.
 * @returns One error naming the replacement and retaining the interrupted failure.
 */
function supersededDuring(cause: unknown, superseded: unknown): Error {
  return new SupersededDuringFailure(
    `${describeFlowError(superseded)} The failure it interrupted: ${describeFlowError(cause)}`,
    { cause },
  );
}

interface OperationResult {
  refunded: boolean;
}
interface DepositRequest {
  token: string;
  requestId: string | null;
  status: MidnightTxStatus;
}
interface VaultOperationState {
  currentDeposit: DepositRequest | null;
  log: string[];
  busy: boolean;
  ready: boolean;
  unavailable: string | null;
  deposit: (erc20: string, amount: bigint) => Promise<OperationResult>;
  lookupDepositRequest: (erc20: string, requestId: string) => Promise<DepositLookup>;
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
  const runtime = useConfiguration();
  const queries = useQueryClient();
  const readiness = useMidnightReadiness();
  const { refresh } = useVaultBalances();
  const { binding } = vaultOwner;
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [depositRequest, setDepositRequest] = useState<{
    operation: CapturedOperation;
    request: DepositRequest;
  } | null>(null);
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
    if (!locked.current)
      setDepositRequest((current) => (current?.operation.binding === binding ? current : null));
  }, [binding, busy]);

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
      if (!mounted.current || operation.binding !== binding) return;
      flow.set(phase, operation);
    },
    event: (event) => {
      if (!mounted.current || operation.binding !== binding) return;
      flow.event(event, operation);
    },
    observed: () => {
      if (!mounted.current || operation.binding !== binding) return;
      flow.observed(operation);
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
    chainId: resolveEvmChain(operation.configuration.evm).chain.id,
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
      try {
        captured.assertActive();
      } catch (superseded) {
        throw supersededDuring(error, superseded);
      }
      if (!isStaleStateError(error)) throw error;
      append(operation, "Wallet state drifted behind the chain. Resynchronising from scratch...");
      const recovered = await vaultOwner.rebuild(captured, (error) => {
        operation.recoveryError = describeFlowError(error);
        if (mounted.current) flow.fail(operation.recoveryError, operation);
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
    if (ownsPresentation(operation))
      setDepositRequest((current) =>
        current?.operation === operation
          ? { ...current, request: { ...current.request, status: "completed" } }
          : current,
      );
    if (operation.recordId)
      midnightTxHistory.update(operation.recordId, {
        ...patch,
        midnightTxHash: result.midnightTxHash,
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
      setDepositRequest((current) =>
        current?.operation === operation
          ? { ...current, request: { ...current.request, status: "failed" } }
          : current,
      );
      console.error(`[midnight] operation failed: ${reason}`, error);
    }
    // The shared progress owner must settle whenever its owning operation stops. A replaced
    // binding changes who the result belongs to, never whether the page may keep claiming that
    // work is still in flight.
    if (mounted.current) flow.fail(reason, operation);
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
      base: Omit<MidnightTxRecord, "id" | "status" | "timestampRaw" | "evmTxHash">,
      evmTxHash?: string,
    ): void => {
      if (operation.recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: resolveEvmChain(operation.configuration.evm).chain.id,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.vault.contractAddress,
        id: rid,
        ...base,
        evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
      let result: VaultExecutionResult;
      if (kind === "deposit") {
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
              if (currentOperation.current !== operation || active !== operation.binding) return;
              if (ownsPresentation(operation))
                setDepositRequest({
                  operation,
                  request: { token: erc20Address, requestId: rid, status: "pending" },
                });
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
        if (evmTxHash) midnightTxHistory.update(rid, { evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: resolveEvmChain(operation.configuration.evm).chain.id,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.vault.contractAddress,
        id: rid,
        type: "Swap",
        fromSymbol: tokenMeta(operation, tokenInErc20).symbol,
        fromAmount: fmtAmount(operation, amountUnits, tokenInErc20),
        toSymbol: tokenMeta(operation, tokenOutErc20).symbol,
        toAmount: "",
        evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
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
        if (evmTxHash) midnightTxHistory.update(rid, { evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: resolveEvmChain(operation.configuration.evm).chain.id,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.vault.contractAddress,
        id: rid,
        type: "Supply",
        position: position(operation),
        assetUnits: amountUnits.toString(),
        fromSymbol: "USDC.a",
        fromAmount: fmtAmount(operation, amountUnits, AAVE_USDC),
        basisAssets: formatUnits(amountUnits, tokenMeta(operation, AAVE_USDC).decimals),
        toSymbol: "stataUSDC",
        toAmount: "",
        evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
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
        if (evmTxHash) midnightTxHistory.update(rid, { evmTxHash });
        return;
      }
      operation.recordId = rid;
      midnightTxHistory.add({
        networkId: operation.configuration.midnight.networkId,
        chainId: resolveEvmChain(operation.configuration.evm).chain.id,
        rpcUrl: operation.configuration.evm.rpcUrl,
        explorerUrl: operation.configuration.evm.explorerUrl,
        vaultContractAddress: operation.configuration.vault.contractAddress,
        id: rid,
        type: "Redeem",
        position: position(operation),
        shareUnits: shares.toString(),
        fromSymbol: "stataUSDC",
        fromAmount: fmtAmount(operation, shares, STATA_USDC),
        sharesBurned: formatUnits(shares, tokenMeta(operation, STATA_USDC).decimals),
        toSymbol: "USDC",
        toAmount: "",
        evmTxHash,
        status: "pending",
        timestampRaw: nowSec(),
      });
    };
    try {
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
    retainDepositRequest = false,
  ): Promise<OperationResult> => {
    if (locked.current) throw new Error("A vault operation is already in progress.");
    const active = vaultOwner.requireBinding();
    const operation: CapturedOperation = {
      id: crypto.randomUUID(),
      binding: active,
      metadata: {},
      recordId: null,
      configuration: runtime.applied,
      progress: {
        set: (phase) => {
          if (!mounted.current || operation.binding !== active) return;
          flow.set(phase, operation);
        },
        event: (event) => {
          if (!mounted.current || operation.binding !== active) return;
          flow.event(event, operation);
        },
        observed: () => {
          if (!mounted.current || operation.binding !== active) return;
          flow.observed(operation);
        },
      },
    };
    currentOperation.current = operation;
    if (kind === "deposit" && !retainDepositRequest) {
      const token = tokens[0];
      if (!token) throw new Error("A deposit requires a token.");
      setDepositRequest({
        operation,
        request: { token, requestId: null, status: "pending" },
      });
    }
    locked.current = true;
    setBusy(true);
    setLog([]);
    flow.start(kind, operation);
    try {
      await readiness.requireReady();
      active.assertActive();
      // The deposit sweep is paid by the deposit address and is required inside the deposit flow,
      // which alone knows whether a new sweep will be signed.
      if (kind !== "deposit") {
        const evm = operation.configuration.readiness.evm;
        if (evm.status !== "ready") throw new Error(evm.reasons.join(" "));
        await requireGasReserve({
          queries,
          scope: { config: evm.value, sessionId: active.sessionId, address: active.vaultAddress },
          purpose: "vault-operations",
          required: MPC_OPERATION_ETH_RESERVE[kind],
        });
        active.assertActive();
      }
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
      if (mounted.current) {
        if (result.status === "refunded") flow.finishRefunded(operation);
        else flow.set("done", operation);
      }
      return { refunded: result.status === "refunded" };
    } catch (error) {
      if (mounted.current && !flow.error) flow.fail(describeFlowError(error), operation);
      throw error;
    } finally {
      if (currentOperation.current === operation) {
        currentOperation.current = null;
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  };
  let currentDeposit: DepositRequest | null = null;
  if (depositRequest?.operation.binding === binding) {
    try {
      binding.assertActive();
      currentDeposit = depositRequest.request;
    } catch {
      /* A disposed binding cannot attribute a request to the replacement identity. */
    }
  }
  return {
    currentDeposit,
    log,
    busy,
    ready: readiness.ready,
    unavailable: null,
    deposit: (erc20: string, amount: bigint) =>
      execute("deposit", [erc20], (operation) => runFlow(operation, "deposit", erc20, amount)),
    lookupDepositRequest: async (erc20: string, requestId: string): Promise<DepositLookup> => {
      if (!binding) return { kind: "error", cause: "No vault session is bound." };
      try {
        const { lookupDepositRequest: lookup } = await import("@/lib/midnight/vault");
        return await lookup(
          binding.providers,
          binding.environment,
          binding.identity,
          erc20,
          requestId,
        );
      } catch (error) {
        return { kind: "error", cause: describeFlowError(error) };
      }
    },
    recoverDeposit: (erc20: string, requestId: string) =>
      execute(
        "deposit",
        [erc20],
        async (operation) => {
          const active = operation.binding;
          const { lookupDepositRequest } = await import("@/lib/midnight/vault");
          const lookup = await lookupDepositRequest(
            active.providers,
            active.environment,
            active.identity,
            erc20,
            requestId,
          );
          active.assertActive();
          if (lookup.kind !== "recoverable") {
            const described = describeDepositLookup(lookup);
            throw new Error(`${described.summary} ${described.nextAction}`);
          }
          return runFlow(operation, "deposit", erc20, lookup.units, undefined, lookup.requestId);
        },
        true,
      ),
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
