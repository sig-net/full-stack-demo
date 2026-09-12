'use client';

import { Button } from './ui/button';
import { useWalletReadiness } from '@/providers/wallet-readiness-context';
import { useEvmWallet } from '@/providers/evm-wallet-context';

export function LocalWalletFunding() {
  const midnight = useWalletReadiness();
  const evm = useEvmWallet();
  const pending = midnight.funding.isPending || evm.funding.isPending;
  if (!midnight.wallet && !evm.wallet) return null;
  const needsMidnight = !!midnight.wallet && !midnight.ready;
  const needsEvm = !!evm.wallet && !evm.ready;
  const canFundMidnight = needsMidnight && midnight.balances.isSuccess;
  const canFundEvm = needsEvm && evm.balances.isSuccess;
  return (
    <div className='mx-auto max-w-3xl space-y-2 rounded border bg-white/80 p-4 text-sm'>
      <p role='status'>
        {midnight.wallet &&
          `Midnight: ${midnight.balances.isPending ? 'checking resources' : midnight.ready ? 'DUST ready' : midnight.balances.isError ? 'balance unavailable' : 'DUST below transaction threshold'}. `}
        {evm.wallet &&
          `EVM: ${evm.balances.isPending ? 'checking balances' : evm.ready ? 'deposit funds ready' : evm.balances.isError ? 'balances unavailable' : 'funds below deposit threshold'}.`}
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
                  ...(canFundEvm ? [evm.fund()] : []),
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
      {evm.funding.error && (
        <p role='alert'>EVM: {evm.funding.error.message}</p>
      )}
      {midnight.eligibility.isError && (
        <p role='alert'>Funding eligibility could not be checked.</p>
      )}
      <Button
        variant='outline'
        onClick={() => {
          void midnight.eligibility.refetch();
          if (midnight.wallet) void midnight.balances.refetch();
          if (evm.wallet) void evm.balances.refetch();
        }}
      >
        Refresh wallet readiness
      </Button>
    </div>
  );
}
