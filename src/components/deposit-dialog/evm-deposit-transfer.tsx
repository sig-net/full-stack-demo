'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EvmWalletButton } from '@/components/evm-wallet-button';
import { useEvmWallet } from '@/providers/evm-wallet-context';
import { useWalletReadiness } from '@/providers/wallet-readiness-context';
import { useVault } from '@/providers/vault-context';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';
import type { TokenConfig } from '@/lib/constants/token-metadata';

export function EvmDepositTransfer({ token }: { token: TokenConfig }) {
  const evm = useEvmWallet();
  const vault = useVault();
  const readiness = useWalletReadiness();
  const progress = useMidnightProgress();
  const [amount, setAmount] = useState('');
  const transfer = evm.transfer;
  const explorer = evm.wallet?.config.explorerUrl;
  const tokenBalance = evm.balances.data?.tokens.find(
    value => value.erc20Address === token.erc20Address,
  );
  const pending =
    transfer?.status === 'approving' ||
    transfer?.status === 'confirming' ||
    transfer?.sweep === 'pending';
  const currentTransfer =
    transfer?.binding === vault.binding &&
    transfer?.token === token.erc20Address;
  return (
    <div className='space-y-3 border-t pt-4'>
      <p className='font-semibold'>Transfer from your Sepolia wallet</p>
      <EvmWalletButton />
      {evm.wallet && <p className='text-sm break-all'>{evm.wallet.account}</p>}
      {tokenBalance && (
        <p>
          Available: {formatUnits(tokenBalance.units, tokenBalance.decimals)}{' '}
          {token.symbol}
        </p>
      )}
      {evm.balances.isError && (
        <p role='alert'>
          Wallet balances unavailable. Open Sepolia wallet to retry.
        </p>
      )}
      <label className='block' htmlFor={`deposit-amount-${token.symbol}`}>
        Amount ({token.symbol})
      </label>
      <Input
        id={`deposit-amount-${token.symbol}`}
        inputMode='decimal'
        value={amount}
        onChange={event => setAmount(event.target.value)}
        disabled={pending}
      />
      <Button
        disabled={
          !evm.ready ||
          !readiness.ready ||
          !evm.wallet ||
          !vault.binding ||
          pending ||
          !amount.trim()
        }
        onClick={() => {
          try {
            void evm
              .sendDeposit(vault.requireBinding(), token.erc20Address, amount)
              .catch(() => toast.error('The deposit session changed.'));
          } catch {
            toast.error('Load the vault before transferring.');
          }
        }}
      >
        {pending ? 'Transfer pending…' : 'Send tokens to deposit address'}
      </Button>
      {!vault.binding && (
        <p>
          Connect Midnight and load your vault identity to obtain a deposit
          address.
        </p>
      )}
      {transfer && (
        <div className='space-y-2 text-sm'>
          <p>Transfer: {transfer.status}</p>
          <p className='break-all'>Destination: {transfer.destination}</p>
          {transfer.hash &&
            (explorer ? (
              <a
                className='block break-all underline'
                href={`${explorer}/tx/${transfer.hash}`}
                target='_blank'
                rel='noopener noreferrer'
              >
                {transfer.hash}
              </a>
            ) : (
              <p className='break-all'>{transfer.hash}</p>
            ))}
          {transfer.error && <p role='alert'>{transfer.error}</p>}
          {transfer.status === 'confirmed' &&
            (currentTransfer ? (
              <Button
                disabled={
                  !readiness.ready ||
                  progress.active ||
                  transfer.sweep !== 'ready'
                }
                onClick={() => void evm.continueDeposit()}
              >
                {transfer.sweep === 'complete'
                  ? 'Midnight deposit complete'
                  : transfer.sweep === 'pending'
                    ? 'Midnight deposit pending…'
                    : 'Continue with Midnight deposit'}
              </Button>
            ) : (
              <p>
                This transfer belongs to another vault session. Its tokens
                remain at the destination shown.
              </p>
            ))}
          {transfer.hash && transfer.status === 'error' && (
            <p>Check the submitted transaction before sending again.</p>
          )}
        </div>
      )}
    </div>
  );
}
