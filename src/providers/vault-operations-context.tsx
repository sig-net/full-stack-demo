'use client';

import type { GasTopUpRequest } from '@/lib/evm/gas-topup-request';

import './buffer-shim';
import { useVaultBalances } from './vault-balances-context';
import { fetchErc20Decimals } from '@/lib/constants/token-metadata';
import { useVault } from './vault-context';
import { useWalletReadiness } from './wallet-readiness-context';
import type { VaultBinding } from '@/lib/midnight/vault-session';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { formatUnits } from 'viem';

import { flow } from '@/lib/midnight/flow';

import { MIDNIGHT_TOKENS } from '@/lib/constants/token-metadata';
import {
  midnightTxHistory,
  type MidnightTxRecord,
} from '@/lib/midnight/tx-history';
import { AAVE_USDC, STATA_USDC } from '@/lib/midnight/evm-stata';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// These node rejection codes permit one full resynchronisation and retry.
const STALE_STATE_ERROR_CODES = ['196', '195', '171', '170'];
function isStaleStateError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: any = error;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const msg = String(cur.message ?? cur);
    if (
      STALE_STATE_ERROR_CODES.some(code =>
        msg.includes(`Custom error: ${code}`),
      )
    )
      return true;
    cur = cur.cause;
  }
  return false;
}

// Submission errors nest the node verdict in their cause chain.
function describeFlowError(error: unknown): string {
  const seen = new Set<unknown>();
  let cur: any = error;
  let deepest = String((error as any)?.message ?? error);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const msg = String(cur.message ?? cur);
    if (/Custom error: \d+|Invalid Transaction/.test(msg)) return msg;
    deepest = msg;
    cur = cur.cause;
  }
  return deepest;
}

function reportFlowFailure(
  flow: { kind: string | null; fail: (message: string) => void },
  error: unknown,
  recordId: string | null,
): void {
  const reason = describeFlowError(error);
  console.error(`[midnight] ${flow.kind ?? 'flow'} failed: ${reason}`, error);
  if (recordId)
    midnightTxHistory.update(recordId, {
      status: 'failed',
      failureReason: reason,
    });
  flow.fail(reason);
}

async function topUpGas(request: GasTopUpRequest): Promise<void> {
  const res = await fetch('/api/midnight/gas-topup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Gas top-up failed (${res.status})`);
  }
}

