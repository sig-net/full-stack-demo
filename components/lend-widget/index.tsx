'use client';

import { useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useMidnightWallet } from '@/providers/midnight-context';
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

// USDC and its stataUSDC wrapper both use 6 decimals on Sepolia.
const USDC_DECIMALS = 6;

// Aave lending against the vault: supply shielded USDC into stataUSDC, or redeem stataUSDC shares
// back to USDC. Both legs are signed + paid by the pooled vault account and settled via the MPC.
// Midnight-only: disabled until the Developer wallet is connected.
export function LendWidget({ className }: LendWidgetProps) {
  const { connected, supply, redeem, balances } = useMidnightWallet();
  // Aave shows a lender their position in the underlying asset and the rate it earns, never
  // the wrapper's share units. Both are public reads on the pool the wrapper points at.
  // Earnings needs a cost basis, and a shielded vault keeps none on chain. This browser's
  // history is the only source, so the figure is omitted rather than guessed when it is absent.
  // subscribe() replays the current list to a new listener, so it seeds the state too.
  const [history, setHistory] = useState<MidnightTxRecord[]>([]);
  useEffect(() => midnightTxHistory.subscribe(setHistory), []);
  const [apy, setApy] = useState<number | null>(null);
  const [assetsPerShare, setAssetsPerShare] = useState<number | null>(null);
  useEffect(() => {
    const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
    if (!connected || !rpc) return;
    let cancelled = false;
    const read = async () => {
      const [rate, supplyApy] = await Promise.all([
        stataAssetsPerShare(rpc).catch(() => null),
        stataSupplyApy(rpc).catch(() => null),
      ]);
      if (cancelled) return;
      setAssetsPerShare(rate);
      setApy(supplyApy);
    };
    void read();
    const id = setInterval(read, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected]);
  const [supplyAmount, setSupplyAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [busy, setBusy] = useState<'supply' | 'redeem' | null>(null);

  // Same preflight as the deposit dialog: supply spends the shielded vault token of Aave
  // USDC, redeem spends the stataUSDC one — reject before a minutes-long proving flow starts.
  const supplyAvailable =
    balances?.perToken[AAVE_USDC.toLowerCase()]?.vaultUnits ?? 0n;
  const redeemAvailable =
    balances?.perToken[STATA_USDC.toLowerCase()]?.vaultUnits ?? 0n;

  const runSupply = async () => {
    if (!supplyAmount) return;
    const units = parseUnits(supplyAmount, USDC_DECIMALS);
    if (units > supplyAvailable) {
      toast.error('Not enough shielded USDC', {
        description: `You hold ${formatUnits(supplyAvailable, USDC_DECIMALS)} shielded Aave USDC. Deposit Aave USDC into the vault first.`,
      });
      return;
    }
    setBusy('supply');
    try {
      await supply(units);
      toast.success('Supplied USDC into stataUSDC');
      setSupplyAmount('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runRedeem = async () => {
    if (!redeemAmount) return;
    const units = parseUnits(redeemAmount, USDC_DECIMALS);
    if (units > redeemAvailable) {
      toast.error('Not enough shielded stataUSDC', {
        description: `You hold ${formatUnits(redeemAvailable, USDC_DECIMALS)} shielded stataUSDC. Supply USDC first to receive shares.`,
      });
      return;
    }
    setBusy('redeem');
    try {
      await redeem(units);
      toast.success('Redeemed stataUSDC back to USDC');
      setRedeemAmount('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disabled = !connected || busy !== null;

  const num = (v: string | undefined) => {
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const units = (v: string | undefined) => {
    if (v === undefined) return null;
    try {
      return parseUnits(v, USDC_DECIMALS);
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
  // Every leg must carry both its assets and its shares. Any missing leg makes the total wrong
  // rather than approximate, so drop the figure entirely.
  const legsComplete =
    supplies.length > 0 &&
    basis.every(v => v !== null) &&
    proceeds.every(v => v !== null) &&
    sharesIn.every(v => v !== null) &&
    sharesOut.every(v => v !== null);
  // The history must also account for the WHOLE position. Shares supplied before this history
  // existed still sit in the balance, and treating them as profit would overstate earnings by the
  // entire earlier principal. Share units are exact, so compare them rather than the assets.
  const accountedShares = legsComplete
    ? sharesIn.reduce((a, v) => a + (v as bigint), 0n) -
      sharesOut.reduce((a, v) => a + (v as bigint), 0n)
    : null;
  const positionAssets =
    assetsPerShare === null
      ? null
      : Number(formatUnits(redeemAvailable, USDC_DECIMALS)) * assetsPerShare;
  const earnings =
    legsComplete && accountedShares === redeemAvailable && positionAssets !== null
      ? positionAssets +
        proceeds.reduce((a, v) => a + (v as number), 0) -
        basis.reduce((a, v) => a + (v as number), 0)
      : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border bg-card p-4',
        className,
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Aave lending</span>
        <span className="text-xs text-muted-foreground">
          {apy === null ? 'APY —' : `${(apy * 100).toFixed(2)}% APY`}
        </span>
      </div>

      {earnings !== null && (
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Earned</span>
          <span
            className={earnings >= 0 ? 'text-emerald-600' : 'text-destructive'}
          >
            {earnings >= 0 ? '+' : ''}
            {earnings.toFixed(6)} USDC.a
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex justify-between text-xs text-muted-foreground">
          <span>Supply USDC → stataUSDC</span>
          <span>Available: {formatUnits(supplyAvailable, USDC_DECIMALS)}</span>
        </label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            inputMode="decimal"
            placeholder="0.0"
            value={supplyAmount}
            onChange={e => setSupplyAmount(e.target.value)}
            disabled={disabled}
          />
          <Button onClick={runSupply} disabled={disabled || !supplyAmount}>
            {busy === 'supply' ? 'Supplying…' : 'Supply'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex justify-between text-xs text-muted-foreground">
          <span>Redeem stataUSDC → USDC</span>
          <span>
            Available: {formatUnits(redeemAvailable, USDC_DECIMALS)}
            {assetsPerShare === null
              ? ''
              : ` ≈ ${(
                  Number(formatUnits(redeemAvailable, USDC_DECIMALS)) *
                  assetsPerShare
                ).toFixed(6)} USDC.a`}
          </span>
        </label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            inputMode="decimal"
            placeholder="0.0"
            value={redeemAmount}
            onChange={e => setRedeemAmount(e.target.value)}
            disabled={disabled}
          />
          <Button onClick={runRedeem} disabled={disabled || !redeemAmount}>
            {busy === 'redeem' ? 'Redeeming…' : 'Redeem'}
          </Button>
        </div>
      </div>

      {!connected && (
        <div className="text-xs text-muted-foreground">
          Connect the Developer wallet to supply or redeem.
        </div>
      )}
    </div>
  );
}
