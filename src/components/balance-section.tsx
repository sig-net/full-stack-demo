'use client';

import { useState } from 'react';
import { Download, Package } from 'lucide-react';

import { BalanceDisplay } from '@/components/balance-display';
import { Button } from '@/components/ui/button';
import { DepositDialog } from '@/components/deposit-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useMidnightWallet } from '@/providers/midnight-context';
import { MIDNIGHT_TOKENS } from '@/lib/constants/token-metadata';
import type { TokenWithBalance } from '@/lib/types/token.types';

export function BalanceSection() {
  const midnight = useMidnightWallet();
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);

  const midnightBalances = midnight.balances;
  const displayTokens: TokenWithBalance[] =
    midnight.connected && midnightBalances
      ? MIDNIGHT_TOKENS.flatMap(t => {
          const b = midnightBalances.perToken[t.erc20Address.toLowerCase()];
          if (!b || b.vaultUnits === 0n) return [];
          return [
            {
              erc20Address: t.erc20Address,
              symbol: t.symbol,
              name: t.name,
              decimals: b.decimals,
              chain: 'midnight' as const,
              balance: b.vaultUnits,
            },
          ];
        })
      : [];

  if (displayTokens.length === 0) {
    return (
      <div className='flex w-full max-w-full flex-col gap-5'>
        <div className='border-dark-neutral-300 flex w-full items-center justify-between border-t py-5'>
          <h2 className='text-dark-neutral-200 self-start font-semibold uppercase'>
            Balances
          </h2>
          <Button
            onClick={() => setIsDepositDialogOpen(true)}
            variant='outline'
            size='lg'
            className='gap-1.5 font-semibold'
            disabled={midnight.connecting}
          >
            <Download className='h-4 w-4' />
            {midnight.connecting ? 'Connecting…' : 'Deposit'}
          </Button>
        </div>
        <EmptyState
          icon={Package}
          title='No tokens found'
          description='Deposit some tokens to get started managing your portfolio.'
          compact
        />
        <DepositDialog
          open={isDepositDialogOpen}
          onOpenChange={setIsDepositDialogOpen}
        />
      </div>
    );
  }

  return <BalanceDisplay tokens={displayTokens} />;
}
