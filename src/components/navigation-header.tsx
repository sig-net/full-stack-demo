'use client';

import Image from 'next/image';

import { ConfigurationMenu } from '@/components/configuration-menu';
import { EvmWalletButton } from '@/components/evm-wallet-button';
import { MidnightWalletButton } from '@/components/midnight-wallet-button';
import { cn } from '@/lib/utils';

interface NavigationHeaderProps {
  className?: string;
}

export function NavigationHeader({ className }: NavigationHeaderProps) {
  return (
    <header
      className={cn(
        'ds-divider-bottom ds-surface-muted h-16 w-full sm:h-20',
        className,
      )}
    >
      <div className='ds-inset-content container mx-auto flex h-full items-center justify-between'>
        <div className='flex-shrink-0'>
          <Image
            src='/logo.svg'
            alt='Logo'
            width={120}
            height={24}
            className='max-w-24 object-contain sm:h-7 sm:w-36 sm:max-w-36'
            priority
          />
        </div>

        <div className='ds-tight flex shrink-0 items-center'>
          <ConfigurationMenu />
          <MidnightWalletButton />
          <EvmWalletButton />
        </div>
      </div>
    </header>
  );
}
