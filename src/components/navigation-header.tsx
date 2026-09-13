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
        'border-dark-neutral-50 h-16 w-full border-b bg-stone-100 sm:h-20',
        className,
      )}
    >
      <div className='container mx-auto flex h-full items-center justify-between p-4 md:p-0'>
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

        <div className='flex shrink-0 items-center gap-0.5'>
          <ConfigurationMenu />
          <MidnightWalletButton />
          <EvmWalletButton />
        </div>
      </div>
    </header>
  );
}
