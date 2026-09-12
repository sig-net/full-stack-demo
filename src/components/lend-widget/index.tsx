'use client';

import { useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { parseTokenAmount } from '@/lib/utils/token-amount';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getEvmChainConfig } from '@/lib/config/evm';
import { cn } from '@/lib/utils';
import { useVault } from '@/providers/vault-context';
import { useVaultBalances } from '@/providers/vault-balances-context';
import { useVaultOperations } from '@/providers/vault-operations-context';
import {
  midnightTxHistory,
  type MidnightTxRecord,
} from '@/lib/midnight/tx-history';
import {
  AAVE_USDC,
  STATA_USDC,
  stataAssetsPerShare,
  stataSupplyApy,
} from '@/lib/midnight/evm-stata';

import { Button } from '../ui/button';

interface LendWidgetProps {
  className?: string;
}

export function LendWidget({ className }: LendWidgetProps) {
  const vault = useVault();
  const connected = vault.binding !== null;
  const { balances } = useVaultBalances();
  const operations = useVaultOperations();
  const { supply, redeem } = operations;
  const [history, setHistory] = useState<MidnightTxRecord[]>([]);
  useEffect(() => midnightTxHistory.subscribe(setHistory), []);
  const rpc = connected ? getEvmChainConfig().rpcUrl : null;
  const rates = useQuery({
    queryKey: ['vault-lending-rates', rpc],
    enabled: rpc !== null,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!rpc) throw new Error('Vault is not ready.');
      const [rate, apy] = await Promise.all([
        stataAssetsPerShare(rpc).catch(() => null),
        stataSupplyApy(rpc).catch(() => null),
      ]);
      return { rate, apy };
    },
  });
  const apy = rates.isError ? null : (rates.data?.apy ?? null);
  const assetsPerShare = rates.isError ? null : (rates.data?.rate ?? null);
  const [supplyAmount, setSupplyAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [busy, setBusy] = useState<'supply' | 'redeem' | null>(null);

  const supplyToken = balances?.perToken[AAVE_USDC.toLowerCase()];
  const redeemToken = balances?.perToken[STATA_USDC.toLowerCase()];
  const supplyAvailable = supplyToken?.vaultUnits ?? null;
  const redeemAvailable = redeemToken?.vaultUnits ?? null;
  const assetDecimals = supplyToken?.decimals ?? null;
  const shareDecimals = redeemToken?.decimals ?? null;
  const supplyReady = supplyAvailable !== null && assetDecimals !== null;
  const redeemReady = redeemAvailable !== null && shareDecimals !== null;
  const supplyLabel = supplyReady
    ? formatUnits(supplyAvailable, assetDecimals)
    : 'Unavailable';
  const redeemLabel = redeemReady
    ? formatUnits(redeemAvailable, shareDecimals)
    : 'Unavailable';

  const runSupply = async () => {
    if (!supplyAmount || !supplyReady) return;
    let units: bigint;
    try {
      units = parseTokenAmount(supplyAmount, assetDecimals);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    if (units > supplyAvailable) {
      toast.error('Not enough shielded USDC', {
        description: `You hold ${supplyLabel} shielded Aave USDC. Deposit Aave USDC into the vault first.`,
      });
      return;
    }
    setBusy('supply');
    try {
      const result = await supply(units);
      if (!result.refunded) toast.success('Supplied USDC into stataUSDC');
      setSupplyAmount('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runRedeem = async () => {
    if (!redeemAmount || !redeemReady) return;
    let units: bigint;
    try {
      units = parseTokenAmount(redeemAmount, shareDecimals);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    if (units > redeemAvailable) {
      toast.error('Not enough shielded stataUSDC', {
        description: `You hold ${redeemLabel} shielded stataUSDC. Supply USDC first to receive shares.`,
      });
      return;
    }
    setBusy('redeem');
    try {
      const result = await redeem(units);
      if (!result.refunded) toast.success('Redeemed stataUSDC back to USDC');
      setRedeemAmount('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disabled =
    !operations.ready || !connected || busy !== null || operations.busy;

  const num = (v: string | undefined) => {
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const units = (v: string | undefined) => {
    if (v === undefined || shareDecimals === null) return null;
    try {
      return parseUnits(v, shareDecimals);
    } catch {
      return null;
    }
  };
  const completed = history.filter(t => t.status === 'completed');
  const supplies = completed.filter(t => t.type === 'Supply');
  const redeems = completed.filter(t => t.type === 'Redeem');
  const basis = supplies.map(t => num(t.basisAssets));
  const proceeds = redeems.map(t => num(t.proceedsAssets));
  const sharesIn = supplies.map(t => units(t.sharesReceived));
  const sharesOut = redeems.map(t => units(t.sharesBurned));
  const legsComplete =
    supplies.length > 0 &&
    basis.every(v => v !== null) &&
    proceeds.every(v => v !== null) &&
    sharesIn.every(v => v !== null) &&
    sharesOut.every(v => v !== null);
  const accountedShares = legsComplete
    ? sharesIn.reduce((a, v) => a + (v as bigint), 0n) -
      sharesOut.reduce((a, v) => a + (v as bigint), 0n)
    : null;
  const positionAssets =
    assetsPerShare === null || !redeemReady
      ? null
      : Number(redeemLabel) * assetsPerShare;
  const earnings =
    legsComplete &&
    accountedShares === redeemAvailable &&
    positionAssets !== null
      ? positionAssets +
        proceeds.reduce((a, v) => a + (v as number), 0) -
        basis.reduce((a, v) => a + (v as number), 0)
      : null;

  return (
    <div
      className={cn(
        'border-border bg-card flex flex-col gap-4 rounded-2xl border p-4',
        className,
      )}
    >
      <div className='flex items-baseline justify-between'>
        <span className='text-sm font-semibold'>Aave lending</span>
        <span className='text-muted-foreground text-xs'>
          {apy === null ? 'APY unavailable' : `${(apy * 100).toFixed(2)}% APY`}
        </span>
      </div>

      {earnings !== null && (
        <div className='flex items-baseline justify-between text-xs'>
          <span className='text-muted-foreground'>Earned</span>
          <span
            className={earnings >= 0 ? 'text-emerald-600' : 'text-destructive'}
          >
            {earnings >= 0 ? '+' : ''}
            {earnings.toFixed(6)} USDC.a
          </span>
        </div>
      )}

      <div className='flex flex-col gap-2'>
        <label className='text-muted-foreground flex justify-between text-xs'>
          <span>Supply USDC → stataUSDC</span>
          <span>Available: {supplyLabel}</span>
        </label>
        <div className='flex gap-2'>
          <input
            className='border-border bg-background flex-1 rounded-lg border px-3 py-2 text-sm'
            inputMode='decimal'
            placeholder='0.0'
            value={supplyAmount}
            onChange={e => setSupplyAmount(e.target.value)}
            disabled={disabled}
          />
          <Button
            onClick={runSupply}
            disabled={disabled || !supplyReady || !supplyAmount}
          >
            {busy === 'supply' ? 'Supplying…' : 'Supply'}
          </Button>
        </div>
      </div>

      <div className='flex flex-col gap-2'>
        <label className='text-muted-foreground flex justify-between text-xs'>
          <span>Redeem stataUSDC → USDC</span>
          <span>
            Available: {redeemLabel}
            {assetsPerShare === null || !redeemReady
              ? ''
              : ` ≈ ${(Number(redeemLabel) * assetsPerShare).toFixed(
                  6,
                )} USDC.a`}
          </span>
        </label>
        <div className='flex gap-2'>
          <input
            className='border-border bg-background flex-1 rounded-lg border px-3 py-2 text-sm'
            inputMode='decimal'
            placeholder='0.0'
            value={redeemAmount}
            onChange={e => setRedeemAmount(e.target.value)}
            disabled={disabled}
          />
          <Button
            onClick={runRedeem}
            disabled={disabled || !redeemReady || !redeemAmount}
          >
            {busy === 'redeem' ? 'Redeeming…' : 'Redeem'}
          </Button>
        </div>
      </div>

      {!connected && (
        <div className='text-muted-foreground text-xs'>
          Connect Midnight and set a vault identity to supply or redeem.
        </div>
      )}
    </div>
  );
}
