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
          <div className='ds-control-gap ds-after-section flex flex-wrap justify-center'>
            <MidnightWalletButton />
            <EvmWalletButton />
            <VaultIdentityButton />
          </div>

          <div className='ds-content-gap sm:ds-section-gap grid grid-cols-2 text-center'>
            <div className='ds-stack ds-control-gap items-center'>
              <div className='ds-circle ds-surface-success flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16'>
                <ArrowDownCircle className='ds-success h-6 w-6 sm:h-8 sm:w-8' />
              </div>
              <div>
                <p className='ds-text ds-prose ds-label'>Deposit</p>
                <p className='ds-text ds-body'>From Ethereum</p>
              </div>
            </div>

            <div className='ds-stack ds-control-gap items-center'>
              <div className='ds-circle ds-surface flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16'>
                <ArrowRightLeft className='ds-muted h-6 w-6 sm:h-8 sm:w-8' />
              </div>
              <div>
                <p className='ds-text ds-prose ds-label'>Manage</p>
                <p className='ds-text ds-body'>Cross-Chain</p>
              </div>
            </div>
          </div>
        </>
      }
    />
  );
}
