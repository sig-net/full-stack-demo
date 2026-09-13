'use client';

import { Button } from './ui/button';
import { useWalletReadiness } from '@/providers/wallet-readiness-context';
import { useEvmLocalFunding } from '@/providers/evm-local-funding-context';
import { useEvmBalances } from '@/providers/evm-balances-context';
import { useEvmWallet } from '@/providers/evm-wallet-context';

export function LocalWalletFunding() {
  const midnight = useWalletReadiness();
  const evm = useEvmWallet();
  const localEvm = useEvmLocalFunding();
  const evmBalances = useEvmBalances();
  const pending = midnight.funding.isPending || localEvm.funding.isPending;
  if (!midnight.wallet && !evm.wallet) return null;
  const needsMidnight = !!midnight.wallet && !midnight.ready;
  const needsEvm = !!evm.wallet && !localEvm.ready;
  const canFundMidnight = needsMidnight && midnight.balances.isSuccess;
  const canFundEvm = needsEvm && evmBalances.isSuccess;
  return (
    <div className='mx-auto max-w-3xl space-y-2 rounded border bg-white/80 p-4 text-sm'>
      <p role='status'>
        {midnight.wallet &&
          `Midnight: ${midnight.balances.isPending ? 'checking resources' : midnight.ready ? 'DUST ready' : midnight.balances.isError ? 'balance unavailable' : 'DUST below transaction threshold'}. `}
        {evm.wallet &&
          `EVM: ${evmBalances.isPending ? 'checking balances' : localEvm.ready ? 'local funding reserve ready' : evmBalances.isError ? 'balances unavailable' : 'funds below local funding reserve'}.`}
      </p>
      {(needsMidnight || needsEvm) && (
        <>
          <p>
            Fund the connected wallets and wait for spendable DUST before
            starting a transaction. Local EVM funding targets 1 ETH and 100
            USDC.
          </p>
          {midnight.eligibility.data === true && (
            <Button
              disabled={pending || (!canFundMidnight && !canFundEvm)}
              onClick={() => {
                void Promise.allSettled([
                  ...(canFundMidnight ? [midnight.fund()] : []),
                  ...(canFundEvm ? [localEvm.fund()] : []),
                ]);
              }}
            >
              {pending
                ? 'Funding and waiting for spendable resources…'
                : 'Fund local wallets'}
            </Button>
          )}
          {midnight.eligibility.data === false && (
            <p>
              Local funding is unavailable. Check the local setup configuration
              or fund your configured network wallet.
            </p>
          )}
        </>
      )}
      {midnight.funding.error && (
        <p role='alert'>Midnight: {midnight.funding.error.message}</p>
      )}
      {localEvm.funding.error && (
        <p role='alert'>EVM: {localEvm.funding.error.message}</p>
      )}
      {localEvm.refreshError && (
        <p role='alert'>EVM: {localEvm.refreshError}</p>
      )}
      {midnight.eligibility.isError && (
        <p role='alert'>Funding eligibility could not be checked.</p>
      )}
      <Button
        variant='outline'
        onClick={() => {
          void midnight.eligibility.refetch();
          if (midnight.wallet) void midnight.balances.refetch();
          if (evm.wallet) void evmBalances.refetch();
        }}
      >
        Refresh wallet readiness
      </Button>
    </div>
  );
}
