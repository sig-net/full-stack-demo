'use client';

import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { NetworkIcon } from '@web3icons/react';

import { CryptoIcon } from '@/components/balance-display/crypto-icon';
import { MidnightLogo } from '@/components/midnight-logo';
import { cn } from '@/lib/utils';
import { NetworkData, TokenConfig } from '@/lib/constants/token-metadata';

interface NetworkAccordionItemProps {
  network: NetworkData;
  isExpanded: boolean;
  onNetworkClick: () => void;
  onTokenSelect: (token: TokenConfig, network: NetworkData) => void;
  className?: string;
}

export function NetworkAccordionItem({
  network,
  isExpanded,
  onNetworkClick,
  onTokenSelect,
  className,
}: NetworkAccordionItemProps) {
  return (
    <div
      className={cn('ds-surface-success ds-round overflow-hidden', className)}
    >
      <Button
        variant='ghost'
        size='row'
        className='w-full'
        aria-expanded={isExpanded}
        onClick={onNetworkClick}
      >
        <div className='ds-row ds-control-gap'>
          {network.chain === 'midnight' ? (
            <MidnightLogo className='size-7' />
          ) : (
            <NetworkIcon
              name={network.symbol}
              size={28}
              variant='background'
              className='ds-circle shrink-0'
            />
          )}
          <div className='ds-stack'>
            <span className='ds-text ds-prose ds-label'>
              {network.chainName}
            </span>
            <span className='ds-muted ds-body'>
              {network.tokens.length} tokens available
            </span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'ds-muted ds-motion size-4',
            isExpanded && 'rotate-180',
          )}
        />
      </Button>

      {isExpanded && (
        <div className='ds-inline-inset-content ds-bottom-inset-control'>
          <div>
            {network.tokens.map((token, index) => (
              <Button
                variant='ghost'
                size='row'
                key={`${token.erc20Address}-${index}`}
                type='button'
                onClick={() => onTokenSelect(token, network)}
                className='w-full'
              >
                <CryptoIcon
                  chain={network.chain}
                  token={token.symbol}
                  className='size-6 shrink-0'
                />
                <div className='ds-stack'>
                  <span className='ds-text ds-body ds-label'>
                    {token.symbol}
                  </span>
                  <span className='ds-muted ds-caption'>{token.name}</span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
