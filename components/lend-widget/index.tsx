'use client';

import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useMidnightWallet } from '@/providers/midnight-context';
import { AAVE_USDC, STATA_USDC } from '@/lib/midnight/evm-stata';

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

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border bg-card p-4',
        className,
      )}
    >
      <div className="text-sm font-semibold">Aave lending</div>

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
          <span>Available: {formatUnits(redeemAvailable, USDC_DECIMALS)}</span>
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
