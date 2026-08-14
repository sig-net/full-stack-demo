'use client';

import { useState } from 'react';
import { parseUnits } from 'viem';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useMidnightWallet } from '@/providers/midnight-context';

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
  const { connected, supply, redeem } = useMidnightWallet();
  const [supplyAmount, setSupplyAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [busy, setBusy] = useState<'supply' | 'redeem' | null>(null);

  const runSupply = async () => {
    if (!supplyAmount) return;
    setBusy('supply');
    try {
      await supply(parseUnits(supplyAmount, USDC_DECIMALS));
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
    setBusy('redeem');
    try {
      await redeem(parseUnits(redeemAmount, USDC_DECIMALS));
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
        <label className="text-xs text-muted-foreground">Supply USDC → stataUSDC</label>
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
        <label className="text-xs text-muted-foreground">Redeem stataUSDC → USDC</label>
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
