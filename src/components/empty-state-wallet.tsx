import { Wallet, ArrowDownCircle, ArrowRightLeft } from 'lucide-react';

import { MidnightWalletButton } from '@/components/midnight-wallet-button';
import { EvmWalletButton } from '@/components/evm-wallet-button';
import { VaultIdentityButton } from '@/components/vault-identity-button';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyStateWallet() {
  return (
    <EmptyState
      icon={Wallet}
      title='Ethereum Assets in an ERC-20 Vault'
      description='Deposit ERC-20 tokens and your program can call into Ethereum liquidity, markets, and assets'
      action={
        <>
          <div className='mb-12 flex flex-wrap justify-center gap-2'>
            <MidnightWalletButton />
            <EvmWalletButton />
            <VaultIdentityButton />
          </div>

          <div className='grid grid-cols-2 gap-4 text-center sm:gap-8'>
            <div className='flex flex-col items-center gap-3'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-green-100 sm:h-16 sm:w-16'>
                <ArrowDownCircle className='h-6 w-6 text-green-600 sm:h-8 sm:w-8' />
              </div>
              <div>
                <p className='text-dark-neutral-900 text-base font-medium'>
                  Deposit
                </p>
                <p className='text-dark-neutral-600 text-sm'>From Ethereum</p>
              </div>
            </div>

            <div className='flex flex-col items-center gap-3'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 sm:h-16 sm:w-16'>
                <ArrowRightLeft className='h-6 w-6 text-purple-600 sm:h-8 sm:w-8' />
              </div>
              <div>
                <p className='text-dark-neutral-900 text-base font-medium'>
                  Manage
                </p>
                <p className='text-dark-neutral-600 text-sm'>Cross-Chain</p>
              </div>
            </div>
          </div>
        </>
      }
    />
  );
}
