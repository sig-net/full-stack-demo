'use client';

import { Feedback } from '@/components/ui/feedback';
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
  const needsMidnight = !!midnight.wallet && !midnight.resourcesReady;
  const needsEvm = !!evm.wallet && !localEvm.ready;
  const canFundMidnight =
    needsMidnight &&
    midnight.balances.isSuccess &&
    !midnight.fundingUnavailable;
  const canFundEvm =
    needsEvm && evmBalances.isSuccess && !localEvm.fundingUnavailable;
  return (
    <div className='ds-stack-control ds-round ds-frame ds-surface ds-inset-content ds-body mx-auto max-w-3xl'>
      <p role='status'>
        {midnight.wallet &&
          `Midnight: ${midnight.transactionUnavailable ?? (midnight.balances.isPending ? 'checking resources' : midnight.ready ? 'DUST ready' : midnight.balances.isError ? 'balance unavailable' : 'DUST below transaction threshold')}. `}
        {evm.wallet &&
          `EVM: ${evmBalances.isPending ? 'checking balances' : localEvm.ready ? 'local funding reserve ready' : evmBalances.isError ? 'balances unavailable' : 'funds below local funding reserve'}.`}
      </p>
      {midnight.fundingUnavailable && <p>{midnight.fundingUnavailable}</p>}
      {localEvm.fundingUnavailable && <p>{localEvm.fundingUnavailable}</p>}
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
        <Feedback tone='error' role='alert'>
          Midnight: {midnight.funding.error.message}
        </Feedback>
      )}
      {localEvm.funding.error && (
        <Feedback tone='error' role='alert'>
          EVM: {localEvm.funding.error.message}
        </Feedback>
      )}
      {localEvm.refreshError && (
        <Feedback tone='error' role='alert'>
          EVM: {localEvm.refreshError}
        </Feedback>
      )}
      {midnight.eligibility.isError && (
        <Feedback tone='error' role='alert'>
          Funding eligibility could not be checked.
        </Feedback>
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
