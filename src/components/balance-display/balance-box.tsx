'use client';

import { ArrowUpDown, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BalanceBox({
  amount,
  usdValue,
  tokenSymbol,
  icon,
  className,
  onSwapClick,
  onSendClick,
}: {
  amount: string;
  usdValue: string;
  tokenSymbol: string;
  icon: React.ReactNode;
  className?: string;
  onSwapClick?: () => void;
  onSendClick?: () => void;
}) {
  return (
    <div
      className={cn(
        'ds-content-gap ds-divider-top ds-block-inset-content sm:ds-block-inset-content flex w-full max-w-full sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className='ds-content-gap sm:ds-content-gap flex min-w-0 flex-1'>
        <div className='ds-tight sm:ds-control-gap flex min-w-0 flex-col'>
          <div className='ds-text ds-title sm:ds-display truncate'>
            {amount}
          </div>
          <div className='ds-muted ds-body ds-label'>{usdValue}</div>
        </div>
        <div className='ds-control-gap sm:ds-content-gap flex flex-shrink-0 items-center'>
          {icon}
          <span className='ds-text ds-body ds-label sm:ds-prose'>
            {tokenSymbol}
          </span>
        </div>
      </div>
      <div className='flex justify-end sm:justify-start'>
        <div className='ds-row ds-content-gap'>
          <Button
            variant='default'
            size='default'
            disabled
            onClick={onSwapClick}
          >
            <ArrowUpDown className='h-3 w-3' />
            Swap
          </Button>
          <Button variant='secondary' size='default' onClick={onSendClick}>
            <Send className='h-3 w-3' />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
