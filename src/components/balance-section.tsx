'use client';

import { useState } from 'react';
import { Download, Package } from 'lucide-react';

import { BalanceDisplay } from '@/components/balance-display';
import { Button } from '@/components/ui/button';
import { DepositDialog } from '@/components/deposit-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useVault } from '@/providers/vault-context';
import { useVaultBalances } from '@/providers/vault-balances-context';
import { useMidnightConnection } from '@/providers/midnight-wallet-context';
import { MIDNIGHT_TOKENS } from '@/lib/constants/token-metadata';
import type { TokenWithBalance } from '@/lib/types/token.types';

export function BalanceSection() {
  const state = useVaultBalances();
  const vault = useVault();
  const connection = useMidnightConnection();
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);

  const midnightBalances = state.balances;
  const displayTokens: TokenWithBalance[] = midnightBalances
    ? MIDNIGHT_TOKENS.flatMap(t => {
        const b = midnightBalances.perToken[t.erc20Address.toLowerCase()];
        if (
          !b ||
          b.vaultUnits == null ||
          b.decimals == null ||
          b.vaultUnits === 0n
        )
          return [];
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
            disabled={connection.connecting}
          >
            <Download className='h-4 w-4' />
            {connection.connecting ? 'Connecting…' : 'Deposit'}
          </Button>
        </div>
        {state.error && (
          <Button
            variant='outline'
            onClick={() => void state.refresh().catch(() => {})}
          >
            Retry balances
          </Button>
        )}
        <EmptyState
          icon={Package}
          title={
            state.loading
              ? 'Loading balances'
              : state.error
                ? 'Balances unavailable'
                : !state.balances
                  ? vault.status === 'missing-identity'
                    ? 'Set a vault identity'
                    : vault.status === 'disconnected'
                      ? 'Connect Midnight'
                      : 'Vault unavailable'
                  : 'No tokens found'
          }
          description={
            state.error ??
            'Deposit some tokens to get started managing your portfolio.'
          }
          compact
        />
        <DepositDialog
          open={isDepositDialogOpen}
          onOpenChange={setIsDepositDialogOpen}
        />
      </div>
    );
  }

  return (
    <div>
      {state.error && <p role='alert'>{state.error}</p>}
      <Button
        variant='outline'
        onClick={() => void state.refresh().catch(() => {})}
      >
        Refresh balances
      </Button>
      <BalanceDisplay tokens={displayTokens} />
    </div>
  );
}