function useVaultOperationOwner() {
  const vaultOwner = useVault();
  const readiness = useWalletReadiness();
  const { refresh } = useVaultBalances();
  const { binding } = vaultOwner;
  const depositAddress = binding?.depositAddress ?? '';
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

  const append = (m: string) =>
    setLog(l => [...l, `${new Date().toLocaleTimeString()}  ${m}`]);

  const tokenMeta = (erc20: string) => {
    const token = MIDNIGHT_TOKENS.find(
      t => t.erc20Address.toLowerCase() === erc20.toLowerCase(),
    );
    const decimals = metadata.current[erc20.toLowerCase()];
    if (decimals === undefined)
      throw new Error('Token decimals are unavailable.');
    return { symbol: token?.symbol ?? 'ERC20', decimals };
  };
  const fmtAmount = (amount: bigint, erc20: string) => {
    const { symbol, decimals } = tokenMeta(erc20);
    return `${formatUnits(amount, decimals)} ${symbol}`;
  };
  const nowSec = () => Math.floor(Date.now() / 1000);

  const requireOperationBinding = (
    kind: 'deposit' | 'withdraw' | 'swap' | 'supply' | 'redeem',
  ) => {
    try {
      return vaultOwner.requireBinding();
    } catch (error) {
      flow.start(kind);
      flow.fail('Vault is not ready. Check the wallet and vault identity.');
      throw error;
    }
  };

  const withStaleStateRecovery = async <T,>(
    operation: { binding: VaultBinding; recoveryError?: unknown },
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
      append(
        'Wallet state drifted behind the chain. Resynchronising from scratch...',
      );
      const recovered = await vaultOwner.rebuild(captured, error => {
        operation.recoveryError = error;
        if (mounted.current) flow.fail(describeFlowError(error));
      });
      operation.binding = recovered;
      const result = await op(recovered);
      recovered.assertActive();
      return result;
    }
  };

  const runFlow = async (
    kind: 'deposit' | 'withdraw',
    erc20Address: string,
    amountUnits: bigint,
    receiver?: string,
  ) => {
    const captured = requireOperationBinding(kind);
    const operation: { binding: VaultBinding; recoveryError?: unknown } = {
      binding: captured,
    };
    const appendActive = (message: string) => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runDeposit, runWithdraw } = await import('@/lib/midnight/vault');
    captured.assertActive();
    flow.start(kind);
    const amountStr = fmtAmount(amountUnits, erc20Address);
    const { symbol } = tokenMeta(erc20Address);
    let recordId: string | null = null;
    const record = (
      rid: string,
      base: Omit<MidnightTxRecord, 'id' | 'status' | 'timestampRaw' | 'txHash'>,
      evmTxHash?: string,
    ) => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      recordId = rid;
      midnightTxHistory.add({
        id: rid,
        ...base,
        txHash: evmTxHash,
        status: 'pending',
        timestampRaw: nowSec(),
      });
    };
    try {
      if (kind === 'deposit') {
        append('Requesting gas top-up from relayer...');
        captured.assertActive();
        await topUpGas({
          operation: 'deposit',
          recipient: { kind: 'deposit', path: captured.identity.pathHex },
        });
        await withStaleStateRecovery(operation, active =>
          runDeposit(
            active.providers,
            active.contract,
            active.environment,
            active.identity,
            erc20Address,
            amountUnits,
            appendActive,
            (rid, hash) =>
              record(
                rid,
                {
                  type: 'Deposit',
                  fromSymbol: 'WALLET',
                  fromAmount: depositAddress,
                  toSymbol: symbol,
                  toAmount: amountStr,
                  counterparty: depositAddress,
                },
                hash,
              ),
          ),
        );
      } else {
        const hex = (receiver ?? '').trim().replace(/^0x/, '');
        const destHex = hex.length === 40 ? `0x${hex}` : DEAD_ADDRESS;
        append('Requesting gas top-up from relayer...');
        captured.assertActive();
        await topUpGas({ operation: 'withdraw', recipient: { kind: 'vault' } });
        await withStaleStateRecovery(operation, active =>
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
                operation: 'withdraw',
                recipient: { kind: 'vault' },
              });
            },
            (rid, hash) =>
              record(
                rid,
                {
                  type: 'Withdraw',
                  fromSymbol: symbol,
                  fromAmount: amountStr,
                  toSymbol: 'WALLET',
                  toAmount: destHex,
                  counterparty: destHex,
                },
                hash,
              ),
          ),
        );
      }
      if (recordId)
        midnightTxHistory.update(recordId, {
          status: flow.refunded ? 'refunded' : 'completed',
        });
      void refresh(operation.binding).catch(() => {});
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, recordId);
      } catch {
        if (recordId)
          midnightTxHistory.update(recordId, {
            status: 'failed',
            failureReason: operation.recoveryError
              ? describeFlowError(operation.recoveryError)
              : 'Vault session superseded.',
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
  ) => {
    const captured = requireOperationBinding('swap');
    const operation: { binding: VaultBinding; recoveryError?: unknown } = {
      binding: captured,
    };
    const appendActive = (message: string) => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runSwap } = await import('@/lib/midnight/vault');
    const { flow } = await import('@/lib/midnight/flow');
    captured.assertActive();
    flow.start('swap');
    let recordId: string | null = null;
    const record = (rid: string, evmTxHash?: string) => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      recordId = rid;
      midnightTxHistory.add({
        id: rid,
        type: 'Swap',
        fromSymbol: tokenMeta(tokenInErc20).symbol,
        fromAmount: fmtAmount(amountUnits, tokenInErc20),
        toSymbol: tokenMeta(tokenOutErc20).symbol,
        toAmount: '',
        txHash: evmTxHash,
        status: 'pending',
        timestampRaw: nowSec(),
      });
    };
    try {
      append('Requesting gas top-up from relayer...');
      captured.assertActive();
      await topUpGas({ operation: 'swap', recipient: { kind: 'vault' } });
      await withStaleStateRecovery(operation, active =>
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
              operation: 'swap',
              recipient: { kind: 'vault' },
            });
          },
          (rid, hash) => record(rid, hash),
        ),
      );
      if (recordId)
        midnightTxHistory.update(recordId, {
          status: flow.refunded ? 'refunded' : 'completed',
        });
      void refresh(operation.binding).catch(() => {});
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, recordId);
      } catch {
        if (recordId)
          midnightTxHistory.update(recordId, {
            status: 'failed',
            failureReason: operation.recoveryError
              ? describeFlowError(operation.recoveryError)
              : 'Vault session superseded.',
          });
      }
      throw e;
    }
  };

  const runSupplyFlow = async (amountUnits: bigint) => {
    const captured = requireOperationBinding('supply');
    const operation: { binding: VaultBinding; recoveryError?: unknown } = {
      binding: captured,
    };
    const appendActive = (message: string) => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runSupply } = await import('@/lib/midnight/vault');
    const { flow } = await import('@/lib/midnight/flow');
    captured.assertActive();
    flow.start('supply');
    let recordId: string | null = null;
    const record = (rid: string, evmTxHash?: string) => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      recordId = rid;
      midnightTxHistory.add({
        id: rid,
        type: 'Supply',
        fromSymbol: 'USDC.a',
        fromAmount: fmtAmount(amountUnits, AAVE_USDC),
        basisAssets: formatUnits(amountUnits, tokenMeta(AAVE_USDC).decimals),
        toSymbol: 'stataUSDC',
        toAmount: '',
        txHash: evmTxHash,
        status: 'pending',
        timestampRaw: nowSec(),
      });
    };
    try {
      append('Requesting gas top-up from relayer...');
      captured.assertActive();
      await topUpGas({ operation: 'supply', recipient: { kind: 'vault' } });
      const mintedShares = await withStaleStateRecovery(operation, active =>
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
              operation: 'supply',
              recipient: { kind: 'vault' },
            });
          },
          (rid, hash) => record(rid, hash),
        ),
      );
      if (recordId)
        midnightTxHistory.update(recordId, {
          status: flow.refunded ? 'refunded' : 'completed',
          toAmount:
            mintedShares == null
              ? ''
              : `${formatUnits(mintedShares, tokenMeta(STATA_USDC).decimals)} stataUSDC`,
          sharesReceived:
            mintedShares == null
              ? undefined
              : formatUnits(mintedShares, tokenMeta(STATA_USDC).decimals),
        });
      void refresh(operation.binding).catch(() => {});
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, recordId);
      } catch {
        if (recordId)
          midnightTxHistory.update(recordId, {
            status: 'failed',
            failureReason: operation.recoveryError
              ? describeFlowError(operation.recoveryError)
              : 'Vault session superseded.',
          });
      }
      throw e;
    }
  };

  const runRedeemFlow = async (shares: bigint) => {
    const captured = requireOperationBinding('redeem');
    const operation: { binding: VaultBinding; recoveryError?: unknown } = {
      binding: captured,
    };
    const appendActive = (message: string) => {
      operation.binding.assertActive();
      if (mounted.current) append(message);
    };
    const { runRedeem } = await import('@/lib/midnight/vault');
    const { flow } = await import('@/lib/midnight/flow');
    captured.assertActive();
    flow.start('redeem');
    let recordId: string | null = null;
    const record = (rid: string, evmTxHash?: string) => {
      operation.binding.assertActive();
      if (!mounted.current) return;
      if (recordId === rid) {
        if (evmTxHash) midnightTxHistory.update(rid, { txHash: evmTxHash });
        return;
      }
      recordId = rid;
      midnightTxHistory.add({
        id: rid,
        type: 'Redeem',
        fromSymbol: 'stataUSDC',
        fromAmount: fmtAmount(shares, STATA_USDC),
        sharesBurned: formatUnits(shares, tokenMeta(STATA_USDC).decimals),
        toSymbol: 'USDC',
        toAmount: '',
        txHash: evmTxHash,
        status: 'pending',
        timestampRaw: nowSec(),
      });
    };
    try {
      append('Requesting gas top-up from relayer...');
      captured.assertActive();
      await topUpGas({ operation: 'redeem', recipient: { kind: 'vault' } });
      const redeemedAssets = await withStaleStateRecovery(operation, active =>
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
              operation: 'redeem',
              recipient: { kind: 'vault' },
            });
          },
          (rid, hash) => record(rid, hash),
        ),
      );
      if (recordId)
        midnightTxHistory.update(recordId, {
          status: flow.refunded ? 'refunded' : 'completed',
          toAmount:
            redeemedAssets == null
              ? ''
              : `${formatUnits(redeemedAssets, tokenMeta(AAVE_USDC).decimals)} USDC.a`,
          proceedsAssets:
            redeemedAssets == null
              ? undefined
              : formatUnits(redeemedAssets, tokenMeta(AAVE_USDC).decimals),
        });
      void refresh(operation.binding).catch(() => {});
    } catch (e) {
      try {
        operation.binding.assertActive();
        if (mounted.current) reportFlowFailure(flow, e, recordId);
      } catch {
        if (recordId)
          midnightTxHistory.update(recordId, {
            status: 'failed',
            failureReason: operation.recoveryError
              ? describeFlowError(operation.recoveryError)
              : 'Vault session superseded.',
          });
      }
      throw e;
    }
  };

  const execute = async (
    kind: import('@/lib/midnight/flow').FlowKind,
    tokens: string[],
    run: () => Promise<void>,
  ) => {
    if (locked.current)
      throw new Error('A vault operation is already in progress.');
    const active = vaultOwner.requireBinding();
    locked.current = true;
    setBusy(true);
    flow.start(kind);
    try {
      await readiness.requireReady();
      active.assertActive();
      const entries = await Promise.all(
        tokens.map(
          async token =>
            [token.toLowerCase(), await fetchErc20Decimals(token)] as const,
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
    ready: readiness.ready,
    deposit: (erc20: string, amount: bigint) =>
      execute('deposit', [erc20], () => runFlow('deposit', erc20, amount)),
    withdraw: (erc20: string, amount: bigint, receiver?: string) =>
      execute('withdraw', [erc20], () =>
        runFlow('withdraw', erc20, amount, receiver),
      ),
    swap: (
      tokenIn: string,
      tokenOut: string,
      amount: bigint,
      fee?: bigint,
      slippageBps?: bigint,
    ) =>
      execute('swap', [tokenIn, tokenOut], () =>
        runSwapFlow(tokenIn, tokenOut, amount, fee, slippageBps),
      ),
    supply: (amount: bigint) =>
      execute('supply', [AAVE_USDC, STATA_USDC], () => runSupplyFlow(amount)),
    redeem: (shares: bigint) =>
      execute('redeem', [AAVE_USDC, STATA_USDC], () => runRedeemFlow(shares)),
  };
}

const VaultOperationsContext = createContext<ReturnType<
  typeof useVaultOperationOwner
> | null>(null);
export function VaultOperationsProvider({ children }: { children: ReactNode }) {
  const value = useVaultOperationOwner();
  return (
    <VaultOperationsContext.Provider value={value}>
      {children}
    </VaultOperationsContext.Provider>
  );
}
export function useVaultOperations() {
  const value = useContext(VaultOperationsContext);
  if (!value)
    throw new Error('useVaultOperations requires VaultOperationsProvider.');
  return value;
}
