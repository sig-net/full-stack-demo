'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';

import { CryptoIcon } from '@/components/balance-display/crypto-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Token } from '@/lib/types/token.types';

interface TokenAmountToken extends Token {
  balance: string;
}

interface TokenAmountDisplayProps {
  value: string;
  onChange: (value: string) => void;
  tokens: TokenAmountToken[];
  selectedToken?: TokenAmountToken;
  onTokenSelect: (token: TokenAmountToken) => void;
  usdValue?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  // Amount is computed, not user-entered (e.g. a quote): the input is non-editable and the
  // `max` shortcut is hidden, but the token dropdown still works so the token can be changed.
  readOnly?: boolean;
}

export function TokenAmountDisplay({
  value,
  onChange,
  tokens,
  selectedToken,
  onTokenSelect,
  usdValue,
  className = '',
  placeholder = '0.00',
  disabled = false,
  readOnly = false,
}: TokenAmountDisplayProps) {
  const handleMaxClick = () => {
    if (selectedToken) {
      const bal = selectedToken.balance;
      if (!bal.includes('.')) {
        onChange(bal);
        return;
      }
      const trimmed = bal.replace(/0+$/, '').replace(/\.$/, '.0');
      onChange(trimmed);
    }
  };
  return (
    <div
      className={`ds-surface-muted ds-control-gap ds-round ds-frame ds-inset-content sm:ds-inset-content flex max-w-full flex-col ${className} `}
    >
      <div className='ds-control-gap flex w-full min-w-0 items-center justify-between'>
        <div className='ds-control-gap flex min-w-0 flex-1 items-center'>
          <Input
            type='text'
            inputMode='decimal'
            enterKeyHint='done'
            value={value}
            onChange={e => !disabled && !readOnly && onChange(e.target.value)}
            readOnly={readOnly}
            disabled={disabled}
            aria-label='Token amount'
            placeholder={placeholder}
            className='w-full min-w-0'
          />
          {selectedToken && !disabled && !readOnly && (
            <Button
              type='button'
              variant='link'
              size='xs'
              onClick={handleMaxClick}
              className='shrink-0'
            >
              max
            </Button>
          )}
        </div>

        <DropdownMenu open={disabled ? false : undefined}>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <Button
              type='button'
              variant='outline'
              aria-label='Select token'
              className='shrink-0'
            >
              {selectedToken ? (
                <div className='ds-row ds-control-gap'>
                  <CryptoIcon
                    chain={selectedToken.chain}
                    token={selectedToken.symbol}
                    className='size-4'
                  />
                  <span className='ds-body'>{selectedToken.symbol}</span>
                </div>
              ) : (
                <span className='ds-body'>Select</span>
              )}
              <ChevronDown className='ds-muted size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='min-w-0'>
            {tokens.map((token, index) => (
              <DropdownMenuItem
                key={`${token.chain}-${token.erc20Address}-${index}`}
                onClick={() => onTokenSelect(token)}
              >
                <CryptoIcon
                  chain={token.chain}
                  token={token.symbol}
                  className='size-4'
                />
                <span>{token.symbol}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(usdValue || selectedToken) && (
        <div className='ds-stack ds-tight'>
          {usdValue && (
            <div className='ds-row'>
              <span className='ds-muted ds-caption ds-label'>{usdValue}</span>
            </div>
          )}

          {selectedToken && (
            <div className='ds-row'>
              <span className='ds-muted ds-caption ds-label'>
                Available:{' '}
                {(() => {
                  const b = selectedToken.balance;
                  const dot = b.indexOf('.');
                  return dot === -1 ? b : b.slice(0, dot + 4);
                })()}{' '}
                {selectedToken.symbol}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
